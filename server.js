import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {research} from './research.js';
import {JobQueue} from './jobs.js';
const queue=new JobQueue(research);
const assets={'/':['public/index.html','text/html'],'/app.js':['public/app.js','text/javascript'],'/org.js':['public/org.js','text/javascript'],'/accounts.js':['public/accounts.js','text/javascript'],'/style.css':['public/style.css','text/css']};
const limits=new Map();
async function jsonBody(req){let bytes=0,parts=[];for await(const part of req){bytes+=part.length;if(bytes>3000000)throw new Error('Request exceeds the 3 MB limit.');parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw new Error('Invalid JSON request.');}}
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
export const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
 try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='POST'&&['/api/brief','/api/batches'].includes(path)){
   // Bound anonymous workload. Render's proxy owns X-Forwarded-For; use the rightmost address.
   const key=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim();let limit=limits.get(key);if(!limit||Date.now()>limit.until){limit={count:0,until:Date.now()+600000};limits.set(key,limit);}if(++limit.count>12){send(res,429,{error:'Research request limit reached. Try again in ten minutes.'});return;}if(limits.size>10000)for(const [k,v] of limits)if(v.until<Date.now())limits.delete(k);
   const body=await jsonBody(req);if(path==='/api/batches'){send(res,202,queue.create(body.accounts,body.options));return;}send(res,200,await research(body));return;
  }
  const match=path.match(/^\/api\/batches\/([a-f0-9-]{36})$/);if(match&&['GET','DELETE'].includes(req.method)){queue.prune();const job=req.method==='DELETE'?queue.cancel(match[1]):queue.snapshot(match[1]);send(res,job?200:404,job||{error:'Job expired or the service restarted. Rerun the account list.'});return;}
  if(path==='/health'){send(res,200,{status:'ok'});return;}
  if(req.method==='GET'&&assets[path]){const [file,type]=assets[path];res.writeHead(200,{'Content-Type':type});res.end(await readFile(new URL(file,import.meta.url)));return;}
  send(res,404,{error:'Not found'});
 }catch(e){send(res,400,{error:e.message});}
});
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Account Lens listening on port '+(process.env.PORT||3000)));
