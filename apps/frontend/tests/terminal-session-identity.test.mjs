import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sessions from '../src/sessionLoader.js';
import {bindTerminalNavigation,bindTerminalSessionNavigation} from '../src/terminalNavigation.js';
import {linkedTerminalContext} from '../src/terminalSessionIdentity.js';

const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const location={origin:'http://127.0.0.1:62800',hostname:'127.0.0.1',search:'?terminal=1&erpOrigin=http%3A%2F%2F127.0.0.1%3A5244'};
const actor=()=>({id:'clean-staff-20261022',username:'ornek-personel',role:'personel',chatwootAgentId:2,permissions:['crm.view','crm.send'],normalRefreshSession:true,canAssign:false});
// An explicit fixture relation, never a real ERP/CRM person mapping.
const relation=()=>({version:1,environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',
 erpOrigin:'http://127.0.0.1:5244',crmOrigin:location.origin,erpUserId:15,
 erpNormalSessionId:'e1000001-0000-4000-8000-000000000001',crmUserId:'clean-staff-20261022',chatwootAgentId:2,bindingRevision:'a'.repeat(64),expiresAt:10000});
function fixture(overrides={}){
 let binding=relation(),visible=false,key=0,clearFailure=false;const calls=[],errors=[];
 const api={resumeNormalSession:async()=>{calls.push('resume');return {accessToken:'synthetic-'+(++key),refreshToken:'synthetic-refresh',expiresAt:10000,user:actor()};},
 session:async()=>{calls.push('me');return {...actor(),terminalIdentity:structuredClone(binding)};},rememberNormalSession:async()=>calls.push('remember'),
 inbox:async()=>{calls.push('inbox');return {conversations:[{id:'55',assignedUserId:'clean-staff-20261022',chatwootAgentId:2}],summary:{total:1}};},
 clearNormalSession:async token=>{calls.push(['clear',token]);if(clearFailure)throw Object.assign(Error('unconfirmed close fixture'),{status:503});},...overrides.api};
 const loader=sessions.createTerminalSessionLoader({api,location,now:()=>1000,
 onCommit:()=>{visible=true;},onInvalidate:()=>{visible=false;},onError:error=>errors.push(error),onBusy:()=>{},...overrides,api});
 return {loader,api,calls,errors,visible:()=>visible,binding:()=>binding,setBinding:b=>{binding=b;},failClose:b=>{clearFailure=b;}};
}

test('linked terminal resumes only the existing CRM grant and commits its verified assigned inbox',async()=>{
 const f=fixture(),result=await f.loader.start();assert(result);assert.equal(result.session.id,'clean-staff-20261022');assert.equal(f.visible(),true);
 assert.deepEqual(f.calls,['resume','me','remember','inbox','me']);
 await f.loader.verifySession(result.key);assert.equal(f.errors.length,0);
 await f.loader.close();assert.equal(f.visible(),false);assert.deepEqual(f.calls.at(-1),['clear',result.key]);
});

test('absent authenticated binding or protected CRM grant cannot fall through to password, bootstrap or an inbox',async()=>{
 for(const override of [{api:{session:async()=>actor()}},{api:{resumeNormalSession:async()=>null}}]){
  const f=fixture(override);assert.equal(await f.loader.start(),null);assert.equal(f.visible(),false);
  assert.equal(f.errors.length,1);assert(!f.calls.includes('inbox'));assert(f.calls.some(x=>Array.isArray(x)&&x[0]==='clear'));
 }
});

test('unbound, different, expired, foreign audience and credential-shaped binding payloads fail closed',async()=>{
 for(const changed of [null,{confirmed:true},{...relation(),crmUserId:'clean-stranger-20261022'},
  {...relation(),chatwootAgentId:3},{...relation(),expiresAt:999},{...relation(),environmentId:'other'},
  {...relation(),database:'LIVE'},{...relation(),erpOrigin:'http://127.0.0.1:5234'},
  {...relation(),accessToken:'must-not-be-a-binding'},{...relation(),erpNormalSessionId:''}]){
  const f=fixture();f.setBinding(changed);assert.equal(await f.loader.start(),null);assert.equal(f.visible(),false);assert(!f.calls.includes('inbox'));
 }
});

test('binding or ERP family changes while inbox is pending cannot commit and close the old CRM family',async()=>{
 for(const change of [{erpUserId:18},{erpNormalSessionId:'e1000002-0000-4000-8000-000000000002'},{bindingRevision:'b'.repeat(64)}]){
  const pending=defer(),entered=defer(),f=fixture({api:{inbox:async()=>{entered.resolve();return pending.promise;}}});
  const running=f.loader.start();await entered.promise;f.setBinding({...relation(),...change});
  pending.resolve({conversations:[]});assert.equal(await running,null);assert.equal(f.visible(),false);assert(f.errors.length);assert.deepEqual(f.calls.at(-1),['clear','synthetic-1']);
 }
});

test('a foreign assignment cannot be silently shown or filtered into a successful linked inbox',async()=>{
 const f=fixture({api:{inbox:async()=>({conversations:[{id:'56',assignedUserId:'clean-stranger-20261022',chatwootAgentId:3}]})}});
 assert.equal(await f.loader.start(),null);assert.equal(f.visible(),false);assert(f.errors.length);
});

test('close waits for a late normal grant and prevents a replacement until server closure is confirmed',async()=>{
 const pending=defer(),entered=defer(),closed=defer();let count=0;
 const f=fixture({api:{resumeNormalSession:async()=>{count++;if(count===1){entered.resolve();return pending.promise;}return {accessToken:'synthetic-new',user:actor()};},clearNormalSession:async()=>closed.promise}});
 const old=f.loader.start();await entered.promise;const closing=f.loader.close();const next=f.loader.start();
 pending.resolve({accessToken:'synthetic-old',user:actor()});await old;assert.equal(count,1);assert.equal(f.visible(),false);
 closed.resolve();await closing;assert(await next);assert.equal(count,2);
});

test('unconfirmed logout blocks a new linked session; a later explicit retry must close first',async()=>{
 const f=fixture();assert(await f.loader.start());f.failClose(true);await assert.rejects(()=>f.loader.close());
 const before=f.calls.filter(x=>x==='resume').length;assert.equal(await f.loader.start(),null);assert.equal(f.calls.filter(x=>x==='resume').length,before);assert.equal(f.visible(),false);
 f.failClose(false);assert(await f.loader.start());
});

test('fresh ERP revoke closes an active linked CRM and never leaves the prior UI visible',async()=>{
 const f=fixture();const opened=await f.loader.start();f.setBinding(null);
 await assert.rejects(()=>f.loader.verifySession(opened.key));assert.equal(f.visible(),false);assert.deepEqual(f.calls.at(-1),['clear',opened.key]);
});

test('old permission polling during a valid replacement cannot revoke the rotated same-person family',async()=>{
 const pending=defer(),entered=defer();let delayed=false;
 const f=fixture({api:{inbox:async()=>{if(delayed){entered.resolve();return pending.promise;}return {conversations:[]};}}});
 const first=await f.loader.start();delayed=true;const next=f.loader.start();await entered.promise;
 const oldRead=f.loader.verifySession(first.key);pending.resolve({conversations:[]});
 await assert.rejects(oldRead,{name:'AbortError'});assert(await next);assert.equal(f.visible(),true);
 assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='clear').length,0);await f.loader.close();
});

test('ordinary access expiry retains the existing protected refresh for same-person renewal; revoke still closes it',async()=>{
 let error=null;const f=fixture({api:{session:async()=>{if(error)throw error;return {...actor(),terminalIdentity:relation()};}}});
 const first=await f.loader.start();error=Object.assign(Error('expired fixture'),{status:401,code:'AUTH_TOKEN_EXPIRED'});
 await assert.rejects(()=>f.loader.verifySession(first.key),{code:'AUTH_TOKEN_EXPIRED'});
 assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='clear').length,0);
 error=null;const renewed=await f.loader.start();assert(renewed);assert.notEqual(renewed.key,first.key);
 error=Object.assign(Error('revoked fixture'),{status:401,code:'AUTH_SESSION_REVOKED'});
 await assert.rejects(()=>f.loader.verifySession(renewed.key));assert.equal(f.visible(),false);assert.deepEqual(f.calls.at(-1),['clear',renewed.key]);
});

test('identity DTO does not coerce nested arrays into trusted family or revision strings',async()=>{
 for(const change of [{erpNormalSessionId:[relation().erpNormalSessionId]},{bindingRevision:[relation().bindingRevision]}]){
  const f=fixture();f.setBinding({...relation(),...change});assert.equal(await f.loader.start(),null);assert.equal(f.visible(),false);assert(!f.calls.includes('inbox'));
 }
});

test('temporary linked reads hide the old view but retain the protected grant for an explicit safe retry',async()=>{
 for(const error of [Object.assign(Error('busy fixture'),{status:429}),Object.assign(Error('unavailable fixture'),{status:503}),Object.assign(Error('timeout fixture'),{code:'CRM_REQUEST_TIMEOUT'})]){
  let failing=false;const f=fixture({api:{session:async()=>{if(failing)throw error;return {...actor(),terminalIdentity:relation()};}}});
  const first=await f.loader.start();failing=true;await assert.rejects(()=>f.loader.verifySession(first.key));
  assert.equal(f.visible(),false);assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='clear').length,0);
  failing=false;assert(await f.loader.start());await f.loader.close();
 }
});

test('linked scope excludes standalone, legacy, wrong-host and ambiguous parent entries',()=>{
 const host={location,parent:{}};assert(linkedTerminalContext(host));
 for(const changed of [{...host,parent:null},{...host,location:{...location,search:''}},
  {...host,location:{...location,origin:'http://127.0.0.1:62700'}},
  {...host,location:{...location,search:'?terminal=1&erpOrigin=http%3A%2F%2F192.168.1.46%3A5244'}},
  {...host,location:{...location,search:location.search+'&terminal=1'}}])assert.equal(linkedTerminalContext(changed),false);
 host.parent=host;assert.equal(linkedTerminalContext(host),false);
});

test('view cancellation preserves protected credentials; a late permission failure cannot close the replacement',async()=>{
 const delayed=defer(),entered=defer();let wait=false;
 const f=fixture({api:{session:async()=>{if(wait){wait=false;entered.resolve();return delayed.promise;}return {...actor(),terminalIdentity:relation()};}}});
 const first=await f.loader.start();wait=true;const read=f.loader.verifySession(first.key);await entered.promise;
 f.loader.cancel();assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='clear').length,0);
 const next=await f.loader.start();assert(next);delayed.reject(Object.assign(Error('old revoke fixture'),{status:403}));
 await assert.rejects(read);assert.equal(f.visible(),true);assert.equal(f.errors.length,0);
 assert.equal(f.calls.filter(x=>Array.isArray(x)&&x[0]==='clear').length,0);
 await f.loader.close();
});

test('cancelled pending resume cannot restore the view and may be retried without a server logout',async()=>{
 const delayed=defer(),entered=defer();let first=true;
 const f=fixture({api:{resumeNormalSession:async()=>{if(first){first=false;entered.resolve();return delayed.promise;}return {accessToken:'synthetic-new',user:actor()};}}});
 const pending=f.loader.start();await entered.promise;f.loader.cancel();delayed.resolve({accessToken:'synthetic-old',user:actor()});
 assert.equal(await pending,null);assert.equal(f.visible(),false);assert(!f.calls.some(x=>Array.isArray(x)));
 assert(await f.loader.start());await f.loader.close();
});

test('a binding expiry or current role/permission change cannot refresh a linked actor',async()=>{
 for(const change of [{role:'mudur'},{normalRefreshSession:false},{canAssign:true},{permissions:['crm.view','crm.assign']},{testAdmin:true}]){
  const f=fixture({api:{session:async()=>({...actor(),...change,terminalIdentity:relation()})}});
  assert.equal(await f.loader.start(),null);assert.equal(f.visible(),false);assert(!f.calls.includes('inbox'));
 }
 const f=fixture();const opened=await f.loader.start();f.setBinding({...relation(),expiresAt:1000});
 await assert.rejects(()=>f.loader.verifySession(opened.key));assert.equal(f.visible(),false);
});

test('linked navigation waits for server closure and UI cleanup, and never issues a password login',async()=>{
 const messages=[],closed=defer(),hidden=defer();let listener,closeCalls=0;
 const parent={postMessage:data=>messages.push(data)},win={parent,addEventListener:(_,fn)=>listener=fn,removeEventListener:()=>{}};
 const binding=bindTerminalSessionNavigation({window:win,entry:{enabled:true,erpOrigin:'http://127.0.0.1:5244'},
  sessionLoader:{start:async()=>({session:actor()}),close:()=>{closeCalls++;return closed.promise;}},onClose:()=>hidden.promise});
 const event={source:parent,origin:'http://127.0.0.1:5244',data:{type:'melisa-terminal-parent',version:1,action:'logout'}};
 listener(event);assert.equal(closeCalls,1);closed.resolve();await new Promise(resolve=>setImmediate(resolve));assert.equal(messages.length,0);
 hidden.resolve();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(messages.map(x=>x.action),['logged-out']);binding.close();
});

test('linked navigation announces ready only after activation and ignores late activation after logout',async()=>{
 const entered=defer(),closed=defer(),messages=[];let listener;
 const parent={postMessage:data=>messages.push(data)},win={parent,addEventListener:(_,fn)=>listener=fn,removeEventListener:()=>{}};
 const binding=bindTerminalNavigation({window:win,entry:{enabled:true,erpOrigin:'http://127.0.0.1:5244'},deferReady:true,onActivate:()=>entered.promise,onLogout:()=>closed.promise});
 assert.equal(messages.length,0);
 const event={source:parent,origin:'http://127.0.0.1:5244',data:{type:'melisa-terminal-parent',version:1,action:'activate'}};
 listener(event);assert.equal(messages.length,0);listener({...event,data:{...event.data,action:'logout'}});
 entered.resolve();await Promise.resolve();await Promise.resolve();assert.equal(messages.length,0);
 closed.resolve();await Promise.resolve();await Promise.resolve();assert.deepEqual(messages.map(x=>x.action),['logged-out']);
 assert(messages.every(x=>Object.keys(x).sort().join(',')==='action,type,version'));binding.close();
});
