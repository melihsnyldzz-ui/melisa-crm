import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
import {createTestOrderHandler} from '../deploy/test-erp-orders.mjs';
import {nativeOrderPayload} from '../apps/frontend/src/lib/nativeOrder.js';

// Synthetic transport proof only: no socket, SQL transaction or pricing authority.
const endpoints=resolveTestEndpoints({CRM_TEST_PORT_BASE:'62700',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'});
const source='a'.repeat(40),packageId='synthetic-native-successor';
const health={environment:'ISOLATED_TEST_COPY',database:endpoints.database,serverName:'Semih\\MELISADEV',originalDatabaseAccess:0,liveDatabaseAccess:0,sysadmin:0,databaseControl:0,externalOperations:false,actualT1:false,automaticJobs:false,reservationEffect:false,purpose:'crm-order-draft-only',sourceCommit:source,packageId,port:62704,stockEffect:false,ledgerEffect:false};
const body=()=>nativeOrderPayload('12345678-1234-4234-9234-123456789012',{id:'88',phone:'905387217733'},{id:123,revision:'a'.repeat(64),blocked:false},{basis:'operator-confirmed',reason:'Synthetic test mapping'},[{productId:12,stockCode:'SYNTHETIC-12',priceId:9,unitSourceId:8,currency:'TRY',priceExact:'196.00000000',priceSourceKey:'synthetic:price:9',pricing:{origin:'MANUAL',versionId:'9223372036854775807',sourcePriceExact:null}}],[2],'1.00000000');
async function invoke(handler,method,path,input){
 const req=Readable.from(input===undefined?[]:[JSON.stringify(input)]);Object.assign(req,{method,url:path,headers:{authorization:'Bearer synthetic-crm','x-erp-token':'synthetic-native'}});
 let status,payload;await handler(req,{setHeader(){},writeHead(s){status=s;},end(s){payload=JSON.parse(s);}});return {status,payload};
}
function fixture({denied=false,badHealth=false}={}){
 const calls=[];let saved;const handler=createTestOrderHandler({testEndpoints:endpoints,nativeSourceCommit:source,nativePackageId:packageId,fetchFn:async(url,options)=>{
  calls.push({url:String(url),options});
  if(url.pathname==='/auth/me')return Response.json({data:{id:'synthetic',permissions:['crm.send']}});
  if(url.pathname==='/crm/conversations/88')return Response.json(denied?{error:{code:'FORBIDDEN'}}:{data:{id:'88',phone:'905387217733'}},{status:denied?403:200});
  if(url.pathname==='/test-health')return Response.json({data:{...health,...(badHealth?{sourceCommit:'b'.repeat(40)}:{})}});
  if(url.pathname==='/api/test/crm/orders/v2/drafts'&&options.method==='POST'){saved=JSON.parse(options.body);return Response.json({data:{request:saved,status:'draft'}});}
  if(url.pathname===`/api/test/crm/orders/v2/drafts/${body().requestId}`&&options.method==='GET')return Response.json({data:{request:saved,status:'draft'}});
  throw Error('Unexpected synthetic transport route');
 }});return {handler,calls};
}
test('E02 actual TEST transport preserves complete MANUAL request and historical readback',async()=>{
 const f=fixture(),input=body(),created=await invoke(f.handler,'POST','/crm/erp/v2/drafts',input);
 assert.equal(created.status,200);assert.deepEqual(created.payload.data.request,input);
 const post=f.calls.find(c=>c.options.method==='POST');assert.equal(post.options.body,JSON.stringify(input));assert.equal(post.options.headers.Authorization,'Bearer synthetic-native');assert.equal(post.options.headers['X-CRM-Authorization'],'Bearer synthetic-crm');assert.equal(post.options.redirect,'error');
 const detail=await invoke(f.handler,'GET',`/crm/erp/v2/drafts/${input.requestId}`);assert.equal(detail.status,200);assert.deepEqual(detail.payload.data.request,input);assert.equal(detail.payload.data.request.items[0].pricingWitness.sourcePriceExact8,null);assert.equal(detail.payload.data.request.items[0].pricingWitness.versionId,'9223372036854775807');assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
test('E02 witness cannot bypass TEST identity or normal conversation access',async()=>{
 for(const options of [{denied:true},{badHealth:true}]){const f=fixture(options),result=await invoke(f.handler,'POST','/crm/erp/v2/drafts',body());assert.equal(result.status,options.denied?403:503);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);}
});
