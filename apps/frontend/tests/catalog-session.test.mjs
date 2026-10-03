import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogAccessError, catalogErrorDiagnostic, createCatalogSession, MAX_CATALOG_VIEW_MS } from '../src/catalog/session.js';
import { liveApi } from '../src/liveApi.js';
import { closeCatalogSession } from '../src/catalog/logout.js';

const row = {id:'42',stockCode:'TEST.042',productName:'Synthetic ERP product',brand:'TEST',category:'TEST',salePrice:10,currency:'EUR',priceStatus:'recorded',priceBasis:'per-item',priceBasisStatus:'user-confirmed',stockQuantity:2,photoPath:'/crm/catalog/products/42/photo',photoStatus:'guarded-path',sourceUpdatedAt:null,pricedDocumentEligible:false,pricedDocumentBlockReason:'SOURCE_FRESHNESS_UNVERIFIED'};
function envelope() { return {success:true,data:[{...row}],meta:{page:1,limit:100,total:1,totalPages:1,hasNextPage:false,hasPreviousPage:false,source:'melisa-erp-authorized-read',fetchedAt:'2026-10-01T03:00:00.000Z',cached:false,sourceUpdatedAt:null,sourceDatabaseVerified:true,capabilities:{read:true,unpricedCatalog:true,pricedPdf:false}}}; }
const fail = (status,code) => Object.assign(new Error('Synthetic denial'), {status,code});
function deferred() { let resolve,reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function fixture(overrides={},options={}) {
  const states=[],calls=[],timers=new Map(),made=[],revoked=[];
  let time=1000,current=true,timerId=0,crmExpired=0;
  const api={
    async catalogProducts(token,options){calls.push({kind:'read',token,options});return envelope();},
    async catalogSignIn(token,credentials,options){calls.push({kind:'sign-in',token,credentials,options});return {expiresAt:time+MAX_CATALOG_VIEW_MS};},
    async catalogSignOut(token,options){calls.push({kind:'sign-out',token,options});return {connected:false};},
    async catalogPhoto(token,id,options){calls.push({kind:'photo',token,id,options});return new Blob(['synthetic']);},
    ...overrides,
  };
  const session=createCatalogSession({api,token:'synthetic-crm-session',isCurrent:()=>current,onState:s=>states.push(s),onCrmExpired:()=>crmExpired++,now:()=>time,schedule:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},unschedule:id=>timers.delete(id),urlApi:{createObjectURL(){const u=`blob:synthetic-${made.length}`;made.push(u);return u;},revokeObjectURL:u=>revoked.push(u)},...options});
  return {session,states,calls,timers,made,revoked,latest:()=>states.at(-1),advance:ms=>time+=ms,invalidate:()=>current=false,expired:()=>crmExpired};
}

test('exact ERP access errors distinguish recoverable login from missing permissions',()=>{
  for (const code of ['USER_ERP_SESSION_REQUIRED','CATALOG_SESSION_REVOKED','ERP_LOGIN_REJECTED']) assert.equal(catalogAccessError(fail(401,code)).state,'credentials');
  for (const code of ['ERP_SOURCE_IDENTITY_REQUIRED','ERP_PRODUCT_PERMISSION_REQUIRED','OTHER_DENIAL']) assert.equal(catalogAccessError(fail(403,code)).state,'blocked');
  assert.match(catalogAccessError(fail(401,'ERP_LOGIN_REJECTED')).message,/kullanıcı adı veya şifresi/);
  for (const status of [404,429,503]) {const value=catalogAccessError(fail(status,'TEST'));assert.equal(value.state,'error');assert.deepEqual(value.products,[]);}
});

test('opening catalog performs reads only and exposes no credentials or currentness claims',async()=>{
  const f=fixture();await f.session.read();assert.deepEqual(f.calls.map(c=>c.kind),['read']);assert.equal(f.latest().state,'ready');assert(f.session.isUsable());assert.equal(f.latest().priceExportAllowed,false);assert.equal(f.latest().products[0].priceVerified,false);assert.equal(f.latest().products[0].stockVerified,false);assert.doesNotMatch(JSON.stringify(f.states),/synthetic-crm-session/);f.session.close();assert.equal(f.timers.size,0);
});

test('real product transport handles exact no-meta USER_ERP_SESSION_REQUIRED before catalog schema validation',async()=>{
 const previous=globalThis.fetch,calls=[];const f=fixture({catalogProducts:liveApi.catalogProducts});
 try {
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({success:false,error:{code:'USER_ERP_SESSION_REQUIRED',message:'USER_ERP_SESSION_REQUIRED'}},{status:401});};
  assert.equal(await f.session.read(),null);assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/live/crm/catalog/products?search=&page=1&limit=100');assert.equal(f.latest().state,'credentials');assert.deepEqual(f.latest().products,[]);assert(!f.session.isUsable());assert.equal(f.timers.size,0);assert.equal(f.expired(),0);assert(!f.states.some(state=>state.state==='error'));
 }finally{f.session.close();globalThis.fetch=previous;}
});

test('sign-in and repeated activation use one mutation, then read and bounded expiry',async()=>{
  const pending=deferred();let authCalls=0;
  const f=fixture({catalogSignIn:async()=>{authCalls++;return pending.promise;}});
  const first=f.session.signIn({username:'synthetic',password:'test-only'});const second=f.session.signIn({username:'synthetic',password:'test-only'});
  assert.equal(first,second);assert.equal(authCalls,1);assert.equal(f.latest().state,'signing-in');pending.resolve({expiresAt:61000});await first;
  assert.equal(f.latest().state,'ready');assert.equal(f.latest().accessExpiresAt,61000);assert.deepEqual(f.calls.map(c=>c.kind),['read']);assert.equal([...f.timers.values()][0].delay,60000);assert.doesNotMatch(JSON.stringify(f.states),/test-only|synthetic-crm-session/);f.session.close();
});

test('backend rejection restores the ERP form; only explicit retry makes another sign-in',async()=>{
  let calls=0;const f=fixture({catalogSignIn:async()=>{calls++;throw fail(401,'ERP_LOGIN_REJECTED');}});
  await f.session.signIn({username:'synthetic',password:'wrong-test-only'});assert.equal(f.latest().state,'credentials');assert.equal(calls,1);assert.equal(f.calls.length,0);await f.session.signIn({username:'synthetic',password:'wrong-test-only'});assert.equal(calls,2);f.session.close();
});

test('real auth transport 409 SESSION_CONTEXT_CHANGED cannot connect, read products or auto-retry',async()=>{
  const previous=globalThis.fetch,pending=deferred();let calls=0;
  const f=fixture({catalogSignIn:liveApi.catalogSignIn});
  try {
    globalThis.fetch=async()=>{calls++;return pending.promise;};
    const first=f.session.signIn({username:'synthetic',password:'test-only'}),second=f.session.signIn({username:'synthetic',password:'test-only'});
    assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
    pending.resolve(Response.json({success:false,error:{code:'SESSION_CONTEXT_CHANGED',message:'Synthetic binding changed'}},{status:409}));
    assert.equal(await first,null);await second;await Promise.resolve();
    assert.equal(calls,1);assert.equal(f.calls.length,0);assert.equal(f.latest().state,'error');assert.deepEqual(f.latest().products,[]);assert(!f.session.isUsable());assert.equal(f.timers.size,0);assert.equal(f.expired(),0);assert(!f.states.some(state=>state.state==='ready'||state.state==='uncertain'));
  } finally {f.session.close();globalThis.fetch=previous;}
});

test('late SESSION_CONTEXT_CHANGED after close cannot replace newer session state',async()=>{
  const pending=deferred();let calls=0;const f=fixture({catalogSignIn:()=>{calls++;return pending.promise;}});
  const work=f.session.signIn({username:'synthetic',password:'test-only'});f.session.close();const count=f.states.length;
  pending.reject(fail(409,'SESSION_CONTEXT_CHANGED'));await work;assert.equal(f.states.length,count);assert.equal(calls,1);assert.equal(f.calls.length,0);assert(!f.session.isUsable());assert.equal(f.timers.size,0);assert.equal(f.expired(),0);
});

test('lost sign-in response becomes uncertain and read-only recovery never repeats auth',async()=>{
  let calls=0;const f=fixture({catalogSignIn:async()=>{calls++;throw new TypeError('Synthetic network loss');}});
  await f.session.signIn({username:'synthetic',password:'test-only'});assert.equal(f.latest().state,'uncertain');assert.equal(calls,1);assert.equal(f.calls.length,0);await f.session.read();assert.equal(f.latest().state,'ready');assert.equal(calls,1);assert.deepEqual(f.calls.map(c=>c.kind),['read']);f.session.close();
});

test('close during sign-in aborts and ignores late success without starting reads',async()=>{
  const pending=deferred();let signal;const f=fixture({catalogSignIn:async(_token,_credentials,options)=>{signal=options.signal;return pending.promise;}});
  const work=f.session.signIn({username:'synthetic',password:'test-only'});f.session.close();assert(signal.aborted);const count=f.states.length;pending.resolve({expiresAt:61000});await work;assert.equal(f.states.length,count);assert.equal(f.calls.length,0);assert(!f.session.isUsable());assert.equal(f.timers.size,0);
});

test('close during product read aborts and ignores an uncooperative late response',async()=>{
  const pending=deferred();let signal;const f=fixture({catalogProducts:async(_token,options)=>{signal=options.signal;return pending.promise;}});
  const work=f.session.read();f.session.close();assert(signal.aborted);const count=f.states.length;pending.resolve(envelope());await work;assert.equal(f.states.length,count);assert(!f.session.isUsable());assert.equal(f.timers.size,0);
});

test('recipient/account context change suppresses late data and cannot start another request',async()=>{
  const pending=deferred();let calls=0;const f=fixture({catalogProducts:async()=>{calls++;return pending.promise;}});
  const work=f.session.read();f.invalidate();pending.resolve(envelope());await work;assert.equal(f.latest().state,'loading');assert(!f.session.isUsable());await f.session.read();assert.equal(calls,1);f.session.close();
});

test('old session failure cannot expire a replacement CRM context',async()=>{
  const pending=deferred();const f=fixture({catalogProducts:()=>pending.promise});const work=f.session.read();f.invalidate();pending.reject(fail(401,'AUTH_TOKEN_EXPIRED'));await work;assert.equal(f.expired(),0);f.session.close();
});

test('current CRM token expiry clears catalog and invokes the owned CRM expiry handler once',async()=>{
  const f=fixture({catalogProducts:async()=>{throw fail(401,'AUTH_TOKEN_EXPIRED');}});await f.session.read();assert.equal(f.latest().state,'blocked');assert.deepEqual(f.latest().products,[]);assert.equal(f.expired(),1);assert(!f.session.isUsable());assert.equal(f.timers.size,0);f.session.close();
});

test('view deadline stays at most fifteen minutes and expiry revokes cached photos',async()=>{
  const f=fixture();await f.session.signIn({username:'synthetic',password:'test-only'});const url=await f.session.photo(f.latest().products[0]);assert.equal(url,f.made[0]);const timer=[...f.timers.values()][0];assert.equal(timer.delay,MAX_CATALOG_VIEW_MS);f.advance(MAX_CATALOG_VIEW_MS);timer.fn();assert.equal(f.latest().state,'credentials');assert.deepEqual(f.latest().products,[]);assert.deepEqual(f.revoked,[url]);assert(!f.session.isUsable());assert.equal(f.timers.size,0);f.session.close();
});

test('expired access is rejected even before the scheduled expiry callback runs',async()=>{
  const f=fixture();await f.session.read();f.advance(MAX_CATALOG_VIEW_MS);await assert.rejects(()=>f.session.verifyOutput(),/erişimi sona erdi/);assert.equal(f.latest().state,'credentials');assert.equal(f.calls.length,1);f.session.close();
});

test('photo reads deduplicate within owned session and close aborts pending transport',async()=>{
  const pending=deferred();let signal,calls=0;const f=fixture({catalogPhoto:async(_token,_id,options)=>{calls++;signal=options.signal;return pending.promise;}});await f.session.read();const product=f.latest().products[0];const a=f.session.photo(product),b=f.session.photo(product);assert.equal(calls,1);f.session.close();assert(signal.aborted);pending.resolve(new Blob(['test']));await assert.rejects(()=>a);await assert.rejects(()=>b);assert.deepEqual(f.made,[]);
});

test('photo authorization loss clears products and cached images immediately',async()=>{
  const f=fixture({catalogPhoto:async()=>{throw fail(401,'CATALOG_SESSION_REVOKED');}});await f.session.read();await assert.rejects(()=>f.session.photo(f.latest().products[0]));assert.equal(f.latest().state,'credentials');assert.deepEqual(f.latest().products,[]);assert(!f.session.isUsable());f.session.close();
});

test('output access check is read-only and a malformed/revoked response prevents output',async()=>{
  for(const outcome of [()=>({success:true,data:[],meta:{}}),()=>{throw fail(401,'CATALOG_SESSION_REVOKED');}]) {
    let calls=0;const f=fixture({catalogProducts:async()=>++calls===1?envelope():outcome()});await f.session.read();await assert.rejects(()=>f.session.verifyOutput(),/Çıktı hazırlanmadı/);assert.equal(calls,2);assert(!f.session.isUsable());assert.deepEqual(f.latest().products,[]);assert(f.calls.every(c=>c.kind!=='sign-in'&&c.kind!=='sign-out'));f.session.close();
  }
});

test('closing while output verification waits aborts it and blocks late attachment approval',async()=>{
  let reads=0,signal;const pending=deferred();const f=fixture({catalogProducts:async(_token,options)=>{if(++reads===1)return envelope();signal=options.signal;return pending.promise;}});await f.session.read();const checking=f.session.verifyOutput();f.session.close();assert(signal.aborted);pending.resolve(envelope());await assert.rejects(()=>checking,/Çıktı hazırlanmadı/);assert(!f.session.isUsable());
});

test('disconnect clears local products/photos first, performs one sign-out and requires explicit reconnect',async()=>{
  const pending=deferred();let calls=0;const f=fixture({catalogSignOut:async()=>{calls++;return pending.promise;}});await f.session.read();const url=await f.session.photo(f.latest().products[0]);const work=f.session.disconnect();await f.session.disconnect();assert.equal(calls,1);assert.equal(f.latest().state,'disconnecting');assert.deepEqual(f.latest().products,[]);assert.deepEqual(f.revoked,[url]);pending.resolve({connected:false});await work;assert.equal(f.latest().state,'disconnected');assert(!f.session.isUsable());assert.equal(f.timers.size,0);f.session.close();
});

test('unconfirmed disconnect stays uncertain with no retry or fabricated success',async()=>{
  let calls=0;const f=fixture({catalogSignOut:async()=>{calls++;throw new TypeError('Synthetic network loss');}});await f.session.read();await f.session.disconnect();assert.equal(calls,1);assert.equal(f.latest().state,'uncertain');assert.deepEqual(f.latest().products,[]);assert(!f.session.isUsable());f.session.close();
});

test('closed catalog is terminal and all later actions are local no-ops or denials',async()=>{
  const f=fixture();f.session.close();await f.session.read();await f.session.signIn({username:'synthetic',password:'test-only'});await f.session.disconnect();await assert.rejects(()=>f.session.photo({id:'42'}));await assert.rejects(()=>f.session.verifyOutput());assert.equal(f.calls.length,0);assert.equal(f.states.length,0);assert(!f.session.isUsable());
});

test('CRM-only panel reads with existing CRM authorization and never calls sign-in or sign-out on panel actions',async()=>{
 const f=fixture({}, {authMode:'crm'});await f.session.read();assert.equal(f.latest().state,'ready');assert.deepEqual(f.calls.map(c=>c.kind),['read']);assert.equal(f.calls[0].token,'synthetic-crm-session');
 await f.session.signIn({username:'unused',password:'never-transmitted'});await f.session.disconnect();assert.deepEqual(f.calls.map(c=>c.kind),['read']);assert(f.session.isUsable());f.session.close();assert.deepEqual(f.calls.map(c=>c.kind),['read']);assert.doesNotMatch(JSON.stringify(f.states),/never-transmitted|ERP hesabınızla giriş/);
});

test('explicit CRM-only logout invalidates server once and immediately aborts a pending catalog read without late restoration',async()=>{
 const previous=globalThis.fetch,pending=deferred(),logout=deferred(),calls=[];let token='synthetic-crm-logout',readSignal,cleared=false;
 const f=fixture({catalogProducts:async(_token,options)=>{readSignal=options.signal;return pending.promise;}},{authMode:'crm'});
 try {
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return logout.promise;};
  const read=f.session.read();const close=()=>{const closing=token;return closeCatalogSession({explicitLogout:Boolean(closing),disconnect:()=>liveApi.catalogSignOut(closing),clearPhotos:()=>f.session.close(),clearLocal:()=>{token='';cleared=true;f.invalidate();}});};
  const first=close(),second=close();assert(cleared);assert.equal(token,'');assert(readSignal.aborted);assert(!f.session.isUsable());const stateCount=f.states.length;
  await Promise.resolve();assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/live/crm/catalog/auth/sign-out');assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.body,'{}');assert.equal(calls[0].options.headers.Authorization,'Bearer synthetic-crm-logout');assert.equal(calls[0].options.redirect,'error');
  pending.resolve(envelope());await read;assert.equal(f.states.length,stateCount);assert.equal(f.expired(),0);assert(!f.session.isUsable());
  logout.resolve(Response.json({success:true,data:{connected:false}}));assert.deepEqual(await first,{serverSignOutConfirmed:true});assert.deepEqual(await second,{serverSignOutConfirmed:false});assert.equal(calls.length,1);
 }finally{f.session.close();globalThis.fetch=previous;}
});

test('CRM-only mode expires the CRM session for every 401, including old ERP-session errors',async()=>{
 for(const code of ['AUTH_TOKEN_EXPIRED','AUTH_TOKEN_INVALID','USER_ERP_SESSION_REQUIRED','WHATSAPP_CRM_AUTH_TOKEN_REQUIRED','CATALOG_SESSION_REVOKED','UNRECOGNIZED_401']) {
  const f=fixture({catalogProducts:async()=>{throw fail(401,code);}}, {authMode:'crm'});await f.session.read();assert.equal(f.expired(),1);assert.equal(f.latest().state,'blocked');assert.deepEqual(f.latest().products,[]);assert(!f.session.isUsable());assert(!f.states.some(s=>s.state==='credentials'));assert.equal(f.timers.size,0);f.session.close();
 }
});

test('CRM-only permission denial remains denied without logging out or offering ERP login',async()=>{
 for(const code of ['ERP_PRODUCT_PERMISSION_REQUIRED','CRM_CATALOG_SCOPE_REQUIRED','AUTH_TOKEN_EXPIRED']) {
  const f=fixture({catalogProducts:async()=>{throw fail(403,code);}}, {authMode:'crm'});await f.session.read();assert.equal(f.expired(),0);assert.equal(f.latest().state,'blocked');assert.match(f.latest().message,/CRM hesabının/);assert.deepEqual(f.latest().products,[]);assert(!f.session.isUsable());f.session.close();
 }
});

test('CRM-only mode cannot request catalog data without a CRM token',async()=>{
 const f=fixture({}, {authMode:'crm',token:''});await f.session.read();await f.session.signIn({username:'unused',password:'unused'});await f.session.disconnect();assert.equal(f.calls.length,0);assert.equal(f.states.length,0);assert(!f.session.isUsable());f.session.close();
});

test('CRM-only view expiry clears products and offers a read check without ERP credentials',async()=>{
 const f=fixture({}, {authMode:'crm'});await f.session.read();const timer=[...f.timers.values()][0];f.advance(MAX_CATALOG_VIEW_MS);timer.fn();assert.equal(f.latest().state,'idle');assert.deepEqual(f.latest().products,[]);assert.doesNotMatch(f.latest().message,/ERP hesab|giriş/);assert.equal(f.expired(),0);await f.session.read();assert.equal(f.latest().state,'ready');assert.deepEqual(f.calls.map(c=>c.kind),['read','read']);f.session.close();
});

test('CRM-only photo and output 401s invalidate access and return to CRM login',async()=>{
 const photo=fixture({catalogPhoto:async()=>{throw fail(401,'AUTH_TOKEN_INVALID');}}, {authMode:'crm'});await photo.session.read();await assert.rejects(()=>photo.session.photo(photo.latest().products[0]));assert.equal(photo.expired(),1);assert.equal(photo.latest().state,'blocked');assert(!photo.session.isUsable());photo.session.close();
 let reads=0;const output=fixture({catalogProducts:async()=>{if(++reads===1)return envelope();throw fail(401,'AUTH_TOKEN_INVALID');}}, {authMode:'crm'});await output.session.read();await assert.rejects(()=>output.session.verifyOutput());assert.equal(output.expired(),1);assert.equal(output.latest().state,'blocked');assert(!output.session.isUsable());output.session.close();
});

test('CRM-only photo and output 403 remain denied even with a contradictory expiry code',async()=>{
 const photo=fixture({catalogPhoto:async()=>{throw fail(403,'AUTH_TOKEN_EXPIRED');}}, {authMode:'crm'});await photo.session.read();await assert.rejects(()=>photo.session.photo(photo.latest().products[0]));assert.equal(photo.expired(),0);assert.equal(photo.latest().state,'blocked');assert(!photo.session.isUsable());photo.session.close();
 let reads=0;const output=fixture({catalogProducts:async()=>{if(++reads===1)return envelope();throw fail(403,'AUTH_TOKEN_EXPIRED');}}, {authMode:'crm'});await output.session.read();await assert.rejects(()=>output.session.verifyOutput());assert.equal(output.expired(),0);assert.equal(output.latest().state,'blocked');assert(!output.session.isUsable());output.session.close();
});

test('CRM-only late token denial cannot log out a replacement context',async()=>{
 const pending=deferred();const f=fixture({catalogProducts:()=>pending.promise}, {authMode:'crm'});const work=f.session.read();f.invalidate();pending.reject(fail(401,'AUTH_TOKEN_INVALID'));await work;assert.equal(f.expired(),0);assert(!f.session.isUsable());f.session.close();
});

test('CRM-only reads, photos and output checks preserve known 401/403 when the error body times out',async()=>{
 const previousFetch=globalThis.fetch,previousTimeout=globalThis.setTimeout;
 try {
  globalThis.setTimeout=(fn,ms,...args)=>previousTimeout(fn,ms===20000?5:ms,...args);
  for(const status of [401,403])for(const phase of ['read','photo','output']) {
   let calls=0;globalThis.fetch=async(_url,options)=>{calls++;return new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new DOMException('Synthetic abort','AbortError')),{once:true});}}),{status,headers:{'Content-Type':'application/json'}});};
   let reads=0;const f=fixture({catalogProducts:phase==='read'?liveApi.catalogProducts:phase==='output'?async(...args)=>++reads===1?envelope():liveApi.catalogProducts(...args):async()=>envelope(),catalogPhoto:liveApi.catalogPhoto},{authMode:'crm'});
   await f.session.read();if(phase==='photo')await assert.rejects(()=>f.session.photo(f.latest().products[0]));if(phase==='output')await assert.rejects(()=>f.session.verifyOutput());
   assert.equal(calls,1,`${status} ${phase} must not retry`);assert.equal(f.expired(),status===401?1:0,`${status} ${phase} CRM expiry`);assert.equal(f.latest().state,'blocked');assert.equal(f.latest().diagnostic.status,status);assert.equal(f.latest().diagnostic.code,'CRM_REQUEST_TIMEOUT');assert(!f.session.isUsable());f.session.close();
  }
 }finally{globalThis.fetch=previousFetch;globalThis.setTimeout=previousTimeout;}
});

test('caller cancellation of an error body remains cancellation rather than expiring a replacement CRM session',async()=>{
 const previousFetch=globalThis.fetch;let transportReady;
 try {
  const ready=new Promise(resolve=>transportReady=resolve);
  globalThis.fetch=async(_url,options)=>new Response(new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new DOMException('Synthetic cancel','AbortError')),{once:true});transportReady();}}),{status:401,headers:{'Content-Type':'application/json'}});
  const f=fixture({catalogProducts:liveApi.catalogProducts},{authMode:'crm'});const work=f.session.read();await ready;f.session.close();await work;assert.equal(f.expired(),0);assert(!f.session.isUsable());
 }finally{globalThis.fetch=previousFetch;}
});

test('safe catalog diagnostics expose only bounded HTTP status and allowlisted symbolic codes',()=>{
 assert.deepEqual(catalogErrorDiagnostic({status:500,code:'WHATSAPP_CRM_INTERNAL_ERROR',message:'secret',body:{password:'secret'},token:'secret'}),{status:500,code:'WHATSAPP_CRM_INTERNAL_ERROR'});
 for(const value of [{status:'401',code:'Bearer secret'},{status:999,code:'SECRET_PRIVATE_VALUE'},{status:200,code:'https://private.example/?token=secret'},{message:'secret',body:'secret'}]) {
  const result=catalogErrorDiagnostic(value);assert.deepEqual(result,{status:null,code:'UNCLASSIFIED_ERROR'});assert.doesNotMatch(JSON.stringify(result),/secret|private|Bearer/i);
 }
 assert.deepEqual(catalogAccessError(fail(400,'CATALOG_CONTRACT_INVALID')).diagnostic,{status:400,code:'CATALOG_CONTRACT_INVALID'});
});
