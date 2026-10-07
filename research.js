import {safeURL} from './network.js';
import {plainText} from './discovery.js';
import {collectResearch} from './collector.js';
export {safeURL,download} from './network.js';
export {plainText} from './discovery.js';
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
    candidates[key].push({dateScore:s.date?Date.parse(s.date):0,quote,sourceId:s.id,date:s.date||null,dateKind:s.dateKind||'Publication date',status:'Source passage',interpretation:'Keyword-matched passage; confirm context and relevance.',score:priority+historical});
   }
  }
 }
 let evidenceId=0;
 for(const key of Object.keys(categories)){
  const seen=new Set();
  facts[key]=candidates[key].sort((a,b)=>b.score-a.score||b.dateScore-a.dateScore).filter(f=>{if(seen.has(f.quote))return false;seen.add(f.quote);return true;}).slice(0,8).map(({score,dateScore,...f})=>({id:`E${++evidenceId}`,...f}));
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
 return {company,generatedAt:new Date().toISOString(),method:'Extractive research: exact source passages matched by topic; hypotheses use explicit templates. No LLM verification or exhaustive research is performed.',facts,hypotheses,gaps,failures,sources:sources.map(({text,html,...s})=>({...s,charactersReviewed:text.length}))};
}
export async function research(input,options){return collectResearch(input,buildBrief,options);}
