import {load} from 'cheerio';
import {safeURL} from './network.js';
function spaceBlocks($){$('br').replaceWith(' ');$('p,div,article,section,li,tr,td,th,h1,h2,h3,h4,h5,h6').each((_,el)=>{$(el).prepend(' ');$(el).append(' ');});}
export function plainText(html){const $=load(html);spaceBlocks($);$('script,style,noscript,svg').remove();return $.root().text().replace(/\s+/g,' ').trim();}
export function pageText(html){const $=load(html);spaceBlocks($);$('script,style,noscript,svg,nav,header,footer').remove();return ($('main').length?$('main').text():$('body').text()).replace(/\s+/g,' ').trim();}
export function validDate(value){const m=String(value||'').match(/(?:^|[^0-9])(20\d{2}-\d{2}-\d{2})(?![0-9])/);return m&&!Number.isNaN(Date.parse(m[1]))&&new Date(m[1]).toISOString().slice(0,10)===m[1]?m[1]:null;}
export function textDate(text){const iso=validDate(text);if(iso)return iso;const month=String(text||'').match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}\b/i);if(month){const d=new Date(month[0]);if(!Number.isNaN(+d))return d.toISOString().slice(0,10);}return null;}
export function publicationDate(html){const $=load(html);for(const sel of ['meta[property="article:published_time"]','meta[name="date"]','meta[name="pubdate"]','meta[itemprop="datePublished"]']){const d=validDate($(sel).attr('content'));if(d)return d;}const d=validDate($('time[datetime]').first().attr('datetime'));if(d)return d;for(const el of $('script[type="application/ld+json"]').toArray()){try{const d=validDate(JSON.parse($(el).text()).datePublished);if(d)return d;}catch{}}return null;}
export function sourceType(title,url=''){
 const text=`${title} ${url}`;
 if(/10[\s_-]?k\b|annual[\s_-]*report/i.test(text))return '10-K';
 if(/10[\s_-]?q\b|quarterly[\s_-]*report/i.test(text))return '10-Q';
 if(/transcript|earnings.{0,30}conference.call/i.test(text))return 'Earnings transcript';
 if(/investor[\s_-]*day|capital[\s_-]*markets[\s_-]*day|analyst[\s_-]*day/i.test(text))return 'Investor day';
 if(/presentation|slides|deck/i.test(text))return 'Investor presentation';
 if(/earnings|press[\s_-]*release|financial[\s_-]*results|quarter[\s_-]*results/i.test(text))return 'Earnings results';
 return /\.pdf(?:\?|$)/i.test(url)?'Company report':'Investor center';
}
export function links(html,base){const $=load(html),seen=new Set(),out=[];for(const el of $('a[href]').toArray()){try{const u=safeURL(new URL($(el).attr('href'),base).href);if(seen.has(u.href))continue;seen.add(u.href);const title=$(el).text().replace(/\s+/g,' ').trim()||$(el).attr('aria-label')||u.pathname.split('/').pop();const nearby=$(el).closest('tr,li,article').text().slice(0,400);out.push({url:u.href,title:title.slice(0,180),date:textDate(title)||textDate(nearby),type:sourceType(title,u.href)});}catch{}}return out;}
const role=/\b(?:chief [a-z &-]{2,55} officer|CEO|CTO|CIO|CISO|CFO|COO|partner|lead independent director|president|vice chair(?:man)?|chairman|chairwoman|executive vice president|senior vice president|head of [a-z &-]{2,60})\b/i;
const validName=n=>/^[\p{Lu}][\p{L}’'.-]+(?:\s+(?:[\p{Lu}][\p{L}’'.-]*)){1,5}$/u.test(n)&&!/(Leadership|Executive|Board|Investor|Company|Management|Learn|Read|Annual|Privacy|Chief|Officer|President|Microsoft|Corporation|Group|Team|Our|About|Meet|Contact|Director|Partner|Founder|Committee|Member|Biographies)/i.test(n);
export function extractLeaders(html,url,sourceId,date){
 const $=load(html),result=[],seen=new Set();let section='Leadership';spaceBlocks($);const add=(name,title,evidence,profileUrl=url,membership=section)=>{name=String(name||'').replace(/\s+/g,' ').trim();title=String(title||'').replace(/\s+/g,' ').trim();if(!validName(name)||!role.test(title)||seen.has(name.toLowerCase()))return;try{profileUrl=safeURL(profileUrl||url).href;}catch{profileUrl=url;}seen.add(name.toLowerCase());result.push({id:`leader-${sourceId}-${result.length+1}`,name,title:title.slice(0,200),sourceId,sourceUrl:url,profileUrl,date,quote:evidence.slice(0,900),membership,status:membership==='Board'?'Board member; quoted title may describe an external or former role. Verify company responsibilities.':'Detected on public leadership page; verify current role',reportsTo:null});};
 function visit(value){if(!value||typeof value!=='object')return;if(value['@type']==='Person')add(value.name,value.jobTitle,`${value.name} — ${value.jobTitle}`,value.url||url);for(const v of Object.values(value))if(typeof v==='object'){if(Array.isArray(v))v.forEach(visit);else visit(v);}}
 for(const el of $('script[type="application/ld+json"]').toArray())try{visit(JSON.parse($(el).text()));}catch{}
 $('script,style,nav,header,footer').remove();
 for(const el of $('h1,h2,h3,h4,h5,h6,[itemprop="name"],.name,.person-name,span,p').toArray()){
  const name=$(el).text().replace(/\s+/g,' ').trim();if(/board of directors|board members/i.test(name)){section='Board';continue;}if(/^(executive (team|leadership|profiles)|leadership team|senior leadership)$/i.test(name))section='Leadership';if(!validName(name))continue;
  let node=$(el),context='';for(let depth=0;depth<4;depth++){const text=node.text().replace(/\s+/g,' ').trim();const otherNames=node.find('h2,h3,h4,h5,h6,span,p').toArray().map(e=>$(e).text().replace(/\s+/g,' ').trim()).filter(n=>n!==name&&validName(n)&&!role.test(n));if(otherNames.length)break;if(text.length>name.length&&text.length<1100&&role.test(text)){context=text;break;}node=node.parent();}
  if(!context)continue;const after=context.slice(context.indexOf(name)+name.length).trim().replace(/^[,|:—–-]+\s*/,'');const title=after.split(/[.!?]/)[0];if(!role.test(title))continue;
  let profile=url;try{const href=$(el).closest('a').attr('href')||$(el).parent().find('a[href]').first().attr('href');if(href)profile=safeURL(new URL(href,url).href).href;}catch{}const board=$(el).parents().toArray().some(e=>/board|director/i.test(($(e).attr('id')||'')+' '+($(e).attr('aria-label')||'')));add(name,title,context,profile,board?'Board':section);
 }
 // Profile biographies frequently put the person's name in the page title.
 const titleName=$('h1').first().text().trim();if(validName(titleName)){const text=$('main').length?$('main').text():$('body').text();const match=text.match(role);if(match)add(titleName,match[0],text.replace(/\s+/g,' ').trim().slice(0,900));}
 return result;
}
export function selectFilings(recent,{months=24,max=24,now=Date.now()}={}){
 const cutoff=new Date(now);cutoff.setUTCMonth(cutoff.getUTCMonth()-months);const out=[];
 for(let i=0;i<(recent.form||[]).length;i++)if(['10-K','10-Q','10-K/A','10-Q/A'].includes(recent.form[i])&&new Date(recent.filingDate[i])>=cutoff)out.push({type:recent.form[i].replace('/A',''),amendment:recent.form[i].endsWith('/A'),date:recent.filingDate[i],accession:recent.accessionNumber[i],document:recent.primaryDocument[i],period:recent.reportDate?.[i]||null});
 out.sort((a,b)=>b.date.localeCompare(a.date));return {selected:out.slice(0,max),total:out.length,cutoff:cutoff.toISOString().slice(0,10)};
}
