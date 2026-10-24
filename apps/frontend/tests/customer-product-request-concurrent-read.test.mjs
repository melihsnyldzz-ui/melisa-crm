import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerRequestApi} from '../src/customerProductRequest/api.js';
import {createRequestController} from '../src/customerProductRequest/controller.js';
import {operationStore} from '../src/customerProductRequest/model.js';

const operationId='00000000-0000-4000-8000-000000000001';
const product={id:'erp-1',productId:'erp-1',stockCode:'SYNTHETIC',productName:'Synthetic product',quantity:2,photoPath:'/api/live/customer-product-requests/products/erp-1/photo'};
const session=(revision=1,request=null)=>({sessionId:'synthetic-session',expiresAt:new Date(Date.now()+60000).toISOString(),draft:{revision,items:[product]},request});
const json=data=>Response.json({success:true,data});
function setup({retry=false}={}){
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  if(retry)operationStore(storage).write('synthetic-session',operationId);
  let listError=null,resolveWrite,writeSignal,writes=0,transports=0,sentOperation;
  const writeResponse=new Promise(resolve=>{resolveWrite=resolve;});
  const fetcher=async(url,options)=>{
    transports++;
    if(url.endsWith('/session'))return json(session());
    if(url.includes('/products?')){
      if(listError==='timeout')throw new DOMException('Synthetic list timeout','AbortError');
      if(listError)return new Response('',{status:listError});
      return Response.json({success:true,data:[product],meta:{page:1,total:1,totalPages:1,hasNextPage:false,categories:[],ages:[]}});
    }
    if(url.endsWith('/draft')||url.endsWith('/submit')){writes++;writeSignal=options.signal;sentOperation=JSON.parse(options.body).operationId;return writeResponse;}
    throw Error('Unexpected synthetic transport');
  };
  const controller=createRequestController({api:createCustomerRequestApi('synthetic-capability',{fetcher}),storage,uuid:()=>operationId});
  return {controller,storage,setListError(value){listError=value;},resolveWrite,get writes(){return writes;},get transports(){return transports;},get writeSignal(){return writeSignal;},get sentOperation(){return sentOperation;}};
}
function successfulWrite(kind){
  const receipt=kind==='submit'?{id:'synthetic-request',status:'interest',submittedAt:new Date().toISOString(),items:[product],modelCount:1,quantityTotal:2}:null;
  return json(session(2,receipt));
}
const begin=(controller,kind)=>kind==='edit'?controller.edit([{productId:product.id,quantity:2}]):controller.submit();

for(const [kind,listError,retry] of [['edit',503,false],['submit',503,false],['submit','timeout',false],['submit',503,true]]){
  test(`${kind}${retry?' retry':''} pending survives concurrent list ${listError} without changing its write state`,async()=>{
    const page=setup({retry});let pending;
    try{
      await page.controller.open();pending=begin(page.controller,kind);
      assert.equal(page.controller.getState().busy,true);assert.equal(page.writes,1);
      const before=page.controller.getState(),operation=operationStore(page.storage).read('synthetic-session');
      page.setListError(listError);await page.controller.search({search:'synthetic'});
      const during=page.controller.getState(),duringOperation=operationStore(page.storage).read('synthetic-session');
      assert.equal(page.writeSignal.aborted,false);
      page.resolveWrite(successfulWrite(kind));await pending;
      assert.deepEqual({busy:during.busy,uncertain:during.uncertain,listBusy:during.listBusy,session:during.session},
        {busy:true,uncertain:before.uncertain,listBusy:false,session:before.session});
      assert.ok(during.error);assert.equal(operation,kind==='submit'?operationId:null);assert.equal(duringOperation,operation);
      assert.equal(page.writes,1);assert.equal(page.controller.getState().busy,false);
      assert.equal(page.controller.getState().uncertain,false);
      if(kind==='submit'){assert.equal(page.sentOperation,operationId);assert.equal(page.controller.getState().step,'success');assert.equal(operationStore(page.storage).read('synthetic-session'),null);}
      else assert.equal(page.controller.getState().session.draft.revision,2);
    }finally{page.resolveWrite(successfulWrite(kind));await pending;page.controller.dispose();}
  });
}

for(const kind of ['edit','submit'])test(`${kind} write failure after a list failure still marks uncertainty`,async()=>{
  const page=setup();let pending;
  try{
    await page.controller.open();pending=begin(page.controller,kind);
    page.setListError(503);await page.controller.search({search:'synthetic'});
    page.resolveWrite(new Response('',{status:503}));await pending;
    const state=page.controller.getState();
    assert.equal(state.busy,false);assert.equal(state.uncertain,true);assert.ok(state.error);assert.ok(state.session);
    assert.equal(operationStore(page.storage).read('synthetic-session'),kind==='submit'?operationId:null);
    assert.equal(page.writes,1);
  }finally{page.resolveWrite(successfulWrite(kind));await pending;page.controller.dispose();}
});

for(const status of [401,403,410])test(`list ${status} during pending submit still closes the entire context and rejects late success`,async()=>{
  const page=setup();let pending;
  try{
    await page.controller.open();pending=page.controller.submit();page.setListError(status);
    await page.controller.search({search:'synthetic'});
    const denied=page.controller.getState();assert.equal(denied.status,'expired');assert.equal(denied.session,null);assert.deepEqual(denied.products,[]);
    assert.equal(denied.busy,false);assert.equal(denied.listBusy,false);assert.equal(page.writeSignal.aborted,true);
    page.resolveWrite(successfulWrite('submit'));await pending;
    assert.equal(page.controller.getState().status,'expired');assert.equal(page.controller.getState().session,null);
    const transports=page.transports;
    await page.controller.edit([{productId:product.id,quantity:3}]);await page.controller.submit();
    assert.equal(page.transports,transports);assert.equal(page.writes,1);
  }finally{page.resolveWrite(successfulWrite('submit'));await pending;page.controller.dispose();}
});

for(const status of [401,403,410,503])test(`older list ${status} after newer success ${status===503?'stays ignored':'still expires the same context'}`,async()=>{
  let resolveOlder,reads=0,writes=0;
  const olderResponse=new Promise(resolve=>{resolveOlder=resolve;});
  const listing=()=>Response.json({success:true,data:[product],meta:{page:1,total:1,totalPages:1,hasNextPage:false,categories:[],ages:[]}});
  const api=createCustomerRequestApi('synthetic-capability',{fetcher:async(url,options)=>{
    if((options.method||'GET')!=='GET')writes++;
    if(url.endsWith('/session'))return json(session());
    if(url.includes('/products?'))return ++reads===2?olderResponse:listing();
    throw Error('Unexpected synthetic transport');
  }});
  const page=createRequestController({api});let older;
  try{
    await page.open();older=page.search({search:'older'});
    await page.search({search:'newer'});
    const fresh=page.getState();assert.equal(fresh.status,'ready');assert.equal(fresh.filters.search,'newer');assert.equal(fresh.products.length,1);
    resolveOlder(new Response('',{status}));await older;
    const state=page.getState();
    if(status===503){assert.equal(state,fresh);assert.equal(state.error,'');}
    else{assert.equal(state.status,'expired');assert.equal(state.session,null);assert.deepEqual(state.products,[]);assert.equal(state.listBusy,false);}
    assert.equal(writes,0);
  }finally{resolveOlder(new Response('',{status}));await older;page.dispose();}
});
