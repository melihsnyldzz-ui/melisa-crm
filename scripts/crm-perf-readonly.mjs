// Explicitly authorized local TEST measurements. Never sends messages or changes business data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let phase='before',runtimeSource,overwrite=false;
const seen=new Set();
for(let i=2;i<process.argv.length;i++){
 const flag=process.argv[i];
 if(seen.has(flag)||!['--phase','--runtime-source','--overwrite'].includes(flag))throw Error('MEASUREMENT_ARGUMENT_INVALID');
 seen.add(flag);
 if(flag==='--overwrite'){overwrite=true;continue;}
 const value=process.argv[++i];
 if(flag==='--phase'){if(!['before','after'].includes(value))throw Error('MEASUREMENT_PHASE_INVALID');phase=value;}
 else {if(!/^[a-f0-9]{40}$/.test(value||''))throw Error('MEASUREMENT_RUNTIME_SOURCE_INVALID');runtimeSource=value;}
}
const sourceHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
if(!/^[a-f0-9]{40}$/.test(sourceHead))throw Error('MEASUREMENT_SOURCE_HEAD_INVALID');
const runtimeSourceBasis=runtimeSource?'explicit':'startup-package-manifest';
if(!runtimeSource){
 const config=JSON.parse(await fs.readFile('C:/Sirket/CRM/runtime/test-completion/startup-config.json','utf8'));
 const manifestBytes=await fs.readFile(path.join(config.PackageRoot,'release-manifest.json'));
 if(crypto.createHash('sha256').update(manifestBytes).digest('hex')!==config.PackageManifestSha256)throw Error('MEASUREMENT_RUNTIME_MANIFEST_INVALID');
 const manifest=JSON.parse(manifestBytes);
 runtimeSource=manifest?.source?.commit;
 if(!/^[a-f0-9]{40}$/.test(runtimeSource||''))throw Error('MEASUREMENT_RUNTIME_SOURCE_INVALID');
}
const output=path.join(root,`docs/evidence/crm/performance-2026-10-05/${phase}-api.json`);
await fs.mkdir(path.dirname(output),{recursive:true});
// Reserve before any network request. Existing evidence requires explicit --overwrite.
const evidence=await fs.open(output,overwrite?'w':'wx');
const origin='http://127.0.0.1:62400',gateway='http://127.0.0.1:62401';
const round=n=>Math.round(n*100)/100;
const report={measuredAt:new Date().toISOString(),phase,sourceHead,runtimeSource,runtimeSourceBasis,scope:'authorized-existing-TEST-read-only',sampleCount:3,scenarios:[],stoppedOn429:false};
let token,productId;
async function checkpoint(){const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await evidence.truncate(0);await evidence.write(bytes,0,bytes.length,0);}
async function request(route,{bootstrap=false,binary=false}={}){
 const started=performance.now();
 const response=await fetch(bootstrap?origin+route:gateway+route,{method:bootstrap?'POST':'GET',headers:{Origin:origin,...(bootstrap?{}:{Authorization:`Bearer ${token}`})},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(50000)});
 const bytes=new Uint8Array(await response.arrayBuffer());
 const sample={status:response.status,ms:round(performance.now()-started),bytes:bytes.length};
 const retry=response.headers.get('retry-after');if(retry&&/^\d{1,9}$/.test(retry))sample.retryAfterSeconds=Number(retry);
 let body;if(!binary){try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{}}
 if(response.status===429)report.stoppedOn429=true;
 if(!bootstrap&&body){
  const data=body.data;
  for(const [key,value]of Object.entries(body.meta||{}))if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean') (sample.meta??={})[key]=value;
  if(Array.isArray(data))sample.count=data.length;
  for(const key of ['conversations','messages'])if(Array.isArray(data?.[key]))(sample.counts??={})[key]=data[key].length;
  const code=body.error?.code;if(typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code))sample.errorCode=code;
 }
 return {sample,body};
}
async function scenario(name,route,options={}){
 const entry={name,samples:[]};report.scenarios.push(entry);
 for(let i=0;i<3&&!report.stoppedOn429;i++){
  try{const {sample,body}=await request(route,options);entry.samples.push(sample);
   if(name==='catalog-first-page'&&sample.status===200&&Array.isArray(body?.data))productId=body.data.find(row=>/^vega-[1-9]\d*$/.test(row?.id))?.id;
  }catch{entry.samples.push({status:null,errorCode:'REQUEST_FAILED_OR_TIMEOUT'});}
  await checkpoint();
 }
 const values=entry.samples.filter(s=>Number.isFinite(s.ms)).map(s=>s.ms).sort((a,b)=>a-b);
 if(values.length){entry.medianMs=values[Math.floor(values.length/2)];entry.maxMs=values.at(-1);}
}
try{
 const boot=await request('/api/test-admin/session',{bootstrap:true});report.bootstrap={status:boot.sample.status,ms:boot.sample.ms};
 if(boot.sample.status!==200||typeof boot.body?.accessToken!=='string')throw Error('TEST_SESSION_UNAVAILABLE');
 token=boot.body.accessToken;
 const query=(page,search='')=>'/crm/catalog/products?'+new URLSearchParams({page:String(page),limit:'12',hasImage:'true',search,brand:'',category:''});
 let catalogBlocked=false;
 for(const [name,route]of [['auth-me','/auth/me'],['inbox','/crm/inbox?limit=100&offset=0'],['conversation-55','/crm/conversations/55'],['catalog-first-page',query(1)],['catalog-code-41140',query(1,'41140')],['catalog-name-supermini',query(1,'SÜPERMİNİ')]]){if(report.stoppedOn429)break;if(catalogBlocked){report.scenarios.push({name,status:'N/A-blocked',reason:'FIRST_PAGE_FAILED'});continue;}await scenario(name,route);if(name==='catalog-first-page'&&!report.scenarios.at(-1).samples.some(s=>s.status===200))catalogBlocked=true;}
 if(productId&&!report.stoppedOn429){await scenario('catalog-product-detail',`/crm/catalog/products/${productId}`);if(!report.stoppedOn429)await scenario('catalog-product-photo',`/crm/catalog/products/${productId}/photo`,{binary:true});}
 if(!productId&&!report.stoppedOn429)for(const name of ['catalog-product-detail','catalog-product-photo'])report.scenarios.push({name,status:'N/A-blocked',reason:'NO_SUCCESSFUL_PRODUCT_ID'});
 if(!report.stoppedOn429&&!catalogBlocked)await scenario('catalog-second-page',query(2));
 else if(catalogBlocked)report.scenarios.push({name:'catalog-second-page',status:'N/A-blocked',reason:'FIRST_PAGE_FAILED'});
}catch{report.errorCode='MEASUREMENT_INCOMPLETE';}
finally{token=undefined;productId=undefined;try{await checkpoint();}finally{await evidence.close();}}
console.log(JSON.stringify({output,stoppedOn429:report.stoppedOn429,scenarios:report.scenarios.map(({name,medianMs,maxMs,samples=[]})=>({name,medianMs,maxMs,statuses:samples.map(s=>s.status)}))}));
