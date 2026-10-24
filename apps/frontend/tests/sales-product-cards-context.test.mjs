import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import React,{act,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const product=(extra={})=>({id:'erp-8023',stockCode:'SYN-8023',productName:'Synthetic product A',salePrice:3,currency:'USD',priceExact:'3.00000000',unitLabel:'ADET',photoEligible:true,...extra});
const deferred=()=>{let resolve,reject;const promise=new Promise((accept,deny)=>{resolve=accept;reject=deny;});return {promise,resolve,reject};};

// Minimal inert DOM host for the installed real ReactDOM renderer. Hooks,
// scheduling, layout/passive effects and the production photo session are real.
// There is no browser, network/image decoder, extra renderer package or service.
class HostNode {
 constructor(name,document,nodeType=1){this.nodeType=nodeType;this.nodeName=nodeType===3?'#text':name.toUpperCase();this.tagName=this.nodeName;this.namespaceURI='http://www.w3.org/1999/xhtml';this.ownerDocument=document;this.parentNode=null;this.childNodes=[];this.attributes=new Map();this.listeners=new Map();this.style={};this.nodeValue='';}
 get firstChild(){return this.childNodes[0]??null;}
 get lastChild(){return this.childNodes.at(-1)??null;}
 get nextSibling(){if(!this.parentNode)return null;return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this)+1]??null;}
 get textContent(){return this.nodeType===3?this.nodeValue:this.childNodes.map(child=>child.textContent).join('');}
 set textContent(value){for(const child of this.childNodes)child.parentNode=null;this.childNodes=[];if(this.nodeType===3)this.nodeValue=String(value);else if(value!=='')this.appendChild(this.ownerDocument.createTextNode(String(value)));}
 appendChild(child){return this.insertBefore(child,null);}
 insertBefore(child,before){child.parentNode?.removeChild(child);const index=before===null?this.childNodes.length:this.childNodes.indexOf(before);if(index<0)throw Error('Unknown host sibling');this.childNodes.splice(index,0,child);child.parentNode=this;return child;}
 removeChild(child){const index=this.childNodes.indexOf(child);if(index<0)throw Error('Unknown host child');this.childNodes.splice(index,1);child.parentNode=null;return child;}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 removeAttribute(name){this.attributes.delete(name);}
 getAttribute(name){return this.attributes.get(name)??null;}
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
 removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
 dispatchEvent(event){event.target=this;for(const listener of this.listeners.get(event.type)??[])listener.call(this,event);return true;}
 contains(node){return node===this||this.childNodes.some(child=>child.contains(node));}
}
function hostDocument(){
 const document={nodeType:9,nodeName:'#document',addEventListener(){},removeEventListener(){},createElement:name=>new HostNode(name,document),createElementNS:(_namespace,name)=>new HostNode(name,document),createTextNode:value=>{const node=new HostNode('#text',document,3);node.nodeValue=String(value);return node;}};
 document.documentElement=document.createElement('html');document.body=document.createElement('body');document.documentElement.appendChild(document.body);document.activeElement=document.body;
 document.defaultView={document,HTMLIFrameElement:class{},HTMLElement:HostNode,Node:HostNode,addEventListener(){},removeEventListener(){}};
 return document;
}
function nodes(root,name){const result=[];for(const child of root.childNodes){if(child.nodeName===name.toUpperCase())result.push(child);result.push(...nodes(child,name));}return result;}
const snapshot=root=>({images:nodes(root,'img').map(image=>image.getAttribute('src')),text:root.textContent});

async function fixture(run){
 mkdirSync(frontend+'.sites-runtime/',{recursive:true});const file=frontend+'.sites-runtime/sales-cards-context-'+randomUUID()+'.mjs';
 const keys=['window','document','Image','IS_REACT_ACT_ENVIRONMENT','__salesCardsApi'],before=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const priorCreate=URL.createObjectURL,priorRevoke=URL.revokeObjectURL,document=hostDocument(),container=document.createElement('div'),calls=[],created=[],revoked=[],commits=[];
 let root;
 globalThis.document=document;globalThis.window=document.defaultView;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 globalThis.Image=class{naturalWidth=1200;naturalHeight=1500;set src(_value){queueMicrotask(()=>this.onload?.());}};
 URL.createObjectURL=()=>{const url='blob:synthetic-photo-'+(created.length+1);created.push(url);return url;};URL.revokeObjectURL=url=>revoked.push(url);
 globalThis.__salesCardsApi={canonicalCatalogPhoto(token,id,options){const pending=deferred();calls.push({token,id,options,...pending});return pending.promise;}};
 try{
  await build({absWorkingDir:frontend,tsconfigRaw:{},entryPoints:[frontend+'src/SalesProductCards.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react'],plugins:[{name:'inert-photo-api-boundary',setup(builder){builder.onLoad({filter:/[\\/]liveApi\.js$/},()=>({loader:'js',contents:'export const liveApi=globalThis.__salesCardsApi;'}));}}]});
  const Cards=(await import(pathToFileURL(file).href)).default;
  function PendingContext({promise}){React.use(promise);return null;}
  function Observed({label,suspend,...props}){useLayoutEffect(()=>{commits.push({label,...snapshot(container)});});return React.createElement(React.Suspense,{fallback:React.createElement('span',null,'Fixture pending context')},React.createElement(Cards,props),suspend?React.createElement(PendingContext,{promise:suspend}):null);}
  root=createRoot(container);const base={isCurrent:()=>true,onInvalidate:error=>assert.fail('Unexpected auth failure: '+error.status),onTakeProduct(){},disabled:false};
  const render=async(label,props)=>{await act(async()=>{root.render(React.createElement(Observed,{...base,...props,label}));});};
  const resolve=async index=>{await act(async()=>{calls[index].resolve(new Blob(['synthetic'],{type:'image/jpeg'}));});};
  await run({render,resolve,calls,created,revoked,commits,container,snapshot:()=>snapshot(container),reject:async(index,error)=>{await act(async()=>{calls[index].reject(error);});},error:async()=>{await act(async()=>{nodes(container,'img')[0].dispatchEvent({type:'error',defaultPrevented:false,preventDefault(){},stopPropagation(){}});});}});
 }finally{
  if(root)await act(async()=>root.unmount());
  URL.createObjectURL=priorCreate;URL.revokeObjectURL=priorRevoke;
  for(const [key,descriptor]of before)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  rmSync(file,{force:true});
 }
}

test('same product ID with a new token cannot commit the old session photo before passive cleanup',async()=>fixture(async h=>{
 const products=[product()];await h.render('A',{products,token:'synthetic-token-a'});await h.resolve(0);assert.deepEqual(h.snapshot().images,['blob:synthetic-photo-1']);
 await h.render('B',{products,token:'synthetic-token-b'});
 const commit=h.commits.find(row=>row.label==='B');assert.deepEqual(commit.images,[]);assert.match(commit.text,/Fotoğraf yükleniyor/);
 assert.equal(h.calls.length,2);assert.equal(h.calls[1].token,'synthetic-token-b');assert(h.revoked.includes('blob:synthetic-photo-1'));
 await h.resolve(1);assert.deepEqual(h.snapshot().images,['blob:synthetic-photo-2']);
}));

test('new product list with the same ID cannot commit the previous product context photo',async()=>fixture(async h=>{
 await h.render('A',{products:[product()],token:'synthetic-token-a'});await h.resolve(0);
 await h.render('B',{products:[product({productName:'Synthetic product B'})],token:'synthetic-token-a'});
 const commit=h.commits.find(row=>row.label==='B');assert.deepEqual(commit.images,[]);assert.match(commit.text,/Synthetic product B/);assert.match(commit.text,/USD 3,00 \/ ADET/);
 await h.resolve(1);assert.deepEqual(h.snapshot().images,['blob:synthetic-photo-2']);
}));

test('a new photo-ineligible context never commits the old eligible product image',async()=>fixture(async h=>{
 await h.render('A',{products:[product()],token:'synthetic-token-a'});await h.resolve(0);
 await h.render('B',{products:[product({photoEligible:false})],token:'synthetic-token-a'});
 assert.deepEqual(h.commits.find(row=>row.label==='B').images,[]);assert.match(h.snapshot().text,/Fotoğraf yok/);assert.equal(h.calls.length,1);
}));

test('unchanged product and token context keeps its decoded photo without a repeat read',async()=>fixture(async h=>{
 const products=[product()];await h.render('A',{products,token:'synthetic-token-a'});await h.resolve(0);
 await h.render('same',{products,token:'synthetic-token-a',disabled:true});
 assert.deepEqual(h.commits.find(row=>row.label==='same').images,['blob:synthetic-photo-1']);assert.equal(h.calls.length,1);assert.deepEqual(h.revoked,[]);
}));

test('current image errors retain the fallback and a later context can load its own photo',async()=>fixture(async h=>{
 await h.render('A',{products:[product()],token:'synthetic-token-a'});await h.resolve(0);await h.error();assert.deepEqual(h.snapshot().images,[]);assert.match(h.snapshot().text,/Fotoğraf alınamadı/);
 await h.render('B',{products:[product()],token:'synthetic-token-b'});assert.match(h.snapshot().text,/Fotoğraf yükleniyor/);await h.resolve(1);assert.deepEqual(h.snapshot().images,['blob:synthetic-photo-2']);
}));

for(const [change,status]of [['token',401],['products',403]])test('pending old-context '+status+' after '+change+' change cannot invalidate the new rendered context before passive cleanup',async()=>fixture(async h=>{
 const invalidations=[],blocked=deferred(),products=[product()];
 await h.render('A',{products,token:'synthetic-token-a',onInvalidate:error=>invalidations.push({context:'A',status:error.status})});
 await h.render('B',{products:change==='products'?[product({productName:'Synthetic product B'})]:products,token:change==='token'?'synthetic-token-b':'synthetic-token-a',suspend:blocked.promise,onInvalidate:error=>invalidations.push({context:'B',status:error.status})});
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.signal.aborted,false,'React keeps the previous passive session while the new context is suspended');
 await h.reject(0,Object.assign(Error('Synthetic stale photo authorization'),{status}));
 assert.deepEqual(invalidations,[]);
}));

for(const status of [401,403])test('current-context photo '+status+' still invokes its own invalidation callback',async()=>fixture(async h=>{
 const invalidations=[];await h.render('current',{products:[product()],token:'synthetic-token-a',onInvalidate:error=>invalidations.push(error.status)});
 await h.reject(0,Object.assign(Error('Synthetic current photo authorization'),{status}));assert.deepEqual(invalidations,[status]);
}));
