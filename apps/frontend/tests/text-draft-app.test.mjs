import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {rememberTerminalShare} from '../src/terminalShareProof.js';
import {TEXT_DRAFT_STORAGE_KEY,createTextDraftStorage} from '../src/lib/textDraftStorage.js';
import {normalizeConversation} from '../src/liveApi.js';

const frontend=fileURLToPath(new URL('../',import.meta.url)), temporary=frontend+'.sites-runtime/';
const actor=()=>({accountIdentity:{id:42},role:'mudur',canSend:true,chatwootAgentId:7,liveSendEnabled:true,displayName:'Synthetic account'});
const row=(id='55')=>({id,phone:'+905387217733',channel:'whatsapp',assignedUserId:7,owner:'Synthetic staff',name:'Synthetic fixture',initials:'SF',country:'',code:'TR',messages:[],preview:'',unread:0});
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const fakeWindow=sessionStorage=>({location:{pathname:'/',search:''},crypto:{randomUUID},sessionStorage,localStorage:{getItem:()=>null,setItem(){}},matchMedia:()=>({matches:false}),dispatchEvent(){},requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},addEventListener(){},removeEventListener(){}});
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
async function bundle(file,instrument=false,isolated=false){
 await build({absWorkingDir:frontend,tsconfigRaw:{},entryPoints:[frontend+'src/App.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',define:{'import.meta.env.DEV':'false','import.meta.env.VITE_CRM_TEST':'"1"','import.meta.env.VITE_CRM_ISOLATED_PREPARATION':JSON.stringify(isolated?'1':'0')},external:['react','@phosphor-icons/react'],loader:{'.css':'empty'},plugins:instrument?[{name:'isolated-app-handler-harness',setup(build){
  build.onLoad({filter:/App\.jsx$/},args=>({loader:'jsx',contents:readFileSync(args.path,'utf8').replace(/^import \{ useCallback, useEffect, useMemo, useRef, useState \} from "react";/,'const {useCallback,useEffect,useMemo,useRef,useState}=globalThis.__draftHooks;').replace('  if(liveMode&&!liveSession&&!semihEntry.checked)','  globalThis.__draftHarness.actions={commitLiveSession,openAssignment,confirmAssignment,assignCustomer,setAgents,setSelectedAssigneeId,setDraft,sendMessage,closeLiveSession,refreshLivePermissions,selectConversation,setQuery,setFilter,loadRemainingConversations,activateTerminal,checkSendStatus,translateDraft,renewExpiredNormalSession,continueSemihSession,connectLive,getConversations:()=>conversations,setHistoryPanel:panel=>chatScrollRef.current=panel};\n  if(liveMode&&!liveSession&&!semihEntry.checked)')}));
  build.onLoad({filter:/liveApi\.js$/},args=>({loader:'js',contents:readFileSync(args.path,'utf8')+'\nfor(const name of Object.keys(globalThis.__draftHarness.api))liveApi[name]=(...args)=>globalThis.__draftHarness.api[name](...args);'}));
 }}]:[]});
}
async function fixture(run,{compact=false,terminal=false,offline=false,isolated=false,remembered=null,origin=''}={}){
 mkdirSync(temporary,{recursive:true});const file=temporary+'text-draft-handlers-'+randomUUID()+'.mjs', previous={window:globalThis.window,document:globalThis.document,hooks:globalThis.__draftHooks,harness:globalThis.__draftHarness};
 const local=storage(),values=[],effects=[];let cursor=0;
 globalThis.window=fakeWindow(local);
 if(origin)globalThis.window.location={...globalThis.window.location,origin,hostname:new URL(origin).hostname};
 if(terminal){globalThis.window.location={pathname:"/",search:"?terminal=1",origin:`http://127.0.0.1:${isolated?62600:62400}`,hostname:"127.0.0.1"};globalThis.window.navigator={onLine:!offline};local.setItem("melisa-crm-access-token","desktop-synthetic-session");}
 if(compact)globalThis.window.localStorage.getItem=()=> 'terminal';
 globalThis.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 globalThis.__draftHooks={useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],update=>{values[i]=typeof update==='function'?update(values[i]):update;}];},useRef(initial){const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
 const harness=globalThis.__draftHarness={api:{login:async()=>({accessToken:'synthetic-normal-access'}),rememberedNormalSession:async()=>remembered??({enabled:false,user:null}),hasNativeNormalSession:()=>false,clearNormalSession:async()=>{},rememberNormalSession:async()=>{},resumeNormalSession:async()=>null,assign:async()=>({}),sendStatus:async()=>({}),canonicalCatalogProduct:async()=>({}),erpDrafts:async()=>({orders:[]}),catalogSignOut:async()=>({}),session:async()=>actor(),inbox:async()=>({conversations:[row()],summary:{total:1}}),conversation:async()=>({conversation:row()}),send:async()=>({message:{id:'synthetic-accepted',direction:'outgoing',text:'sent'}})},actions:null};
 try{await bundle(file,true,isolated);const {App}=await import(pathToFileURL(file).href);const render=()=>{cursor=0;effects.length=0;return App();};const connect=(session=actor(),rows=[row(),row('56')],inboxExtra={})=>{harness.actions.commitLiveSession({key:'synthetic-session',session,inbox:{conversations:rows,summary:{total:rows.length},...inboxExtra},agents:{agents:[]}});return render();};
  const checking=render();assert.match(renderToStaticMarkup(checking),/Oturum kontrol ediliyor/);assert.doesNotMatch(renderToStaticMarkup(checking),/Synthetic fixture|Mesajınız/);
  const startup=effects.find(fn=>String(fn).includes('liveApi.rememberedNormalSession'));assert.equal(typeof startup,'function');const stopStartup=startup();
  for(let i=0;i<12;i++)await Promise.resolve();render();
  try{await run({local,harness,render,connect,pollAutomatic:()=>effects.filter(fn=>String(fn).includes("automaticTranslationBusy.current")).forEach(fn=>fn()),pollBackground:()=>effects.filter(fn=>String(fn).includes('const refreshInbox = async')||String(fn).includes('permissionPollRef.current')).forEach(fn=>fn()),pollDrafts:()=>effects.filter(fn=>String(fn).includes('textDraftStorageRef.current.synchronize')).forEach(fn=>fn()),pollHistoryScroll:()=>effects.filter(fn=>String(fn).includes('previousChatRef.current')).forEach(fn=>fn()),pollConversation:()=>effects.filter(fn=>String(fn).includes('const refreshConversation = async')).forEach(fn=>fn())});}finally{stopStartup?.();}
 }finally{globalThis.window=previous.window;globalThis.document=previous.document;globalThis.__draftHooks=previous.hooks;globalThis.__draftHarness=previous.harness;rmSync(file,{force:true});}
}
function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of React.Children.toArray(tree.props?.children)){const found=find(child,predicate);if(found)return found;}return null;}
const composer=tree=>find(tree,node=>node.type==='textarea'&&node.props['aria-label']==='Mesajınız');

test('B5 clean inbox denial hides assignment controls and rejects direct assignment handlers',async()=>fixture(async h=>{
 const session={...actor(),assignmentEnabled:true},conversation={...row(),canAssign:true,capabilities:{assign:true}};
 h.connect(session,[conversation],{capabilities:{assign:false}});
 h.harness.actions.setAgents([{id:7,name:'Synthetic staff'}]);h.render();
 let writes=0;h.harness.api.assign=async()=>writes++;
 h.harness.actions.openAssignment(conversation);h.render();
 await h.harness.actions.assignCustomer('Synthetic staff');
 assert.equal(writes,0);
 const html=renderToStaticMarkup(h.render());assert.doesNotMatch(html,/Atanmamışlar|Atamayı onayla/);
 const menu=find(h.render(),node=>node.type==='button'&&node.props['aria-label']==='Konuşma menüsünü aç');menu.props.onClick();
 assert.doesNotMatch(renderToStaticMarkup(h.render()),/Temsilci ata/);
}));

test('B5 conversation denial overrides a generally supported manager assignment',async()=>fixture(async h=>{
 const session={...actor(),assignmentEnabled:true},conversation={...row(),canAssign:false,capabilities:{assign:false}};
 h.connect(session,[conversation],{capabilities:{assign:true}});h.harness.actions.setAgents([{id:7,name:'Synthetic staff'}]);h.render();
 let writes=0;h.harness.api.assign=async()=>writes++;
 h.harness.actions.openAssignment(conversation);h.render();await h.harness.actions.assignCustomer('Synthetic staff');
 assert.equal(writes,0);assert.doesNotMatch(renderToStaticMarkup(h.render()),/Atamayı onayla/);
 const menu=find(h.render(),node=>node.type==='button'&&node.props['aria-label']==='Konuşma menüsünü aç');menu.props.onClick();
 assert.doesNotMatch(renderToStaticMarkup(h.render()),/Temsilci ata/);
}));

test('B5 supported manager assignment keeps its normal confirmation and one API call',async()=>fixture(async h=>{
 const session={...actor(),assignmentEnabled:true},conversation={...row(),canAssign:true,capabilities:{assign:true}};
 h.connect(session,[conversation],{capabilities:{assign:true}});h.harness.actions.setAgents([{id:7,name:'Synthetic staff'}]);h.render();
 const writes=[];h.harness.api.assign=async(...args)=>writes.push(args);
 h.harness.actions.openAssignment(conversation);h.render();assert.match(renderToStaticMarkup(h.render()),/Atamayı onayla/);
 h.harness.actions.setSelectedAssigneeId('7');h.render();await h.harness.actions.confirmAssignment();
 assert.deepEqual(writes,[['synthetic-session','55',7]]);assert.doesNotMatch(renderToStaticMarkup(h.render()),/Atamayı onayla/);
}));

test('B5 a captured confirmation cannot write after the current inbox forbids assignment',async()=>fixture(async h=>{
 const session={...actor(),assignmentEnabled:true},conversation={...row(),canAssign:true,capabilities:{assign:true}};
 h.connect(session,[conversation],{capabilities:{assign:true}});h.harness.actions.setAgents([{id:7,name:'Synthetic staff'}]);h.render();
 let writes=0;h.harness.api.assign=async()=>writes++;
 h.harness.actions.openAssignment(conversation);h.render();h.harness.actions.setSelectedAssigneeId('7');h.render();
 const captured=h.harness.actions.confirmAssignment;
 h.connect(session,[conversation],{capabilities:{assign:false}});await captured();
 assert.equal(writes,0);assert.doesNotMatch(renderToStaticMarkup(h.render()),/Atamayı onayla/);
}));

test('B5 personnel cannot assign even when the source supports assignment',async()=>fixture(async h=>{
 const session={...actor(),role:'personel',assignmentEnabled:false,canAssign:false},conversation={...row(),canAssign:true};
 h.connect(session,[conversation],{capabilities:{assign:true}});h.harness.actions.setAgents([{id:7,name:'Synthetic staff'}]);h.render();
 let writes=0;h.harness.api.assign=async()=>writes++;
 h.harness.actions.openAssignment(conversation);h.render();await h.harness.actions.assignCustomer('Synthetic staff');
 assert.equal(writes,0);assert.doesNotMatch(renderToStaticMarkup(h.render()),/Atamayı onayla|Atanmamışlar/);
}));

test('B5 supported legacy manager without source flags retains assignment',async()=>fixture(async h=>{
 h.connect({...actor(),assignmentEnabled:true},[row()]);h.harness.actions.openAssignment(row());
 assert.match(renderToStaticMarkup(h.render()),/Atamayı onayla/);
}));

test('B5 a captured confirmation rejects a newly denied conversation or personnel role',async()=>{
 for(const denied of ['conversation','role'])await fixture(async h=>{
  const session={...actor(),assignmentEnabled:true},conversation={...row(),canAssign:true};
  h.connect(session,[conversation],{capabilities:{assign:true}});h.harness.actions.setAgents([{id:7,name:'Synthetic staff'}]);h.render();
  let writes=0;h.harness.api.assign=async()=>writes++;
  h.harness.actions.openAssignment(conversation);h.render();h.harness.actions.setSelectedAssigneeId('7');h.render();
  const captured=h.harness.actions.confirmAssignment;
  h.connect(denied==='role'?{...session,role:'personel',assignmentEnabled:false}:session,
    [denied==='conversation'?{...conversation,canAssign:false}:conversation],{capabilities:{assign:true}});
  await captured();assert.equal(writes,0,denied);assert.doesNotMatch(renderToStaticMarkup(h.render()),/Atamayı onayla/);
 });
});
const dedicatedSession=()=>({accountIdentity:{id:'crm-agent-test-20261011',username:'crm-agent-test'},id:'crm-agent-test-20261011',username:'crm-agent-test',role:'personel',chatwootAgentId:3,permissions:['crm.view'],canSend:false,liveSendEnabled:false,displayName:'TEST personeli',normalTestScope:{database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',isolatedPreparation:true,draftOnly:true,chatwootAgentId:3}});
const semihSession=()=>({accountIdentity:{id:'crm-semih-test-20261012',username:'crm-semih-test',role:'patron'},id:'crm-semih-test-20261012',username:'crm-semih-test',displayName:'Semih TEST',role:'patron',canSend:true,canAssign:false,liveSendEnabled:false,permissions:['crm.view','crm.send','crm.assign','crm.agents','crm.manage'],normalTestScope:{semihTestContinue:true,isolatedPreparation:true,draftOnly:true,database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'}});
test('actual App shows only the verified Semih continue action, then loads profile and real inbox before showing the account',async()=>fixture(async h=>{
 const gate=h.render(),html=renderToStaticMarkup(gate);assert.match(html,/Semih olarak devam et/);assert.doesNotMatch(html,/TEST ADMIN|Synthetic fixture|Mesajınız|type="password"/);
 const calls=[];h.harness.api.resumeNormalSession=async()=>{calls.push('refresh');return {accessToken:'synthetic-normal-access',user:semihSession()};};h.harness.api.session=async()=>{calls.push('me');return semihSession();};h.harness.api.rememberNormalSession=async()=>calls.push('verified');h.harness.api.inbox=async()=>{calls.push('inbox');return {conversations:[row()],summary:{total:1}};};
 await gate.props.onContinue();assert.deepEqual(calls,['refresh','me','verified','inbox']);const opened=renderToStaticMarkup(h.render());assert.match(opened,/crm-semih-test/);assert.match(opened,/Patron/);assert.match(opened,/Synthetic fixture/);assert.doesNotMatch(opened,/TEST ADMIN/);
 await h.harness.actions.closeLiveSession('',true);const loggedOut=renderToStaticMarkup(h.render());assert.doesNotMatch(loggedOut,/Semih olarak devam et|TEST ADMIN|Synthetic fixture/);assert.match(loggedOut,/type="password"/);
},{remembered:{enabled:true,user:semihSession()},origin:'http://127.0.0.1:62700'}));
test('actual fresh Semih-enabled loopback browser retains normal password login without any TEST ADMIN bootstrap',async()=>fixture(async h=>{
 const html=renderToStaticMarkup(h.render());assert.match(html,/type="password"/);assert.doesNotMatch(html,/Semih olarak devam et|TEST ADMIN|Synthetic fixture/);
 h.render().props.onChange({username:'synthetic-normal-account',password:'synthetic-input'});h.render();let logins=0;h.harness.api.login=async(username,password)=>{logins++;assert.equal(username,'synthetic-normal-account');assert.equal(password,'synthetic-input');return {accessToken:'synthetic-normal-access'};};
 await h.harness.actions.connectLive();assert.equal(logins,1);assert.match(renderToStaticMarkup(h.render()),/Synthetic fixture/);
},{remembered:{enabled:true,user:null},origin:'http://127.0.0.1:62700'}));
test('actual normalized dedicated personel draft survives chat back/reopen and is purged after reassignment while Send stays forbidden',async()=>fixture(async h=>{
 const session=dedicatedSession(),raw={...row(),assignedUserId:'crm-personel-3',chatwootAgentId:3},assigned=normalizeConversation(raw);let sends=0;h.harness.api.send=async()=>sends++;h.harness.api.session=async()=>session;
 h.connect(session,[assigned]);h.harness.actions.selectConversation(assigned);h.render();h.harness.actions.setDraft('Gönderilmemiş kısa TEST taslağı');h.render();
 const reloaded=createTextDraftStorage({getStorage:()=>h.local}).activate(session,[assigned]);assert.equal(reloaded.drafts['55'],'Gönderilmemiş kısa TEST taslağı');
 await h.harness.actions.sendMessage();assert.equal(sends,0);assert.equal(composer(h.render()).props.value,'Gönderilmemiş kısa TEST taslağı');
 const send=find(h.render(),node=>node.type==='button'&&node.props.className?.includes('send-button'));assert.equal(send?.props.disabled,true);
 const back=find(h.render(),node=>node.type==='button'&&node.props['aria-label']==='Mesaj listesine dön');back.props.onClick();assert.doesNotMatch(h.render().props.className,/chat-open/);
 h.harness.actions.selectConversation(assigned);assert.match(h.render().props.className,/chat-open/);assert.equal(composer(h.render()).props.value,'Gönderilmemiş kısa TEST taslağı');
 h.harness.api.conversation=async()=>({conversation:normalizeConversation({...raw,chatwootAgentId:4})});h.pollConversation();await settle();h.render();h.pollDrafts();
 assert.equal(composer(h.render()).props.value,'');assert.deepEqual(createTextDraftStorage({getStorage:()=>h.local}).activate(session,[assigned]).drafts,{});
 await h.harness.actions.sendMessage();assert.equal(sends,0);assert.equal(find(h.render(),node=>node.type==='button'&&node.props.className?.includes('send-button')).props.disabled,true);
},{terminal:true,isolated:true}));
test('actual expired-session renewal retains protected grant on503 but clears it on401 and closes authenticated UI',async()=>{
 for(const status of [503,401])await fixture(async h=>{
  let clears=0;h.harness.api.clearNormalSession=async()=>clears++;h.harness.api.resumeNormalSession=async()=>{throw Object.assign(Error('offline fixture'),{status});};
  h.connect();await h.harness.actions.renewExpiredNormalSession();await settle();const gate=h.render();assert.equal(clears,status===401?1:0);assert.equal(gate.props.retryAvailable,status===503);assert.equal(gate.props.error,status===503?'Bağlantı kurulamadı. Kaydedilen oturumunuzu yeniden deneyebilirsiniz.':'offline fixture');
 },{terminal:true,isolated:true});
});

test('actual App captures the issuer key before clearing local state and reports an unconfirmed logout honestly',async()=>fixture(async h=>{
 const issuer={...actor(),customerProductRequestIssuer:true};h.connect(issuer);
 let rejected;const pending=new Promise((_resolve,reject)=>{rejected=reject;}),calls=[];
 h.harness.api.clearNormalSession=key=>{calls.push({key,stored:h.local.getItem('melisa-crm-access-token')});return pending;};
 const closed=h.harness.actions.closeLiveSession('',true),failure=assert.rejects(closed,/Synthetic logout unavailable/);
 assert.deepEqual(calls,[{key:'synthetic-session',stored:'synthetic-session'}]);assert.equal(h.local.getItem('melisa-crm-access-token'),null);
 assert.doesNotMatch(renderToStaticMarkup(h.render()),/Synthetic fixture/);
 rejected(Error('Synthetic logout unavailable'));await failure;await settle();assert.equal(h.render().props.error,'Synthetic logout unavailable');
},{isolated:true,origin:'http://127.0.0.1:62700'}));

test('actual App clears browser access on a failed issuer logout and still blocks password login through the captured old key',async()=>fixture(async h=>{
 const beforeFetch=globalThis.fetch,calls=[],issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',permissions:['crm.view','crm.manage'],customerProductRequestIssuer:true};
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return url.endsWith('/me')?Response.json({data:issuer}):Response.json({error:{message:'Synthetic revoke unavailable'}},{status:503});};
 try{
  const {liveApi}=await import('../src/liveApi.js?actual-app-failed-issuer-logout-barrier-test');
  await liveApi.session('synthetic-session');h.connect({...actor(),customerProductRequestIssuer:true});
  h.harness.api.clearNormalSession=key=>liveApi.clearNormalSession(key);h.harness.api.login=(...args)=>liveApi.login(...args);
  const closed=h.harness.actions.closeLiveSession('',true);assert.equal(h.local.getItem('melisa-crm-access-token'),null);
  await assert.rejects(closed,/Oturumun kapanışı doğrulanamadı/);await settle();
  for(let i=0;i<2;i++){
   h.render().props.onChange({username:'synthetic-manager',password:'synthetic-password'});h.render();await h.harness.actions.connectLive();
   assert.match(h.render().props.error,/Oturumun kapanışı doğrulanamadı/);
  }
  assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/logout','/api/live/auth/logout']);
  assert(calls.slice(1).every(call=>call.options.body==='{}'&&call.options.headers.Authorization==='Bearer synthetic-session'));
 }finally{globalThis.fetch=beforeFetch;}
},{isolated:true,origin:'http://127.0.0.1:62700'}));

test('actual App blocks password login while its captured issuer logout is pending after browser access has been cleared',async()=>fixture(async h=>{
 const beforeFetch=globalThis.fetch,calls=[],issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};
 let started,rejectLogout;const logoutStarted=new Promise(resolve=>started=resolve),logoutResponse=new Promise(resolve=>rejectLogout=()=>resolve(Response.json({error:{message:'Synthetic pending revoke failed'}},{status:503})));
 globalThis.fetch=async(url,options)=>{calls.push({url,options});if(url.endsWith('/me'))return Response.json({data:issuer});started();return logoutResponse;};
 try{
  const {liveApi}=await import('../src/liveApi.js?actual-app-pending-issuer-close-barrier-test');await liveApi.session('synthetic-session');
  h.connect({...actor(),customerProductRequestIssuer:true});h.harness.api.clearNormalSession=key=>liveApi.clearNormalSession(key);h.harness.api.login=(...args)=>liveApi.login(...args);
  const closed=h.harness.actions.closeLiveSession('',true),failedClose=assert.rejects(closed,/Oturumun kapanışı doğrulanamadı/);assert.equal(h.local.getItem('melisa-crm-access-token'),null);
  await logoutStarted;h.render().props.onChange({username:'synthetic-manager',password:'synthetic-password'});h.render();
  const login=h.harness.actions.connectLive();await settle();assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout']);
  rejectLogout();await failedClose;assert.equal(await login,null);assert.match(h.render().props.error,/Oturumun kapanışı doğrulanamadı/);
  assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout']);
 }finally{globalThis.fetch=beforeFetch;}
},{isolated:true,origin:'http://127.0.0.1:62700'}));

test('actual App permits expired or revoked issuer relogin only after the same captured key me401 settles',async()=>{
 for(const reason of ['expired','revoked'])await fixture(async h=>{
  const beforeFetch=globalThis.fetch,calls=[],issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};
  let verifying=false,started,finish;const verificationStarted=new Promise(resolve=>started=resolve),verification=new Promise(resolve=>finish=resolve);
  globalThis.fetch=async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith('/login'))return Response.json({data:{accessToken:'synthetic-new-access',user:issuer}});
   if(url.endsWith('/logout'))return Response.json({error:{message:`Synthetic ${reason} logout denied`}},{status:401});
   if(!verifying)return Response.json({data:issuer});started();return verification;
  };
  try{
   const {liveApi}=await import(`../src/liveApi.js?actual-app-known-${reason}-revalidation-test`);await liveApi.session('synthetic-session');verifying=true;
   h.connect({...actor(),customerProductRequestIssuer:true});h.harness.api.clearNormalSession=key=>liveApi.clearNormalSession(key);h.harness.api.login=(...args)=>liveApi.login(...args);
   const closed=h.harness.actions.closeLiveSession('',true);assert.equal(h.local.getItem('melisa-crm-access-token'),null);await verificationStarted;
   h.render().props.onChange({username:'synthetic-manager',password:'synthetic-password'});h.render();const login=h.harness.actions.connectLive();await settle();
   assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me']);
   finish(Response.json({error:{message:`Synthetic ${reason} old authority`}},{status:401}));await closed;await login;
   assert.equal(h.local.getItem('melisa-crm-access-token'),'synthetic-new-access');assert.match(renderToStaticMarkup(h.render()),/Synthetic fixture/);
   assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/login']);
   assert(calls.slice(1,3).every(call=>call.options.headers.Authorization==='Bearer synthetic-session'&&call.options.redirect==='error'&&call.options.credentials==='omit'));
  }finally{globalThis.fetch=beforeFetch;}
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual App keeps a known issuer logout401 barrier through valid or unavailable me and recovers after verified invalidation',async()=>{
 for(const initial of ['valid','unavailable'])await fixture(async h=>{
  const beforeFetch=globalThis.fetch,calls=[],issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};let mode='bootstrap';
  globalThis.fetch=async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith('/login'))return Response.json({data:{accessToken:'synthetic-new-access',user:issuer}});
   if(url.endsWith('/logout'))return Response.json({error:{message:'Synthetic logout denied'}},{status:401});
   return mode==='bootstrap'||mode==='valid'?Response.json({data:issuer}):Response.json({error:{message:'Synthetic old authority unconfirmed'}},{status:mode==='invalid'?401:503});
  };
  try{
   const {liveApi}=await import(`../src/liveApi.js?actual-app-known-${initial}-barrier-test`);await liveApi.session('synthetic-session');mode=initial;
   h.connect({...actor(),customerProductRequestIssuer:true});h.harness.api.clearNormalSession=key=>liveApi.clearNormalSession(key);h.harness.api.login=(...args)=>liveApi.login(...args);
   const closed=h.harness.actions.closeLiveSession('',true);assert.equal(h.local.getItem('melisa-crm-access-token'),null);await assert.rejects(closed,/Oturumun kapanışı doğrulanamadı/);
   for(let i=0;i<2;i++){
    h.render().props.onChange({username:'synthetic-manager',password:'synthetic-password'});h.render();await h.harness.actions.connectLive();
    assert.match(h.render().props.error,/Oturumun kapanışı doğrulanamadı/);
   }
   assert.equal(calls.filter(call=>call.url.endsWith('/login')).length,0);mode='invalid';
   h.render().props.onChange({username:'synthetic-manager',password:'synthetic-password'});h.render();await h.harness.actions.connectLive();
   assert.equal(h.local.getItem('melisa-crm-access-token'),'synthetic-new-access');assert.match(renderToStaticMarkup(h.render()),/Synthetic fixture/);
   assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/login']);
   assert(calls.slice(1,-1).every(call=>call.options.headers.Authorization==='Bearer synthetic-session'&&call.options.redirect==='error'&&call.options.credentials==='omit'));
  }finally{globalThis.fetch=beforeFetch;}
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual terminal entry has an isolated auth session and offline keyboard send cannot reach transport',async()=>fixture(async h=>{
 let sends=0;h.harness.api.send=async()=>{sends++;};
 const login=renderToStaticMarkup(h.render());
 assert.match(login,/login-gate terminal-login/); assert.match(login,/<h1>Müşterilerim<\/h1>/);
 assert.doesNotMatch(login,/TEST CRM|CANLI CRM|CRM Yönetim Merkezi/);
 assert.equal(h.local.getItem('melisa-crm-access-token'),'desktop-synthetic-session');
 const tree=h.connect();assert.match(tree.props.className,/terminal-entry/);
 const html=renderToStaticMarkup(tree);assert.match(html,/MELISA TERMINAL|Müşterilerim/);assert.match(html,/Bağlantı yok/);
 assert.equal(h.local.getItem('melisa-crm-terminal-access-token'),null);
 h.harness.actions.setDraft('Human text');h.render();await h.harness.actions.sendMessage();assert.equal(sends,0);
 await h.harness.actions.closeLiveSession('',true);
 assert.equal(h.local.getItem('melisa-crm-terminal-access-token'),null);assert.equal(h.local.getItem('melisa-crm-access-token'),'desktop-synthetic-session');
},{terminal:true,offline:true}));

test('actual terminal manual price send fresh-checks ERP before transport and preserves message on source failure',async()=>fixture(async h=>{
 h.connect();h.harness.actions.setDraft('Recorded product price');h.render();
 const p={id:'erp-36724',revision:'a'.repeat(64)};rememberTerminalShare(h.local,'id:42','55',[p]);let sends=0,reads=0;
 h.harness.api.send=async()=>{sends++;return{message:{id:'synthetic-result',direction:'outgoing',text:'accepted'}};};
 h.harness.api.canonicalCatalogProduct=async()=>{reads++;throw Error('offline');};
 await h.harness.actions.sendMessage();assert.equal(reads,1);assert.equal(sends,0);assert.equal(composer(h.render()).props.value,'Recorded product price');
 h.harness.api.canonicalCatalogProduct=async()=>{reads++;return{data:{...p,status:'active',hold:{blocked:false}},meta:{catalogVersion:'melisa-catalog.v1',sourceDatabaseVerified:true,cached:false}};};
 await h.harness.actions.sendMessage();assert.equal(reads,2);assert.equal(sends,1);assert.equal(composer(h.render()).props.value,'');
},{terminal:true}));

test('actual terminal return preserves the selected conversation and composer while rechecking permissions and assignment',async()=>fixture(async h=>{
 h.connect(); h.harness.actions.selectConversation(row()); h.render();
 h.harness.actions.setDraft('Preserved personnel message'); h.render();
 let permissionReads=0,detailReads=0;
 h.harness.api.session=async()=>{permissionReads++;return actor();};
 h.harness.api.conversation=async()=>{detailReads++;return {conversation:row()};};
 for(let navigation=0;navigation<2;navigation++){
  h.harness.actions.activateTerminal();const tree=h.render();
  assert.match(tree.props.className,/chat-open/);assert.equal(composer(tree).props.value,'Preserved personnel message');
  h.pollConversation();await settle();h.render();
 }
 assert(permissionReads>=1);assert.equal(detailReads,2);
 h.harness.api.conversation=async()=>{throw Object.assign(Error('assignment changed'),{status:403});};
 h.harness.actions.activateTerminal();h.render();h.pollConversation();await settle();
 const revoked=h.render();assert.doesNotMatch(revoked.props.className,/chat-open/);assert.equal(composer(revoked).props.disabled,true);
 assert.equal(createTextDraftStorage({getStorage:()=>h.local}).activate(actor(),[row()]).drafts['55'],undefined);
 await h.harness.actions.closeLiveSession('',true);h.harness.actions.activateTerminal();
 assert.match(renderToStaticMarkup(h.render()),/login-gate terminal-login/);
},{terminal:true,compact:true}));

test('actual personnel terminal polls metadata without rehydrating every conversation or losing selected history',async()=>fixture(async h=>{
 const originalNow=Date.now;let time=100000;Date.now=()=>time;
 try{
  const own={...row(),messagesLoaded:true,detailLoaded:true,messages:[{id:'old',direction:'incoming',text:'Existing own history'}]};
  h.connect({...actor(),role:'personel'},[own]);h.harness.actions.selectConversation(own);h.render();
  h.harness.actions.setDraft('Unsent personnel message');h.render();
  const calls=[];h.harness.api.inbox=async(key,offset,options)=>{calls.push({offset,view:options?.view});return {conversations:[{...row(),messagesLoaded:false,detailLoaded:false}],summary:{total:1}};};
  h.harness.api.session=async()=>({...actor(),role:'personel'});
  time+=20000;h.pollBackground();await settle();
  const tree=h.render();assert.deepEqual(calls,[{offset:0,view:'bootstrap'}]);
  assert.equal(composer(tree).props.value,'Unsent personnel message');assert.match(renderToStaticMarkup(tree),/Existing own history/);
 }finally{Date.now=originalNow;}
},{terminal:true,compact:true}));

const loadedHistory=(ids=Array.from({length:20},(_,i)=>i+1),changes={})=>normalizeConversation({...row(),messages:ids.map(id=>({id:String(id),messageType:'incoming',content:`Fixture history ${id}`,createdAt:`2026-10-13T12:00:${String(id).padStart(2,'0')}Z`,deliveryState:'sent',attachments:id===1?[{id:'photo-1',type:'image/jpeg',fileName:'oldest-photo.jpg',url:'https://example.test/oldest-photo.jpg'},{id:'pdf-1',type:'application/pdf',fileName:'oldest-history.pdf',url:'https://example.test/oldest-history.pdf'}]:[],...changes[id]}))});
const flushHistoryPoll=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const olderButton=tree=>find(tree,node=>node.type==='button'&&node.props['aria-label']==='Eski mesajları yükle');
const historyPage=(ids,before,extra={})=>({...loadedHistory(ids),history:{nextBefore:before,hasMore:before!==null},...extra});
function historyPanel(h){const panel={scrollTop:290,clientHeight:200,get scrollHeight(){const row=h.harness.actions.getConversations()[0];return (row.history?.hasMore?40:0)+row.messages.length*50;},querySelectorAll(){const row=h.harness.actions.getConversations()[0];return row.messages.map((message,index)=>({dataset:{crmMessageId:message.id},offsetTop:(row.history?.hasMore?40:0)+index*50,offsetHeight:50}));},scrollTo(options){this.scrollTop=Math.max(0,options.top-this.clientHeight);}};h.harness.actions.setHistoryPanel(panel);return panel;}

test('actual App older history is manual single-flight and keeps latest metadata media draft cursor and scroll anchor in either return order',async()=>{
 for(const order of ['older-first','latest-first'])await fixture(async h=>{
  const initial=historyPage(Array.from({length:20},(_,i)=>i+21),21,{name:'Current person',preview:'Current preview',workflow:[{id:'current-workflow'}]}),latest=historyPage(Array.from({length:20},(_,i)=>i+20),20,{name:'Latest person',preview:'Latest preview',workflow:[{id:'latest-workflow'}]});
  latest.messages.find(message=>message.id==='20').text='Latest body 20';latest.messages.find(message=>message.id==='20').deliveryState='read';
  const old=historyPage(Array.from({length:20},(_,i)=>i+1),1,{name:'Old snapshot person',preview:'OLD preview',workflow:[{id:'old-workflow'}],capabilities:{canSend:false}});let finishOlder,finishLatest,olderCalls=0;
  h.connect(actor(),[initial]);h.harness.actions.selectConversation(initial);h.render();h.harness.actions.setDraft('Unchanged history draft');h.render();
  const panel=historyPanel(h),scroll=find(h.render(),node=>node.props.className==='chat-scroll');scroll.props.onScroll({currentTarget:panel});h.render();
  const button=olderButton(h.render());assert.equal(typeof button?.props.onClick,'function');
  h.harness.api.conversation=(_key,id,options)=>{assert.equal(id,'55');return options.before!==undefined?(olderCalls++,assert.equal(options.before,21),new Promise(resolve=>finishOlder=resolve)):new Promise(resolve=>finishLatest=resolve);};
  const pending=button.props.onClick();button.props.onClick();h.render();assert.equal(olderButton(h.render()).props.disabled,true);h.pollConversation();await flushHistoryPoll();assert.equal(olderCalls,1);
  if(order==='latest-first'){finishLatest({conversation:latest});await flushHistoryPoll();h.render();}
  const visibleBefore=panel.querySelectorAll().find(node=>node.offsetTop+node.offsetHeight>panel.scrollTop),offsetBefore=visibleBefore.offsetTop-panel.scrollTop;
  finishOlder({conversation:old});await pending;h.render();h.pollHistoryScroll();h.render();
  const anchored=panel.querySelectorAll().find(node=>node.dataset.crmMessageId===visibleBefore.dataset.crmMessageId);assert.equal(anchored.offsetTop-panel.scrollTop,offsetBefore);
  if(order==='older-first'){finishLatest({conversation:latest});await flushHistoryPoll();h.render();h.pollHistoryScroll();h.render();}
  const current=h.harness.actions.getConversations()[0];assert.deepEqual(current.messages.map(message=>message.id),Array.from({length:40},(_,i)=>String(i+1)));
  assert.equal(current.messages.find(message=>message.id==='20').text,'Latest body 20');assert.equal(current.messages.find(message=>message.id==='20').deliveryState,'read');
  assert.equal(current.name,'Latest person');assert.equal(current.preview,'Latest preview');assert.deepEqual(current.workflow,[{id:'latest-workflow'}]);assert.equal(current.capabilities,undefined);
  assert.deepEqual(current.messages[0].attachments.map(media=>media.fileName),['oldest-photo.jpg','oldest-history.pdf']);assert.equal(current.history.nextBefore,1);assert.equal(olderCalls,1);assert.equal(composer(h.render()).props.value,'Unchanged history draft');
  const jump=find(h.render(),node=>node.type==='button'&&node.props.className==='jump-latest');assert.equal(typeof jump?.props.onClick,'function');jump.props.onClick();assert.equal(panel.scrollTop,panel.scrollHeight-panel.clientHeight);assert.equal(find(h.render(),node=>node.props.className==='jump-latest'),null);
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual App older history advances through private-only pages ends on raw-empty and stays hidden for legacy metadata',async()=>fixture(async h=>{
 const initial=historyPage([21,22],21);h.connect(actor(),[initial]);h.harness.actions.selectConversation(initial);h.render();h.harness.actions.setDraft('Private page draft');h.render();
 const calls=[];h.harness.api.conversation=async(_key,_id,options)=>{calls.push(options.before);return {conversation:historyPage([],options.before===21?16:null)};};
 await olderButton(h.render()).props.onClick();h.render();assert.deepEqual(calls,[21]);assert.deepEqual(h.harness.actions.getConversations()[0].messages.map(message=>message.id),['21','22']);assert.equal(h.harness.actions.getConversations()[0].history.nextBefore,16);assert(olderButton(h.render()));
 await olderButton(h.render()).props.onClick();h.render();assert.deepEqual(calls,[21,16]);assert.equal(olderButton(h.render()),null);assert.deepEqual(h.harness.actions.getConversations()[0].history,{nextBefore:null,hasMore:false,loadedEarlier:true});assert.equal(composer(h.render()).props.value,'Private page draft');
 h.harness.api.conversation=async()=>({conversation:initial});h.pollConversation();await flushHistoryPoll();h.render();assert.equal(olderButton(h.render()),null);assert.equal(h.harness.actions.getConversations()[0].history.hasMore,false);
 h.connect(actor(),[loadedHistory([21,22])]);h.harness.actions.selectConversation(h.harness.actions.getConversations()[0]);h.render();assert.equal(olderButton(h.render()),null);assert.equal(h.harness.actions.getConversations()[0].history,undefined);
},{isolated:true,origin:'http://127.0.0.1:62700'}));

test('actual App older history retries only manually and rejects foreign malformed or nonprogress pages without changing messages or draft',async()=>{
 for(const failure of [503,'foreign','assignment','cursor','missing'])await fixture(async h=>{
  const initial=historyPage([21,22],21);h.connect(actor(),[initial]);h.harness.actions.selectConversation(initial);h.render();h.harness.actions.setDraft('Retry page draft');h.render();let calls=0;
  h.harness.api.conversation=async()=>{calls++;if(calls===2)return {conversation:historyPage([1,20],1)};if(failure===503)throw Object.assign(Error('Synthetic history unavailable'),{status:503});return {conversation:{...historyPage([20],failure==='cursor'?21:20),...(failure==='foreign'?{id:'56'}:failure==='assignment'?{assignedUserId:8}:failure==='missing'?{history:undefined}:{})}};};
  await olderButton(h.render()).props.onClick();h.render();await flushHistoryPoll();assert.equal(calls,1);assert.deepEqual(h.harness.actions.getConversations()[0].messages.map(message=>message.id),['21','22']);assert.equal(h.harness.actions.getConversations()[0].history.nextBefore,21);assert(find(h.render(),node=>node.props.role==='alert'));assert.equal(olderButton(h.render()).props.disabled,false);assert.equal(composer(h.render()).props.value,'Retry page draft');
  await olderButton(h.render()).props.onClick();h.render();assert.equal(calls,2);assert.deepEqual(h.harness.actions.getConversations()[0].messages.map(message=>message.id),['1','20','21','22']);assert.equal(find(h.render(),node=>node.props.role==='alert'),null);
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual App older history keeps cursor messages and draft when production API receives invalid raw message lists',async()=>{
 for(const messages of [undefined,null,{},Array.from({length:21},()=>({id:20,content:'Synthetic duplicate'}))])await fixture(async h=>{
  const previousFetch=globalThis.fetch,initial=historyPage([21,22],21);let calls=0;
  try{
   const {liveApi}=await import('../src/liveApi.js?actual-app-raw-history-list-test');
   globalThis.fetch=async(url)=>{calls++;assert.equal(url,'/api/live/crm/conversations/55?before=21');return Response.json({data:{conversation:{id:55,assignedUserId:7,history:{nextBefore:16,hasMore:true},messages}}});};
   h.connect(actor(),[initial]);h.harness.actions.selectConversation(initial);h.render();h.harness.actions.setDraft('Raw page unchanged draft');h.render();h.harness.api.conversation=(...args)=>liveApi.conversation(...args);
   await olderButton(h.render()).props.onClick();h.render();await flushHistoryPoll();assert.equal(calls,1);
   const current=h.harness.actions.getConversations()[0];assert.equal(current.history.nextBefore,21);assert.deepEqual(current.messages.map(message=>message.id),['21','22']);assert.equal(composer(h.render()).props.value,'Raw page unchanged draft');assert.match(h.local.getItem(TEXT_DRAFT_STORAGE_KEY),/Raw page unchanged draft/);assert(find(h.render(),node=>node.props.role==='alert'));assert.equal(olderButton(h.render()).props.disabled,false);
  }finally{globalThis.fetch=previousFetch;}
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual App older history ignores late success across recipient actor session permission logout and assignment changes',async()=>{
 for(const changed of ['recipient','actor','session','permission','logout','assignment'])await fixture(async h=>{
  const originalNow=Date.now;let time=100000;Date.now=()=>time;
  try{
   const initial=historyPage([21,22],21),fresh=historyPage([40],40),other={...historyPage([30],30),id:'56'};let finish,signal;
   h.connect(actor(),[initial,other]);h.harness.actions.selectConversation(initial);h.render();h.harness.api.conversation=(_key,_id,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve);};const pending=olderButton(h.render()).props.onClick();h.render();
   if(changed==='recipient'){h.harness.actions.selectConversation(other);h.render();}
   else if(changed==='actor')h.connect({...actor(),accountIdentity:{id:43}},[fresh]);
   else if(changed==='session'){h.harness.actions.commitLiveSession({key:'replacement-session',session:actor(),inbox:{conversations:[fresh],summary:{total:1}}});h.render();}
   else if(changed==='permission'){h.harness.api.session=async()=>({...actor(),role:'personel',canSend:false});await h.harness.actions.refreshLivePermissions();h.render();}
   else if(changed==='logout'){await h.harness.actions.closeLiveSession('',true);h.render();}
   else{h.harness.api.inbox=async()=>({conversations:[{...fresh,assignedUserId:8,chatwootAgentId:8}],summary:{total:1}});time+=20000;h.pollBackground();await flushHistoryPoll();h.render();}
   if(changed!=='assignment')assert.equal(signal.aborted,true);
   finish({conversation:historyPage([1,20],1)});await pending;h.render();assert.equal(h.harness.actions.getConversations().some(row=>row.messages.some(message=>message.id==='1')),false);assert.doesNotMatch(renderToStaticMarkup(h.render()),/oldest-photo|oldest-history/);
  }finally{Date.now=originalNow;}
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

for(const status of [403,404,401])test(`actual App older history assignment race keeps scoped${status} separate from current token renewal`,async()=>fixture(async h=>{
 const originalNow=Date.now;let time=100000,deny,renewals=0;Date.now=()=>time;
 try{
  const initial=historyPage([21,22],21),fresh={...historyPage([40],40),assignedUserId:8,chatwootAgentId:8};h.connect(actor(),[initial]);h.harness.actions.selectConversation(initial);h.render();
  h.harness.api.conversation=()=>new Promise((_resolve,reject)=>deny=reject);const pending=olderButton(h.render()).props.onClick();h.render();
  h.harness.api.inbox=async()=>({conversations:[fresh],summary:{total:1}});time+=20000;h.pollBackground();await flushHistoryPoll();h.render();h.harness.actions.setDraft('Fresh older-page assignment draft');h.render();
  h.harness.api.resumeNormalSession=async()=>{renewals++;return {accessToken:'synthetic-renewed-authority'};};deny(Object.assign(Error('Synthetic old page denied'),{status}));await pending;await flushHistoryPoll();h.render();
  assert.equal(renewals,status===401?1:0);assert.deepEqual(h.harness.actions.getConversations().map(row=>row.id),['55']);assert.equal(h.harness.actions.getConversations()[0].assignedUserId,8);if(status!==401)assert.equal(composer(h.render()).props.value,'Fresh older-page assignment draft');
 }finally{Date.now=originalNow;}
},{isolated:true,origin:'http://127.0.0.1:62700'}));

test('actual App older history current 403 404 and revoked 401 retain denial cleanup',async()=>{
 for(const status of [403,404,401])await fixture(async h=>{
  const initial=historyPage([21,22],21);h.connect(actor(),[initial]);h.harness.actions.selectConversation(initial);h.render();h.harness.actions.setDraft('Denied older draft');h.render();
  h.harness.api.conversation=async()=>{throw Object.assign(Error('Synthetic older page denied'),{status});};h.harness.api.resumeNormalSession=async()=>{throw Object.assign(Error('Synthetic revoked session'),{status:401});};
  await olderButton(h.render()).props.onClick();await flushHistoryPoll();h.render();
  if(status===401){assert.match(renderToStaticMarkup(h.render()),/Melisa CRM güvenli giriş/);assert.equal(h.local.getItem('melisa-crm-access-token'),null);assert.equal(olderButton(h.render()),null);}
  else{assert.deepEqual(h.harness.actions.getConversations(),[]);assert.doesNotMatch(h.local.getItem(TEXT_DRAFT_STORAGE_KEY)||'',/Denied older draft/);}
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual App detail and inbox polling retain loaded media and merge message updates in either return order',async()=>{
 for(const order of ['detail-first','inbox-first'])await fixture(async h=>{
  const originalNow=Date.now;let time=100000,finishDetail,finishInbox,detailCalls=0,inboxCalls=0;Date.now=()=>time;
  try{
   const loaded=loadedHistory(),latest=loadedHistory(Array.from({length:20},(_,i)=>i+2).reverse(),{10:{content:'Updated history 10',deliveryState:'read'}});
   h.connect(actor(),[loaded]);h.harness.actions.selectConversation(loaded);h.render();
   h.harness.api.conversation=()=>{detailCalls++;return new Promise(resolve=>finishDetail=resolve);};h.harness.api.inbox=()=>{inboxCalls++;return new Promise(resolve=>finishInbox=resolve);};
   time+=20000;h.pollConversation();h.pollBackground();await flushHistoryPoll();assert.equal(detailCalls,1);assert.equal(inboxCalls,1);
   const resolveDetail=()=>finishDetail({conversation:latest}),resolveInbox=()=>finishInbox({conversations:[loadedHistory([21])],summary:{total:1}});
   if(order==='detail-first')resolveDetail();else resolveInbox();await flushHistoryPoll();h.render();
   if(order==='detail-first')resolveInbox();else resolveDetail();await flushHistoryPoll();const tree=h.render();
   const messages=h.harness.actions.getConversations()[0].messages;
   assert.deepEqual(messages.map(message=>message.id),Array.from({length:21},(_,i)=>String(i+1)));
   assert.equal(messages.find(message=>message.id==='10').text,'Updated history 10');assert.equal(messages.find(message=>message.id==='10').deliveryState,'read');
   assert.deepEqual(messages[0].attachments.map(attachment=>attachment.fileName),['oldest-photo.jpg','oldest-history.pdf']);
   const html=renderToStaticMarkup(tree);assert.match(html,/oldest-photo\.jpg/);assert.match(html,/oldest-history\.pdf/);assert.equal((html.match(/class="message-block /g)||[]).length,21);
  }finally{Date.now=originalNow;}
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual App loaded-history polling replaces changed assignments and ignores late old-assignment detail',async()=>fixture(async h=>{
 const originalNow=Date.now;let time=100000,finishOld;Date.now=()=>time;
 try{
  const old=loadedHistory(),assigned=normalizeConversation({...row(),assignedUserId:8,chatwootAgentId:8,messages:loadedHistory([22]).messages});
  h.connect(actor(),[old]);h.harness.actions.selectConversation(old);h.render();
  h.harness.api.conversation=()=>new Promise(resolve=>finishOld=resolve);h.pollConversation();await flushHistoryPoll();
  h.harness.api.inbox=async()=>({conversations:[assigned],summary:{total:1}});time+=20000;h.pollBackground();await flushHistoryPoll();h.render();
  assert.deepEqual(h.harness.actions.getConversations()[0].messages.map(message=>message.id),['22']);
  finishOld({conversation:loadedHistory(Array.from({length:20},(_,i)=>i+2))});await flushHistoryPoll();h.render();
  assert.deepEqual(h.harness.actions.getConversations()[0].messages.map(message=>message.id),['22']);assert.equal(h.harness.actions.getConversations()[0].assignedUserId,8);
  h.harness.api.conversation=async()=>({conversation:{...assigned,messages:loadedHistory([23]).messages}});time+=20000;h.pollConversation();await flushHistoryPoll();h.render();
  assert.deepEqual(h.harness.actions.getConversations()[0].messages.map(message=>message.id),['22','23']);
  h.harness.api.conversation=async()=>({conversation:{...assigned,assignedUserId:9,chatwootAgentId:9,messages:loadedHistory([24]).messages}});time+=20000;h.pollConversation();await flushHistoryPoll();h.render();
  assert.deepEqual(h.harness.actions.getConversations()[0].messages.map(message=>message.id),['24']);assert.doesNotMatch(renderToStaticMarkup(h.render()),/oldest-photo|oldest-history/);
 }finally{Date.now=originalNow;}
},{isolated:true,origin:'http://127.0.0.1:62700'}));

for(const status of [403,404])test(`actual App loaded-history ignores stale assignment${status} without removing the new conversation or draft`,async()=>fixture(async h=>{
 const originalNow=Date.now;let time=100000,denyOld;Date.now=()=>time;
 try{
  const old=loadedHistory(),assigned=normalizeConversation({...row(),assignedUserId:8,chatwootAgentId:8,messages:loadedHistory([22]).messages});
  h.connect(actor(),[old]);h.harness.actions.selectConversation(old);h.render();
  h.harness.api.conversation=()=>new Promise((_resolve,reject)=>denyOld=reject);h.pollConversation();await flushHistoryPoll();
  h.harness.api.inbox=async()=>({conversations:[assigned],summary:{total:1}});time+=20000;h.pollBackground();await flushHistoryPoll();h.render();
  h.harness.actions.setDraft('Fresh assignment draft');h.render();assert.equal(composer(h.render()).props.value,'Fresh assignment draft');
  denyOld(Object.assign(Error('Synthetic old assignment denied'),{status}));await flushHistoryPoll();const tree=h.render(),rows=h.harness.actions.getConversations();
  assert.deepEqual(rows.map(item=>item.id),['55']);assert.equal(rows[0].assignedUserId,8);assert.deepEqual(rows[0].messages.map(message=>message.id),['22']);
  assert.equal(composer(tree).props.value,'Fresh assignment draft');assert.match(h.local.getItem(TEXT_DRAFT_STORAGE_KEY),/Fresh assignment draft/);
 }finally{Date.now=originalNow;}
},{isolated:true,origin:'http://127.0.0.1:62700'}));

test('actual App loaded-history same-key401 still renews authority after the conversation assignment changes',async()=>fixture(async h=>{
 const originalNow=Date.now;let time=100000,denyOld,renewals=0;Date.now=()=>time;
 try{
  const old=loadedHistory(),assigned=normalizeConversation({...row(),assignedUserId:8,chatwootAgentId:8,messages:loadedHistory([22]).messages});
  h.connect(actor(),[old]);h.harness.actions.selectConversation(old);h.render();
  h.harness.api.conversation=()=>new Promise((_resolve,reject)=>denyOld=reject);h.pollConversation();await flushHistoryPoll();
  h.harness.api.inbox=async()=>({conversations:[assigned],summary:{total:1}});time+=20000;h.pollBackground();await flushHistoryPoll();h.render();
  h.harness.api.resumeNormalSession=async()=>{renewals++;return {accessToken:'synthetic-renewed-authority'};};
  denyOld(Object.assign(Error('Synthetic current access expired'),{status:401}));await flushHistoryPoll();h.render();
  assert.equal(renewals,1);assert.equal(h.local.getItem('melisa-crm-access-token'),'synthetic-renewed-authority');
  assert.deepEqual(h.harness.actions.getConversations().map(item=>item.id),['55']);assert.equal(h.harness.actions.getConversations()[0].assignedUserId,8);
 }finally{Date.now=originalNow;}
},{isolated:true,origin:'http://127.0.0.1:62700'}));

test('actual App loaded-history polling cannot restore stale detail across recipient actor session permission or logout changes',async()=>{
 for(const {changed,status} of [{changed:'recipient'},{changed:'actor'},{changed:'session'},{changed:'permission'},{changed:'logout'},{changed:'actor',status:403},{changed:'session',status:401},{changed:'recipient',status:404}])await fixture(async h=>{
  const old=loadedHistory(),fresh=loadedHistory([40]),other={...loadedHistory([30]),id:'56',name:'Other fixture conversation'};let finishOld,denyOld;
  h.connect(actor(),[old,other]);h.harness.actions.selectConversation(old);h.render();
  h.harness.api.conversation=()=>new Promise((resolve,reject)=>{finishOld=resolve;denyOld=reject;});h.pollConversation();await flushHistoryPoll();
  if(changed==='recipient'){h.harness.actions.selectConversation(other);h.render();}
  else if(changed==='actor')h.connect({...actor(),accountIdentity:{id:43}},[fresh]);
  else if(changed==='session'){h.harness.actions.commitLiveSession({key:'replacement-session',session:actor(),inbox:{conversations:[fresh],summary:{total:1}}});h.render();}
  else if(changed==='permission'){h.harness.api.session=async()=>({...actor(),role:'personel',canSend:false});await h.harness.actions.refreshLivePermissions();h.render();}
  else{await h.harness.actions.closeLiveSession('',true);h.render();}
  if(status)denyOld(Object.assign(Error('Synthetic stale detail denied'),{status}));else finishOld({conversation:loadedHistory(Array.from({length:20},(_,i)=>i+2))});await flushHistoryPoll();const tree=h.render(),rows=h.harness.actions.getConversations();
  if(changed==='recipient'){
   assert.deepEqual(rows.find(item=>item.id==='56').messages.map(message=>message.id),['30']);assert.equal(rows.some(item=>item.messages.some(message=>message.id==='21')),false);
  }else if(changed==='actor'||changed==='session'){
   assert.deepEqual(rows[0].messages.map(message=>message.id),['40']);assert.doesNotMatch(renderToStaticMarkup(tree),/oldest-photo|oldest-history/);
  }else{assert.deepEqual(rows,[]);assert.match(renderToStaticMarkup(tree),/Melisa CRM güvenli giriş/);}
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual App loaded-history polling keeps existing 401 403 404 transient and malformed-ID boundaries',async()=>{
 for(const status of [401,403,404,503,'foreign-id'])await fixture(async h=>{
  const old=loadedHistory();h.connect(actor(),[old]);h.harness.actions.selectConversation(old);h.render();
  h.harness.api.resumeNormalSession=async()=>{throw Object.assign(Error('Synthetic expired authority'),{status:401});};
  h.harness.api.conversation=async()=>{
   if(status==='foreign-id')return {conversation:{...loadedHistory([21]),id:'56',name:'Unexpected foreign conversation'}};
   throw Object.assign(Error('Synthetic detail denied'),{status});
  };
  h.pollConversation();await flushHistoryPoll();const tree=h.render(),html=renderToStaticMarkup(tree),rows=h.harness.actions.getConversations();
  if(status===401){assert.match(html,/Melisa CRM güvenli giriş/);assert.doesNotMatch(html,/oldest-photo|oldest-history/);}
  else if(status===403||status===404){assert.deepEqual(rows,[]);assert.doesNotMatch(html,/oldest-photo|oldest-history/);}
  else{
   assert.deepEqual(rows.map(item=>item.id),['55']);assert.deepEqual(rows[0].messages.map(message=>message.id),Array.from({length:20},(_,i)=>String(i+1)));
   assert.match(html,/oldest-photo\.jpg/);assert.match(html,/oldest-history\.pdf/);assert.match(html,/Güncelleme gecikti/);assert.doesNotMatch(html,/Unexpected foreign conversation|Fixture history 21/);
  }
 },{isolated:true,origin:'http://127.0.0.1:62700'});
});

test('actual compact App exposes the first real bootstrap list, truthful partial search and selected-history loading',async()=>fixture(async h=>{
 const boot={...row(),messagesLoaded:false,detailLoaded:false,preview:'Son mesaj yükleniyor…'};
 const partial={summary:{complete:false,total:null,unread:null,unassigned:null,pendingHumanReply:null}};
 let tree=h.connect(actor(),[boot],partial);
 assert.match(tree.props.className,/compact-mode/);assert.doesNotMatch(tree.props.className,/chat-open/);
 let html=renderToStaticMarkup(tree);assert.match(html,/1 konuşma · toplam yükleniyor/);assert.doesNotMatch(html,/null konuşma|0 konuşma/);
 h.harness.actions.setQuery('not-a-loaded-customer');html=renderToStaticMarkup(h.render());assert.match(html,/Yüklenen kayıtlarda sonuç yok/);assert.doesNotMatch(html,/Sonuç bulunamadı|Herkesin bir sorumlusu var|Tüm mesajlar okundu/);
 h.harness.actions.setQuery('');h.harness.actions.selectConversation(boot);tree=h.render();assert.match(tree.props.className,/chat-open/);assert.match(renderToStaticMarkup(tree),/Konuşma geçmişi yükleniyor/);
 let complete;h.harness.api.conversation=()=>new Promise(r=>{complete=r;});h.pollConversation();await settle();complete({conversation:{...row(),messages:[{id:'synthetic-m1',direction:'incoming',text:'Synthetic real detail',createdAt:'2026-10-05T12:00:00Z',attachments:[]}]}});await settle();
 html=renderToStaticMarkup(h.render());assert.match(html,/Synthetic real detail/);assert.doesNotMatch(html,/Konuşma geçmişi yükleniyor/);
 h.connect(actor(),[boot],partial);assert.doesNotMatch(h.render().props.className,/chat-open/,'another authenticated bootstrap returns compact mode to the list');
},{compact:true}));

test('actual App preserves background failure text and retries a fresh full traversal that reconciles stale bootstrap rows',async()=>fixture(async h=>{
 const old={...row('55'),name:'Synthetic stale bootstrap',messagesLoaded:false},kept={...row('56'),name:'Synthetic kept bootstrap',messagesLoaded:false};
 h.connect(actor(),[old,kept],{summary:{complete:false,total:null,unread:null,unassigned:null,pendingHumanReply:null}});
 h.harness.api.inbox=async()=>{throw Object.assign(new Error('Synthetic background failure'),{status:429});};
 await h.harness.actions.loadRemainingConversations();let html=renderToStaticMarkup(h.render());assert.match(html,/Synthetic background failure/);assert.match(html,/Synthetic stale bootstrap/);
 const calls=[];h.harness.api.inbox=async(key,offset)=>{calls.push(offset);return {conversations:[{...kept,messagesLoaded:true}],summary:{complete:true,total:1,unread:0,unassigned:0,pendingHumanReply:0}};};
 await h.harness.actions.loadRemainingConversations();html=renderToStaticMarkup(h.render());assert.deepEqual(calls,[0]);assert.doesNotMatch(html,/Synthetic stale bootstrap|Synthetic background failure/);assert.match(html,/Synthetic kept bootstrap/);
}));

test('actual App clears bootstrap rows and selected chat after a proven empty full overview',async()=>fixture(async h=>{
 const boot={...row(),name:'Synthetic removed bootstrap',messagesLoaded:false};
 h.connect(actor(),[boot],{summary:{complete:false,total:null,unread:null,unassigned:null,pendingHumanReply:null}});h.harness.actions.selectConversation(boot);h.render();
 h.harness.api.inbox=async()=>({conversations:[],summary:{complete:true,total:0,unread:0,unassigned:0,pendingHumanReply:0}});
 await h.harness.actions.loadRemainingConversations();const html=renderToStaticMarkup(h.render());assert.doesNotMatch(html,/Synthetic removed bootstrap/);assert.match(html,/0 konuşma/);assert.match(html,/Konuşma seçilmedi/);
}));

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
  for(let i=0;i<8;i++)await Promise.resolve();
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

test('actual terminal status control is read-only, keeps unknown locks, and unlocks only exact pretransport rejection',async()=>fixture(async h=>{
 h.connect();h.harness.actions.setDraft('Original preserved body');h.render();let sends=0,uuid;
 h.harness.api.send=async(_token,_id,_text,id)=>{sends++;uuid=id;throw Object.assign(Error('synthetic response loss'),{status:503});};
 await h.harness.actions.sendMessage();let tree=h.render();assert.equal(sends,1);
 assert.equal(find(tree,node=>node.props?.['aria-label']==='Dosya ekle').props.disabled,false,'reloaded attachment may be reselected without enabling transport');
 assert.equal(find(tree,node=>node.props?.['aria-label']==='Mesajı gönder').props.disabled,true);
 const base={clientRequestId:uuid,conversationId:'55',providerMessageIdPresent:false,chatwootMessageIdPresent:false};
 for(const outcome of [null,{...base,deliveryState:'PENDING'},{...base,deliveryState:'REJECTED_BEFORE_TRANSPORT',clientRequestId:'other'}]){
  h.harness.api.sendStatus=async(_token,id,text,requestId,media)=>{assert.equal(id,'55');assert.equal(text,'Original preserved body');assert.equal(requestId,uuid);assert.equal(media,null);return outcome;};
  await h.harness.actions.checkSendStatus();tree=h.render();assert.equal(find(tree,node=>node.props?.['aria-label']==='Mesajı gönder').props.disabled,true);assert.equal(sends,1);
 }
 for(const status of [403,409,404]){h.harness.api.sendStatus=async()=>{throw Object.assign(Error('denied'),{status});};await h.harness.actions.checkSendStatus();assert.equal(find(h.render(),node=>node.props?.['aria-label']==='Mesajı gönder').props.disabled,true);}
 h.harness.api.sendStatus=async()=>({...base,deliveryState:'CONFIRMED',providerMessageIdPresent:true,chatwootMessageIdPresent:true});await h.harness.actions.checkSendStatus();tree=h.render();assert.match(renderToStaticMarkup(tree),/Gönderim kabul edilmiş/);assert.equal(find(tree,node=>node.props?.['aria-label']==='Mesajı gönder').props.disabled,true);
 h.harness.api.sendStatus=async()=>({...base,deliveryState:'REJECTED_BEFORE_TRANSPORT'});await h.harness.actions.checkSendStatus();tree=h.render();assert.equal(find(tree,node=>node.props?.['aria-label']==='Mesajı gönder').props.disabled,false);assert.equal(composer(tree).props.value,'Original preserved body');assert.equal(sends,1,'checking journal never retries transport');
},{terminal:true}));
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

test('actual App opens passively despite a stored automatic-translation preference',async()=>fixture(async h=>{
 h.local.setItem('melisa-crm-auto-translate','true');let calls=0;
 h.harness.api.translate=async()=>{calls++;return {translatedText:'Synthetic translation'};};
 const incoming={...row(),messages:[{id:'synthetic-incoming',direction:'incoming',text:'Foreign synthetic text'}]};
 const tree=h.connect(actor(),[incoming]);const toggle=find(tree,node=>node.type==='input'&&node.props.type==='checkbox');
 assert.equal(toggle.props.checked,false);h.pollAutomatic();await settle();assert.equal(calls,0);
 h.render();h.pollAutomatic();await settle();assert.equal(calls,0,'read render/poll never restores paid consent');
}));

for(const policy of [undefined,false,true])test(`composer translation refuses paid-disabled/default policy ${policy}`,async()=>fixture(async h=>{
 let calls=0;h.harness.api.translate=async()=>{calls++;throw Error('Must not reach transport');};
 h.connect({...actor(),paidAiEnabled:policy});h.harness.actions.setDraft('Synthetic private draft');
 const tree=h.render(),button=find(tree,node=>node.type==='button'&&node.props['aria-label']==='Mesajı çevir');
 assert.equal(button.props.disabled,true);
 await h.harness.actions.translateDraft();
 assert.equal(calls,0);assert.equal(composer(h.render()).props.value,'Synthetic private draft');
},{isolated:policy===true}));

test('shared terminal existing personnel action uses only empty stateless bootstrap and isolated terminal storage',async()=>fixture(async h=>{
 const originalFetch=globalThis.fetch,requests=[];
 try{
  globalThis.fetch=async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({accessToken:'existing-personnel-rehearsal'})};};
  h.harness.api.session=async()=>({...actor(),id:'crm-personel-3',username:'crm-ahmet',role:'personel',chatwootAgentId:3,testPersonnel:true,paidAiEnabled:false,liveSendEnabled:false});
  const action=h.render().props.extraAction;assert.equal(action.props.children,'Personel oturumunu aç');
  await action.props.onClick();
  assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/test-personnel/session');assert.equal(requests[0].options.method,'POST');assert.equal(requests[0].options.body,'{}');
  assert.equal(h.local.getItem('melisa-crm-terminal-access-token'),null);assert.equal(h.local.getItem('melisa-crm-access-token'),'desktop-synthetic-session');
  assert.doesNotMatch(renderToStaticMarkup(h.render()),/TEST ADMIN/);
 }finally{globalThis.fetch=originalFetch;}
},{terminal:true,isolated:true}));
