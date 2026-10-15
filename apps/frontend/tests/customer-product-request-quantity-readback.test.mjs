import '../../../tests/offline-test-guard.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {transformSync} from 'esbuild';
import {createCustomerRequestApi} from '../src/customerProductRequest/api.js';
import {createRequestController} from '../src/customerProductRequest/controller.js';

const frontend=fileURLToPath(new URL('../',import.meta.url)),workspace=path.resolve(frontend);
const cap='q'.repeat(43),operation='00000000-0000-4000-8000-000000000001';
const product={id:'erp-1',stockCode:'SYNTHETIC',productName:'Synthetic product',photoPath:'/api/live/customer-product-requests/products/erp-1/photo'};
const item=quantity=>({...product,productId:product.id,quantity});
let QuantityInput,directory;
before(async()=>{
 const temporary=path.resolve(frontend,'.sites-runtime');mkdirSync(temporary,{recursive:true});directory=mkdtempSync(path.join(temporary,'quantity-readback-'));
 const pagePath=path.resolve(frontend,'src/customerProductRequest/CustomerProductRequestPage.jsx'),page=readFileSync(pagePath,'utf8');
 const actual=page.slice(page.indexOf('function QuantityInput('),page.indexOf('export default function CustomerProductRequestPage'));
 assert(actual.startsWith('function QuantityInput('));
 const source=`const useState=(...args)=>globalThis.__quantityHooks.useState(...args),useEffect=(...args)=>globalThis.__quantityHooks.useEffect(...args);\nimport {quantity} from '${pathToFileURL(path.resolve(frontend,'src/customerProductRequest/model.js')).href}';\nexport ${actual}`;
 const file=path.join(directory,'quantity.mjs');writeFileSync(file,transformSync(source,{loader:'jsx',jsx:'automatic',format:'esm'}).code);
 ({QuantityInput}=await import(pathToFileURL(file).href));
});
after(()=>{
 if(!directory)return;
 const absolute=path.resolve(directory),temporary=path.resolve(frontend,'.sites-runtime');
 if(!absolute.startsWith(workspace+path.sep)||!absolute.startsWith(temporary+path.sep)||!path.basename(absolute).startsWith('quantity-readback-'))throw Error('Refused fixture cleanup outside intended workspace directory');
 rmSync(absolute,{recursive:true,force:true});
});

function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of [tree.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(run,{failure=0}={}){
 const previous=globalThis.__quantityHooks,values=[],effects=[],storage=new Map(),calls=[];let cursor=0,scheduled=[],latest,pendingWrite,server={sessionId:'synthetic-quantity-session',expiresAt:new Date(Date.now()+60000).toISOString(),draft:{revision:1,items:[item(1)]},request:null},nextList=null;
 globalThis.__quantityHooks={useState(initial){const index=cursor++;if(!(index in values))values[index]=typeof initial==='function'?initial():initial;return [values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},useEffect(effect,deps){const index=cursor++,old=effects[index];if(!old||deps.some((value,i)=>value!==old.deps[i]))scheduled.push({index,effect,deps});}};
 const fetcher=async(url,options)=>{
  assert.equal(options.headers.Authorization,`Bearer ${cap}`);calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});
  if(url.includes('/products?')){if(nextList){const promise=nextList;nextList=null;await promise;}return Response.json({success:true,data:[product],meta:{page:1,total:1,totalPages:1,hasNextPage:false,categories:[],ages:[]}});}
  if(url.endsWith('/draft')){
   const body=JSON.parse(options.body);
   if(failure){if(failure===409)server={...server,draft:{...server.draft,revision:2}};return Response.json({success:false,error:{code:'SYNTHETIC_WRITE_FAILURE'}},{status:failure});}
   server={...server,draft:{revision:server.draft.revision+1,items:body.items.map(row=>item(row.quantity))}};
  }
  if(url.endsWith('/submit'))server={...server,request:{id:'synthetic-request',status:'interest',submittedAt:new Date().toISOString(),items:server.draft.items,modelCount:1,quantityTotal:server.draft.items[0].quantity}};
  return Response.json({success:true,data:server});
 };
 const controller=createRequestController({api:createCustomerRequestApi(cap,{fetcher}),uuid:()=>operation,storage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},onChange:view=>{latest=view;}});
 const render=()=>{
  cursor=0;scheduled=[];const currentItem=latest.session.draft.items[0];
  const tree=QuantityInput({item:currentItem,disabled:latest.busy||latest.uncertain||Boolean(latest.session.request),onChange:quantity=>{pendingWrite=controller.edit(latest.session.draft.items.map(row=>({productId:row.productId,quantity})));}});
  for(const {index,effect,deps}of scheduled){effects[index]?.cleanup?.();effects[index]={deps,cleanup:effect()};}
  return tree;
 };
 const input=()=>{render();return find(render(),node=>node.type==='input');};
 try{
  await controller.open();controller.review();input();
  await run({controller,calls,input,render,get state(){return latest;},type(value){input().props.onChange({target:{value}});},blur(){input().props.onBlur();return pendingWrite;},holdNextList(promise){nextList=promise;}});
 }finally{controller.dispose();globalThis.__quantityHooks=previous;}
}

for(const failure of [503,409])test(`quantity readback ${failure}: fresh same-value session replaces unsaved local text and submits the visible count`,async()=>fixture(async h=>{
 h.type('7');const write=h.blur();assert.equal(h.input().props.value,'7');assert.equal(h.input().props.disabled,true);await write;
 assert.equal(h.state.uncertain,true);assert.equal(h.state.session.draft.items[0].quantity,1);assert.equal(h.input().props.value,'7');
 const old=h.state.session.draft.items[0];await h.controller.reconcile();assert.notEqual(h.state.session.draft.items[0],old);
 assert.equal(h.state.uncertain,false);assert.equal(h.input().props.value,'1');assert.equal(h.state.session.draft.items.reduce((sum,row)=>sum+row.quantity,0),1);
 await h.controller.submit();assert.equal(h.state.session.request.quantityTotal,1);assert.equal(h.state.session.request.items[0].quantity,1);
 assert.equal(h.calls.filter(call=>call.url.endsWith('/draft')).length,1);assert.equal(h.calls.find(call=>call.url.endsWith('/draft')).body.items[0].quantity,7);assert.equal(h.calls.find(call=>call.url.endsWith('/submit')).body.revision,failure===409?2:1);
},{failure}));

test('quantity readback success: saved count remains visible through fresh snapshot and submission',async()=>fixture(async h=>{
 h.type('7');await h.blur();assert.equal(h.input().props.value,'7');assert.equal(h.state.session.draft.items[0].quantity,7);
 await h.controller.reconcile();assert.equal(h.input().props.value,'7');await h.controller.submit();assert.equal(h.state.session.request.quantityTotal,7);
}));

test('quantity typing survives same-item rerenders, unrelated list reads and pending reads until a fresh snapshot arrives',async()=>fixture(async h=>{
 h.type('7');const original=h.state.session.draft.items[0];h.render();assert.equal(h.input().props.value,'7');assert.equal(h.state.session.draft.items[0],original);
 const listing=deferred();h.holdNextList(listing.promise);const read=h.controller.search({search:'synthetic'});assert.equal(h.state.listBusy,true);assert.equal(h.input().props.value,'7');listing.resolve();await read;assert.equal(h.input().props.value,'7');assert.equal(h.state.session.draft.items[0],original);
 const fresh=h.controller.reconcile();assert.equal(h.state.busy,true);assert.equal(h.input().props.value,'7');await fresh;assert.equal(h.input().props.value,'1');
}));
