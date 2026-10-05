import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const [phase,expected]=process.argv.slice(2);
if(!['before','after'].includes(phase)||!/^[a-f0-9]{40}$/.test(expected||''))throw Error('ARGUMENT_INVALID');
const configPath='C:/Sirket/CRM/runtime/test-completion/startup-config.json';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
let identity;
async function verify(){const cfg=JSON.parse(await fs.readFile(configPath,'utf8'));const b=await fs.readFile(path.join(cfg.PackageRoot,'release-manifest.json'));if(hash(b)!==cfg.PackageManifestSha256||JSON.parse(b).source.commit!==expected)throw Error('RUNTIME_IDENTITY_MISMATCH');const next=JSON.stringify([cfg.PackageRoot,cfg.PackageManifestSha256]);if(identity&&identity!==next)throw Error('RUNTIME_CHANGED');identity=next;}
await verify();
const output=`C:/Sirket/CRM/reports/crm-startup-${phase}-api-20261005.json`;
const file=await fs.open(output,'wx');
const report={phase,runtimeSource:expected,measuredAt:new Date().toISOString(),scope:'TEST-admin-authorized-read-only',sampleCount:3,scenarios:[],writes:0,stoppedOn429:false};
const origin='http://127.0.0.1:62400',gateway='http://127.0.0.1:62401';let token;
const round=n=>Math.round(n*100)/100;
async function read(route,bootstrap=false){await verify();const start=performance.now();const res=await fetch((bootstrap?origin:gateway)+route,{method:bootstrap?'POST':'GET',headers:{Origin:origin,...(bootstrap?{}:{Authorization:`Bearer ${token}`})},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(50000)});const bytes=new Uint8Array(await res.arrayBuffer());const ms=performance.now()-start;await verify();let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{};if(res.status===429)report.stoppedOn429=true;return {body,sample:{ms:round(ms),status:res.status,bytes:bytes.length}};}
try{const boot=await read('/api/test-admin/session',true);if(boot.sample.status!==200||!boot.body?.accessToken)throw Error('SESSION_REQUIRED');token=boot.body.accessToken;
for(const [name,route] of [['first-inbox-request','/crm/inbox?limit=100&offset=0&view=bootstrap'],['test-conversation-detail','/crm/conversations/55'],['catalog-first-page','/crm/catalog/products?page=1&limit=12&hasImage=true']]){const entry={name,samples:[]};report.scenarios.push(entry);for(let i=0;i<3&&!report.stoppedOn429;i++){const {body,sample}=await read(route);const d=body?.data;if(Array.isArray(d))sample.rows=d.length;if(d?.conversations)sample.rows=d.conversations.length;if(d?.summary){sample.total=d.summary.total;sample.summaryComplete=d.summary.complete!==false;sample.incomplete=d.summary.complete===false;sample.hydratedRows=d.conversations.filter(c=>Array.isArray(c.messages)).length;}if(body?.meta?.total!==undefined)sample.catalogTotal=body.meta.total;const code=body?.error?.code;if(typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code))sample.errorCode=code;entry.samples.push(sample)}const values=entry.samples.filter(s=>s.status===200).map(s=>s.ms).sort((a,b)=>a-b);if(values.length)entry.medianMs=values[Math.floor(values.length/2)];if(report.stoppedOn429)break;}
}catch{report.errorCode='MEASUREMENT_INCOMPLETE'}finally{token=undefined;await file.writeFile(JSON.stringify(report,null,2)+'\n');await file.close()}
console.log(JSON.stringify(report));