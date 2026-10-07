import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pdf from 'pdf-parse/lib/pdf-parse.js';
const exec=promisify(execFile);
export function safeURL(value){
 const u=new URL(value);const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||isIP(h)||h.includes(':')||h==='localhost'||!h.includes('.')||/\.(local|internal|localhost|test|invalid)$/.test(h))throw new Error('Use a public HTTPS source without credentials or custom ports.');
 u.hash='';return u;
}
function privateIP(ip){const n=ip.split('.').map(Number);return isIP(ip)!==4||[0,10,127].includes(n[0])||n[0]>=224||(n[0]===169&&n[1]===254)||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&(n[1]===168||n[1]===0))||(n[0]===100&&n[1]>=64&&n[1]<=127)||(n[0]===198&&[18,19].includes(n[1]));}
export async function publicAddress(host){
 let addresses;
 try{addresses=await lookup(host,{all:true,family:4});}
 catch(e){if(!['EAI_AGAIN','ENOTFOUND'].includes(e.code))throw e;const {stdout}=await exec('curl',['--silent','--show-error','--fail','--max-time','10','--proto','=https','--',`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`],{maxBuffer:50000});const data=JSON.parse(stdout);addresses=(data.Answer||[]).filter(a=>a.type===1).map(a=>({address:a.data}));}
 if(!addresses.length||addresses.some(a=>privateIP(a.address)))throw new Error('Source must resolve to a public IPv4 address.');return addresses[0].address;
}
export async function retrieve(value,{deadline=Date.now()+180000}={}){
 const dir=await mkdtemp(join(tmpdir(),'accountlens-'));let u=safeURL(value);
 try{
  for(let redirects=0;redirects<=4;redirects++){
   if(Date.now()>deadline)throw new Error('Research time budget reached; source was not reviewed.');
   const address=await publicAddress(u.hostname),path=join(dir,'source');let stdout;
   try{({stdout}=await exec('curl',['--ipv4','--silent','--show-error','--max-time',String(Math.max(1,Math.min(22,Math.ceil((deadline-Date.now())/1000)))),'--max-filesize','30000000','--proto','=https','--resolve',`${u.hostname}:443:${address}`,'--output',path,'--write-out','%{json}','--user-agent',process.env.SEC_USER_AGENT||'AccountLens public investor research','--',u.href],{maxBuffer:100000}));}
   catch(e){throw new Error(String(e.stderr||'Source could not be downloaded.').trim());}
   const meta=JSON.parse(stdout);
   if(meta.http_code>=300&&meta.http_code<400&&meta.redirect_url){u=safeURL(meta.redirect_url);continue;}
   if(meta.http_code<200||meta.http_code>=300)throw new Error(`Source returned HTTP ${meta.http_code}. It may restrict automated access.`);
   const buffer=await readFile(path);if(!buffer.length)throw new Error('Source returned no content.');
   if(buffer.subarray(0,4).toString()==='%PDF'||/application\/pdf/i.test(meta.content_type||'')){
    const parsed=await pdf(buffer,{max:400});if(!parsed.text.trim())throw new Error('PDF contains no extractable text; upload a text version.');
    return {url:u.href,body:parsed.text,format:'pdf',pages:parsed.numpages,pagesReviewed:Math.min(parsed.numpages,400),truncated:parsed.numpages>400};
   }
   if(/audio\/|video\/|image\/|octet-stream/i.test(meta.content_type||''))throw new Error('This format is not text or PDF; provide a transcript.');
   return {url:u.href,body:buffer.toString('utf8'),format:/json/.test(meta.content_type||'')?'json':'html'};
  }
  throw new Error('Too many redirects.');
 }finally{await rm(dir,{recursive:true,force:true});}
}
export async function download(value,options){return (await retrieve(value,options)).body;}
