import {investorFeed} from './investor-feeds.js';
import {retrieve,safeURL,download} from './network.js';
import {load} from 'cheerio';
import {plainText,pageText,links,publicationDate,extractLeaders,selectFilings,validDate,sourceType} from './discovery.js';
const cache=new Map();
async function cachedJSON(url){let entry=cache.get(url);if(!entry||Date.now()>entry.expires){entry={expires:Date.now()+900000,promise:download(url).then(JSON.parse)};cache.set(url,entry);entry.promise.catch(()=>cache.delete(url));}return entry.promise;}
export async function concurrent(items,count,fn){let next=0;await Promise.all(Array.from({length:Math.min(count,items.length)},async()=>{while(next<items.length){const i=next++;await fn(items[i],i);}}));}
const known={MSFT:{website:'https://www.microsoft.com',investor:'https://www.microsoft.com/en-us/Investor/',leadership:'https://news.microsoft.com/leadership/'},AAPL:{website:'https://www.apple.com',investor:'https://investor.apple.com',leadership:'https://www.apple.com/leadership/'},AMZN:{website:'https://www.amazon.com',investor:'https://ir.aboutamazon.com',leadership:'https://www.aboutamazon.com/about-us/leadership'},GOOGL:{website:'https://abc.xyz',investor:'https://abc.xyz/investor/'},NVDA:{website:'https://www.nvidia.com',investor:'https://investor.nvidia.com',leadership:'https://www.nvidia.com/en-us/about-nvidia/corporate-management/'},CRM:{website:'https://www.salesforce.com',investor:'https://investor.salesforce.com',leadership:'https://www.salesforce.com/company/leadership/'}};
const number=(v,def,min,max)=>Number.isFinite(Number(v))&&v!==''?Math.max(min,Math.min(max,Math.floor(Number(v)))):def;
export async function collectResearch(input,buildBrief,{fetcher=retrieve,jsonFetcher=cachedJSON,now=Date.now()}={}){
 const company=String(input.company||'').trim();if(company.length<2||company.length>150)throw new Error('Enter a company name between 2 and 150 characters.');
 if(input.materials&&!Array.isArray(input.materials))throw new Error('Materials must be a list.');
 const months=number(input.months,24,3,120),maxDocuments=number(input.maxDocuments,24,4,80),maxPages=number(input.maxPages,8,2,20),deadline=Date.now()+240000;
 const cutoffDate=new Date(now);cutoffDate.setUTCMonth(cutoffDate.getUTCMonth()-months);const cutoff=cutoffDate.toISOString().slice(0,10);
 const sources=[],failures=[],catalog=[],leaders=[],seenURLs=new Set(),pageCache=new Map();let sequence=0;
 const fail=(source,error)=>failures.push({source,message:error.message||String(error)});
 const add=(s)=>{const found=s.url&&sources.find(x=>x.url===s.url);if(found)return found;const text=s.text.slice(0,1000000);const source={...s,text,truncated:s.truncated||s.text.length>text.length,id:`S${++sequence}`,accessedAt:new Date().toISOString()};sources.push(source);return source;};
 const get=async url=>{url=safeURL(url).href;if(!pageCache.has(url))pageCache.set(url,fetcher(url,{deadline}));return pageCache.get(url);};
 const review=async(item)=>{
  if(/view\.officeapps\.live\.com|\.pptx?(?:\?|$)/i.test(item.url)){item.status='Failed';item.reason='Presentation is a PowerPoint or viewer page. Supply its PDF export or paste slide text.';fail(item.title,new Error(item.reason));return;}
  if(seenURLs.has(item.url)){item.status='Duplicate';const source=sources.find(s=>s.url===item.url);if(source){item.sourceId=source.id;const result=await get(item.url);if(item.type==='Leadership'&&result.format==='html')leaders.push(...extractLeaders(result.body,result.url,source.id,source.date));return {source,result};}return;}seenURLs.add(item.url);item.status='Reviewing';
  try{const result=await get(item.url);const html=result.format==='html'?result.body:null;const title=(html&&['Investor center','Investor-center section','Leadership profile','Company leadership'].includes(item.title)?load(html)('title').text().trim():null)||item.title||(html?load(html)('title').text():item.type);const text=html?pageText(html):result.body;const date=item.date||(html?publicationDate(html):null);if(date&&date<cutoff&&item.type!=='Leadership'){item.status='Outside research window';item.date=date;return;}
   if(text.length<30)throw new Error('Source contains insufficient readable text. It may require JavaScript or authenticated access.');
   const s=add({title,type:item.type,url:result.url,date,dateKind:item.dateKind||'Publication date',period:item.period||null,text,format:result.format,pages:result.pages,pagesReviewed:result.pagesReviewed,provenance:item.provenance||'Retrieved from company investor center',truncated:result.truncated});item.status='Reviewed';item.sourceId=s.id;item.date=date;
   if(item.type==='Leadership'&&html)leaders.push(...extractLeaders(html,result.url,s.id,date));return {result,source:s};
  }catch(e){item.status='Failed';item.reason=e.message;fail(item.title||item.url,e);}
 };
 for(const item of (input.materials||[]).slice(0,12))try{const url=item.url?safeURL(item.url).href:null;const pasted=String(item.text||'').trim();if(pasted){if(pasted.length<30)throw new Error('Source needs at least 30 readable characters.');const text=plainText(pasted);const s=add({title:String(item.title||item.type||'Imported material').slice(0,180),type:item.type||'Public information',url,date:validDate(item.date),text,provenance:'User-provided text; authenticity and company relevance not independently verified'});if(item.type==='Leadership')leaders.push(...extractLeaders(pasted,url,s.id,s.date));}else{const c={title:item.title,type:item.type||'Public information',url,date:validDate(item.date),status:'Discovered',provenance:'User-provided source URL; company relevance requires review'};catalog.push(c);await review(c);}}catch(e){fail(item.title||'Imported material',e);}
 let identity={name:company,ticker:null,website:null};let issuer=null;let investorURL=input.investorUrl||null,leadershipURL=input.leadershipUrl||null,websiteURL=input.websiteUrl||null;
 if(input.live!==false){
  try{const tickerData=await jsonFetcher('https://www.sec.gov/files/company_tickers.json');const q=company.toLowerCase();const entries=Object.values(tickerData);let match=entries.find(e=>e.ticker.toLowerCase()===q||e.title.toLowerCase()===q);if(!match){const matches=entries.filter(e=>e.title.toLowerCase().includes(q));if(matches.length===1)match=matches[0];else throw new Error(matches.length?'Issuer match is ambiguous; use its stock ticker.':'No SEC issuer matched. Supply an investor-center URL for this account.');}
   issuer=await jsonFetcher(`https://data.sec.gov/submissions/CIK${String(match.cik_str).padStart(10,'0')}.json`);identity={name:issuer.name,ticker:match.ticker,cik:match.cik_str,website:null};const seed=known[match.ticker]||{};websiteURL||=seed.website;investorURL||=seed.investor;leadershipURL||=seed.leadership;
   let recent=issuer.filings.recent;const historic=issuer.filings.files||[];let archiveReads=0;
   for(const file of historic.filter(f=>f.filingTo>=cutoff)){if(archiveReads++>=3){fail('SEC archive coverage',new Error('Additional filing archives exist but the three-archive limit was reached.'));break;}const more=await jsonFetcher(`https://data.sec.gov/submissions/${file.name}`);for(const key of Object.keys(recent))recent={...recent,[key]:[...(recent[key]||[]),...(more[key]||[])]};}
   const selected=selectFilings(recent,{months,max:1000,now});for(const f of selected.selected){const url=`https://www.sec.gov/Archives/edgar/data/${match.cik_str}/${f.accession.replaceAll('-','')}/${f.document}`;catalog.push({title:`${issuer.name} · ${f.type}${f.amendment?' amendment':''} · ${f.date}`,type:f.type,date:f.date,dateKind:'Filing date',period:f.period,url,status:'Discovered',origin:'SEC',provenance:'Retrieved SEC filing'});}
  }catch(e){fail('SEC issuer and filing discovery',e);}
  if(!websiteURL){
   try{const query=encodeURIComponent((issuer?.name||company)+' company');const data=await jsonFetcher(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${query}&gsrlimit=1&prop=pageprops&format=json`);const page=Object.values(data.query?.pages||{})[0],id=page?.pageprops?.wikibase_item;if(!id)throw new Error('No official website could be resolved.');const entity=await jsonFetcher(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=claims&format=json`);websiteURL=entity.entities[id].claims?.P856?.[0]?.mainsnak?.datavalue?.value;if(websiteURL?.startsWith('http://'))websiteURL=websiteURL.replace('http://','https://');if(!websiteURL)throw new Error('No official website is listed.');identity.discovery='Website suggested by Wikidata; confirm company identity.';}
   catch(e){fail('Official website discovery',e);}
  }
  if(!websiteURL&&investorURL)websiteURL=new URL(investorURL).origin;
  if(websiteURL){try{identity.website=safeURL(websiteURL).href;if(!investorURL||!leadershipURL){const home=await get(identity.website);const list=links(home.body,home.url);investorURL||=list.find(l=>/investor[ -]?relations|investors|investor center/i.test(`${l.title} ${l.url}`))?.url;leadershipURL||=list.find(l=>/leadership|executive (team|management)|management team/i.test(`${l.title} ${l.url}`))?.url;}}catch(e){fail('Company website',e);}}
  const navigation=[],leadershipCandidates=[];const discovered=new Map();
  if(investorURL){
   try{investorURL=safeURL(investorURL).href;navigation.push(investorURL);const visited=new Set();
    while(navigation.length&&visited.size<maxPages&&Date.now()<deadline){navigation.sort((a,b)=>Number(/annual-reports|sec-filings/i.test(b))-Number(/annual-reports|sec-filings/i.test(a)));const url=navigation.shift();if(visited.has(url))continue;visited.add(url);const item={url,type:'Investor center',title:visited.size===1?'Investor center':'Investor-center section',status:'Discovered',origin:'Company investor center'};catalog.push(item);const reviewed=await review(item);if(!reviewed)continue;
     try{for(const l of await investorFeed(reviewed.result.body,reviewed.result.url,get,cutoff))if(!discovered.has(l.url)&&!seenURLs.has(l.url))discovered.set(l.url,l);}catch(e){fail('Investor-center public financial feed',e);}
     for(const l of links(reviewed.result.body,reviewed.result.url)){
      const words=`${l.title} ${l.url}`;
      if(/leadership|executive (team|management)|management team|senior (leadership|management)/i.test(words))leadershipCandidates.push(l.url);
      if(/corporate-responsibility|reports-hub|\/CSR\/|conflict.minerals|ISO50001|privacy|cookie|contact|sitemap|subscribe|stock (price|quote)|dividend|tax|faq|proxy|governance|board.of.directors/i.test(words))continue;
      const listing=!/\.pdf(?:\?|$)/i.test(l.url)&&(/^(annual reports|quarterly reports|sec filings|presentations|events|financial results|quarterly results|earnings releases|financial information)$/i.test(l.title.trim())||/\/(annual-reports|sec-filings|presentations|events|financial-reports|quarterly-results)(?:\/|\?|$)/i.test(l.url));
      const earningsLanding=/press-release-webcast|earnings\/[^/]+\/?$/i.test(l.url);
      const doc=/\.pdf(?:\?|$)|10[ -]?[kq]\b|annual.report|transcript|presentation|slides|investor.day|capital.markets.day|press.release|earnings.release/i.test(words);
      const nav=!/\/metrics(?:\/|$)/i.test(l.url)&&/earnings|financial|reports|filings|events|presentations|quarter|archive|results|investor.day/i.test(words);
      if(doc&&!listing&&!earningsLanding){if(!discovered.has(l.url)&&!seenURLs.has(l.url))discovered.set(l.url,{...l,status:l.date&&l.date<cutoff?'Outside research window':'Discovered',origin:'Company investor center'});}
      else if((nav||listing||earningsLanding)&&new URL(l.url).hostname===new URL(investorURL).hostname&&!visited.has(l.url)&&!navigation.includes(l.url))navigation.push(l.url);
     }
    }
    if(navigation.length)fail('Investor-center navigation coverage',new Error(`Crawl stopped at ${maxPages} pages or the time budget. ${navigation.length} linked sections were not opened. JavaScript-only listings may need a direct source URL.`));
   }catch(e){fail('Investor center',e);}
  }else fail('Investor center',new Error('Investor-relations URL was not discovered. Enter its official URL and rerun.'));
  catalog.push(...discovered.values());
  leadershipURL||=leadershipCandidates[0];
  const docs=catalog.filter(x=>x.status==='Discovered'&&x.type!=='Investor center');docs.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||Number(/transcript|Investor day|presentation|Earnings/.test(b.type))-Number(/transcript|Investor day|presentation|Earnings/.test(a.type))||Number(b.origin==='SEC')-Number(a.origin==='SEC'));
  // Guaranteed baseline filings plus recent investor material within an explicit document budget.
  const sec=docs.filter(x=>x.origin==='SEC'),ir=docs.filter(x=>x.origin!=='SEC');const secLimit=Math.min(sec.length,Math.max(2,Math.floor(maxDocuments*.65)));const picked=[...sec.slice(0,secLimit),...ir.slice(0,maxDocuments-secLimit)];if(picked.length<maxDocuments)picked.push(...sec.slice(secLimit,maxDocuments-picked.length+secLimit));
  const chosen=new Set(picked);for(const item of docs)if(!chosen.has(item)){item.status='Not reviewed';item.reason='Selected document limit reached. Increase the document budget to review this source.';}
  await concurrent(picked,2,review);
  if(leadershipURL){
   const root={url:safeURL(leadershipURL).href,title:'Company leadership',type:'Leadership',status:'Discovered',origin:'Company leadership'};catalog.push(root);const reviewed=await review(root);
   if(reviewed){const list=links(reviewed.result.body,reviewed.result.url);const people=extractLeaders(reviewed.result.body,reviewed.result.url,reviewed.source.id,reviewed.source.date);const profileURLs=[...new Set([...people.map(p=>p.profileUrl),...list.filter(l=>/leadership|executive|management/i.test(l.url)&&l.title.split(' ').length>=2&&l.title.split(' ').length<=5&&!/leadership|team|board|executive|management|member|view|read|meet/i.test(l.title)).map(l=>l.url)])].filter(u=>u!==root.url&&new URL(u).hostname===new URL(root.url).hostname).slice(0,8);
    await concurrent(profileURLs,2,async url=>{const p={url,title:'Leadership profile',type:'Leadership',status:'Discovered',origin:'Company leadership'};catalog.push(p);await review(p);});
   }
  }else fail('Company leadership',new Error('No leadership page was discovered. Enter its official URL to seed the organization map.'));
 }
 const b=buildBrief(company,sources,failures);const unique=new Map();for(const leader of leaders){const key=leader.name.toLowerCase();if(!unique.has(key))unique.set(key,leader);}
 b.identity=identity;b.leaders=[...unique.values()];b.orgChart={nodes:b.leaders.map((p,i)=>({...p,x:40+(i%4)*280,y:40+Math.floor(i/4)*200,notes:'',relationshipSource:null,relationshipStatus:'Unknown — no reporting line inferred'}))};
 b.catalog=catalog;b.scope={months,cutoff,maxDocuments,maxPages,reviewed:sources.length,discovered:catalog.length,notReviewed:catalog.filter(x=>!['Reviewed','Duplicate','Outside research window'].includes(x.status)).length,description:'Latest available sources within the selected window. Discovery follows public HTML links with explicit page/document/time limits; it is not an exhaustive archive or a JavaScript browser.'};
 if(!b.leaders.length)b.gaps.push('No named leaders were extracted from an accessible leadership page. Add a direct page or manually add people with source evidence.');
 if(b.scope.notReviewed)b.gaps.push(`${b.scope.notReviewed} discovered sources were unavailable or not reviewed; see document inventory.`);
 if(!sources.some(s=>s.type==='Investor center'))b.gaps.push('No company investor-center page was reviewed.');
 if(sources.some(s=>s.truncated))b.gaps.push('Some source text or PDF pages were truncated; consult the original documents.');
 b.method='Source passages are extracted from retrieved company investor materials and filings, with the newest dated evidence prioritized. AI opportunities remain explicit hypotheses. Named leaders are detected from public pages; reporting lines are not inferred.';
 return b;
}
