// Authorized f166 TEST shadow profiler. GET-only Chatwoot; no listeners, readiness, SQL or sends.
// Private configuration and full rows stay in memory. Only metadata/counts/timings are persisted.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const probeOnly=process.argv.length===3&&process.argv[2]==='--probe-only';
const orderingOnly=process.argv.length===3&&process.argv[2]==='--ordering-probe';
if(process.argv.length>2&&!probeOnly&&!orderingOnly)throw Error('STARTUP_PROFILE_ARGUMENT_INVALID');
const expectedSource='f166b0f7db499c68e6cc6718bcf090fcaf457927';
const expectedManifest='47c495de9fa0d1da6a1878b7dfc2b2d6742c976d4541f35944315bacd36b6d4f';
const configPath='C:/Sirket/CRM/runtime/test-completion/startup-config.json';
const output=path.join(root,'docs/evidence/crm/performance-2026-10-05/startup-before-provider.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const config=JSON.parse(await fs.readFile(configPath,'utf8'));
async function assertPackage(){
 const current=JSON.parse(await fs.readFile(configPath,'utf8'));
 const bytes=await fs.readFile(path.join(current.PackageRoot,'release-manifest.json'));
 if(current.PackageRoot!==config.PackageRoot||current.PackageManifestSha256!==expectedManifest||hash(bytes)!==expectedManifest||JSON.parse(bytes).source.commit!==expectedSource)throw Error('STARTUP_PROFILE_RUNTIME_IDENTITY_CHANGED');
}
function processIdentity(){
 // Never output a process command line or a private config value.
 const command=`$ErrorActionPreference='Stop'; $cfg=Get-Content -LiteralPath 'C:\\Sirket\\CRM\\runtime\\test-completion\\startup-config.json' -Raw|ConvertFrom-Json; $connections=Get-NetTCPConnection -State Listen|Where-Object LocalPort -In 62400,62401,62402,62403,62404; $all=Get-CimInstance Win32_Process; $result=foreach($port in 62400,62401,62402,62403,62404){$c=@($connections|Where-Object LocalPort -EQ $port);if($c.Count -ne 1){throw 'STARTUP_PROFILE_PORT_IDENTITY_INVALID'};$p=$all|Where-Object ProcessId -EQ $c[0].OwningProcess;if(!$p){throw 'STARTUP_PROFILE_PROCESS_REQUIRED'};$entry=switch($port){62400{'deploy/test-server.mjs'}62401{'deploy/test-server.mjs'}62402{'deploy/test-erp-catalog.mjs'}62403{'deploy/test-erp-orders.mjs'}62404{'apps/api/start-crm-order-test.mjs'}};$package=if($port -eq 62404){$cfg.NativeRelease}else{$cfg.PackageRoot};$script=Join-Path $package $entry;$owner=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid;if($c[0].LocalAddress -ne '127.0.0.1' -or $p.ExecutablePath -ne $cfg.NodePath -or $owner.ReturnValue -ne 0 -or $owner.Sid -ne $cfg.OwnerSid -or !$p.CommandLine.Contains($script)){throw 'STARTUP_PROFILE_PROCESS_IDENTITY_INVALID'};[pscustomobject]@{port=$port;pid=$p.ProcessId;startedAt=$p.CreationDate.ToUniversalTime().ToString('o')}};ConvertTo-Json -InputObject @($result) -Compress`;
 const rows=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
 if(rows.length!==5||rows[0].pid!==rows[1].pid)throw Error('STARTUP_PROFILE_PROCESS_IDENTITY_INVALID');
 return rows;
}
await assertPackage();
const baselineServices=processIdentity();
const {default:dotenv}=await import(pathToFileURL(path.join(config.PackageRoot,'apps/gateway/node_modules/dotenv/lib/main.js')));
let values=dotenv.parse(await fs.readFile(config.BaselineEnv));
const base=new URL(values.CHATWOOT_BASE_URL||'http://localhost:3100');
if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('STARTUP_PROFILE_LOOPBACK_REQUIRED');
const account=Number(values.CHATWOOT_ACCOUNT_ID),inbox=Number(values.CHATWOOT_INBOX_ID||0),groups=values.CHATWOOT_INCLUDE_GROUPS==='true';let token=values.CHATWOOT_API_ACCESS_TOKEN;values=undefined;
if(!Number.isSafeInteger(account)||account<1||!token)throw Error('STARTUP_PROFILE_CONFIG_REQUIRED');
const identity=hash(JSON.stringify([base.href,account,token]));
const source=await fs.readFile(path.join(config.PackageRoot,'apps/gateway/src/services/chatwootInboxService.js'),'utf8');
const extract=(begin,end)=>{const start=source.indexOf(begin),finish=source.indexOf(end,start);if(start<0||finish<0)throw Error('STARTUP_PROFILE_FUNCTION_REQUIRED');return source.slice(start,finish).replace(/\bexport /g,'');};
const pure=extract('function toIsoDate(', 'async function readMessagesUnshared(');
const hydration=extract('async function readMessagesUnshared(', '\nfunction readMessages(');
const traversal=extract('async function readAllConversationPagesUnshared(', '\nfunction readAllConversationPages(');
const report=(probeOnly||orderingOnly)?JSON.parse(await fs.readFile(output,'utf8')):{measuredAt:new Date().toISOString(),runtimeSource:expectedSource,manifestSha256:expectedManifest,baselineServices,sampleCount:3,snapshotMode:'three-independent-cold-shadow-traversals; gateway-management-20s-snapshot-not-used',hydrationMode:'exact-public-message-mapping-and-private-workflow; receipt-journal-enrichment-excluded',providerReadinessCalls:0,sqlCalls:0,writes:0,completed:0,samples:[]};
if(report.runtimeSource!==expectedSource||report.manifestSha256!==expectedManifest||(probeOnly||orderingOnly)&&!report.completed)throw Error('STARTUP_PROFILE_BASELINE_REQUIRED');
if(orderingOnly&&report.installedOrderingProbe)throw Error('STARTUP_PROFILE_ORDERING_PROBE_EXISTS');
const round=n=>Math.round(n*100)/100;
let sample,phase;
const rawMessages=new Map();
async function read(route){
 if(!/^\/conversations\?status=all&page=[1-9]\d*&sort_by=(?:created_at_desc|last_activity_at_desc)$/.test(route)&&!/^\/conversations\/[1-9]\d*\/messages$/.test(route)&&route!=='/agents')throw Error('STARTUP_PROFILE_ROUTE_REJECTED');
 const section=sample[phase],started=performance.now();
 const response=await fetch(new URL(`/api/v1/accounts/${account}${route}`,base),{method:'GET',headers:{api_access_token:token},redirect:'error',signal:AbortSignal.timeout(25000)});
 const text=await response.text(),elapsed=performance.now()-started;
 section.calls++;section.bytes+=Buffer.byteLength(text);section.requestSumMs+=elapsed;section.requestMaxMs=Math.max(section.requestMaxMs,elapsed);
 if(phase==='list'&&section.calls===1)sample.firstProviderListPage={ms:round(elapsed),bytes:Buffer.byteLength(text),status:response.status};
 if(!response.ok)throw Error('STARTUP_PROFILE_READ_REJECTED');const payload=JSON.parse(text);
 if(probeOnly&&/^\/conversations\/[1-9]\d*\/messages$/.test(route))rawMessages.set(route.split('/')[2],payload.payload);
 return payload;
}
await fs.mkdir(path.dirname(output),{recursive:true});
const evidence=await fs.open(output,(probeOnly||orderingOnly)?'r+':'wx');
try{
 if(orderingOnly){
  if(report.installedOrderingProbe)throw Error('STARTUP_PROFILE_ORDERING_PROBE_EXISTS');
  const probe=report.installedOrderingProbe={measuredAt:new Date().toISOString(),completed:0,list:{calls:0,bytes:0,requestSumMs:0,requestMaxMs:0}};sample=probe;phase='list';
  const traverse=new Function('chatwootApiRequest','assertBackendIdentity','const CHATWOOT_PAGE_SIZE=25,CHATWOOT_MAX_TRAVERSAL_PAGES=80,CHATWOOT_MAX_RAW_CONVERSATIONS=2000;\n'+pure+'\n'+traversal+'\nreturn readAllConversationPagesUnshared;')(read,current=>{if(current!==identity)throw Error('STARTUP_PROFILE_BACKEND_IDENTITY_INVALID');});
  const t=row=>Number(row.last_activity_at||row.timestamp||row.updated_at)||0;
  const start=performance.now(),first=await read('/conversations?status=all&page=1&sort_by=last_activity_at_desc');
  const recent=first?.data?.payload;if(!Array.isArray(recent)||recent.length!==25)throw Error('STARTUP_PROFILE_RECENT_PAGE_INVALID');
  probe.firstWallMs=round(performance.now()-start);const fullStart=performance.now(),result=await traverse(identity),all=result.rows,top=all.slice(0,25);probe.fullWallMs=round(performance.now()-fullStart);
  const recentIds=new Set(recent.map(r=>Number(r.id))),topIds=new Set(top.map(r=>Number(r.id))),cutoff=t(top.at(-1));
  const onlyRecent=recent.filter(r=>!topIds.has(Number(r.id))),onlyTop=top.filter(r=>!recentIds.has(Number(r.id)));
  Object.assign(probe,{recentCount:recent.length,fullCount:all.length,recentMinTimestamp:Math.min(...recent.map(t)),recentMaxTimestamp:Math.max(...recent.map(t)),fullMinTimestamp:Math.min(...all.map(t)),fullMaxTimestamp:Math.max(...all.map(t)),topMinTimestamp:Math.min(...top.map(t)),topMaxTimestamp:Math.max(...top.map(t)),cutoffTimestamp:cutoff,fullAboveCutoffCount:all.filter(r=>t(r)>cutoff).length,fullAtCutoffCount:all.filter(r=>t(r)===cutoff).length,recentAtCutoffCount:recent.filter(r=>t(r)===cutoff).length,topAtCutoffCount:top.filter(r=>t(r)===cutoff).length,onlyRecentCount:onlyRecent.length,onlyTopCount:onlyTop.length,membershipDifferenceAllAtCutoff:Number([...onlyRecent,...onlyTop].every(r=>t(r)===cutoff)),recentAbsentFromFullCount:recent.filter(r=>!all.some(a=>Number(a.id)===Number(r.id))).length,sameIdOrder:Number(recent.every((r,i)=>Number(r.id)===Number(top[i]?.id))),sameActivitySequence:Number(recent.every((r,i)=>t(r)===t(top[i]))),sameTimestampForRecentSharedRows:Number(recent.every(r=>{const a=all.find(a=>Number(a.id)===Number(r.id));return !a||t(a)===t(r);})),recentDescendingViolations:recent.slice(1).filter((r,i)=>t(recent[i])<t(r)).length});
  await assertPackage();probe.sameServiceIdentity=Number(JSON.stringify(baselineServices)===JSON.stringify(processIdentity()));if(!probe.sameServiceIdentity)throw Error('STARTUP_PROFILE_PROCESS_IDENTITY_CHANGED');probe.list.requestSumMs=round(probe.list.requestSumMs);probe.list.requestMaxMs=round(probe.list.requestMaxMs);probe.completed=1;
 }else if(probeOnly){
  const metrics=()=>({calls:0,bytes:0,requestSumMs:0,requestMaxMs:0});
  const probe=report.recentFirstPageProbe={measuredAt:new Date().toISOString(),beforeServices:baselineServices,completed:0,list:metrics(),messages:metrics(),receiptJournalReadsSkipped:0};sample=probe;
  const factory=new Function('chatwootApiRequest','assertBackendIdentity','enrichWaapiReceipt',`const CHATWOOT_PAGE_SIZE=25,CHATWOOT_MAX_TRAVERSAL_PAGES=80,CHATWOOT_MAX_RAW_CONVERSATIONS=2000;\n${pure}\n${hydration}\n${traversal}\nreturn {traverse:readAllConversationPagesUnshared,hydrate:readMessagesUnshared,map:mapChatwootMessage,type:normalizeChatwootMessageType};`);
  const functions=factory(read,current=>{if(current!==identity)throw Error('STARTUP_PROFILE_BACKEND_IDENTITY_INVALID');},async(mapped,raw)=>{if(raw.content_attributes?.provider==='waapi'&&mapped.direction==='outgoing')probe.receiptJournalReadsSkipped++;return mapped;});
  phase='list';let start=performance.now();const first=await read('/conversations?status=all&page=1&sort_by=last_activity_at_desc');probe.recentFirstPageWallMs=round(performance.now()-start);
  const recent=first?.data?.payload;if(!Array.isArray(recent)||recent.length>25)throw Error('STARTUP_PROFILE_RECENT_PAGE_INVALID');probe.recentFirstPageCount=recent.length;probe.recentFirstPageBytes=probe.list.bytes;
  const firstCalls=probe.list.calls,firstBytes=probe.list.bytes;start=performance.now();const full=await functions.traverse(identity);probe.allPagesWallMs=round(performance.now()-start);probe.allPagesCalls=probe.list.calls-firstCalls;probe.allPagesBytes=probe.list.bytes-firstBytes;probe.allPagesCount=full.rows.length;
  const ids=rows=>hash(JSON.stringify(rows.map(r=>Number(r.id))));probe.sameGlobalRecentIdOrder=Number(ids(recent)===ids(full.rows.slice(0,recent.length)));probe.sameGlobalRecentIdSet=Number(hash(JSON.stringify(recent.map(r=>Number(r.id)).sort((a,b)=>a-b)))===hash(JSON.stringify(full.rows.slice(0,recent.length).map(r=>Number(r.id)).sort((a,b)=>a-b))));
  const time=row=>Date.parse((()=>{const n=Number(row.last_activity_at||row.timestamp||row.updated_at);return Number.isFinite(n)?new Date(n*1000).toISOString():row.last_activity_at||row.timestamp||row.updated_at;})())||0;
  probe.recentOrderingViolations=recent.slice(1).filter((row,i)=>time(recent[i])<time(row)).length;
  Object.assign(probe,{lastNonActivityPresent:0,lastNonActivityPrivateRejected:0,lastNonActivityActivityRejected:0,candidateMissing:0,sameLatestId:0,latestIdMismatch:0,directionMismatch:0,textMismatch:0,normalizedTimeMismatch:0,attachmentCountMismatch:0,idMismatchSameText:0,idMismatchSameSourceId:0,idMismatchProviderTimestampPresent:0,idMismatchDifferentNormalizedTime:0});
  phase='messages';start=performance.now();let index=0;
  const settled=await Promise.allSettled(Array.from({length:Math.min(5,recent.length)},async()=>{while(index<recent.length){const row=recent[index++],last=row.last_non_activity_message;if(last){probe.lastNonActivityPresent++;if(last.private)probe.lastNonActivityPrivateRejected++;if(functions.type(last)==='activity')probe.lastNonActivityActivityRejected++;}
   const publicRow=m=>m&&!m.private&&functions.type(m)!=='activity';
   const mappedPublic=(row.messages||[]).filter(publicRow).map(m=>({raw:m,mapped:functions.map(m)})).sort((a,b)=>(Date.parse(a.mapped.createdAt)||0)-(Date.parse(b.mapped.createdAt)||0)||Number(a.mapped.id)-Number(b.mapped.id));
   const candidate=publicRow(last)?{raw:last,mapped:functions.map(last)}:mappedPublic.at(-1);
   const detail=await functions.hydrate(row,identity),latest=detail.messages.at(-1);if(!candidate||!latest){probe.candidateMissing++;continue;}
   const sameId=String(candidate.mapped.id)===String(latest.id);probe[sameId?'sameLatestId':'latestIdMismatch']++;
   if(candidate.mapped.direction!==latest.direction)probe.directionMismatch++;if(candidate.mapped.text!==latest.text)probe.textMismatch++;if(candidate.mapped.createdAt!==latest.createdAt)probe.normalizedTimeMismatch++;if(candidate.mapped.attachments.length!==latest.attachments.length)probe.attachmentCountMismatch++;
   if(!sameId){if(candidate.mapped.text===latest.text)probe.idMismatchSameText++;const latestRaw=rawMessages.get(String(row.id))?.find(m=>String(m.id)===String(latest.id));if(candidate.raw.source_id&&candidate.raw.source_id===latestRaw?.source_id)probe.idMismatchSameSourceId++;if(candidate.raw.content_attributes?.provider_timestamp||latestRaw?.content_attributes?.provider_timestamp)probe.idMismatchProviderTimestampPresent++;if(candidate.mapped.createdAt!==latest.createdAt)probe.idMismatchDifferentNormalizedTime++;}
   rawMessages.delete(String(row.id));
  }}));const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;probe.messageHydrationWallMs=round(performance.now()-start);
  await assertPackage();probe.afterServices=processIdentity();probe.sameServiceIdentity=Number(JSON.stringify(baselineServices)===JSON.stringify(probe.afterServices));if(!probe.sameServiceIdentity)throw Error('STARTUP_PROFILE_PROCESS_IDENTITY_CHANGED');for(const section of ['list','messages'])for(const key of ['requestSumMs','requestMaxMs'])probe[section][key]=round(probe[section][key]);probe.completed=1;
 }else{
 for(let iteration=0;iteration<3;iteration++){
  await assertPackage();
  sample={index:iteration+1,list:{calls:0,bytes:0,requestSumMs:0,requestMaxMs:0},messages:{calls:0,bytes:0,requestSumMs:0,requestMaxMs:0,receiptJournalReadsSkipped:0,publicMessageCount:0,workflowEntryCount:0},team:{calls:0,bytes:0,requestSumMs:0,requestMaxMs:0}};report.samples.push(sample);
  const factory=new Function('chatwootApiRequest','assertBackendIdentity','enrichWaapiReceipt',`const CHATWOOT_PAGE_SIZE=25,CHATWOOT_MAX_TRAVERSAL_PAGES=80,CHATWOOT_MAX_RAW_CONVERSATIONS=2000;\n${pure}\n${hydration}\n${traversal}\nreturn {traverse:readAllConversationPagesUnshared,hydrate:readMessagesUnshared};`);
  const functions=factory(read,current=>{if(current!==identity)throw Error('STARTUP_PROFILE_BACKEND_IDENTITY_INVALID');},async(mapped,raw)=>{if(raw.content_attributes?.provider==='waapi'&&mapped.direction==='outgoing')sample.messages.receiptJournalReadsSkipped++;return mapped;});
  phase='list';let start=performance.now();const result=await functions.traverse(identity);sample.list.wallMs=round(performance.now()-start);sample.list.rawCount=result.rows.length;sample.list.cacheable=Number(result.cacheable);
  const rows=result.rows.filter(row=>(!inbox||Number(row.inbox_id)===inbox)&&(groups||!(String(row.meta?.sender?.identifier||'').toLowerCase().endsWith('@g.us')||String(row.meta?.sender?.name||'').toLocaleUpperCase('tr-TR').includes('(GROUP)')))).slice(0,100);
  sample.messages.conversationCount=rows.length;phase='messages';start=performance.now();let index=0;
  const settled=await Promise.allSettled(Array.from({length:Math.min(5,rows.length)},async()=>{while(index<rows.length){const data=await functions.hydrate(rows[index++],identity);sample.messages.publicMessageCount+=data.messages.length;sample.messages.workflowEntryCount+=data.workflow.length;}}));
  const failed=settled.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  sample.messages.wallMs=round(performance.now()-start);
  phase='team';start=performance.now();const agents=await read('/agents');const list=Array.isArray(agents)?agents:agents?.payload;if(!Array.isArray(list))throw Error('STARTUP_PROFILE_TEAM_CONTRACT_INVALID');sample.team.count=list.length;sample.team.wallMs=round(performance.now()-start);
  for(const section of ['list','messages','team'])for(const key of ['requestSumMs','requestMaxMs'])sample[section][key]=round(sample[section][key]);
 }
 await assertPackage();report.afterServices=processIdentity();report.sameServiceIdentity=Number(JSON.stringify(baselineServices)===JSON.stringify(report.afterServices));
 if(!report.sameServiceIdentity)throw Error('STARTUP_PROFILE_PROCESS_IDENTITY_CHANGED');
 const median=values=>values.sort((a,b)=>a-b)[1];
 report.medians={firstProviderPageMs:median(report.samples.map(s=>s.firstProviderListPage.ms)),allPagesWallMs:median(report.samples.map(s=>s.list.wallMs)),messageHydrationWallMs:median(report.samples.map(s=>s.messages.wallMs)),teamWallMs:median(report.samples.map(s=>s.team.wallMs))};report.completed=1;
 }
}catch{if(orderingOnly){if(report.installedOrderingProbe)report.installedOrderingProbe.failure=1;}else if(probeOnly)report.recentFirstPageProbe.failure=1;else report.failure=1;}
finally{token=undefined;rawMessages.clear();try{await evidence.truncate(0);await evidence.writeFile(JSON.stringify(report,null,2)+'\n');}finally{await evidence.close();}}
console.log(JSON.stringify({output,completed:report.completed,sameServiceIdentity:report.sameServiceIdentity,medians:report.medians}));
