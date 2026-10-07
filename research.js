import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
const exec = promisify(execFile);
export function safeURL(value) {
 const u = new URL(value);
 if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw new Error('Use a public HTTPS source without credentials or custom ports.');
 const h=u.hostname.toLowerCase();
 if(isIP(h)||h.includes(':')||h==='localhost'||!h.includes('.')||h.endsWith('.local')||h.endsWith('.internal')) throw new Error('Private and local source addresses are not allowed.');
 return u;
}
function privateIP(ip) { return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|172\.(1[6-9]|2\d|3[01])\.|2(?:2[4-9]|[3-5]\d)\.)/.test(ip)||ip.includes(':'); }
export async function download(value) {
 const u=safeURL(value);
 let addresses;
 try { addresses=await lookup(u.hostname,{all:true,family:4}); }
 catch(error) {
  if(!['EAI_AGAIN','ENOTFOUND'].includes(error.code))throw error;
  // Cloud tasks route HTTPS through a proxy; direct DNS can be unavailable.
  const {stdout}=await exec('curl',['--silent','--show-error','--fail','--max-time','10','--proto','=https','--',`https://dns.google/resolve?name=${encodeURIComponent(u.hostname)}&type=A`],{maxBuffer:50000});
  const response=JSON.parse(stdout);
  addresses=(response.Answer||[]).filter(a=>a.type===1&&isIP(a.data)===4).map(a=>({address:a.data,family:4}));
 }

 if(!addresses.length || addresses.some(a=>privateIP(a.address))) throw new Error('Source must resolve to a public IPv4 address.');
 // Redirects are deliberately not followed: each destination must be separately validated.
 let stdout;
 try { ({stdout}=await exec('curl',['--ipv4','--silent','--show-error','--fail','--max-time','18','--max-filesize','30000000','--proto','=https','--write-out','\nACCOUNTLENS_RESPONSE:%{http_code}:%{content_type}','--user-agent',process.env.SEC_USER_AGENT||'AccountLens public research prototype','--',u.href],{maxBuffer:31000000})); } catch(e) { const detail=String(e.stderr||'').trim(); throw new Error(detail||'Unable to retrieve this public source. Check internet access, source permissions, or paste the source text.'); }
 const marker=stdout.lastIndexOf('\nACCOUNTLENS_RESPONSE:');
 const body=stdout.slice(0,marker), metadata=stdout.slice(marker+22);
 if(!metadata.startsWith('2')) throw new Error('Source returned a redirect or unsupported response. Enter its final public URL.');
 if(/application\/pdf|octet-stream/i.test(metadata)||body.startsWith('%PDF')) throw new Error('PDF and binary sources need pasted text in this version.');
 if(!body.trim()) throw new Error('Source returned no readable content.');
 return body;
}
export function plainText(html) {
 return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';}).replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
}
const categories={leaders:/\b(CTO|CIO|CISO|chief (?:technology|information security|information technology|information|security|digital|executive|data|operating|financial) officer|executive vice president)\b/i,priorities:/\b(strategy|strategic|priority|priorities|growth|margin|efficien|transformation|investment|investing)\b/i,technology:/\b(Azure|AWS|cloud|platform|data center|datacenter|ERP|SAP|Salesforce|cybersecurity|infrastructure|machine learning|artificial intelligence|generative AI)\b/i,initiatives:/\b(launch|introduced|announced|initiative|rollout|partnership|acquisition|deploy|expan)\w*/i};
export function buildBrief(company,sources,failures=[]) {
 const facts=Object.fromEntries(Object.keys(categories).map(k=>[k,[]]));
 const candidates=Object.fromEntries(Object.keys(categories).map(k=>[k,[]]));
 for(const s of sources){
  // Protect initials and abbreviations so executive names remain intact.
  const protectedText=s.text.replace(/\b([A-Z])\.(?=\s)/g,'$1\uE000').replace(/\b(Mr|Mrs|Ms|Dr|Inc|Corp|Co)\./g,'$1\uE000').replace(/(\d)\.(?=\d)/g,'$1\uE000');
  const sentences=(protectedText.match(/[^.!?]+(?:[.!?]+|$)/g)||[]).map(x=>x.replaceAll('\uE000','.').trim());
  for(const [key,re] of Object.entries(categories)) {
   for(const quote of sentences){
    if(quote.length<25||quote.length>1200||!re.test(quote))continue;
    const priority=key==='leaders'&&/\b(CTO|CIO|CISO|chief (technology|information|information security|security|digital|data) officer)\b/i.test(quote)?100:0;
    const historical=/\b(former|previously|served as|until|retired)\b/i.test(quote)?-10:0;
    candidates[key].push({quote,sourceId:s.id,date:s.date||null,dateKind:s.dateKind||'Publication date',status:'Source passage',interpretation:'Keyword-matched passage; confirm context and relevance.',score:priority+historical});
   }
  }
 }
 let evidenceId=0;
 for(const key of Object.keys(categories)){
  const seen=new Set();
  facts[key]=candidates[key].sort((a,b)=>b.score-a.score).filter(f=>{if(seen.has(f.quote))return false;seen.add(f.quote);return true;}).slice(0,8).map(({score,...f})=>({id:`E${++evidenceId}`,...f}));
 }
 const hypotheses=[];
 const add=(title,evidence,outcome,questions)=>{if(evidence.length) hypotheses.push({title,label:'Hypothesis — requires discovery',evidence:evidence.slice(0,2).map(e=>e.id),rationale:'The cited passages suggest an area to investigate; they do not establish demand, feasibility, budget, or buying intent.',outcome,questions});};
 add('Knowledge and workflow copilot',[...facts.priorities,...facts.technology],'Potential reduction in time spent finding information and completing repetitive work. Establish a baseline before estimating savings.',['Which workflow has the highest repeatable manual workload?','What systems and approved data could a copilot access?','Who owns the outcome, and how would success be measured?']);
 add('Technology operations intelligence',facts.technology,'Potential faster incident triage and improved service reliability; validate against incident and recovery metrics.',['Where do teams lose time during incident investigation?','Are logs, runbooks and incident histories available with appropriate access controls?','What is the current mean time to resolution?']);
 add('Initiative delivery assistant',facts.initiatives,'Potential faster preparation and coordination of the cited initiative, subject to an identified process and owner.',['What milestones and dependencies are hardest to coordinate?','Which decisions require human approval?','What would make a pilot useful within 60 days?']);
 const gaps=['Current CTO, CIO and CISO identities, responsibilities and reporting lines require verification; a role mention alone does not identify a current leader. Buying committee, budget and procurement timing remain unverified.','Installed vendors, architecture, contracts and data access need direct validation.','AI feasibility, security requirements and quantified ROI remain hypotheses.'];
 for(const [role,re] of [['CTO',/\bCTO\b|chief technology officer/i],['CIO',/\bCIO\b|chief information officer/i],['CISO',/\bCISO\b|chief information security officer/i]]) if(!facts.leaders.some(f=>re.test(f.quote)))gaps.push(`${role} role has no direct mention in the reviewed passages; find a current primary leadership source.`);
 for(const [k,v] of Object.entries(facts)) if(!v.length) gaps.push(`No usable evidence found for ${k}.`);
 if(!sources.some(s=>s.type==='10-K')) gaps.push('No 10-K was successfully reviewed.');
 if(!sources.some(s=>s.type==='10-Q')) gaps.push('No 10-Q was successfully reviewed.');
 for(const type of ['Investor day','Earnings transcript']) if(!sources.some(s=>s.type===type)) gaps.push(`No ${type.toLowerCase()} material was reviewed.`);
 if(sources.some(s=>!s.date)) gaps.push('Some sources have no publication date; freshness cannot be established.');
 return {company,generatedAt:new Date().toISOString(),method:'Extractive first version: exact source passages matched by topic; hypotheses use explicit templates. No LLM verification or exhaustive research is performed.',facts,hypotheses,gaps,failures,sources:sources.map(({text,...s})=>({...s,charactersReviewed:text.length}))};
}
export async function research(input) {
 const company=String(input.company||'').trim(); if(company.length<2||company.length>150) throw new Error('Enter a company name between 2 and 150 characters.');
 const sources=[],failures=[]; let seq=0;
 const add=(s)=>sources.push({...s,id:`S${++seq}`,accessedAt:new Date().toISOString()});
 for(const item of (input.materials||[]).slice(0,8)) {
  try { const url=item.url?safeURL(item.url).href:null; const pasted=String(item.text||'').trim(); const body=pasted||await download(url); const text=plainText(body).slice(0,220000); if(text.length<30) throw new Error('Source needs at least 30 readable characters.'); add({title:String(item.title||item.type||'Company material').slice(0,160),type:['10-K','10-Q','Investor day','Earnings transcript','Public information'].includes(item.type)?item.type:'Public information',url,date:/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')&&!Number.isNaN(Date.parse(item.date))?item.date:null,text,provenance:pasted?'User-provided text; authenticity and company relevance not independently verified':'Retrieved public page; company relevance requires review'}); }
  catch(e){failures.push({source:item.title||item.url||'Imported material',message:e.message});}
 }
 if(input.live!==false){
  try {
   const tickerData=JSON.parse(await download('https://www.sec.gov/files/company_tickers.json'));
   const entries=Object.values(tickerData), q=company.toLowerCase();
   let match=entries.find(e=>e.ticker.toLowerCase()===q||e.title.toLowerCase()===q);
   if(!match){const candidates=entries.filter(e=>e.title.toLowerCase().includes(q));if(candidates.length===1)match=candidates[0];else throw new Error(candidates.length?'Company name is ambiguous. Retry with its stock ticker.':'No SEC issuer match. Try its stock ticker or import source materials.');}
   const cik=String(match.cik_str).padStart(10,'0'); const data=JSON.parse(await download(`https://data.sec.gov/submissions/CIK${cik}.json`));
   const r=data.filings.recent;
   for(const type of ['10-K','10-Q']) {const i=r.form.indexOf(type);if(i<0){failures.push({source:type,message:'No recent filing found.'});continue;} const url=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accessionNumber[i].replaceAll('-','')}/${r.primaryDocument[i]}`;
    try {const text=plainText(await download(url)).slice(0,1000000);add({title:`${data.name} · ${type}`,type,url,date:r.filingDate[i],text,provenance:'Retrieved SEC filing',dateKind:'Filing date'});} catch(e){failures.push({source:type,message:e.message});}
   }
  }catch(e){failures.push({source:'SEC company and filing research',message:e.message});}
  try {const url=`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(company+' company')}&gsrlimit=1&prop=extracts&explaintext=1&format=json`;const data=JSON.parse(await download(url));const page=Object.values(data.query?.pages||{})[0];if(!page?.extract)throw new Error('No public overview found.');add({title:page.title,type:'Public information',url:`https://en.wikipedia.org/?curid=${page.pageid}`,date:null,text:page.extract.slice(0,220000),provenance:'Wikipedia search result; confirm entity identity and verify against primary sources'});}catch(e){failures.push({source:'Public company overview',message:e.message});}
 }
 return buildBrief(company,sources,failures);
}
