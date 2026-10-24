import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerRequestLifecycle} from '../src/customerProductRequest/lifecycle.js';
import {createRequestController} from '../src/customerProductRequest/controller.js';
import {CUSTOMER_OPERATION_KEY,operationStore} from '../src/customerProductRequest/model.js';

const product={id:'erp-1',productId:'erp-1',stockCode:'SYNTHETIC',productName:'Synthetic product',quantity:2};
const session=()=>({sessionId:'synthetic-session',expiresAt:new Date(Date.now()+60000).toISOString(),draft:{revision:1,items:[{...product}]},request:null});
const listing=()=>({products:[{...product}],meta:{page:1,total:1,totalPages:1,hasNextPage:false,categories:[],ages:[]}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function pageEvent(type,persisted=true){const event=new Event(type);Object.defineProperty(event,'persisted',{value:persisted});return event;}
function setup(api,storage=null){
  const target=new EventTarget(),views=[],controllers=[];let current;
  const lifecycle=createCustomerRequestLifecycle({target,createController:onChange=>{const controller=createRequestController({api,storage,onChange});controllers.push(controller);return controller;},onChange:view=>views.push(view),onController:controller=>{current=controller;}});
  return {target,views,controllers,lifecycle,get current(){return current;},get view(){return views.at(-1);}};
}

test('persisted browser return clears cached state and opens a new controller with fresh session before edits',async()=>{
  let reads=0,resolveRead,writes=0;
  const api={session:async()=>{reads++;if(reads===2)return new Promise(resolve=>{resolveRead=resolve;});return session();},products:async()=>listing(),updateDraft:async(_revision,items)=>{writes++;return {...session(),draft:{revision:2,items:items.map(item=>({...product,...item}))}};}};
  const page=setup(api);
  try{
    await tick();assert.equal(page.view.status,'ready');const original=page.current;
    page.target.dispatchEvent(pageEvent('pagehide'));page.target.dispatchEvent(pageEvent('pageshow'));
    assert.equal(reads,2);assert.notEqual(page.current,original);
    assert.equal(page.view.status,'loading');assert.equal(page.view.session,null);assert.deepEqual(page.view.products,[]);
    await original.edit([{productId:'erp-1',quantity:3}]);await page.current.edit([{productId:'erp-1',quantity:3}]);assert.equal(writes,0);
    resolveRead(session());await tick();assert.equal(page.view.status,'ready');
    await page.current.edit([{productId:'erp-1',quantity:3}]);assert.equal(writes,1);
  }finally{page.lifecycle.dispose();}
});

test('closed and already expired/revoked pages never reopen on persisted return',async()=>{
  for(const status of [null,401,403,410]){
    let reads=0;
    const page=setup({session:async()=>{reads++;if(status)throw Object.assign(Error('Synthetic denial'),{status});return session();},products:async()=>listing()});
    try{
      await tick();if(status)assert.equal(page.view.status,'expired');else page.lifecycle.close();
      page.target.dispatchEvent(pageEvent('pagehide'));page.target.dispatchEvent(pageEvent('pageshow'));
      await tick();assert.equal(reads,1);assert.equal(page.current,null);
    }finally{page.lifecycle.dispose();}
  }
});

test('a revoked fresh session never restores cached products or permits edits on browser return',async()=>{
  let reads=0,writes=0;
  const page=setup({session:async()=>{if(++reads===2)throw Object.assign(Error('Revoked while away'),{status:401});return session();},products:async()=>listing(),updateDraft:async()=>{writes++;return session();}});
  try{
    await tick();page.target.dispatchEvent(pageEvent('pagehide'));page.target.dispatchEvent(pageEvent('pageshow'));
    assert.equal(page.view.status,'loading');assert.equal(page.view.session,null);
    await tick();assert.equal(page.view.status,'expired');assert.equal(page.view.session,null);assert.deepEqual(page.view.products,[]);
    await page.current.edit([{productId:'erp-1',quantity:3}]);assert.equal(writes,0);
    page.target.dispatchEvent(pageEvent('pagehide'));page.target.dispatchEvent(pageEvent('pageshow'));assert.equal(reads,2);
  }finally{page.lifecycle.dispose();}
});

test('pagehide/unmount abort old work, revoke object URLs and suppress stale callbacks; photo owner is replaced',async()=>{
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL,revoked=[];let photoRead=0,resolvePhoto,readSignal;
  URL.createObjectURL=()=>`blob:synthetic-${photoRead}`;URL.revokeObjectURL=value=>revoked.push(value);
  const page=setup({session:async({signal})=>{readSignal=signal;return session();},products:async()=>listing(),photo:async()=>{photoRead++;if(photoRead===2)return new Promise(resolve=>{resolvePhoto=resolve;});return new Blob(['synthetic']);}});
  try{
    await tick();const old=page.current;assert.equal(await old.photo(product),'blob:synthetic-1');
    const late=old.photo({...product,id:'erp-2'});const rejected=assert.rejects(late);
    page.target.dispatchEvent(pageEvent('pagehide'));assert.equal(page.current,null);assert.deepEqual(revoked,['blob:synthetic-1']);
    const count=page.views.length;resolvePhoto(new Blob(['late']));await rejected;assert.equal(page.views.length,count);
    page.target.dispatchEvent(pageEvent('pageshow'));await tick();assert.notEqual(page.current,old);
    assert.equal(await page.current.photo(product),'blob:synthetic-3');
    page.lifecycle.dispose();assert.deepEqual(revoked,['blob:synthetic-1','blob:synthetic-3']);
    const controllers=page.controllers.length;page.target.dispatchEvent(pageEvent('pageshow'));assert.equal(page.controllers.length,controllers);
    // A completed read is no longer in flight; pending reads are checked separately below.
    assert.equal(readSignal.aborted,false);
  }finally{page.lifecycle.dispose();URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
  let resolveRead,signal;
  const pending=setup({session:({signal:own})=>{signal=own;return new Promise(resolve=>{resolveRead=resolve;});},products:async()=>listing()});
  pending.target.dispatchEvent(pageEvent('pagehide'));assert.equal(signal.aborted,true);const count=pending.views.length;
  resolveRead(session());await tick();assert.equal(pending.views.length,count);pending.lifecycle.dispose();
});

test('browser return preserves a pending operation and retries the same single submission after fresh readback',async()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const operationId='00000000-0000-4000-8000-000000000001';operationStore(storage).write('synthetic-session',operationId);
  let calls=0,reads=0,persisted=session();
  const page=setup({session:async()=>{reads++;return persisted;},products:async()=>listing(),submit:async(_revision,id)=>{assert.equal(id,operationId);calls++;persisted={...persisted,request:{id:'synthetic-request',items:persisted.draft.items,modelCount:1,quantityTotal:2}};return persisted;}},storage);
  try{
    await tick();assert.equal(page.view.uncertain,true);assert.equal(page.view.step,'review');
    page.target.dispatchEvent(pageEvent('pagehide'));page.target.dispatchEvent(pageEvent('pageshow',false));assert.equal(reads,1);
    page.target.dispatchEvent(pageEvent('pageshow'));page.target.dispatchEvent(pageEvent('pageshow'));assert.equal(reads,2);
    await tick();assert.equal(operationStore(storage).read('synthetic-session'),operationId);
    await page.current.submit();assert.equal(page.view.step,'success');assert.equal(storage.getItem(CUSTOMER_OPERATION_KEY),null);
    await page.current.submit();assert.equal(calls,1);
  }finally{page.lifecycle.dispose();}
});
