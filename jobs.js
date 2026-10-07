import {randomUUID} from 'node:crypto';
export class JobQueue {
 constructor(run,{concurrency=2,ttl=3600000,maxAccounts=50}={}){this.run=run;this.concurrency=concurrency;this.ttl=ttl;this.maxAccounts=maxAccounts;this.jobs=new Map();this.active=0;}
 create(accounts,options={}){
  this.prune();if(!Array.isArray(accounts)||accounts.length<1||accounts.length>this.maxAccounts)throw new Error(`Upload between 1 and ${this.maxAccounts} accounts.`);
  if(this.jobs.size>=20)throw new Error('Job capacity reached. Try again after existing jobs expire.');
  const seen=new Set(),items=[];for(const account of accounts){const value=typeof account==='string'?{company:account}:account;if(!value||typeof value!=='object')throw new Error('Invalid account row.');const company=String(value.company||value.ticker||'').trim();if(company.length<2||company.length>150)throw new Error('Each account needs a name or ticker between 2 and 150 characters.');const key=company.toLowerCase();if(seen.has(key))continue;seen.add(key);items.push({company,input:{...options,company,...Object.fromEntries(['websiteUrl','investorUrl','leadershipUrl'].filter(k=>value[k]).map(k=>[k,value[k]]))},status:'queued',result:null,error:null});}
  const job={id:randomUUID(),createdAt:Date.now(),cancelled:false,items};this.jobs.set(job.id,job);this.pump();return this.snapshot(job.id);
 }
 pump(){while(this.active<this.concurrency){let job,item;for(const j of this.jobs.values()){if(j.cancelled)continue;const next=j.items.find(i=>i.status==='queued');if(next){job=j;item=next;break;}}if(!item)break;item.status='researching';this.active++;Promise.resolve().then(()=>this.run(item.input)).then(result=>{item.result=result;item.status=result.sources.length?(result.failures.length||result.scope?.notReviewed?'partial':'complete'):'failed';if(!result.sources.length)item.error='No sources could be reviewed. Open the result for source failures.';},error=>{item.status='failed';item.error=error.message;}).finally(()=>{this.active--;delete item.input;this.pump();});}}
 snapshot(id){const job=this.jobs.get(id);if(!job)return null;const done=job.items.filter(i=>!['queued','researching'].includes(i.status)).length;return {id:job.id,createdAt:job.createdAt,status:done===job.items.length?(job.cancelled?'cancelled':'finished'):'running',total:job.items.length,completed:done,items:job.items.map(({input,...item})=>item),expiresAt:job.createdAt+this.ttl};}
 cancel(id){const job=this.jobs.get(id);if(!job)return null;job.cancelled=true;for(const item of job.items)if(item.status==='queued'){item.status='cancelled';delete item.input;}return this.snapshot(id);}
 prune(){for(const [id,job] of this.jobs)if(Date.now()-job.createdAt>this.ttl&&!job.items.some(i=>i.status==='researching'))this.jobs.delete(id);}
}
