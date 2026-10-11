import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CUSTOMER_CAPABILITY_KEY,CUSTOMER_OPERATION_KEY,consumeCapability,clearCustomerStorage,draftItems,operationStore,newOperationId} from '../src/customerProductRequest/model.js';
import {createCustomerRequestApi,createStaffRequestApi,MAX_PHOTO_BYTES,normalizedSession,normalizedRequest} from '../src/customerProductRequest/api.js';
import {createRequestController} from '../src/customerProductRequest/controller.js';

const cap=`synthetic_${'c'.repeat(33)}`;
const operationId='00000000-0000-4000-8000-000000000001';
const secondId='00000000-0000-4000-8000-000000000002';
const product=id=>({id,stockCode:`CODE ${id.slice(5)}`,productName:'Gerçek kaynak ürünü',category:'TAKIM',age:null,photoPath:`/api/live/customer-product-requests/products/${id}/photo`});
const session=(items=[],patch={})=>({sessionId:'synthetic-session',expiresAt:'2099-01-01T00:00:00.000Z',draft:{revision:0,items:items.map(([id,count])=>({...product(id),productId:id,quantity:count}))},request:null,...patch});
const listing=(items=[product('vega-1')])=>({products:items,meta:{page:1,total:items.length,totalPages:1,hasNextPage:false,categories:[{value:'TAKIM',count:items.length}],ages:[]}});
const memory=()=>{const values=new Map();return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('customer fragment is consumed once and private customer keys cannot overwrite staff/Semih/native sessions',()=>{
  const storage=memory();storage.setItem('crm-native-session','preserved');storage.setItem('crm-semih-session','preserved');const history=[];
  const location={hash:`#request=${cap}`,pathname:'/katalog',search:''};
  assert.equal(consumeCapability({location,history:{replaceState:(...args)=>history.push(args)},storage}),cap);
  assert.deepEqual(history,[[null,'','/katalog']]);assert.equal(storage.getItem(CUSTOMER_CAPABILITY_KEY),cap);
  assert.equal(consumeCapability({location:{...location,hash:''},history:{},storage}),cap);
  operationStore(storage).write('synthetic-session',operationId);assert.equal(consumeCapability({location,history:{replaceState(){}},storage}),cap);assert.equal(operationStore(storage).read('synthetic-session'),operationId);
  clearCustomerStorage(storage);assert.equal(storage.getItem(CUSTOMER_CAPABILITY_KEY),null);assert.equal(storage.getItem('crm-native-session'),'preserved');assert.equal(storage.getItem('crm-semih-session'),'preserved');
  storage.setItem(CUSTOMER_CAPABILITY_KEY,cap);storage.setItem(CUSTOMER_OPERATION_KEY,'old-operation');
  assert.equal(consumeCapability({location:{...location,hash:'#request=bad&conversationId=88'},history:{replaceState(){}},storage}),'');assert.equal(storage.getItem(CUSTOMER_CAPABILITY_KEY),null);assert.equal(storage.getItem(CUSTOMER_OPERATION_KEY),null);
});
test('interest draft includes only canonical IDs and bounded integer quantities, never client price/customer snapshots',()=>{
  assert.deepEqual(draftItems([{productId:'vega-3',quantity:2,price:999,contactId:'spoof'}]),[{productId:'vega-3',quantity:2}]);
  for(const items of [[{productId:'other',quantity:1}],[{productId:'vega-3',quantity:0}],[{productId:'vega-3',quantity:1.5}],[{productId:'vega-3',quantity:10000}],[{productId:'vega-3',quantity:1},{productId:'vega-3',quantity:2}],Array.from({length:51},(_,index)=>({productId:`vega-${index}`,quantity:1}))])assert.throws(()=>draftItems(items));
});
test('HTTP LAN browser uses cryptographic UUIDv4 without depending on secure-context randomUUID',()=>{
  const value=newOperationId({getRandomValues:bytes=>{bytes.fill(255);return bytes;}});assert.equal(value,'ffffffff-ffff-4fff-bfff-ffffffffffff');assert.throws(()=>newOperationId({}),/güncel bir tarayıcı/);
});
test('actual backend millisecond dates and both supported product prefixes normalize without fabricating ages or prices',()=>{
  const source=session([['erp-3',2]],{expiresAt:4070908800000});assert.equal(normalizedSession(source).expiresAt,'2099-01-01T00:00:00.000Z');assert.equal(normalizedSession(source).draft.items[0].age,null);assert.equal(Object.hasOwn(normalizedSession(source).draft.items[0],'price'),false);
  assert.equal(normalizedRequest({id:'request',status:'interest',submittedAt:1791763200000,items:source.draft.items,modelCount:1,quantityTotal:2}).submittedAt,new Date(1791763200000).toISOString());
});
test('actual customer API uses cap only in Authorization, no normal CRM cookie, bounded paging and original photos',async()=>{
  const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});if(url.endsWith('/photo'))return new Response(new Uint8Array([255,216,255,1]),{headers:{'content-type':'image/jpeg'}});if(url.includes('/products?'))return Response.json({success:true,data:listing().products,meta:listing().meta});return Response.json({success:true,data:session()});};
  const api=createCustomerRequestApi(cap,{fetcher});await api.session();const list=await api.products({search:'8023 CONCEPT',category:'TAKIM',page:2,limit:24});assert.equal(list.meta.ages.length,0);await api.updateDraft(3,[{productId:'vega-1',quantity:2,price:44}]);await api.submit(4,operationId);const photo=await api.photo('vega-1');assert.equal(photo.type,'image/jpeg');
  for(const {url,options} of calls){assert(!url.includes(cap));assert.equal(options.headers.Authorization,`Bearer ${cap}`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');}
  assert.match(calls[1].url,/search=8023\+CONCEPT/);assert.deepEqual(JSON.parse(calls[2].options.body),{revision:3,items:[{productId:'vega-1',quantity:2}]});assert.deepEqual(JSON.parse(calls[3].options.body),{revision:4,operationId});assert(!calls[4].url.includes('preview'));
  await assert.rejects(()=>api.products({limit:4000}));assert.equal(calls.length,5);
});
test('malformed API/photo responses and foreign photo URLs fail closed without exposing a capable image',async()=>{
  for(const payload of [{success:true,data:{}},{success:true,data:{...session(),draft:{revision:0,items:[{...product('vega-1'),productId:'vega-1',quantity:1,photoPath:'https://evil.test/image.jpg'}]}}},{success:true,data:{...session(),request:{id:'x',status:'sale',items:[]}}}]){
    const api=createCustomerRequestApi(cap,{fetcher:async()=>Response.json(payload)});await assert.rejects(()=>api.session());
  }
  for(const response of [()=>new Response('<svg></svg>',{headers:{'content-type':'image/svg+xml'}}),()=>new Response(new Uint8Array([1,2,3,4]),{headers:{'content-type':'image/jpeg'}}),()=>new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg','content-length':String(MAX_PHOTO_BYTES+1)}}),()=>new Response(new Uint8Array(MAX_PHOTO_BYTES+1),{headers:{'content-type':'image/png'}})]){
    const api=createCustomerRequestApi(cap,{fetcher:async()=>response()});await assert.rejects(()=>api.photo('vega-1'));
  }
});
test('staff routes retain normal token, require source conversation and preserve authoritative interest counts',async()=>{
  const record={id:'synthetic-request',status:'interest',submittedAt:'2026-10-12T00:00:00.000Z',items:session([['vega-1',2]]).draft.items,modelCount:1,quantityTotal:2};const calls=[];
  const api=createStaffRequestApi('synthetic-normal-personnel',{fetcher:async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:url.endsWith('/sessions')?{sessionId:'synthetic-session',capability:cap,expiresAt:'2099-01-01T00:00:00Z'}:[record]});}});
  assert.deepEqual(await api.list('7733'),[record]);await api.issue('7733');assert.equal(calls[0].url,'/api/live/crm/customer-product-requests?conversationId=7733');assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-normal-personnel');assert.deepEqual(JSON.parse(calls[1].options.body),{conversationId:'7733'});await assert.rejects(()=>api.issue('caller-contact'));assert.equal(calls.length,2);
});
test('server draft survives search, quantity edit, removal and reopening; no product snapshot is trusted from storage',async()=>{
  let persisted=session(),writes=0;const api={session:async()=>persisted,products:async()=>listing(),updateDraft:async(revision,items)=>{assert.equal(revision,persisted.draft.revision);writes++;persisted=session(items.map(item=>[item.productId,item.quantity]),{draft:{revision:revision+1,items:items.map(item=>({...product(item.productId),...item}))}});return persisted;}};
  const first=createRequestController({api,storage:memory()});await first.open();await first.toggle(product('vega-1'));assert.equal(first.getState().session.draft.items[0].quantity,1);await first.search({search:'a different product'});assert.equal(first.getState().session.draft.items[0].productId,'vega-1');first.review();await first.edit([{productId:'vega-1',quantity:12}]);assert.equal(first.getState().session.draft.items[0].quantity,12);first.dispose();
  const reopened=createRequestController({api,storage:memory()});await reopened.open();assert.equal(reopened.getState().session.draft.items[0].quantity,12);await reopened.edit([]);assert.equal(reopened.getState().session.draft.items.length,0);assert.equal(writes,3);reopened.dispose();
});
test('double submit has one transport and lost response/reopen retries durable same operation ID until readback',async()=>{
  const storage=memory(),response=deferred();let persisted=session([['vega-1',2]]),calls=0;
  const api={session:async()=>persisted,products:async()=>listing(),submit:async(revision,id)=>{calls++;assert.equal(id,operationId);if(calls===1){await response.promise;throw Object.assign(Error('Unknown result'),{status:503});}persisted={...persisted,request:{id:'saved-request',status:'interest',submittedAt:'2026-10-12T00:00:00Z',items:persisted.draft.items,modelCount:1,quantityTotal:2}};return persisted;}};
  const first=createRequestController({api,storage,uuid:()=>operationId});await first.open();first.review();const submit=first.submit();await first.submit();assert.equal(calls,1);assert.equal(operationStore(storage).read('synthetic-session'),operationId);response.resolve();await submit;assert.equal(first.getState().step,'review');assert.equal(first.getState().uncertain,true);first.dispose();
  const second=createRequestController({api,storage,uuid:()=>secondId});await second.open();assert.equal(second.getState().uncertain,true);assert.equal(second.getState().step,'review');await second.submit();assert.equal(calls,2);assert.equal(second.getState().step,'success');assert.equal(operationStore(storage).read('synthetic-session'),null);await second.submit();assert.equal(calls,2);second.dispose();
});
test('operation storage failure prevents transport and uncertain draft mutation must reconcile before submit',async()=>{
  let submissions=0,persisted=session([['vega-1',1]]);const api={session:async()=>persisted,products:async()=>listing(),submit:async()=>{submissions++;return persisted;},updateDraft:async()=>{throw Object.assign(Error('Unknown write'),{status:503});}};
  const denied=createRequestController({api,storage:{getItem(){return null;},setItem(){throw Error('Blocked');}},uuid:()=>operationId});await denied.open();await denied.submit();assert.equal(submissions,0);assert.match(denied.getState().error,/normal tarayıcıda/);denied.dispose();
  const controller=createRequestController({api,storage:memory()});await controller.open();await controller.edit([{productId:'vega-1',quantity:3}]);assert.equal(controller.getState().uncertain,true);await controller.submit();assert.equal(submissions,0);await controller.edit([{productId:'vega-1',quantity:4}]);await controller.reconcile();assert.equal(controller.getState().uncertain,false);assert.equal(controller.getState().session.draft.items[0].quantity,1);controller.dispose();
});
test('expired/foreign context clears rendered products and cache; late photos cannot restore after disposal',async()=>{
  const photo=deferred(),api={session:async()=>session(),products:async()=>listing(),photo:async()=>photo.promise};const controller=createRequestController({api,storage:memory()});await controller.open();const loading=controller.photo(product('vega-1'));controller.dispose();photo.resolve(new Blob([new Uint8Array([255,216,255,1])],{type:'image/jpeg'}));await assert.rejects(()=>loading);
  const foreignApi={session:async()=>session(),products:async()=>listing(),updateDraft:async()=>session([['vega-1',1]],{sessionId:'different-customer'})};const foreign=createRequestController({api:foreignApi,storage:memory()});await foreign.open();await foreign.toggle(product('vega-1'));assert.equal(foreign.getState().status,'expired');assert.equal(foreign.getState().session,null);assert.deepEqual(foreign.getState().products,[]);foreign.dispose();
  const revoked=createRequestController({api:{session:async()=>{throw Object.assign(Error('Revoked'),{status:401});}},storage:memory()});await revoked.open();assert.equal(revoked.getState().status,'expired');revoked.dispose();
});
test('a late search cannot replace newer customer results and read failures never count as a submitted request',async()=>{
  const old=deferred();let calls=0;const controller=createRequestController({storage:memory(),api:{session:async()=>session(),products:async()=>++calls===2?old.promise:listing([product(calls===1?'vega-1':'vega-3')])}});await controller.open();const first=controller.search({search:'old'});await controller.search({search:'latest'});old.resolve(listing([product('vega-2')]));await first;assert.equal(controller.getState().products[0].id,'vega-3');controller.dispose();
});
