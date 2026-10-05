import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionLoader,sessionReadIsCurrent} from '../src/sessionLoader.js';
import {liveApi} from '../src/liveApi.js';
import {CATALOG_ENABLED} from '../src/releaseCapabilities.js';
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture(overrides={}){const commits=[],errors=[],busy=[],calls=[];const api={async login(u,p,options){calls.push(['login',u,options.signal]);return {accessToken:'new-key'};},async session(key,options){calls.push(['session',key,options.signal]);return {id:key,canAssign:false};},async inbox(key,offset,options){calls.push(['inbox',key,options.signal]);return {conversations:[{id:key}]};},async agents(){return {agents:[]};},...overrides};const loader=createSessionLoader({api,onCommit:x=>commits.push(x),onError:x=>errors.push(x),onBusy:x=>busy.push(x)});return {loader,commits,errors,busy,calls};}
test('login commits once only after authenticated identity and inbox resolve; repeated clicks do not repeat the mutation',async()=>{
 const inbox=defer(),f=fixture({inbox:()=>inbox.promise});const p=f.loader.start({credentials:{username:'synthetic',password:'test-only'}});assert.equal(p,f.loader.start({credentials:{username:'other',password:'test-only'}}));
 await Promise.resolve();await Promise.resolve();assert.equal(f.commits.length,0);assert.equal(f.calls.filter(x=>x[0]==='login').length,1);
 inbox.resolve({conversations:[]});await p;assert.equal(f.commits.length,1);assert.equal(f.commits[0].key,'new-key');assert.deepEqual(f.busy,[true,false]);
});
test('logout during delayed login aborts and ignores even a transport that still resolves its token',async()=>{
 const login=defer(),f=fixture({login:()=>login.promise});const pending=f.loader.start({credentials:{username:'synthetic',password:'test-only'}});f.loader.invalidate();login.resolve({accessToken:'stale-key'});assert.equal(await pending,null);assert.equal(f.commits.length,0);assert.equal(f.errors.length,0);assert.equal(f.calls.length,0);
});
test('old account profile cannot start reads or restore state after account replacement',async()=>{
 const profile=defer(),f=fixture({session:async(key,{signal})=>key==='old'?profile.promise:{id:key,canAssign:false}});const old=f.loader.start({token:'old'});f.loader.invalidate();await f.loader.start({token:'new'});profile.resolve({id:'old',canAssign:true});await old;
 assert.deepEqual(f.commits.map(x=>x.key),['new']);assert(!f.calls.some(x=>x[0]==='inbox'&&x[1]==='old'));assert.equal(f.errors.length,0);
});
test('logout while inbox waits cannot commit messages or token after local cleanup',async()=>{
 const inbox=defer();let signal;const f=fixture({inbox:async(key,offset,options)=>{signal=options.signal;return inbox.promise;}});const p=f.loader.start({token:'key'});await Promise.resolve();assert(signal);f.loader.invalidate();assert(signal.aborted);inbox.resolve({conversations:[{id:'stale-customer'}]});await p;assert.equal(f.commits.length,0);
});
test('late old-account authorization failure cannot close or show errors over a new account',async()=>{
 const inbox=defer(),f=fixture({inbox:async key=>key==='old'?inbox.promise:{conversations:[]}});const old=f.loader.start({token:'old'});await Promise.resolve();f.loader.invalidate();await f.loader.start({token:'new'});inbox.reject(Object.assign(new Error('expired old'),{status:401}));await old;assert.deepEqual(f.commits.map(x=>x.key),['new']);assert.equal(f.errors.length,0);
});
test('current authorization failures never commit partial identity/inbox and allow an explicit later retry',async()=>{
 for(const status of [401,403]){let failing=true;const f=fixture({session:async()=>{if(failing)throw Object.assign(new Error('Denied'),{status});return {id:'ok',canAssign:false};}});await f.loader.start({token:'key'});assert.equal(f.commits.length,0);assert.equal(f.errors[0].status,status);assert.equal(f.loader.isPending(),false);failing=false;await f.loader.start({token:'other'});assert.equal(f.commits.length,1);}
});
test('recipient/session read guards reject late success or errors after logout, epoch change or navigation',()=>{
 const current={key:'key',currentKey:'key',recipientId:'42',currentRecipientId:'42'};assert(sessionReadIsCurrent(current));for(const changed of [{currentKey:''},{currentKey:'new'},{epochCurrent:false},{active:false},{currentRecipientId:'43'}])assert.equal(sessionReadIsCurrent({...current,...changed}),false);
});
test('caller abort uses an AbortError and scoped reads cannot coalesce with a replacement operation',async()=>{
 const before=globalThis.fetch,calls=[];globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>{calls.push({url,options,resolve});options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));});
 try{
  const old=new AbortController(),fresh=new AbortController();const first=liveApi.session('same-key',{signal:old.signal});const rejected=assert.rejects(first,{name:'AbortError'});await Promise.resolve();old.abort();const second=liveApi.session('same-key',{signal:fresh.signal});await Promise.resolve();assert.equal(calls.length,2);calls[1].resolve(Response.json({success:true,data:{id:42,username:'test',role:'personel'}}));assert.equal((await second).accountIdentity.id,'42');await rejected;
 }finally{globalThis.fetch=before;}
});
test('authorized catalog release enables its UI while retaining gateway account authentication',()=>{assert.equal(CATALOG_ENABLED,true);});

test('startup completion timestamps describe the actual permission and inbox reads, not delayed commit time',async()=>{
 let time=1000;const inbox=defer(),agents=defer(),commits=[];
 const loader=createSessionLoader({now:()=>time,api:{session:async()=>({canAssign:true}),inbox:()=>inbox.promise,agents:()=>agents.promise},onCommit:x=>commits.push(x),onError:error=>{throw error;},onBusy:()=>{}});
 const pending=loader.start({token:'synthetic'});await Promise.resolve();
 time=6000;inbox.resolve({conversations:[]});await Promise.resolve();
 time=9000;agents.resolve({agents:[]});await pending;
 assert.equal(commits[0].permissionReadAt,1000);assert.equal(commits[0].inboxReadAt,6000);
});

test('bootstrap commits a real first page before the delayed agent list and keeps their abort scope',async()=>{
 const agents=defer(),commits=[],agentResults=[],busy=[],states=[];let inboxOptions,agentSignal;
 const loader=createSessionLoader({api:{session:async()=>({canAssign:true}),inbox:async(key,offset,options)=>{inboxOptions=options;assert.equal(offset,0);return {conversations:[{id:'55',messagesLoaded:false}],summary:{complete:false,total:null}};},agents:async(key,{signal})=>{agentSignal=signal;return agents.promise;}},onCommit:x=>commits.push(x),onAgents:x=>agentResults.push(x),onAgentsState:x=>states.push(x),onError:error=>{throw error;},onBusy:x=>busy.push(x)});
 await loader.start({token:'synthetic'});assert.equal(inboxOptions.view,'bootstrap');assert.equal(commits.length,1);assert.deepEqual(busy,[true,false]);assert.equal(agentResults.length,0);assert(states.some(s=>s.busy));
 loader.invalidate();assert(agentSignal.aborted);agents.resolve({agents:[{id:7}]});await Promise.resolve();await Promise.resolve();assert.equal(agentResults.length,0);
});

test('agent failures are truthful and retryable; a late old-account 401 cannot expire the replacement',async()=>{
 const oldAgents=defer(),commits=[],errors=[],states=[],results=[];let freshFailure=true;
 const loader=createSessionLoader({api:{session:async()=>({canAssign:true}),inbox:async()=>({conversations:[]}),agents:async key=>{if(key==='old')return oldAgents.promise;if(freshFailure)throw new Error('Synthetic offline roster');return {agents:[{id:7}]};}},onCommit:x=>commits.push(x),onAgents:x=>results.push(x),onAgentsState:x=>states.push(x),onError:x=>errors.push(x),onBusy:()=>{}});
 await loader.start({token:'old'});await loader.start({token:'fresh'});await Promise.resolve();oldAgents.reject(Object.assign(new Error('old expired'),{status:401}));await Promise.resolve();await Promise.resolve();
 assert.equal(commits.length,2);assert.equal(errors.length,0);assert(states.some(s=>s.error==='Synthetic offline roster'));freshFailure=false;await loader.refreshAgents();assert.deepEqual(results,[{agents:[{id:7}]}]);
});

test('current agent authorization loss expires its owning session after first-page commit',async()=>{
 const agents=defer(),errors=[];const loader=createSessionLoader({api:{session:async()=>({canAssign:true}),inbox:async()=>({conversations:[{id:'55'}]}),agents:()=>agents.promise},onCommit:()=>{},onError:x=>errors.push(x),onBusy:()=>{}});
 await loader.start({token:'synthetic'});agents.reject(Object.assign(new Error('revoked'),{status:401}));await Promise.resolve();await Promise.resolve();assert.equal(errors[0].status,401);
});
test('timeout during successful JSON body reading fails closed instead of committing an empty inbox',async()=>{
 const before=globalThis.fetch;globalThis.fetch=async(url,{signal})=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"data":'));signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')));}}),{status:200,headers:{'Content-Type':'application/json'}});
 try{await assert.rejects(()=>liveApi.inbox('synthetic-timeout',0,{timeoutMs:10}),{code:'CRM_REQUEST_TIMEOUT'});}finally{globalThis.fetch=before;}
});
test('invalid successful JSON is an unconfirmed response, while invalid error bodies preserve HTTP denial',async()=>{
 const before=globalThis.fetch;try{
  globalThis.fetch=async()=>new Response('not-json',{status:200});await assert.rejects(()=>liveApi.inbox('synthetic-invalid'),{code:'CRM_INVALID_RESPONSE'});
  globalThis.fetch=async()=>new Response('denied',{status:401});await assert.rejects(()=>liveApi.inbox('synthetic-denied'),{status:401});
 }finally{globalThis.fetch=before;}
});
