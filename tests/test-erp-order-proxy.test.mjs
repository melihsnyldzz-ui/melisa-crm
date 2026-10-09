import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createTestOrderHandler, ERP_TEST_IDENTITY } from '../deploy/test-erp-orders.mjs';

const requestId='00000000-0000-4000-8000-000000000001';
const draft={requestId,conversationId:'55',customerId:593,exchangeRate:1,items:[{sourceId:'vega-12',stockCode:'0007',quantity:2,unitPrice:196,currency:'TRY'}]};
async function invoke(handler,method,path,input,headers={}) {
  const req=Readable.from(input===undefined?[]:[JSON.stringify(input)]);
  Object.assign(req,{method,url:path,headers:{authorization:'Bearer synthetic-crm',...headers}});
  let status,payload;
  await handler(req,{setHeader(){},writeHead(value){status=value;},end(value){payload=JSON.parse(value);}});
  return {status,...payload};
}
function fixture({health=ERP_TEST_IDENTITY,permissions=['crm.send'],nativeStatus=200,nativeResult={}}={}) {
  const calls=[];
  const handler=createTestOrderHandler({fetchFn:async(url,options)=>{
    calls.push({url:String(url),options});
    if(url.pathname==='/auth/me')return Response.json({success:true,data:{id:1,permissions}});
    if(url.pathname==='/test-health')return Response.json({success:true,data:health});
    return Response.json(nativeStatus===200?{success:true,data:nativeResult}:{success:false,error:{code:'ERP_PRODUCT_MAPPING_REQUIRED',message:'not forwarded raw'}},{status:nativeStatus});
  }});
  return {handler,calls};
}
test('wrong target identity prevents native login and draft writes',async()=>{
  for(const health of [{...ERP_TEST_IDENTITY,database:'OTHER'},{...ERP_TEST_IDENTITY,environment:'LIVE'},{...ERP_TEST_IDENTITY,purpose:'other'}]){
    const f=fixture({health});
    for(const [path,input,headers] of [['/crm/erp/login',{username:'synthetic',password:'synthetic'},{}],['/crm/erp/drafts',draft,{'x-erp-token':'synthetic-erp'}]]){
      const result=await invoke(f.handler,'POST',path,input,headers);
      assert.equal(result.status,503);assert.equal(result.error.code,'ERP_TEST_IDENTITY_MISMATCH');
    }
    assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
  }
});
test('native draft proxy carries distinct CRM/native authentication and unchanged exact source lines',async()=>{
  const f=fixture({nativeResult:{id:12}});
  assert.equal((await invoke(f.handler,'POST','/crm/erp/drafts',draft,{'x-erp-token':'synthetic-erp'})).status,200);
  const call=f.calls.at(-1);
  assert.equal(call.url,'http://127.0.0.1:62404/api/test/crm/orders/drafts');
  assert.equal(call.options.headers.Authorization,'Bearer synthetic-erp');
  assert.equal(call.options.headers['X-CRM-Authorization'],'Bearer synthetic-crm');
  assert.deepEqual(JSON.parse(call.options.body),draft);assert.equal(call.options.redirect,'error');
  assert.equal(f.calls.at(-2).url,'http://127.0.0.1:62404/test-health');
});
test('CRM denial, missing ERP login and unknown route do not enter native service',async()=>{
  const denied=fixture({permissions:[]});assert.equal((await invoke(denied.handler,'POST','/crm/erp/drafts',draft,{'x-erp-token':'synthetic'})).status,403);assert.equal(denied.calls.length,1);
  const f=fixture();assert.equal((await invoke(f.handler,'POST','/crm/erp/drafts',draft)).status,401);assert.equal((await invoke(f.handler,'POST','/crm/erp/finalize',draft,{'x-erp-token':'synthetic'})).status,404);assert(f.calls.every(call=>call.url.endsWith('/auth/me')));
});
test('dashboard requests remain login-required without reading any ERP data',async()=>{
  const f=fixture();const result=await invoke(f.handler,'GET','/crm/erp/drafts');assert.deepEqual(result.data,{orders:[],loginRequired:true});assert.equal(f.calls.length,1);
});
test('native detail and context use health-checked read routes; mapping denial never retries',async()=>{
  const f=fixture({nativeStatus:409});const result=await invoke(f.handler,'POST','/crm/erp/drafts',draft,{'x-erp-token':'synthetic'});assert.equal(result.status,409);assert.equal(result.error.code,'ERP_PRODUCT_MAPPING_REQUIRED');assert.equal(f.calls.length,3);
  const read=fixture();await invoke(read.handler,'GET',`/crm/erp/drafts/${requestId}`,undefined,{'x-erp-token':'synthetic'});assert(read.calls.at(-1).url.endsWith(`/api/test/crm/orders/drafts/${requestId}`));
  await invoke(read.handler,'GET','/crm/erp/context',undefined,{'x-erp-token':'synthetic'});assert(read.calls.at(-1).url.endsWith('/api/test/crm/orders/context'));
});
test('v2 exact phone customer lookup has no fixed-customer fallback and separate native draft/readback paths',async()=>{
 const f=fixture({nativeResult:{status:'missing',entries:[]}}),headers={'x-erp-token':'synthetic-erp'};
 const result=await invoke(f.handler,'GET','/crm/erp/v2/customers?phone=905387217733&conversationId=55',undefined,headers);
 assert.equal(result.status,200);assert.deepEqual(result.data,{status:'missing',entries:[]});assert.equal(f.calls.at(-1).url,'http://127.0.0.1:62404/api/test/crm/orders/v2/customers?phone=905387217733&conversationId=55');
 await invoke(f.handler,'POST','/crm/erp/v2/drafts',{requestId,items:[{productId:17}]},headers);assert(f.calls.at(-1).url.endsWith('/api/test/crm/orders/v2/drafts'));assert.equal(JSON.parse(f.calls.at(-1).options.body).items[0].productId,17);
 await invoke(f.handler,'GET',`/crm/erp/v2/drafts/${requestId}`,undefined,headers);assert(f.calls.at(-1).url.endsWith(`/api/test/crm/orders/v2/drafts/${requestId}`));
 const n=f.calls.length;assert.equal((await invoke(f.handler,'GET','/crm/erp/v2/customers?phone=905387217733&conversationId=56',undefined,headers)).status,400);assert.equal(f.calls.length,n+1);
});

test('shared native read requires exact isolated source/package/effects and never falls back to normal TEST',async()=>{
 const endpoints=resolveTestEndpoints({CRM_TEST_PORT_BASE:'62500',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4174',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_01'});
 const source='a'.repeat(40),packageId='SHARED-NATIVE-FIXTURE',health={serverName:'Semih\\MELISADEV',originalDatabaseAccess:0,liveDatabaseAccess:0,sysadmin:0,databaseControl:0,externalOperations:false,actualT1:false,automaticJobs:false,reservationEffect:false,database:endpoints.database,environment:'ISOLATED_TEST_COPY',purpose:'crm-order-draft-only',sourceCommit:source,packageId,port:62504,stockEffect:false,ledgerEffect:false};
 for(const override of [{},{database:'MELISA_ERP_SIRKET_TEST_20260929_01'},{sourceCommit:'b'.repeat(40)},{packageId:'OTHER'},{stockEffect:true},{port:62404},{actualT1:true},{originalDatabaseAccess:1},{environment:'CANONICAL_TEST'}]){
  const calls=[];const handler=createTestOrderHandler({testEndpoints:endpoints,nativeSourceCommit:source,nativePackageId:packageId,fetchFn:async(url,options)=>{calls.push(String(url));if(url.pathname==='/auth/me')return Response.json({data:{id:'synthetic',permissions:['crm.send']}});if(url.pathname==='/test-health')return Response.json({data:{...health,...override}});return Response.json({data:{draft:'synthetic-read-only'}});}});
  const result=await invoke(handler,'GET',`/crm/erp/v2/drafts/${requestId}`,undefined,{'x-erp-token':'synthetic-native'});
  assert.ok(calls.every(u=>u.startsWith('http://127.0.0.1:62501/')||u.startsWith('http://127.0.0.1:62504/')));
  assert.equal(result.status,Object.keys(override).length?503:200);assert.equal(calls.length,Object.keys(override).length?2:3);
 }
});
test('shared existing-account login uses health-verified ERP4174 and never native auth',async()=>{
 const endpoints=resolveTestEndpoints({CRM_TEST_PORT_BASE:'62500',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4174',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_01'}),source='a'.repeat(40),packageId='native-fixture';
 const base={ok:true,environment:'ISOLATED_TEST_COPY',serverName:'Semih\\MELISADEV',originalDatabaseAccess:0,liveDatabaseAccess:0,sysadmin:0,databaseControl:0,externalOperations:false,actualT1:false,automaticJobs:false};
 for(const wrong of [false,true]){
  const calls=[],handler=createTestOrderHandler({testEndpoints:endpoints,nativeSourceCommit:source,nativePackageId:packageId,fetchFn:async(url,options)=>{calls.push({url:String(url),options});if(url.pathname==='/auth/me')return Response.json({data:{id:'crm-existing',permissions:['crm.send']}});if(url.pathname==='/test-health')return Response.json({data:url.port==='62504'?{...base,database:endpoints.database,port:62504,purpose:'crm-order-draft-only',sourceCommit:source,packageId,stockEffect:false,ledgerEffect:false,reservationEffect:false}:{...base,databaseName:wrong?'OTHER':endpoints.database,port:4174,mode:'erp',writes:true}});if(url.pathname==='/api/auth/login')return Response.json({data:{accessToken:'synthetic-only',user:{id:23,displayName:'existing-fixture',permissions:['sales.create']}}});if(url.pathname==='/api/auth/me')return Response.json({data:{id:23,permissions:['sales.create']}});throw Error('unexpected route');}});
  const r=await invoke(handler,'POST','/crm/erp/login',{username:'existing-fixture',password:'synthetic-only'});assert.equal(r.status,wrong?503:200);
  assert(!calls.some(c=>c.url==='http://127.0.0.1:62504/api/auth/login'));
  const login=calls.find(c=>c.url==='http://127.0.0.1:4174/api/auth/login');if(wrong)assert.equal(login,undefined);else{assert.equal(login.options.headers.origin,'http://127.0.0.1:5224');assert(calls.some(c=>c.url==='http://127.0.0.1:4174/api/auth/me'));assert.equal(r.data.user.id,23);assert.equal(r.data.environment,'ISOLATED_TEST_COPY');}
 }
});
