import '../../../tests/offline-test-guard.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {transformSync} from 'esbuild';

const frontend=fileURLToPath(new URL('../',import.meta.url)),workspace=path.resolve(frontend),cap='u'.repeat(43);
const product={id:'erp-1',stockCode:'SYNTHETIC',productName:'Synthetic product',photoPath:'/api/live/customer-product-requests/products/erp-1/photo'};
const session=()=>({sessionId:'synthetic-session',expiresAt:new Date(Date.now()+60000).toISOString(),draft:{revision:1,items:[{...product,productId:product.id,quantity:1}]},request:null});
const okSession=data=>Response.json({success:true,data});
const failure=status=>Response.json({success:false,error:{code:'SYNTHETIC_FAILURE'}},{status});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
const recovery=tree=>find(tree,node=>node.type==='button'&&node.props.children==='Kaydı yeniden kontrol et');
const footer=tree=>find(tree,node=>node.type==='footer');
const notice=tree=>find(tree,node=>node.props?.className==='request-notice request-error');
let Page,directory;
before(async()=>{
 const temporary=path.resolve(frontend,'.sites-runtime');mkdirSync(temporary,{recursive:true});directory=mkdtempSync(path.join(temporary,'uncertain-search-'));
 const pagePath=path.resolve(frontend,'src/customerProductRequest/CustomerProductRequestPage.jsx');
 const source=readFileSync(pagePath,'utf8').replace("import {useEffect,useRef,useState} from 'react';","const useState=(...args)=>globalThis.__uncertainHooks.useState(...args),useRef=(...args)=>globalThis.__uncertainHooks.useRef(...args),useEffect=(...args)=>globalThis.__uncertainHooks.useEffect(...args);").replace(/import \{([^}]+)\} from '@phosphor-icons\/react';/,(_match,names)=>`const {${names}}=Object.fromEntries('${names}'.split(',').map(name=>[name,()=>null]));`).replace("import './customerProductRequest.css';",'').replace(/from '(\.\/[^']+)'/g,(_match,relative)=>`from '${new URL(relative,pathToFileURL(pagePath)).href}'`).replace('  const controller=controllerRef.current,session=', '  globalThis.__uncertainHarness.current={view,controller:controllerRef.current};\n  const controller=controllerRef.current,session=');
 const file=path.join(directory,'page.mjs');writeFileSync(file,transformSync(source,{loader:'jsx',jsx:'automatic',format:'esm'}).code);({default:Page}=await import(pathToFileURL(file).href));
});
after(()=>{
 if(!directory)return;const absolute=path.resolve(directory),temporary=path.resolve(frontend,'.sites-runtime');
 if(!absolute.startsWith(workspace+path.sep)||!absolute.startsWith(temporary+path.sep)||!path.basename(absolute).startsWith('uncertain-search-'))throw Error('Refused cleanup outside own workspace fixture directory');
 rmSync(absolute,{recursive:true,force:true});
});
async function fixture(run,{editStatus=503,submitted=false}={}){
 const previous={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,hooks:globalThis.__uncertainHooks,harness:globalThis.__uncertainHarness};
 const target=new EventTarget(),data=new Map(),values=[],effects=[],calls=[];let cursor=0,scheduled=[],listPlan=null,sessionPlan=null,draftPlan=null;
 const server=session();if(submitted)server.request={id:'synthetic-request',status:'interest',submittedAt:new Date().toISOString(),items:server.draft.items,modelCount:1,quantityTotal:1};
 target.location={hash:`#request=${cap}`,pathname:'/katalog',search:''};target.history={replaceState(){target.location.hash='';}};target.sessionStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 globalThis.window=target;globalThis.document={body:{classList:{add(){},remove(){}}}};
 globalThis.fetch=async(url,options)=>{
  assert.equal(options.headers.Authorization,`Bearer ${cap}`);calls.push({url,options});
  if(url.endsWith('/draft')){if(draftPlan){const result=draftPlan;draftPlan=null;return result;}return failure(editStatus);}
  if(url.endsWith('/session')){if(sessionPlan){const result=sessionPlan;sessionPlan=null;return result;}return okSession(server);}
  if(url.includes('/products?')){if(listPlan){const result=listPlan;listPlan=null;return result;}const page=Number(new URL(url,'http://fixture.invalid').searchParams.get('page'));return Response.json({success:true,data:[product],meta:{page,total:2,totalPages:2,hasNextPage:page<2,categories:[{value:'TAKIM',count:null}],ages:[]}});}
  throw Error('Unexpected mock transport');
 };
 globalThis.__uncertainHooks={useState(initial){const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},useRef(initial){const index=cursor++;if(!(index in values))values[index]={current:initial};return values[index];},useEffect(effect,deps){const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>value!==old.deps[i]))scheduled.push({index,effect,deps});}};
 const harness=globalThis.__uncertainHarness={current:null};
 const render=()=>{cursor=0;scheduled=[];return Page();};
 const commit=()=>{const tree=render();for(const {index,effect,deps}of scheduled){effects[index]?.cleanup?.();effects[index]={deps,cleanup:effect()};}return tree;};
 try{
  commit();await tick();render();
  await run({render,calls,get state(){return harness.current.controller.getState();},get controller(){return harness.current.controller;},queueList(value){listPlan=value;},queueSession(value){sessionPlan=value;},queueDraft(value){draftPlan=value;},server});
 }finally{for(const effect of effects)effect?.cleanup?.();Object.assign(globalThis,{window:previous.window,document:previous.document,fetch:previous.fetch,__uncertainHooks:previous.hooks,__uncertainHarness:previous.harness});}
}
function assertLocked(h){const tree=h.render();assert.equal(h.state.uncertain,true);assert(recovery(tree),'uncertain catalog must keep its recovery action');assert.equal(recovery(tree).props.disabled,Boolean(h.state.busy));assert(notice(tree));if(!h.state.error)assert.match(find(notice(tree),node=>node.type==='p').props.children,/kaydı yeniden kontrol/i);assert.equal(find(footer(tree),node=>node.type==='button').props.disabled,true);assert.equal(find(tree,node=>node.props?.['aria-label']==='SYNTHETIC listeden çıkar').props.disabled,true);}
async function verifyNoWrite(h){const count=h.calls.length;await h.controller.edit([{productId:'erp-1',quantity:4}]);await h.controller.submit();assert.equal(h.calls.length,count);}

for(const editStatus of [503,409])test(`uncertain search ${editStatus}: pending search, failed filter and successful paging keep actual Page readback reachable`,async()=>fixture(async h=>{
 await h.controller.edit([{productId:'erp-1',quantity:7}]);assertLocked(h);
 const listing=deferred();h.queueList(listing.promise);find(h.render(),node=>node.type==='form'&&node.props.role==='search').props.onSubmit({preventDefault(){}});
 assert.equal(h.state.error,'');assert.equal(h.state.listBusy,true);assert.equal(h.state.busy,false);assertLocked(h);await verifyNoWrite(h);
 listing.resolve(failure(503));await tick();assertLocked(h);assert.equal(h.state.listBusy,false);
 h.queueList(failure(503));find(h.render(),node=>node.type==='button'&&node.props.children==='TAKIM').props.onClick();assertLocked(h);await tick();assertLocked(h);
 find(h.render(),node=>node.type==='button'&&node.props.children==='Sonraki').props.onClick();assertLocked(h);await tick();assert.equal(h.state.error,'');assert.equal(h.state.meta.page,2);assertLocked(h);
 const readback=deferred();h.queueSession(readback.promise);recovery(h.render()).props.onClick();assert.equal(h.state.busy,true);assert.equal(h.state.listBusy,false);assert.equal(recovery(h.render()).props.disabled,true);assertLocked(h);await verifyNoWrite(h);
 readback.resolve(okSession(h.server));await tick();const tree=h.render();assert.equal(h.state.uncertain,false);assert.equal(recovery(tree),null);assert.equal(find(footer(tree),node=>node.type==='button').props.disabled,false);assert.equal(h.state.session.draft.items[0].quantity,1);
},{editStatus}));

test('failed session readback cannot unlock uncertain edit/submit even after another successful list read',async()=>fixture(async h=>{
 await h.controller.edit([{productId:'erp-1',quantity:7}]);h.queueSession(failure(503));recovery(h.render()).props.onClick();await tick();assertLocked(h);await h.controller.search({search:'synthetic'});assert.equal(h.state.error,'');assertLocked(h);await verifyNoWrite(h);
}));

test('normal/busy listing has no false recovery; expired and submitted states do not expose the uncertain action',async()=>{
 await fixture(async h=>{
  assert.equal(recovery(h.render()),null);const pending=deferred();h.queueDraft(pending.promise);const edit=h.controller.edit([{productId:'erp-1',quantity:7}]);assert.equal(h.state.busy,true);assert.equal(h.state.uncertain,false);assert.equal(recovery(h.render()),null);
  pending.resolve(failure(503));await edit;assertLocked(h);h.queueList(failure(403));await h.controller.search({search:'synthetic'});const tree=h.render();assert.equal(h.state.status,'expired');assert.equal(recovery(tree),null);assert.equal(footer(tree),null);assert.equal(h.state.session,null);
 });
 await fixture(async h=>{const tree=h.render();assert.equal(h.state.step,'success');assert.equal(recovery(tree),null);assert.equal(footer(tree),null);},{submitted:true});
});
