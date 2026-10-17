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

test('actual disabled-helper browser reload verifies the saved issuer access token and revokes it after local access is cleared',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[],values=new Map();
  const issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',permissions:['crm.view','crm.manage'],customerProductRequestIssuer:true};
  const signedIn={accessToken:'synthetic-own-issuer-access',refreshToken:'synthetic-ram-only-refresh',expiresAt:100000,user:issuer};
  globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}};
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options,storedAccess:values.get('melisa-crm-access-token')});
    const data=url.endsWith('/remembered')?{enabled:false,user:null}:url.endsWith('/login')?signedIn:url.endsWith('/me')?issuer:url.includes('/crm/inbox?')?{conversations:[],summary:{total:0}}:{loggedOut:true};
    return Response.json({data});
  };
  try{
    const first=await import('../src/liveApi.js?issuer-first-password-session-test');
    assert.deepEqual(await first.liveApi.rememberedNormalSession(),{enabled:false,user:null});
    const normal=await first.liveApi.login('synthetic-manager','synthetic-password'),profile=await first.liveApi.session(normal.accessToken);
    await first.liveApi.rememberNormalSession(normal,profile);first.saveAccessKey(normal.accessToken);
    assert.deepEqual([...values], [['melisa-crm-access-token',normal.accessToken]]);

    // A fresh API instance has no in-memory refresh grant, matching a hard reload.
    const reloaded=await import('../src/liveApi.js?issuer-hard-reloaded-browser-test'),commits=[];
    assert.deepEqual(await reloaded.liveApi.rememberedNormalSession(),{enabled:false,user:null});
    const loader=createSessionLoader({api:reloaded.liveApi,onCommit:value=>commits.push(value),onError:error=>{throw error;},onBusy:()=>{}});
    await loader.start({token:reloaded.savedAccessKey()});assert.equal(commits[0].session.customerProductRequestIssuer,true);
    assert.equal(calls.filter(call=>call.url.endsWith('/refresh')).length,0);
    const closingKey=commits[0].key,closed=reloaded.liveApi.clearNormalSession(closingKey);
    reloaded.saveAccessKey('');loader.invalidate();await closed;
    const mutations=calls.filter(call=>call.options.method==='POST');assert.equal(mutations.length,2);
    const logout=mutations[1];assert.equal(logout.url,'/api/live/auth/logout');assert.equal(logout.options.body,'{}');
    assert.equal(logout.options.headers.Authorization,`Bearer ${closingKey}`);assert.equal(logout.options.headers['Content-Type'],'application/json');
    assert.equal(logout.options.redirect,'error');assert.equal(logout.options.credentials,'omit');assert.equal(logout.storedAccess,undefined);
    assert.equal(JSON.stringify([...values]).includes(signedIn.refreshToken),false);
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('actual issuer replacement revokes its verified old access before password login, and a failed revoke prevents the new mutation',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window;
  try{
    for(const status of [200,401,503]){
      let stored='synthetic-old-issuer';const calls=[],issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};
      globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
      globalThis.fetch=async(url,options)=>{
        calls.push({url,options});
        if(url.endsWith('/logout'))return Response.json(status===200?{data:{loggedOut:true}}:{error:{message:'Synthetic revoke rejected'}},{status});
        return Response.json({data:url.endsWith('/me')?issuer:{accessToken:'synthetic-new-issuer',user:issuer}});
      };
      const {liveApi}=await import(`../src/liveApi.js?issuer-replacement-${status}-test`);await liveApi.session(stored);
      if(status===200)await liveApi.login('synthetic-manager','synthetic-password');
      else{
        await assert.rejects(()=>liveApi.login('synthetic-manager','synthetic-password'),/Oturumun kapanışı doğrulanamadı/);
        await assert.rejects(()=>liveApi.login('synthetic-manager','synthetic-password'),/Oturumun kapanışı doğrulanamadı/);
      }
      assert.equal(calls[1].url,'/api/live/auth/logout');assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-old-issuer');assert.equal(calls[1].options.body,'{}');
      assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout',...(status===200?['/api/live/auth/login']:status===401?['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me']:['/api/live/auth/logout'])]);
    }
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('an unknown access is classified through me and a verified normal nonissuer cannot select the issuer bearer logout',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];
  globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>null}};
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({data:{id:'synthetic-personnel',username:'synthetic-personnel',role:'personel'}});};
  try{
    const {liveApi}=await import('../src/liveApi.js?issuer-nonauthority-logout-test');
    await liveApi.clearNormalSession('synthetic-unverified-issuer');assert.equal(calls.length,1);assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-unverified-issuer');
    await liveApi.session('synthetic-personnel-access');await liveApi.clearNormalSession('synthetic-personnel-access');
    assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/me']);
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('actual issuer repeated close and simultaneous replacement share one pending refresh-grant logout without bearer mixing',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[],started=deferred(),revocation=deferred();let stored=null;
  const issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};
  const result={accessToken:'synthetic-issuer-access',refreshToken:'synthetic-refresh-grant',expiresAt:100000,user:issuer};
  globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
  globalThis.fetch=async(url,options)=>{calls.push({url,options});if(url.endsWith('/logout')){started.resolve();await revocation.promise;return Response.json({data:{loggedOut:true}});}return Response.json({data:url.endsWith('/me')?issuer:result});};
  try{
    const {liveApi,saveAccessKey}=await import('../src/liveApi.js?issuer-concurrent-rt-logout-test');
    const normal=await liveApi.login('synthetic-manager','synthetic-password'),profile=await liveApi.session(normal.accessToken);
    await liveApi.rememberNormalSession(normal,profile);saveAccessKey(normal.accessToken);
    const closed=liveApi.clearNormalSession(normal.accessToken);assert.equal(liveApi.clearNormalSession(normal.accessToken),closed);
    const replacement=liveApi.login('synthetic-manager','synthetic-password');await started.promise;
    const logout=calls.at(-1);assert.equal(logout.url,'/api/live/auth/logout');assert.equal(logout.options.body,JSON.stringify({refreshToken:result.refreshToken}));
    assert.equal(logout.options.headers.Authorization,undefined);assert.equal(calls.filter(call=>call.url.endsWith('/login')).length,1);
    revocation.resolve();await Promise.all([closed,replacement]);
    assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/login','/api/live/auth/me','/api/live/auth/logout','/api/live/auth/login']);
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('unknown reloaded access blocks account replacement on repeated me503 and recovers through its own issuer logout before login',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];let meStatus=503,stored='synthetic-unknown-old-access';
  const issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};
  globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/me'))return Response.json(meStatus===200?{data:issuer}:{error:{message:'Synthetic profile unavailable'}},{status:meStatus});
    return Response.json({data:url.endsWith('/logout')?{loggedOut:true}:{accessToken:'synthetic-next-access',user:issuer}});
  };
  try{
    const {liveApi}=await import('../src/liveApi.js?issuer-unknown-reload-replacement-test');
    for(let i=0;i<2;i++)await assert.rejects(()=>liveApi.login('synthetic-manager','synthetic-password'),/Oturumun kapanışı doğrulanamadı/);
    assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/me']);
    assert(calls.every(call=>call.options.headers.Authorization==='Bearer synthetic-unknown-old-access'&&call.options.redirect==='error'&&call.options.credentials==='omit'));
    meStatus=200;await liveApi.login('synthetic-manager','synthetic-password');
    assert.deepEqual(calls.slice(2).map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/login']);
    assert.equal(calls[3].options.headers.Authorization,'Bearer synthetic-unknown-old-access');assert.equal(calls[3].options.body,'{}');
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('unknown access401 closes locally without claiming revocation or sending an issuer logout',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];
  globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''}};
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({error:{message:'Synthetic expired access'}},{status:401});};
  try{
    const {liveApi}=await import('../src/liveApi.js?issuer-unknown-expired-access-test');
    assert.equal(await liveApi.clearNormalSession('synthetic-expired-access'),undefined);assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me']);
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('unknown close aborts an actual pending me read and retains its old key barrier after browser storage is cleared',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[];let stored='synthetic-timed-out-access',pending=true,aborts=0;
  globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(!pending)return Response.json({error:{message:'Synthetic profile unavailable'}},{status:503});
    return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborts++;reject(new DOMException('Synthetic aborted profile','AbortError'));},{once:true}));
  };
  try{
    const {liveApi,saveAccessKey}=await import('../src/liveApi.js?issuer-unknown-aborted-read-test');
    const closed=liveApi.clearNormalSession(stored);saveAccessKey('');
    await assert.rejects(closed,/Oturumun kapanışı doğrulanamadı/);assert.equal(aborts,1);assert.equal(calls[0].options.signal.aborted,true);
    pending=false;await assert.rejects(()=>liveApi.login('synthetic-manager','synthetic-password'),/Oturumun kapanışı doğrulanamadı/);
    assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/me']);assert(calls.every(call=>call.options.headers.Authorization==='Bearer synthetic-timed-out-access'));
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('two concurrent unknown-key login begins join a failed old close despite cleared storage and later retry that same key before login',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window,calls=[],started=deferred(),profile=deferred();let stored='synthetic-concurrent-old-access',recover=false;
  const issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};
  globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/me')){if(!recover){started.resolve();return profile.promise;}return Response.json({data:issuer});}
    return Response.json({data:url.endsWith('/logout')?{loggedOut:true}:{accessToken:'synthetic-recovered-access',user:issuer}});
  };
  try{
    const {liveApi,saveAccessKey}=await import('../src/liveApi.js?issuer-concurrent-unknown-begins-test');
    const first=liveApi.login('synthetic-manager','synthetic-password'),firstRejected=assert.rejects(first,/Oturumun kapanışı doğrulanamadı/);await started.promise;
    saveAccessKey('');const second=liveApi.login('synthetic-manager','synthetic-password'),secondRejected=assert.rejects(second,/Oturumun kapanışı doğrulanamadı/);
    await Promise.resolve();await Promise.resolve();assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me']);
    profile.resolve(Response.json({error:{message:'Synthetic pending profile failed'}},{status:503}));await Promise.all([firstRejected,secondRejected]);
    assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me']);recover=true;await liveApi.login('synthetic-manager','synthetic-password');
    assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/me','/api/live/auth/logout','/api/live/auth/login']);
    assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-concurrent-old-access');assert.equal(calls[2].options.headers.Authorization,'Bearer synthetic-concurrent-old-access');
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('a previously verified issuer logout401 rechecks the same expired or revoked key and permits login without a revocation claim',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window;
  try{
    for(const reason of ['expired','revoked']){
      const calls=[],issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};let valid=true,stored='synthetic-known-old-access';
      globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
      globalThis.fetch=async(url,options)=>{
        calls.push({url,options});
        if(url.endsWith('/login'))return Response.json({data:{accessToken:'synthetic-new-access',user:issuer}});
        if(url.endsWith('/me')&&valid)return Response.json({data:issuer});
        return Response.json({error:{message:`Synthetic ${reason} old authority`}},{status:401});
      };
      const {liveApi,saveAccessKey}=await import(`../src/liveApi.js?issuer-known-${reason}-logout401-test`);await liveApi.session(stored);valid=false;
      const closed=liveApi.clearNormalSession(stored);saveAccessKey('');assert.equal(await closed,undefined);
      await liveApi.login('synthetic-manager','synthetic-password');
      assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/login']);
      assert(calls.slice(1,3).every(call=>call.options.headers.Authorization==='Bearer synthetic-known-old-access'&&call.options.redirect==='error'&&call.options.credentials==='omit'));
    }
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});

test('known issuer logout401 keeps the old-key barrier when me is valid, unavailable or aborted and recovers only after same-key me401',async()=>{
  const beforeFetch=globalThis.fetch,beforeWindow=globalThis.window;
  try{
    for(const initial of ['valid','unavailable','aborted']){
      const calls=[],issuer={id:'synthetic-existing-manager',username:'synthetic-manager',role:'mudur',customerProductRequestIssuer:true};let mode='bootstrap',stored='synthetic-known-retry-access',aborts=0;
      globalThis.window={location:{origin:'http://127.0.0.1:62700',pathname:'/',search:''},sessionStorage:{getItem:()=>stored,setItem:(_key,value)=>stored=value,removeItem:()=>stored=null}};
      globalThis.fetch=async(url,options)=>{
        calls.push({url,options});
        if(url.endsWith('/login'))return Response.json({data:{accessToken:'synthetic-recovered-access',user:issuer}});
        if(url.endsWith('/logout'))return Response.json({error:{message:'Synthetic logout denied'}},{status:401});
        if(mode==='bootstrap'||mode==='valid')return Response.json({data:issuer});
        if(mode==='aborted')return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborts++;reject(new DOMException('Synthetic verification aborted','AbortError'));},{once:true}));
        return Response.json({error:{message:'Synthetic verification denied'}},{status:mode==='invalid'?401:503});
      };
      const {liveApi,saveAccessKey}=await import(`../src/liveApi.js?issuer-known-${initial}-verification-test`);await liveApi.session(stored);mode=initial;
      const closed=liveApi.clearNormalSession(stored);saveAccessKey('');await assert.rejects(closed,/Oturumun kapanışı doğrulanamadı/);
      if(initial==='aborted'){assert.equal(aborts,1);assert.equal(calls[2].options.signal.aborted,true);mode='unavailable';}
      await assert.rejects(()=>liveApi.login('synthetic-manager','synthetic-password'),/Oturumun kapanışı doğrulanamadı/);
      assert.equal(calls.filter(call=>call.url.endsWith('/login')).length,0);
      mode='invalid';await liveApi.login('synthetic-manager','synthetic-password');
      assert.deepEqual(calls.map(call=>call.url),['/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/logout','/api/live/auth/me','/api/live/auth/login']);
      assert(calls.slice(1,-1).every(call=>call.options.headers.Authorization==='Bearer synthetic-known-retry-access'&&call.options.redirect==='error'&&call.options.credentials==='omit'));
    }
  }finally{globalThis.fetch=beforeFetch;if(beforeWindow===undefined)delete globalThis.window;else globalThis.window=beforeWindow;}
});
