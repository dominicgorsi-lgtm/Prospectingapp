import {safeURL} from './network.js';import {sourceType,validDate} from './discovery.js';
export function q4Documents(data,base,cutoff){const out=[];for(const report of data.GetFinancialReportListResult||[]){let date=validDate(report.ReportDate);if(!date&&report.ReportDate){const parsed=new Date(report.ReportDate);if(!Number.isNaN(+parsed))date=parsed.toISOString().slice(0,10);}if(date&&date<cutoff)continue;for(const doc of report.Documents||[]){try{const url=safeURL(new URL(doc.DocumentPath,base).href).href;const type=sourceType(doc.DocumentTitle,url);out.push({url,title:`${report.ReportTitle} · ${doc.DocumentTitle}`,type,date,dateKind:'Investor-center report date',periodYear:report.ReportYear,origin:'Company investor-center financial feed',status:'Discovered'});}catch{}}}return out;}
export async function investorFeed(html,base,get,cutoff){
 // Public Q4 investor widgets expose their read-only key in the page source.
 // Use only the public GET feed; never call authenticated preview services.
 const key=html.match(/Q4ApiKey\s*=\s*["']([^"']+)["']/)?.[1];if(!key||!html.includes('.financials('))return [];
 const u=new URL('/feed/FinancialReport.svc/GetFinancialReportList',base);u.search=new URLSearchParams({apiKey:key,LanguageId:'1',reportTypes:'Annual Report|First Quarter|Second Quarter|Third Quarter|Fourth Quarter',pageSize:'500',pageNumber:'0',year:'-1',excludeSelection:'1',includeTags:'true'});
 try{const result=await get(u.href);const data=JSON.parse(result.body);if(!Array.isArray(data.GetFinancialReportListResult))throw new Error('Unexpected response');return q4Documents(data,base,cutoff);}catch{throw new Error('The public financial feed could not be retrieved; financial listings may be incomplete. Add direct document URLs.');}
}
