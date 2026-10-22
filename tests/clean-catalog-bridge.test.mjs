// Real reader -> gateway bridge with an in-memory transport; no listener/SQL/GUI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {cleanEnvironment} from '../scripts/ci/environment.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const script=String.raw`
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCatalogBridge} from './apps/gateway/src/services/catalogBridge.mjs';
import {createCanonicalCatalogReader} from './packages/erp-adapter/services/canonicalCatalogReader.mjs';
const actor={id:'synthetic-clean-staff',role:'personel',permissions:['crm.view']};
const image=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const product={id:1,stockCode:'SYN-1',productName:'Yapay TEST',isActive:true,hold:{blocked:false},provenance:{kind:'synthetic-test',verified:true,sourceKey:'synthetic-clean:1'},barcodes:[],salePrices:[],stockQuantityExact:'2.00000000',photo:{status:'available',verified:true,url:'/api/catalog/products/1/photo?variant=preview',sourceKey:'synthetic-clean:1',sha256:createHash('sha256').update(image).digest('hex')}};
const nativeMeta={schemaVersion:'melisa-catalog.v1',readOnly:true,freshLive:false,readAt:new Date().toISOString(),sourceAsOf:'2026-10-22',scopeCounts:{syntheticTest:1},total:1,page:1,limit:50,filters:{brands:[],productTypes:[]}};
const health={ok:true,environment:'CLEAN_SYNTHETIC_TEST',synthetic:true,databaseName:'MELISA_ERP_CLEAN_TEST_20261022',serverName:'Semih\\MELISADEV',port:4194,mode:'erp',writes:true,originalDatabaseAccess:0,liveDatabaseAccess:0,sysadmin:0,databaseControl:0,externalOperations:false,automaticJobs:false,actualT1:false};
const reader=createCanonicalCatalogReader({erpOrigin:'http://127.0.0.1:4194',expectedDatabase:health.databaseName,crmOrigin:'http://127.0.0.1:62801',getErpAuthorization:async()=> 'Bearer synthetic-erp',transport:async(input)=>{
 const url=new URL(input);if(url.pathname==='/auth/me')return Response.json({data:actor});
 if(url.pathname==='/test-health')return Response.json(health);
 if(url.pathname.endsWith('/photo'))return new Response(image,{headers:{'content-type':'image/png'}});
 return Response.json({success:true,data:url.pathname.endsWith('/1')?product:[product],meta:nativeMeta});
}});
let alter=x=>x;
const bridge=createCatalogBridge({deploymentApproved:true,authorizeCrm:async()=>({...actor,catalogReadApproved:true}),resolveCrmReadSession:async()=>({crmActorId:actor.id,authorization:'Bearer synthetic-crm',expiresAt:Date.now()+60000,isCurrent:()=>true,signal:new AbortController().signal}),transport:async(url,options)=>{
 const response=await reader(new Request(url,options));if(!response.headers.get('content-type')?.startsWith('application/json'))return response;
 const body=await response.json();if(body.meta)body.meta=alter(body.meta);return Response.json(body,{status:response.status});
}});
const get=path=>bridge(new Request('http://127.0.0.1:62801/crm/catalog/products'+path));
if(process.env.CRM_ERP_CATALOG_ORIGIN!=='http://127.0.0.1:62802'){
 assert.equal((await get('')).status,503);process.exit(0);
}
for(const path of ['', '/erp-1', '/erp-1/photo?variant=thumbnail']){
 const response=await get(path);assert.equal(response.status,200,path+': '+await response.clone().text());
 if(path.includes('/photo'))assert.deepEqual(new Uint8Array(await response.arrayBuffer()),image);
 else {const body=await response.json();assert.equal(body.meta.environment,'CLEAN_SYNTHETIC_TEST');assert.equal(body.meta.synthetic,true);}
}
for(const mutate of [m=>({...m,environment:'CANONICAL_TEST'}),m=>({...m,synthetic:false}),m=>({...m,businessScope:{...m.businessScope,database:'OTHER'}}),m=>({...m,businessScope:{...m.businessScope,scopeKind:'VERIFIED_BUSINESS_TEST'}}),m=>({...m,sourceIdentity:{...m.sourceIdentity,environment:'CANONICAL_TEST'}}),m=>({...m,cached:true}),m=>({...m,sourceDatabaseVerified:false}),m=>({...m,verifiedCrmActorId:'other'}),m=>({...m,verifiedCrmRole:'patron'})]){
 alter=mutate;assert.equal((await get('')).status,503);assert.equal((await get('/erp-1/photo?variant=thumbnail')).status,503);
}
alter=x=>x;
for(const [key,value]of Object.entries({CRM_TEST_PROFILE:'',CRM_TEST_PORT_BASE:'62700',CRM_ISOLATED_PREPARATION:'false',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',CRM_TEST_EXPECTED_DATABASE:'OTHER'})){
 const prior=process.env[key];process.env[key]=value;assert.equal((await get('')).status,503,key);process.env[key]=prior;
}
`;

test('actual clean reader and gateway agree on list/detail/photo identity and reject cross-environment metadata',()=>{
 for(const origin of ['http://127.0.0.1:62802','http://127.0.0.1:62402']){
  const result=spawnSync(process.execPath,['--import',new URL('./offline-test-guard.mjs',import.meta.url).href,'--input-type=module','-e',script],{cwd:root,env:{...cleanEnvironment(),CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_TEST_PORT_BASE:'62800',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',CRM_ERP_CATALOG_ORIGIN:origin},encoding:'utf8',windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr||result.stdout);
 }
});
