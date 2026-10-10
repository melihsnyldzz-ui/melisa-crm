import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import express from '../apps/gateway/node_modules/express/index.js';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
import {createStableServiceHealthHandler} from '../deploy/stable-transport.mjs';
import {createTestOrderHandler} from '../deploy/test-erp-orders.mjs';
import {createTestCatalogHandler} from '../deploy/test-erp-catalog.mjs';
import {createHealthRoutes} from '../apps/gateway/src/routes/healthRoutes.js';
const source='a'.repeat(40),copy='e16b70f0-4057-428b-9abc-6bbcaf35fe82';
const environment=()=>({CRM_STABLE_TRANSPORT:'true',CRM_TEST_PORT_BASE:'62700',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',CRM_TEST_SOURCE_COMMIT:source,CRM_TEST_COPY_ID:copy,CRM_PAID_AI_ENABLED:'false',WHATSAPP_SEND_ENABLED:'false'});
function fixture(service='catalog',patch={}) {
 const env=environment(),ep=resolveTestEndpoints(env),counts={verification:0,manifest:0};
 const options={service,executionRoot:path.resolve('crm-shared-stable-test-'+source),environment:env,testEndpoints:ep,
  verifyPackage:()=>{counts.verification++;return{environment:'TEST',sourceCommit:source};},
  readManifest:()=>{counts.manifest++;return{source:{commit:source},build:{stableTransport:true,isolatedPreparation:true}};},...patch};
 return{options,ep,counts,handler:createStableServiceHealthHandler(options)};
}
function response(){return{status:0,body:undefined,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};}
const request=(port,patch={})=>({url:'/test-health',method:'GET',headers:{host:'127.0.0.1:'+port},socket:{localAddress:'127.0.0.1',remoteAddress:'127.0.0.1'},...patch});
test('configured health requires explicit DB02, immutable source/package and off external flags before listening',()=>{
 for(const change of [{CRM_TEST_SOURCE_COMMIT:'short'},{CRM_TEST_COPY_ID:'unknown'},{CRM_TEST_COPY_ID:'e16a1234-1234-4123-8123-123456789abc'},{CRM_PAID_AI_ENABLED:'true'},{WHATSAPP_SEND_ENABLED:'true'}])assert.throws(()=>fixture('catalog',{environment:{...environment(),...change}}),/IDENTITY_REQUIRED/);
 for(const patch of [{executionRoot:path.resolve('ordinary-source')},{verifyPackage:()=>undefined},{verifyPackage:()=>({environment:'TEST',sourceCommit:'b'.repeat(40)})},{readManifest:()=>({source:{commit:source},build:{stableTransport:false,isolatedPreparation:true}})}])assert.throws(()=>fixture('catalog',patch),/IDENTITY_REQUIRED/);
 const disabled=fixture('catalog',{environment:{...environment(),CRM_STABLE_TRANSPORT:'false'}});assert.equal(disabled.handler(request(62702),response()),false);assert.equal(disabled.counts.verification,0);
});
test('all three services use exact socket/Host GET/HEAD without Origin or forwarded identity; probes never revalidate or read DB',()=>{
 for(const service of ['catalog','orders','gateway']){
  const f=fixture(service),port=f.ep[service];
  for(const method of ['GET','HEAD','GET']){const res=response();assert.equal(f.handler(request(port,{method}),res),true);assert.equal(res.status,200);if(method==='HEAD')assert.equal(res.body,undefined);else{const data=JSON.parse(res.body);assert.equal(data.service,service);assert.equal(data.sourceCommit,source);assert.equal(data.copyId,copy);assert.equal(data.database,f.ep.database);assert.equal(data.identityKind,'CONFIGURED_TEST_TRANSPORT');assert.equal(data.dependencyProof,'SEPARATE_ERP_NATIVE_PROBES');assert.equal(data.actualT1,false);assert.equal(data.externalOperations,false);assert.equal(data.paidAi,false);assert.equal(data.whatsappSend,false);}}
  for(const changed of [{method:'POST'},{socket:{localAddress:'127.0.0.1',remoteAddress:'192.168.1.46'}},{headers:{host:'localhost:'+port}},...['origin','forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip'].map(key=>({headers:{host:'127.0.0.1:'+port,[key]:''}}))]){const res=response();f.handler(request(port,changed),res);assert.equal(res.status,403);assert.doesNotMatch(res.body||'',/sourceCommit|copyId/);}
  for(const url of ['/test-health?x=1','/health','/test-health/'])assert.equal(f.handler(request(port,{url}),response()),false);
  assert.deepEqual(f.counts,{verification:1,manifest:1});
 }
});
test('actual catalog/orders/gateway handlers expose only configured health without provider/auth calls, retaining normal route denials',async t=>{
 let readerCalls=0,fetchCalls=0;
 for(const service of ['catalog','orders','gateway']){
  const f=fixture(service),app=service==='gateway'?express():null;
  let handler;
  const server=http.createServer(app||((req,res)=>handler(req,res)));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  f.ep[service]=server.address().port;
  const serviceHealth=createStableServiceHealthHandler({...f.options,testEndpoints:f.ep});
  if(service==='catalog')handler=createTestCatalogHandler({serviceHealth,reader:async()=>{readerCalls++;return Response.json({error:'CURRENT_CRM_SESSION_REQUIRED'},{status:401});}});
  else if(service==='orders')handler=createTestOrderHandler({serviceHealth,fetchFn:async()=>{fetchCalls++;throw Error('NO_UPSTREAM_EXPECTED');}});
  else app.use(createHealthRoutes({serviceHealth}));
  const root='http://127.0.0.1:'+f.ep[service];
  const read=await fetch(root+'/test-health');assert.equal(read.status,200);assert.equal((await read.json()).service,service);
  assert.equal((await fetch(root+'/test-health',{method:'HEAD'})).status,200);
  assert.equal((await fetch(root+'/test-health',{headers:{origin:'https://semih.tail295701.ts.net:8443'}})).status,403);
  if(service!=='gateway'){const denied=await fetch(root+(service==='orders'?'/crm/erp/v2/drafts/fixture':'/api/crm-catalog/products'));assert.equal(denied.status,401);}
 }
 assert.equal(fetchCalls,0);assert.equal(readerCalls,1);
});
