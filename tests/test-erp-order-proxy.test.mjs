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
