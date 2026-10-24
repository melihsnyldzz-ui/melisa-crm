// GET-only shadow comparison of exact baseline/edited traversal function bodies.
// Private config, backend identities, rows and set hashes never leave process memory.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await fs.readFile('C:/Sirket/CRM/runtime/test-completion/startup-config.json','utf8'));
const manifestBytes=await fs.readFile(path.join(config.PackageRoot,'release-manifest.json'));
if(crypto.createHash('sha256').update(manifestBytes).digest('hex')!==config.PackageManifestSha256||JSON.parse(manifestBytes).source.commit!=='f1899b0e0828f23010af75b1731682c749e596cc')throw Error('PROFILE_PACKAGE_IDENTITY_MISMATCH');
const {default:dotenv}=await import(pathToFileURL(path.join(config.PackageRoot,'apps/gateway/node_modules/dotenv/lib/main.js')));
let values=dotenv.parse(await fs.readFile(config.BaselineEnv));
const base=new URL(values.CHATWOOT_BASE_URL||'http://localhost:3100');
if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('PROFILE_LOOPBACK_REQUIRED');
const account=Number(values.CHATWOOT_ACCOUNT_ID);let token=values.CHATWOOT_API_ACCESS_TOKEN;values=undefined;
if(!Number.isSafeInteger(account)||account<1||!token)throw Error('PROFILE_CONFIG_REQUIRED');
const identity=crypto.createHash('sha256').update(JSON.stringify([base.href,account,token])).digest('hex');
const round=n=>Math.round(n*100)/100;
const report={before:{},after:{},completed:0,sameIdSet:0,sameMetadata:0,providerCalls:0,sqlCalls:0,writes:0};
const iso=value=>{if(!value)return null;const numeric=Number(value),date=Number.isFinite(numeric)?new Date(numeric*1000):new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString();};
function compile(source,read){
 const start=source.indexOf('async function readAllConversationPagesUnshared('),end=source.indexOf('\nfunction readAllConversationPages(',start);
 if(start<0||end<0)throw Error('PROFILE_SOURCE_FUNCTION_REQUIRED');
 // Only the existing pure traversal function is evaluated; no service module imports or startup.
 return new Function('chatwootApiRequest','assertBackendIdentity','toIsoDate',`const CHATWOOT_PAGE_SIZE=25,CHATWOOT_MAX_TRAVERSAL_PAGES=80,CHATWOOT_MAX_RAW_CONVERSATIONS=2000;\n${source.slice(start,end)}\nreturn readAllConversationPagesUnshared;`)(read,current=>{if(current!==identity)throw Error('PROFILE_IDENTITY_CHANGED');},iso);
}
async function run(filename,result){
 const source=await fs.readFile(filename,'utf8');let active=0;
 Object.assign(result,{calls:0,sumMs:0,maxMs:0,bytes:0,peak:0});
 const read=async route=>{
  if(!/^\/conversations\?status=all&page=[1-9]\d*&sort_by=created_at_desc$/.test(route))throw Error('PROFILE_ROUTE_REJECTED');
  const started=performance.now();active++;result.peak=Math.max(result.peak,active);
  try{
   const response=await fetch(new URL(`/api/v1/accounts/${account}${route}`,base),{method:'GET',headers:{api_access_token:token},redirect:'error',signal:AbortSignal.timeout(25000)});
   const text=await response.text(),elapsed=performance.now()-started;result.calls++;result.sumMs+=elapsed;result.maxMs=Math.max(result.maxMs,elapsed);result.bytes+=Buffer.byteLength(text);
   if(!response.ok)throw Error('PROFILE_READ_REJECTED');return JSON.parse(text);
  }finally{active--;}
 };
 const started=performance.now(),data=await compile(source,read)(identity);result.wallMs=round(performance.now()-started);result.count=data.rows.length;result.cacheable=Number(data.cacheable);
 result.sumMs=round(result.sumMs);result.maxMs=round(result.maxMs);
 return data.rows;
}
try{
 const relative='apps/gateway/src/services/chatwootInboxService.js';
 const before=await run(path.join(config.PackageRoot,relative),report.before),after=await run(path.join(root,relative),report.after);
 const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 report.sameIdSet=Number(hash(before.map(r=>Number(r.id)).sort((a,b)=>a-b))===hash(after.map(r=>Number(r.id)).sort((a,b)=>a-b)));
 const metadata=rows=>rows.map(r=>[Number(r.id),r.inbox_id,r.status,r.meta?.assignee?.id,r.unread_count,r.last_activity_at]).sort((a,b)=>a[0]-b[0]);
 report.sameMetadata=Number(hash(metadata(before))===hash(metadata(after)));report.completed=1;
}catch{report.failure=1;}
finally{token=undefined;const output=path.join(root,'docs/evidence/crm/performance-2026-10-05/inbox-traversal-shadow-compare.json');await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
