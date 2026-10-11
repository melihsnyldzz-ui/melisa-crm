import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserNormalSession,isSemihTestUser,rememberedSessionMetadata,initialSessionAction} from '../src/browserNormalSession.js';
import {createSessionLoader} from '../src/sessionLoader.js';

const user={id:'crm-semih-test-20261012',username:'crm-semih-test',displayName:'Semih TEST',role:'patron',permissions:['crm.view','crm.send','crm.assign','crm.agents','crm.manage'],normalTestScope:{semihTestContinue:true,isolatedPreparation:true,database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'}};
const result=()=>({accessToken:'synthetic-access',expiresAt:100000,user});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const fixture=(overrides={})=>{const calls=[];let cookie=true;const manager=createBrowserNormalSession({inspect:async()=>{calls.push('inspect');return {enabled:true,user:cookie?user:null};},refresh:async()=>{calls.push('refresh');return result();},logout:async()=>{calls.push('logout');cookie=false;},nativeRefresh:async()=>{throw Error('Browser cookie cannot use native refresh');},nativeLogout:async()=>{},...overrides});return {manager,calls};};

test('only the exact normal scoped Semih TEST identity earns the entry label',()=>{
  assert(isSemihTestUser(user));
  for(const changed of [{id:'other'},{username:'semih'},{displayName:'Semih'},{role:'personel'},{testAdmin:true},{testPersonnel:true},{permissions:['crm.view']},{permissions:[...user.permissions,'other']},{normalTestScope:{...user.normalTestScope,isolatedPreparation:false}},{normalTestScope:{...user.normalTestScope,database:'LIVE'}},{normalTestScope:{...user.normalTestScope,semihTestContinue:false}}])assert.equal(isSemihTestUser({...user,...changed}),false);
  assert.throws(()=>rememberedSessionMetadata({enabled:true,user:{...user,testAdmin:true}}),{status:401});
  assert.deepEqual(rememberedSessionMetadata({enabled:false,user}),{enabled:false,user:null});
});
test('enabled entry never falls through to anonymous TEST ADMIN and a fresh LAN browser has no admin path',()=>{
  const base={testAdminEnabled:true,manualTestLogin:false,hasSavedKey:false};
  assert.equal(initialSessionAction({...base,remembered:{enabled:true,user}}),'continue');
  assert.equal(initialSessionAction({...base,remembered:{enabled:true,user:null}}),'login');
  assert.equal(initialSessionAction({...base,hasSavedKey:true,remembered:{enabled:true,user:null}}),'login');
  assert.equal(initialSessionAction({...base,remembered:{enabled:false,user:null}}),'test-admin');
  assert.equal(initialSessionAction({...base,manualTestLogin:true,remembered:{enabled:false,user:null}}),'resume');
  assert.equal(initialSessionAction({...base,native:true,remembered:{enabled:true,user:null}}),'resume');
});
test('inspect provides no access token and continue commits only after refresh, independent /me and inbox',async()=>{
  const {manager,calls}=fixture(),commits=[];
  assert.deepEqual(await manager.probe(),{enabled:true,user});assert.deepEqual(calls,['inspect']);
  const loader=createSessionLoader({api:{resumeNormalSession:async options=>(await manager.resume(options))?.result,session:async()=>{calls.push('me');return user;},rememberNormalSession:async(value,me)=>{calls.push('verified');assert.equal(await manager.remember(value,me,0),true);},inbox:async()=>{calls.push('inbox');return {conversations:[{id:'synthetic-real-read'}]};}},onCommit:x=>commits.push(x),onError:error=>{throw error;},onBusy:()=>{}});
  assert.equal(commits.length,0);await loader.start({resume:true,requireResume:true});
  assert.deepEqual(calls,['inspect','inspect','refresh','me','verified','inbox']);assert.equal(commits[0].session.id,user.id);
});
test('an absent/revoked cookie cannot restore an account and a mismatched /me is denied',async()=>{
  const {manager,calls}=fixture({inspect:async()=>({enabled:true,user:null})});assert.equal(await manager.resume(),null);assert.deepEqual(calls,[]);
  const valid=fixture();const resumed=await valid.manager.resume();await assert.rejects(()=>valid.manager.remember(resumed.result,{...user,id:'other'},resumed.epoch),{status:401});
  const forged=fixture({refresh:async()=>({...result(),refreshToken:'not-browser-safe'})});await assert.rejects(()=>forged.manager.resume(),{status:401});
});
test('logout waits for and revokes a late rotated browser response, without restoring UI state',async()=>{
  const response=deferred(),started=deferred();let cookie=true,revoked=0;
  const {manager}=fixture({inspect:async()=>({enabled:true,user:cookie?user:null}),refresh:async()=>{started.resolve();await response.promise;cookie=true;return result();},logout:async()=>{cookie=false;revoked++;}});
  const resume=manager.resume();await started.promise;const logout=manager.clear();assert.equal(revoked,0);response.resolve();
  assert.equal(await resume,null);await logout;assert.equal(cookie,false);assert.equal(revoked,1);assert.equal(await manager.resume(),null);
});
test('logout after a delayed password login clears its late cookie even before /me or remember',async()=>{
  const response=deferred(),started=deferred();let cookie=false,revoked=0;
  const {manager}=fixture({inspect:async()=>({enabled:false,user:null}),logout:async()=>{cookie=false;revoked++;}});
  const epoch=await manager.begin(),login=manager.authenticate(async()=>{started.resolve();await response.promise;cookie=true;return result();},epoch);
  await started.promise;const logout=manager.clear();response.resolve();await login;await logout;assert.equal(cookie,false);assert.equal(revoked,1);
  assert.equal(await manager.remember(result(),user,epoch),false);
});
test('disabled helper preserves a normal personnel in-memory refresh and does not touch cookie logout',async()=>{
  const personnel={id:'normal-test-personnel',username:'normal-personnel',role:'personel'},tokens=[];
  const {manager,calls}=fixture({inspect:async()=>({enabled:false,user:null}),nativeRefresh:async token=>{tokens.push(token);return {accessToken:'second',refreshToken:'second-refresh',expiresAt:100000,user:personnel};}});
  const epoch=await manager.begin();await manager.remember({accessToken:'first',refreshToken:'first-refresh',expiresAt:100000,user:personnel},personnel,epoch);
  const resumed=await manager.resume();assert.equal(resumed.result.user.role,'personel');assert.deepEqual(tokens,['first-refresh']);assert(!calls.includes('logout'));
});
test('a refresh401 clears through idempotent logout and still permits a subsequent normal password login',async()=>{
  let cookie=true,logins=0;const {manager}=fixture({inspect:async()=>({enabled:true,user:cookie?user:null}),refresh:async()=>{cookie=false;throw Object.assign(Error('revoked fixture'),{status:401});},logout:async()=>{cookie=false;}});
  await assert.rejects(()=>manager.resume(),{status:401});await manager.clear();assert.deepEqual(await manager.probe(),{enabled:true,user:null});
  const epoch=await manager.begin();await manager.authenticate(async()=>{logins++;cookie=true;return result();},epoch);assert.equal(logins,1);assert.equal(await manager.remember(result(),user,epoch),true);
});
test('actual revoke/network failures remain failures and cannot proceed to password login',async()=>{
  for(const status of [401,403,503]){
    const failure=Object.assign(Error('logout rejected fixture'),{status}),{manager}=fixture({logout:async()=>{throw failure;}});await manager.probe();let logins=0;
    await assert.rejects(async()=>{const epoch=await manager.begin();await manager.authenticate(async()=>{logins++;return result();},epoch);},{status});assert.equal(logins,0);
  }
});
test('the actual browser API treats a legacy remembered404 as disabled while preserving normal password login',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];globalThis.window={location:{origin:'http://127.0.0.1:62700'}};
  globalThis.fetch=async(url,options)=>{calls.push(url);return url.endsWith('/remembered')?Response.json({error:{message:'Legacy route absent'}},{status:404}):Response.json({data:{accessToken:'synthetic-normal-access',user:{id:'normal',username:'normal',role:'personel'}}});};
  try{const {liveApi}=await import('../src/liveApi.js?legacy-remembered-404-test');assert.deepEqual(await liveApi.rememberedNormalSession(),{enabled:false,user:null});await liveApi.login('synthetic-normal','synthetic-password');assert.deepEqual(calls,['/api/live/auth/remembered','/api/live/auth/login']);}
  finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});
test('the real browser API sends empty JSON for cookie rotation/logout, with no refresh secret in JavaScript',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];let cookie=true;
  globalThis.window={location:{origin:'http://127.0.0.1:62700'}};
  globalThis.fetch=async(url,options)=>{calls.push({url,body:options.body,headers:options.headers});const data=url.endsWith('/remembered')?{enabled:true,user:cookie?user:null}:url.endsWith('/logout')?(cookie=false,{revoked:true}):result();return Response.json({data});};
  try{
    const {liveApi}=await import('../src/liveApi.js?browser-cookie-api-test');
    assert.deepEqual(await liveApi.rememberedNormalSession(),{enabled:true,user});const renewed=await liveApi.resumeNormalSession();assert(!Object.hasOwn(renewed,'refreshToken'));
    await liveApi.rememberNormalSession(renewed,user);await liveApi.clearNormalSession();
    assert.deepEqual(calls.filter(call=>call.body).map(call=>[call.url,call.body,call.headers['Content-Type']]),[['/api/live/auth/refresh','{}','application/json'],['/api/live/auth/logout','{}','application/json']]);
    assert.equal(await liveApi.resumeNormalSession(),null);
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});
test('the real native API preserves protected refresh secrets and explicitly selects native password login',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];let saved=null;
  const native={postMessage(raw){const message=JSON.parse(raw);if(message.action==='put')saved=message.session;if(message.action==='clear')saved=null;queueMicrotask(()=>native.onmessage({data:JSON.stringify({v:1,id:message.id,ok:true,session:message.action==='get'?saved:null})}));}};
  globalThis.window={location:{origin:'http://192.168.1.46:62700'},MelisaProtectedSession:native};
  globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({data:{...result(),refreshToken:url.endsWith('/login')?'synthetic-first-refresh':'synthetic-next-refresh'}});};
  try{
    const {liveApi}=await import('../src/liveApi.js?native-login-transport-test');
    const signedIn=await liveApi.login('synthetic-test-user','synthetic-test-password');assert.equal(calls[0].body.transport,'native');
    await liveApi.rememberNormalSession(signedIn,user);assert.equal(saved.userId,user.id);assert(!Object.hasOwn(saved,'password'));
    const renewed=await liveApi.resumeNormalSession();assert.equal(calls[1].url,'/api/live/auth/refresh');assert.deepEqual(calls[1].body,{refreshToken:'synthetic-first-refresh'});assert.equal(renewed.refreshToken,'synthetic-next-refresh');
    await liveApi.clearNormalSession();assert.equal(saved,null);assert.deepEqual(calls[2].body,{refreshToken:'synthetic-next-refresh'});
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});
