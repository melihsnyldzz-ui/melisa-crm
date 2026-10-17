import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {transformSync} from 'esbuild';
import {CUSTOMER_CAPABILITY_KEY,CUSTOMER_OPERATION_KEY,operationStore} from '../src/customerProductRequest/model.js';

const frontend=fileURLToPath(new URL('../',import.meta.url)),A='a'.repeat(43),B='b'.repeat(43),operation='00000000-0000-4000-8000-000000000001';
const product=cap=>({id:cap===A?'erp-1':'erp-2',stockCode:cap===A?'SYNTHETIC-A':'SYNTHETIC-B',productName:'Synthetic product',photoPath:`/api/live/customer-product-requests/products/${cap===A?'erp-1':'erp-2'}/photo`});
const session=cap=>({sessionId:cap===A?'session-a':'session-b',expiresAt:new Date(Date.now()+60000).toISOString(),draft:{revision:1,items:[{...product(cap),productId:product(cap).id,quantity:2}]},request:null});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}

async function fixture(run,intercept=()=>undefined){
 mkdirSync(frontend+'.sites-runtime/',{recursive:true});const directory=mkdtempSync(frontend+'.sites-runtime/request-link-'),file=directory+'/page.mjs';
 const before={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,hooks:globalThis.__linkHooks,harness:globalThis.__linkHarness,revoke:URL.revokeObjectURL};
 const target=new EventTarget(),data=new Map(),calls=[],revoked=[];let values=[],effects=[],cursor=0,scheduled=[];
 target.location={hash:`#request=${A}`,pathname:'/katalog',search:''};target.history={replaceState(){target.location.hash='';}};
 target.sessionStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 globalThis.window=target;globalThis.document={body:{classList:{add(){},remove(){}}}};
 URL.revokeObjectURL=url=>{revoked.push(url);before.revoke.call(URL,url);};
 globalThis.fetch=async(url,options)=>{
  const cap=options.headers.Authorization.slice(7),call={url,options,cap};calls.push(call);
  const overridden=intercept(call);if(overridden!==undefined)return overridden;
  if(url.endsWith('/photo'))return new Response(new Uint8Array([255,216,255,1]),{headers:{'content-type':'image/jpeg'}});
  if(url.includes('/products?'))return Response.json({success:true,data:[product(cap)],meta:{page:1,total:1,totalPages:1,hasNextPage:false,categories:[],ages:[]}});
  return Response.json({success:true,data:session(cap)});
 };
 globalThis.__linkHooks={
  useState(initial){const index=cursor++;if(!(index in values)){if(typeof initial==='function'){initial();values[index]=initial();}else values[index]=initial;}return [values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},
  useRef(initial){const index=cursor++;if(!(index in values))values[index]={current:initial};return values[index];},
  useEffect(effect,deps){const index=cursor++,previous=effects[index];if(!previous||deps.some((value,i)=>value!==previous.deps[i]))scheduled.push({index,effect,deps});},
 };
 const harness=globalThis.__linkHarness={current:null};
 try{
  const pagePath=frontend+'src/customerProductRequest/CustomerProductRequestPage.jsx';
  const source=readFileSync(pagePath,'utf8').replace("import {useEffect,useRef,useState} from 'react';","const {useEffect,useRef,useState}=globalThis.__linkHooks;").replace("import './customerProductRequest.css';",'').replace(/from '(\.\/[^']+)'/g,(_match,path)=>`from '${new URL(path,pathToFileURL(pagePath)).href}'`).replace('  const controller=controllerRef.current,session=', '  globalThis.__linkHarness.current={view,controller:controllerRef.current,photoLoader,capability};\n  const controller=controllerRef.current,session=');
  // Transform only the actual JSX entry; plain production API/controller/model modules load unchanged.
  writeFileSync(file,transformSync(source,{loader:'jsx',jsx:'automatic',format:'esm'}).code);
  const Page=(await import(pathToFileURL(file).href)).default;
  const render=()=>{cursor=0;scheduled=[];return Page();};
  const commit=()=>{const tree=render();for(const {index,effect,deps}of scheduled){effects[index]?.cleanup?.();effects[index]={effect,deps,cleanup:effect()};}return tree;};
  const unmount=()=>{for(const effect of effects)effect?.cleanup?.();effects=[];};
  await run({target,data,calls,revoked,harness,render,commit,unmount,
   link(hash){target.location.hash=hash;target.dispatchEvent(new Event('hashchange'));},
   remount(hash){unmount();values=[];target.location.hash=hash;commit();},
   strictReplay(){for(const effect of effects)if(effect){effect.cleanup?.();effect.cleanup=effect.effect();}},
  });
 }finally{for(const effect of effects)effect?.cleanup?.();globalThis.window=before.window;globalThis.document=before.document;globalThis.fetch=before.fetch;globalThis.__linkHooks=before.hooks;globalThis.__linkHarness=before.harness;URL.revokeObjectURL=before.revoke;rmSync(file,{force:true});rmSync(directory,{recursive:true});}
}

test('same-document A to B consumes the link, disposes A photos and waits for fresh B before edits/submission',async()=>{
 const pending=deferred();await fixture(async h=>{
  h.commit();await tick();h.render();const old=h.harness.current.controller,url=await h.harness.current.photoLoader(product(A));
  h.link(`#request=${B}`);h.render();assert.equal(h.target.location.hash,'');assert.equal(h.data.get(CUSTOMER_CAPABILITY_KEY),B);assert.equal(h.harness.current.view.status,'loading');assert.equal(h.harness.current.view.session,null);assert.deepEqual(h.harness.current.view.products,[]);assert.equal(h.harness.current.controller,null);assert(h.revoked.includes(url));
  h.commit();h.render();assert.equal(h.harness.current.view.status,'loading');
  const count=h.calls.length;await old.edit([{productId:'erp-1',quantity:4}]);await old.submit();await h.harness.current.controller.edit([{productId:'erp-2',quantity:4}]);await h.harness.current.controller.submit();assert.equal(h.calls.length,count);
  pending.resolve(Response.json({success:true,data:session(B)}));await tick();h.render();assert.equal(h.harness.current.view.session.sessionId,'session-b');assert.equal(h.harness.current.view.products[0].id,'erp-2');
 },call=>call.cap===B&&call.url.endsWith('/session')?pending.promise:undefined);
});

test('invalid new fragment clears prior capability, operation and products instead of retaining A',async()=>fixture(async h=>{
 h.commit();await tick();h.render();const old=h.harness.current.controller;operationStore(h.target.sessionStorage).write('session-a',operation);
 h.link('#request=invalid');h.commit();h.render();assert.equal(h.target.location.hash,'');assert.equal(h.harness.current.view.status,'missing');assert.equal(h.harness.current.view.session,null);assert.deepEqual(h.harness.current.view.products,[]);assert.equal(h.harness.current.controller,null);assert.equal(h.data.get(CUSTOMER_CAPABILITY_KEY),undefined);assert.equal(h.data.get(CUSTOMER_OPERATION_KEY),undefined);
 const count=h.calls.length;await old.submit();assert.equal(h.calls.length,count);
}));

test('a late A session response cannot overwrite B after the same-document link change',async()=>{
 const pending=deferred();await fixture(async h=>{
  h.commit();const first=h.calls[0];h.link(`#request=${B}`);h.commit();assert.equal(first.options.signal.aborted,true);await tick();h.render();assert.equal(h.harness.current.view.session.sessionId,'session-b');
  pending.resolve(Response.json({success:true,data:session(A)}));await tick();h.render();assert.equal(h.harness.current.view.session.sessionId,'session-b');assert.equal(h.harness.current.view.products[0].id,'erp-2');
 },call=>call.cap===A&&call.url.endsWith('/session')?pending.promise:undefined);
});

test('same capability hash keeps the pending operation and current controller without a duplicate request',async()=>fixture(async h=>{
 h.data.set(CUSTOMER_CAPABILITY_KEY,A);operationStore(h.target.sessionStorage).write('session-a',operation);h.commit();await tick();h.render();const old=h.harness.current.controller,count=h.calls.length;
 h.link(`#request=${A}`);h.commit();h.render();assert.equal(h.target.location.hash,'');assert.equal(h.harness.current.controller,old);assert.equal(operationStore(h.target.sessionStorage).read('session-a'),operation);assert.equal(h.calls.length,count);
}));

test('rapid A to B to A before effects commit creates a fresh A instead of keeping the disposed controller',async()=>fixture(async h=>{
 h.commit();await tick();h.render();const old=h.harness.current.controller;
 h.link(`#request=${B}`);h.link(`#request=${A}`);h.commit();await tick();h.render();assert.equal(h.target.location.hash,'');assert.notEqual(h.harness.current.controller,old);assert.equal(h.harness.current.view.session.sessionId,'session-a');
}));

test('StrictMode double initialization and effect replay retain in-memory link when session storage is denied',async()=>fixture(async h=>{
 h.target.sessionStorage={getItem(){throw Error('Synthetic denied');},setItem(){throw Error('Synthetic denied');},removeItem(){throw Error('Synthetic denied');}};
 h.commit();h.strictReplay();await tick();h.render();assert.equal(h.target.location.hash,'');assert.equal(h.harness.current.view.session.sessionId,'session-a');
 h.link(`#request=${B}`);h.commit();await tick();h.render();assert.equal(h.harness.current.view.session.sessionId,'session-b');
}));

test('queued native hashchange events cannot discard a memory-only link after the first event consumed its fragment',async()=>fixture(async h=>{
 h.target.sessionStorage={getItem(){throw Error('Synthetic denied');},setItem(){throw Error('Synthetic denied');},removeItem(){throw Error('Synthetic denied');}};
 h.commit();await tick();h.render();const original=h.harness.current.controller,count=h.calls.length;
 // Location assignments happen before either queued native event is delivered.
 // Both listeners must read the current location, not assume event.newURL is current.
 h.target.location.hash=`#request=${B}`;const first=new Event('hashchange');Object.defineProperties(first,{oldURL:{value:`http://fixture/katalog`},newURL:{value:`http://fixture/katalog#request=${B}`}});
 h.target.location.hash=`#request=${A}`;const second=new Event('hashchange');Object.defineProperties(second,{oldURL:{value:first.newURL},newURL:{value:`http://fixture/katalog#request=${A}`}});
 h.target.dispatchEvent(first);assert.equal(h.target.location.hash,'');h.target.dispatchEvent(second);
 h.commit();await tick();h.render();assert.equal(h.harness.current.view.status,'ready');assert.equal(h.harness.current.view.session.sessionId,'session-a');assert.equal(h.harness.current.controller,original);assert.equal(h.calls.length,count);
}));

test('module remount and StrictMode effect replay consume the current link; close and unmount release it',async()=>fixture(async h=>{
 h.commit();h.strictReplay();await tick();h.render();assert.equal(h.harness.current.view.session.sessionId,'session-a');
 h.remount(`#request=${B}`);await tick();let tree=h.render();assert.equal(h.target.location.hash,'');assert.equal(h.harness.current.view.session.sessionId,'session-b');
 find(tree,node=>node.props?.['aria-label']==='Kataloğu kapat').props.onClick();h.commit();h.render();assert.equal(h.harness.current.view.status,'closed');assert.equal(h.harness.current.controller,null);assert.equal(h.data.get(CUSTOMER_CAPABILITY_KEY),undefined);
 const count=h.calls.length;h.unmount();h.link(`#request=${A}`);assert.equal(h.calls.length,count);
}));
