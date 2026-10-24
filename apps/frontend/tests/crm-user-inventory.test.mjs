import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import React,{act,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {liveApi} from '../src/liveApi.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((accept,deny)=>{resolve=accept;reject=deny;});return {promise,resolve,reject};};
const context=token=>({token,identity:token,epoch:1,role:'mudur'});
const data=name=>({accounts:[{userId:name,username:name,displayName:name,role:'personel',active:true,chatwootAgentId:null,mappingState:'unlinked',conflicts:[],permissions:['crm.view']},{userId:'disabled',username:'disabled',displayName:'Kapalı örnek hesap',role:'personel',active:false,chatwootAgentId:3,mappingState:'inactive',conflicts:[],permissions:['crm.view']}],assignments:[{conversationId:'55',assigneeAgentId:2,accountIds:[name],state:'linked'}],coverage:{accountsScope:'configured-crm-users',accountsComplete:true,omittedInvalidAccountCount:0},readOnly:true});

// Real ReactDOM/effects in an inert host, not a browser or human acceptance.
class Host {
  constructor(name,doc,type=1){this.nodeType=type;this.nodeName=type===3?'#text':name.toUpperCase();this.tagName=this.nodeName;this.namespaceURI='http://www.w3.org/1999/xhtml';this.ownerDocument=doc;this.parentNode=null;this.childNodes=[];this.attributes=new Map();this.listeners=new Map();this.style={};this.nodeValue='';}
  get firstChild(){return this.childNodes[0]??null;} get lastChild(){return this.childNodes.at(-1)??null;}
  get options(){return this.childNodes.filter(node=>node.nodeName==='OPTION');}
  get value(){return this._value??this.attributes.get('value')??this.textContent;}set value(value){this._value=String(value);}
  get nextSibling(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]??null;}
  get textContent(){return this.nodeType===3?this.nodeValue:this.childNodes.map(x=>x.textContent).join('');}
  set textContent(value){for(const x of this.childNodes)x.parentNode=null;this.childNodes=[];if(this.nodeType===3)this.nodeValue=String(value);else if(value!=='')this.appendChild(this.ownerDocument.createTextNode(value));}
  appendChild(node){return this.insertBefore(node,null);}
  insertBefore(node,before){node.parentNode?.removeChild(node);const index=before===null?this.childNodes.length:this.childNodes.indexOf(before);if(index<0)throw Error('Unknown sibling');this.childNodes.splice(index,0,node);node.parentNode=this;return node;}
  removeChild(node){const index=this.childNodes.indexOf(node);if(index<0)throw Error('Unknown child');this.childNodes.splice(index,1);node.parentNode=null;return node;}
  setAttribute(key,value){this.attributes.set(key,String(value));} removeAttribute(key){this.attributes.delete(key);} getAttribute(key){return this.attributes.get(key)??null;}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);} removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  contains(node){return node===this||this.childNodes.some(x=>x.contains(node));}
}
function documentHost(){
  const d={nodeType:9,nodeName:'#document',addEventListener(){},removeEventListener(){},createElement:name=>new Host(name,d),createElementNS:(_ns,name)=>new Host(name,d),createTextNode:value=>{const x=new Host('#text',d,3);x.nodeValue=String(value);return x;}};
  d.documentElement=d.createElement('html');d.body=d.createElement('body');d.documentElement.appendChild(d.body);d.activeElement=d.body;
  d.defaultView={document:d,HTMLIFrameElement:class{},HTMLElement:Host,Node:Host,addEventListener(){},removeEventListener(){}};return d;
}
function nodes(root,name){return root.childNodes.flatMap(x=>[...(x.nodeName===name.toUpperCase()?[x]:[]),...nodes(x,name)]);}
async function fixture(run){
  const rootPath=fileURLToPath(new URL('../',import.meta.url)),directory=rootPath+'.sites-runtime/';
  mkdirSync(directory,{recursive:true});const file=directory+'user-inventory-'+randomUUID()+'.mjs';
  const before=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT','__inventoryApi'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const doc=documentHost(),container=doc.createElement('div'),calls=[],commits=[],changes=[];let root,current=context('synthetic-a');
  globalThis.document=doc;globalThis.window=doc.defaultView;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const mutations=[];
  globalThis.__inventoryApi={userInventory(token,options){const pending=deferred();calls.push({token,options,...pending});return pending.promise;},
    createCrmUser(token,body,options){const pending=deferred();mutations.push({method:'create',token,body,options,...pending});return pending.promise;},
    updateCrmUser(token,id,body,options){const pending=deferred();mutations.push({method:'update',token,id,body,options,...pending});return pending.promise;}};
  try{
    await build({absWorkingDir:rootPath,tsconfigRaw:{},entryPoints:[rootPath+'src/CrmUserInventory.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react'],plugins:[{name:'inert-inventory-read',setup(b){b.onLoad({filter:/[\\/]liveApi\.js$/},()=>({loader:'js',contents:'export const liveApi=globalThis.__inventoryApi;'}));}}]});
    const Panel=(await import(pathToFileURL(file).href)).default;
    function Observed({label}){useLayoutEffect(()=>{commits.push({label,text:container.textContent});});return React.createElement(Panel,{getContext:()=>current,onChanged:()=>changes.push('refresh-agents')});}
    root=createRoot(container);
    const render=async(label,next=current)=>{current=next;await act(async()=>root.render(React.createElement(Observed,{label})));};
    const click=async()=>act(async()=>{const button=nodes(container,'button')[0],props=button[Object.keys(button).find(k=>k.startsWith('__reactProps$'))];props.onClick();});
    const props=node=>node[Object.keys(node).find(k=>k.startsWith('__reactProps$'))];
    await run({render,click,calls,mutations,commits,changes,container,text:()=>container.textContent,resolve:async(i,value)=>act(async()=>calls[i].resolve(value)),reject:async(i,error)=>act(async()=>calls[i].reject(error)),
      button:async text=>act(async()=>{props(nodes(container,'button').find(node=>node.textContent===text)).onClick();}),
      change:async(name,value)=>act(async()=>{const node=[...nodes(container,'input'),...nodes(container,'select')].find(node=>props(node).name===name);props(node).onChange({target:{value,checked:value}});}),
      submit:async()=>act(async()=>{props(nodes(container,'form')[0]).onSubmit({preventDefault(){}});}),
      resolveMutation:async(index,value)=>act(async()=>mutations[index].resolve(value)),rejectMutation:async(index,error)=>act(async()=>mutations[index].reject(error)),
    });
  }finally{
    if(root)await act(async()=>root.unmount());
    for(const [key,value]of before)if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];
    rmSync(file,{force:true});
  }
}

test('B5 inventory is an on-demand read and displays unlinked, inactive and current assignment metadata',async()=>fixture(async h=>{
  await h.render('A');assert.equal(h.calls.length,0);
  await h.click();assert.equal(h.calls.length,1);assert.equal(h.calls[0].token,'synthetic-a');
  await h.resolve(0,data('Unlinked fixture'));
  for(const text of ['2 CRM hesap kaydı','Unlinked fixture','Kapalı örnek hesap','Temsilci bağlantısı yok','Görüşme 55'])assert(h.text().includes(text),text);
  assert.equal(nodes(h.container,'button').length,1,'no account, assignment or permission mutation control');
}));

test('B5 switching accounts hides the old inventory in the first commit and ignores its pending response',async()=>fixture(async h=>{
  await h.render('A');await h.click();await h.resolve(0,data('Old account inventory'));assert(h.text().includes('Old account inventory'));
  await h.click();await h.render('B',context('synthetic-b'));
  assert(!h.commits.find(x=>x.label==='B').text.includes('Old account inventory'));
  assert.equal(h.calls[1].options.signal.aborted,true);
  await h.resolve(1,data('Late old inventory'));assert(!h.text().includes('Late old inventory'));
  await h.click();await h.resolve(2,data('New account inventory'));
  assert(h.text().includes('New account inventory'));assert(!h.text().includes('Old account inventory'));
}));

test('B5 permission denial clears metadata and partial coverage never claims that a missing account does not exist',async()=>fixture(async h=>{
  await h.render('A');await h.click();const partial=data('Partial fixture');partial.coverage.accountsComplete=false;partial.coverage.omittedInvalidAccountCount=1;
  await h.resolve(0,partial);assert(h.text().includes('hesap kapsamı eksik'));assert(h.text().includes('hesabın bulunmadığını kanıtlamaz'));
  await h.click();await h.reject(1,Object.assign(Error('denied'),{status:403}));
  assert(!h.text().includes('Partial fixture'));assert(h.text().includes('güncel yönetici yetkisi gerekli'));
}));

test('B5 inventory transport uses only the authenticated normal GET route',async()=>{
  const previous=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({success:true,data:data('transport fixture')});};
  try{
    await liveApi.userInventory('synthetic-transport-key');
    assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/live/crm/users');
    assert.equal(calls[0].options.method||'GET','GET');assert.equal(calls[0].options.body,undefined);
    assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-transport-key');
  }finally{globalThis.fetch=previous;}
});

const managedData=()=>({...data('Existing baseline'),management:{enabled:true,revision:7,editableAccountIds:['managed-personel'],agentRange:{minimum:1001,maximum:9999},synthetic:true},accounts:[...data('Existing baseline').accounts,{userId:'managed-personel',username:'sentetik-personel',displayName:'Sentetik Personel',role:'personel',active:true,chatwootAgentId:1001,mappingState:'linked',conflicts:[],permissions:['crm.view','crm.send']}]});
test('B5 management needs server capability and never offers editing a protected baseline account',async()=>fixture(async h=>{
  await h.render('A');await h.click();await h.resolve(0,managedData());
  assert.equal(nodes(h.container,'button').filter(node=>node.textContent==='Hesabı düzenle').length,1);
  await h.button('Yeni TEST hesabı');for(const [name,value]of Object.entries({username:'sentetik-new',displayName:'Sentetik Yeni',chatwootAgentId:'1002',password:'Synthetic UI password only'}))await h.change(name,value);
  await h.submit();assert.equal(h.mutations.length,1);assert.equal(h.mutations[0].method,'create');assert.equal(h.mutations[0].body.revision,7);assert.equal(h.mutations[0].body.chatwootAgentId,1002);assert.equal(h.mutations[0].body.role,'personel');
  assert(!h.text().includes('Synthetic UI password only'));await h.resolveMutation(0,{account:{id:'managed-new'},revision:8});assert.equal(h.calls.length,2);assert.deepEqual(h.changes,['refresh-agents']);assert.equal(nodes(h.container,'form').length,0);await h.resolve(1,managedData());assert(h.text().includes('Sentetik Personel'));
}));
test('B5 editing carries the current revision, omits an unchanged password and clears the form on role loss',async()=>fixture(async h=>{
  await h.render('A');await h.click();await h.resolve(0,managedData());await h.button('Hesabı düzenle');await h.change('role','mudur');await h.submit();
  assert.equal(h.mutations[0].method,'update');assert.equal(h.mutations[0].id,'managed-personel');assert.equal(h.mutations[0].body.role,'mudur');assert(!Object.hasOwn(h.mutations[0].body,'password'));
  await h.render('B',context('synthetic-b'));assert.equal(h.mutations[0].options.signal.aborted,true);assert.equal(nodes(h.container,'form').length,0);assert(!h.commits.find(row=>row.label==='B').text.includes('Sentetik Personel'));
  await h.resolveMutation(0,{revision:8});assert.equal(h.calls.length,1);assert.deepEqual(h.changes,[]);assert(!h.text().includes('Sentetik Personel'));
}));
test('B5 a conflict or uncertain write is never automatically replayed; permission denial removes metadata',async()=>fixture(async h=>{
  await h.render('A');await h.click();await h.resolve(0,managedData());await h.button('Hesabı düzenle');await h.submit();await h.rejectMutation(0,Object.assign(Error('conflict'),{status:409}));assert(h.text().includes('Listeyi yeniden okuyun'));assert.equal(h.mutations.length,1);
  await h.button('Vazgeç');await h.button('Hesabı düzenle');await h.submit();await h.rejectMutation(1,Object.assign(Error('denied'),{status:403}));assert.equal(nodes(h.container,'form').length,0);assert(!h.text().includes('Sentetik Personel'));assert(h.text().includes('güncel yönetici yetkisi gerekli'));
}));
