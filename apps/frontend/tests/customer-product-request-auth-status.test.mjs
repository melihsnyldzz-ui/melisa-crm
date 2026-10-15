import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerRequestApi,createStaffRequestApi} from '../src/customerProductRequest/api.js';
import {createRequestController} from '../src/customerProductRequest/controller.js';

const product={id:'erp-1',stockCode:'SYNTHETIC',productName:'Synthetic product',photoPath:'/api/live/customer-product-requests/products/erp-1/photo'};
const session=(revision=1,quantity=2)=>({sessionId:'synthetic-session',expiresAt:new Date(Date.now()+60000).toISOString(),draft:{revision,items:[{...product,productId:product.id,quantity}]},request:null});
const json=data=>Response.json({success:true,data});
const list=()=>Response.json({success:true,data:[product],meta:{page:1,total:1,totalPages:1,hasNextPage:false,categories:[],ages:[]}});
const bodies=[['empty',''],['HTML','<html>Access denied</html>'],['broken JSON','{"success":']];
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

for(const status of [401,403,410])for(const [label,body] of bodies){
  test(`actual API -> controller expires a ready customer on ${status} ${label}, clears photos and prevents further transport`,async t=>{
    const revoked=[];
    t.mock.method(URL,'createObjectURL',()=> 'blob:synthetic-auth-status');
    t.mock.method(URL,'revokeObjectURL',url=>revoked.push(url));
    let denied=false,transports=0,writes=0;
    const fetcher=async(url,options)=>{
      transports++;if((options.method||'GET')!=='GET')writes++;
      if(denied)return new Response(body,{status});
      if(url.endsWith('/session'))return json(session());
      if(url.includes('/products?'))return list();
      if(url.endsWith('/photo'))return new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});
      throw Error('Unexpected synthetic transport');
    };
    const controller=createRequestController({api:createCustomerRequestApi('synthetic-capability',{fetcher}),storage:storage(),uuid:()=> '00000000-0000-4000-8000-000000000001'});
    try{
      await controller.open();assert.equal(controller.getState().status,'ready');assert.equal(controller.getState().products.length,1);
      assert.equal(await controller.photo(product),'blob:synthetic-auth-status');
      denied=true;await controller.search({search:'synthetic'});
      // Check every independent consequence even when the old implementation stays ready.
      const state=controller.getState(),atDenial=transports;
      await controller.edit([{productId:product.id,quantity:3}]);await controller.submit();await controller.search({search:''});await controller.reconcile();
      assert.deepEqual({status:state.status,session:state.session,products:state.products,revoked,writes,extraTransports:transports-atDenial},
        {status:'expired',session:null,products:[],revoked:['blob:synthetic-auth-status'],writes:0,extraTransports:0});
    }finally{controller.dispose();}
  });
}

for(const [label,body] of bodies)test(`staff list preserves HTTP 401 for ${label}`,async()=>{
  const api=createStaffRequestApi('synthetic-staff-token',{fetcher:async()=>new Response(body,{status:401})});
  await assert.rejects(api.list('55'),error=>error.status===401);
});

test('a malformed successful JSON response still fails the contract',async()=>{
  const api=createCustomerRequestApi('synthetic-capability',{fetcher:async()=>new Response('{"success":',{status:200})});
  await assert.rejects(api.session(),error=>error.code==='PRODUCT_REQUEST_INVALID_RESPONSE'&&error.status===undefined);
});

function interruptedApi(status,onSignal){
  return createCustomerRequestApi('synthetic-capability',{fetcher:async(_url,{signal})=>{
    onSignal(signal);
    return new Response(new ReadableStream({start(controller){
      const abort=()=>controller.error(new DOMException('Cancelled','AbortError'));
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    }}),{status});
  }});
}
test('caller cancellation during an authorization body retains AbortError priority',async()=>{
  const caller=new AbortController();const api=interruptedApi(401,()=>{});
  const pending=api.session({signal:caller.signal});caller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');
});
test('the existing request deadline aborts a pending body with AbortError',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let signal;
  const pending=interruptedApi(200,value=>{signal=value;}).session();
  const rejected=assert.rejects(pending,error=>error.name==='AbortError');
  t.mock.timers.tick(20000);assert.equal(signal.aborted,true);await rejected;
});
test('valid refresh accepts only the fresh normalized server selection',async()=>{
  let reads=0;
  const api=createCustomerRequestApi('synthetic-capability',{fetcher:async url=>url.endsWith('/session')?json(++reads===1?session():session(2,4)):list()});
  const controller=createRequestController({api,storage:storage()});
  try{
    await controller.open();assert.equal(controller.getState().session.draft.revision,1);
    await controller.reconcile();assert.equal(controller.getState().status,'ready');
    assert.deepEqual(controller.getState().session.draft,{revision:2,items:[{...product,category:null,age:null,productId:product.id,quantity:4}]});
    assert.equal(reads,2);assert.equal(controller.getState().products.length,1);
  }finally{controller.dispose();}
});
