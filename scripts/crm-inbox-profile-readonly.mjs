// Authorized shadow measurement: GET-only Chatwoot reads; no gateway service import/readiness, SQL or send.
// Private values and rows exist only in memory. Output contains numeric timings/counts only.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'docs/evidence/crm/performance-2026-10-05/before-inbox-phases.json');
const config=JSON.parse(await fs.readFile('C:/Sirket/CRM/runtime/test-completion/startup-config.json','utf8'));
const expectedSource='f1899b0e0828f23010af75b1731682c749e596cc';
const manifestBytes=await fs.readFile(path.join(config.PackageRoot,'release-manifest.json'));
if(crypto.createHash('sha256').update(manifestBytes).digest('hex')!==config.PackageManifestSha256||JSON.parse(manifestBytes).source.commit!==expectedSource)throw Error('PROFILE_PACKAGE_IDENTITY_MISMATCH');
const {default:dotenv}=await import(pathToFileURL(path.join(config.PackageRoot,'apps/gateway/node_modules/dotenv/lib/main.js')));
let privateValues=dotenv.parse(await fs.readFile(config.BaselineEnv));
const base=new URL(privateValues.CHATWOOT_BASE_URL||'http://localhost:3100');
if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('PROFILE_LOOPBACK_REQUIRED');
const account=Number(privateValues.CHATWOOT_ACCOUNT_ID),inbox=Number(privateValues.CHATWOOT_INBOX_ID||0);
let token=privateValues.CHATWOOT_API_ACCESS_TOKEN;
const groups=privateValues.CHATWOOT_INCLUDE_GROUPS==='true';
privateValues=undefined;
if(!Number.isSafeInteger(account)||account<1||!token)throw Error('PROFILE_READ_CONFIG_REQUIRED');
const round=n=>Math.round(n*100)/100;
const report={samples:[],completed:0,providerReadinessCalls:0,sqlCalls:0,writes:0};
let activeSample;
async function read(route,phase){
 if(!/^\/conversations(?:\?status=all&page=[1-9]\d*&sort_by=created_at_desc|\/[1-9]\d*\/messages)$/.test(route))throw Error('PROFILE_GET_ROUTE_REJECTED');
 const start=performance.now();
 const response=await fetch(new URL(`/api/v1/accounts/${account}${route}`,base),{method:'GET',headers:{api_access_token:token},redirect:'error',signal:AbortSignal.timeout(25000)});
 const text=await response.text(),finish=performance.now();
 const payload=JSON.parse(text);
 activeSample[phase+'Calls']++; activeSample[phase+'SumMs']+=finish-start;activeSample[phase+'MaxMs']=Math.max(activeSample[phase+'MaxMs'],finish-start);activeSample[phase+'Bytes']+=Buffer.byteLength(text);
 if(!response.ok)throw Error('PROFILE_READ_REJECTED');
 return payload;
}
const direction=m=>m?.message_type===0||m?.message_type==='incoming'?'incoming':m?.message_type===1||m?.message_type==='outgoing'||m?.message_type===3||m?.message_type==='template'?'outgoing':null;
const publicMessage=m=>m&&!m.private&&![2,'2','activity'].includes(m.message_type);
try{
 activeSample={listCalls:0,listSumMs:0,listMaxMs:0,listBytes:0,messageCalls:0,messageSumMs:0,messageMaxMs:0,messageBytes:0,summaryCandidateCount:0,summaryMissingCount:0,latestIdMatchCount:0,latestIdMismatchCount:0,latestDirectionMatchCount:0,privateWorkflowCount:0,outgoingReceiptReadSkippedCount:0};
 report.samples.push(activeSample);
 const started=performance.now(),conversations=[],positions=new Map();let visited=0,total=0;
 for(let page=1;page<=80;page++){
  const response=await read(`/conversations?status=all&page=${page}&sort_by=created_at_desc`,'list');
  const rows=response?.data?.payload,count=Number(response?.data?.meta?.all_count);
  if(!Array.isArray(rows)||rows.length>25||!Number.isSafeInteger(count)||count<0||count>2000)throw Error('PROFILE_LIST_CONTRACT_REQUIRED');
  total=count;let newIds=0;
  for(const row of rows){if(!Number.isSafeInteger(Number(row?.id))||Number(row.id)<1)throw Error('PROFILE_LIST_CONTRACT_REQUIRED');const id=String(row.id);if(positions.has(id))conversations[positions.get(id)]=row;else{positions.set(id,conversations.length);conversations.push(row);newIds++;}}
  visited+=rows.length;if(rows.length&&!newIds||conversations.length>total||rows.length<25&&visited<total)throw Error('PROFILE_LIST_CONTRACT_REQUIRED');
  if(rows.length<25||visited>=total)break;
 }
 if(visited<total)throw Error('PROFILE_LIST_INCOMPLETE');
 activeSample.listWallMs=round(performance.now()-started);
 const phase=performance.now();
 const time=row=>{const value=row.last_activity_at||row.timestamp||row.updated_at;const numeric=Number(value);return Number.isFinite(numeric)?numeric*1000:Date.parse(value)||0;};
 conversations.sort((a,b)=>time(b)-time(a)||Number(b.id)-Number(a.id));
 const rows=conversations.filter(row=>(!inbox||Number(row.inbox_id)===inbox)&&(groups||!(String(row.meta?.sender?.identifier||'').toLowerCase().endsWith('@g.us')||String(row.meta?.sender?.name||'').toLocaleUpperCase('tr-TR').includes('(GROUP)')))).slice(0,100);
 activeSample.rawConversationCount=conversations.length;activeSample.selectedCount=rows.length;activeSample.filterSortMs=round(performance.now()-phase);
 const messagePhase=performance.now();let index=0;
 await Promise.all(Array.from({length:Math.min(5,rows.length)},async()=>{
  while(index<rows.length){const row=rows[index++];
   const candidate=publicMessage(row.last_non_activity_message)?row.last_non_activity_message:(row.messages||[]).filter(publicMessage).sort((a,b)=>Number(a.created_at)-Number(b.created_at)||Number(a.id)-Number(b.id)).at(-1);
   activeSample[candidate?'summaryCandidateCount':'summaryMissingCount']++;
   const response=await read(`/conversations/${row.id}/messages`,'message');if(!Array.isArray(response?.payload))throw Error('PROFILE_MESSAGE_CONTRACT_REQUIRED');
   const messages=response.payload.filter(publicMessage).sort((a,b)=>Number(a.content_attributes?.provider_timestamp||a.created_at)-Number(b.content_attributes?.provider_timestamp||b.created_at)||Number(a.id)-Number(b.id));
   const latest=messages.at(-1);
   if(candidate&&latest){activeSample[String(candidate.id)===String(latest.id)?'latestIdMatchCount':'latestIdMismatchCount']++;if(direction(candidate)===direction(latest))activeSample.latestDirectionMatchCount++;}
   activeSample.privateWorkflowCount+=response.payload.filter(m=>m.private&&m.content_attributes?.melisa_crm).length;
   activeSample.outgoingReceiptReadSkippedCount+=messages.filter(m=>m.content_attributes?.provider==='waapi'&&direction(m)==='outgoing').length;
  }
 }));
 activeSample.messageWallMs=round(performance.now()-messagePhase);activeSample.totalWallMs=round(performance.now()-started);
 for(const key of Object.keys(activeSample))if(key.endsWith('Ms'))activeSample[key]=round(activeSample[key]);
 report.completed=1;
}catch{report.completed=0;report.failure=1;}
finally{token=undefined;await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
