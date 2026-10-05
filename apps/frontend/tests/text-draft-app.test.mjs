import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TEXT_DRAFT_STORAGE_KEY,createTextDraftStorage} from '../src/lib/textDraftStorage.js';

const frontend=fileURLToPath(new URL('../',import.meta.url)), temporary=frontend+'.sites-runtime/';
const actor=()=>({accountIdentity:{id:42},role:'mudur',canSend:true,chatwootAgentId:7,liveSendEnabled:true,displayName:'Synthetic account'});
const row=(id='55')=>({id,phone:'+905387217733',channel:'whatsapp',assignedUserId:7,owner:'Synthetic staff',name:'Synthetic fixture',initials:'SF',country:'',code:'TR',messages:[],preview:'',unread:0});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const fakeWindow=sessionStorage=>({location:{pathname:'/',search:''},crypto:{randomUUID},sessionStorage,localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),dispatchEvent(){},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},addEventListener(){},removeEventListener(){}});
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
async function bundle(file,instrument=false){
 await build({absWorkingDir:frontend,tsconfigRaw:{},entryPoints:[frontend+'src/App.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_CRM_TEST':'"1"'},external:['react','@phosphor-icons/react'],loader:{'.css':'empty'},plugins:instrument?[{name:'isolated-app-handler-harness',setup(build){
  build.onLoad({filter:/App\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace(/^import \{ useCallback, useEffect, useMemo, useRef, useState \} from "react";/,'const {useCallback,useEffect,useMemo,useRef,useState}=globalThis.__draftHooks;').replace('  if (liveMode && !liveSession) return <LoginGate','  globalThis.__draftHarness.actions={commitLiveSession,setDraft,sendMessage,closeLiveSession,refreshLivePermissions,selectConversation};\n  if (liveMode && !liveSession) return <LoginGate')}));
  build.onLoad({filter:/liveApi\.js$/},args=>({loader:'js',contents:readFileSync(args.path,'utf8')+'\nfor(const name of Object.keys(globalThis.__draftHarness.api))liveApi[name]=(...args)=>globalThis.__draftHarness.api[name](...args);'}));
 }}]:[]});
}
async function fixture(run){
 mkdirSync(temporary,{recursive:true});const file=temporary+'text-draft-handlers-'+randomUUID()+'.mjs', previous={window:globalThis.window,document:globalThis.document,hooks:globalThis.__draftHooks,harness:globalThis.__draftHarness};
 const local=storage(),values=[],effects=[];let cursor=0;
 globalThis.window=fakeWindow(local);
 globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 globalThis.__draftHooks={useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],update=>{values[i]=typeof update==='function'?update(values[i]):update;}];},useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
 const harness=globalThis.__draftHarness={api:{erpDrafts:async()=>({orders:[]}),catalogSignOut:async()=>({}),session:async()=>actor(),inbox:async()=>({conversations:[row()],summary:{total:1}}),conversation:async()=>({conversation:row()}),send:async()=>({message:{id:'synthetic-accepted',direction:'outgoing',text:'sent'}})},actions:null};
 try{await bundle(file,true);const {App}=await import(pathToFileURL(file).href);const render=()=>{cursor=0;effects.length=0;return App();};const connect=(session=actor(),rows=[row(),row('56')])=>{harness.actions.commitLiveSession({key:'synthetic-session',session,inbox:{conversations:rows,summary:{total:rows.length}},agents:{agents:[]}});return render();};
  render();await run({local,harness,render,connect,pollBackground:()=>effects.filter(fn=>String(fn).includes('const refreshInbox = async')||String(fn).includes('permissionPollRef.current')).forEach(fn=>fn()),pollDrafts:()=>effects.filter(fn=>String(fn).includes('textDraftStorageRef.current.synchronize')).forEach(fn=>fn()),pollConversation:()=>effects.filter(fn=>String(fn).includes('const refreshConversation = async')).forEach(fn=>fn())});
 }finally{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.__draftHooks=previous.hooks;globalThis.__draftHarness=previous.harness;rmSync(file,{force:true});}
}
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
const composer=tree=>find(tree,node=>node.type==='textarea'&&node.props['aria-label']==='Mesajınız');

test('actual App uses committed startup reads for polling while manual permission checks stay fresh',async()=>fixture(async h=>{
 const originalNow=Date.now;let time=100000,inboxCalls=0,permissionCalls=0;
 Date.now=()=>time;
 h.harness.api.inbox=async()=>{inboxCalls++;return {conversations:[row()],summary:{total:1}};};
 h.harness.api.session=async()=>{permissionCalls++;return actor();};
 try{
  h.connect();h.pollBackground();await settle();assert.equal(inboxCalls,0);assert.equal(permissionCalls,0);
  await h.harness.actions.refreshLivePermissions();assert.equal(permissionCalls,1,'manual refresh must always reach the server');
  time+=19999;h.pollBackground();await settle();assert.equal(inboxCalls,0);assert.equal(permissionCalls,1);
  time+=1;h.pollBackground();await settle();assert.equal(inboxCalls,1);assert.equal(permissionCalls,1);
  globalThis.document.visibilityState='hidden';time+=40000;h.pollBackground();await settle();assert.equal(inboxCalls,1);assert.equal(permissionCalls,1);
  globalThis.document.visibilityState='visible';h.pollBackground();await settle();assert.equal(inboxCalls,2);assert.equal(permissionCalls,2);
  h.harness.api.session=async()=>{throw Object.assign(new Error('Synthetic revoked'),{status:401});};
  await assert.rejects(h.harness.actions.refreshLivePermissions(),{status:401});
  const html=renderToStaticMarkup(h.render());assert.match(html,/Melisa CRM güvenli giriş/);
 }finally{Date.now=originalNow;}
}));
test('actual production App first render hides persisted text and never overwrites storage before authentication',async()=>{
 mkdirSync(temporary,{recursive:true});const file=temporary+'text-draft-ssr-'+randomUUID()+'.mjs',previous=globalThis.window,local=storage();
 const s=createTextDraftStorage({getStorage:()=>local});s.activate(actor(),[row()]);s.set(row(),'PRIVATE UNSENT TEXT');local.setItem('melisa-crm-access-token','synthetic-remembered');const before=local.getItem(TEXT_DRAFT_STORAGE_KEY);
 try{await bundle(file);globalThis.window=fakeWindow(local);const {App}=await import(pathToFileURL(file).href);const html=renderToStaticMarkup(React.createElement(App));assert.match(html,/Melisa CRM güvenli giriş/);assert.doesNotMatch(html,/PRIVATE UNSENT TEXT|Synthetic fixture/);assert.equal(local.getItem(TEXT_DRAFT_STORAGE_KEY),before);}finally{globalThis.window=previous;rmSync(file,{force:true});}
});
test('actual App common draft setter restores exact text, keeps appends and captured successful send clears one conversation',async()=>fixture(async h=>{
 h.connect();h.harness.actions.setDraft('Human text\n\nÜrün/fiyat veya AI eki');assert.equal(composer(h.render()).props.value,'Human text\n\nÜrün/fiyat veya AI eki');
 const restored=createTextDraftStorage({getStorage:()=>h.local}).activate(actor(),[row(),row('56')]);assert.equal(restored.drafts['55'],'Human text\n\nÜrün/fiyat veya AI eki');
 h.harness.actions.selectConversation(row('56'));h.render();h.harness.actions.setDraft('other chat');h.render();h.harness.actions.selectConversation(row());h.render();
 await h.harness.actions.sendMessage();assert.equal(composer(h.render()).props.value,'');assert.equal(createTextDraftStorage({getStorage:()=>h.local}).activate(actor(),[row(),row('56')]).drafts['56'],'other chat');
}));
test('actual App preserves failed/uncertain text and 401 expiry; explicit logout removes it',async()=>fixture(async h=>{
 h.connect();h.harness.actions.setDraft('unsent human text');h.render();h.harness.api.send=async()=>{throw Object.assign(new Error('expiry'),{status:401});};await h.harness.actions.sendMessage();h.render();assert.equal(createTextDraftStorage({getStorage:()=>h.local}).activate(actor(),[row()]).drafts['55'],'unsent human text');
 h.connect();assert.equal(composer(h.render()).props.value,'unsent human text');let calls=0;h.harness.api.send=async()=>{calls++;throw new TypeError('synthetic transport failure');};await h.harness.actions.sendMessage();const uncertainTree=h.render();assert.equal(composer(uncertainTree).props.value,'unsent human text');assert.equal(find(uncertainTree,node=>node.props?.['aria-label']==='Mesajı gönder').props.disabled,true);await h.harness.actions.sendMessage();assert.equal(calls,1);
 await h.harness.actions.closeLiveSession('',true);h.render();assert.equal(h.local.getItem(TEXT_DRAFT_STORAGE_KEY),null);h.connect();assert.equal(composer(h.render()).props.value,'');await settle();
}));
test('actual App view-only typing remains memory-only across inbox synchronization',async()=>fixture(async h=>{
 h.connect({...actor(),canSend:false,liveSendEnabled:false});h.harness.actions.setDraft('view-only editable text');assert.equal(composer(h.render()).props.value,'view-only editable text');h.pollDrafts();assert.equal(composer(h.render()).props.value,'view-only editable text');assert.equal(h.local.getItem(TEXT_DRAFT_STORAGE_KEY),null);
}));
test('actual App late send cannot erase human edits and permission loss purges scoped drafts',async()=>fixture(async h=>{
 h.connect();h.harness.actions.setDraft('captured text');h.render();let resolve;h.harness.api.send=()=>new Promise(yes=>{resolve=yes;});const sending=h.harness.actions.sendMessage();h.harness.actions.setDraft('new human text');h.render();resolve({message:{id:'synthetic'}});await sending;assert.equal(composer(h.render()).props.value,'new human text');
 h.harness.api.session=async()=>({...actor(),canSend:false,liveSendEnabled:false});await h.harness.actions.refreshLivePermissions();h.render();assert.equal(h.local.getItem(TEXT_DRAFT_STORAGE_KEY),null);
}));
test('actual App view-only conversation 403/404 removes only that RAM draft and preserves the other chat',async()=>{
 for(const status of [403,404])await fixture(async h=>{
  h.connect({...actor(),canSend:false,liveSendEnabled:false});h.harness.actions.setDraft('first private RAM draft');h.render();
  h.harness.actions.selectConversation(row('56'));h.render();h.harness.actions.setDraft('second RAM draft');h.render();h.harness.actions.selectConversation(row());h.render();
  h.harness.api.conversation=async()=>{throw Object.assign(new Error('synthetic access loss'),{status});};h.pollConversation();await settle();assert.equal(composer(h.render()).props.value,'');
  h.harness.actions.selectConversation(row('56'));assert.equal(composer(h.render()).props.value,'second RAM draft');assert.equal(h.local.getItem(TEXT_DRAFT_STORAGE_KEY),null);
 });
});
