import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import crypto from 'node:crypto';
import {env} from '../apps/gateway/src/config/env.js';
import {configureTestServerEnvironment} from '../deploy/test-server.mjs';

const privateRoot='C:/Sirket/CRM/runtime/offline-shared-request-fixture';
const journalFile=privateRoot+'/issuer.json',normalFile=privateRoot+'/normal.json',requestFile=privateRoot+'/requests.json';
const settings=()=>({CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'true',CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'false',
 CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS:'["existing-patron-fixture"]',CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:journalFile,CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:requestFile,
 CRM_UI_ORIGIN:'http://127.0.0.1:62700',CRM_TEST_PORT_BASE:'62700',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',
 CRM_ISOLATED_PREPARATION:'true',CRM_SEMIH_TEST_CONTINUE_ENABLED:'false',WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',CRM_TEST_LAN_ADDRESS:'192.168.1.46',
 CRM_NORMAL_REFRESH_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'crm-agent-test-20261011',CRM_NORMAL_REFRESH_JOURNAL_PATH:normalFile});

// The canonical private-path checks stay intact. All fixture journal bytes and
// locks are in memory; no actual shared runtime file is read or written.
function inMemoryFiles(t){
 const files=new Map(),handles=new Map();let serial=100000;
 const owned=value=>typeof value==='string'&&(value===privateRoot||value.startsWith(privateRoot+'/'));
 const missing=()=>Object.assign(Error('offline fixture missing'),{code:'ENOENT'});
 const sync={};for(const key of ['mkdirSync','readFileSync','openSync','writeFileSync','fsyncSync','closeSync','renameSync','unlinkSync'])sync[key]=fs[key];
 t.mock.method(fs,'mkdirSync',(target,...args)=>owned(target)?undefined:sync.mkdirSync(target,...args));
 t.mock.method(fs,'readFileSync',(target,...args)=>{if(!owned(target))return sync.readFileSync(target,...args);if(!files.has(target))throw missing();return files.get(target);});
 t.mock.method(fs,'openSync',(target,...args)=>{if(!owned(target))return sync.openSync(target,...args);if(files.has(target))throw Object.assign(Error('fixture lock'),{code:'EEXIST'});const fd=serial++;files.set(target,'');handles.set(fd,target);return fd;});
 t.mock.method(fs,'writeFileSync',(target,bytes,...args)=>{const name=handles.get(target)||target;if(!owned(name))return sync.writeFileSync(target,bytes,...args);files.set(name,String(bytes));});
 t.mock.method(fs,'fsyncSync',fd=>handles.has(fd)?undefined:sync.fsyncSync(fd));
 t.mock.method(fs,'closeSync',fd=>handles.has(fd)?handles.delete(fd):sync.closeSync(fd));
 t.mock.method(fs,'renameSync',(from,to)=>{if(!owned(from)||!owned(to))return sync.renameSync(from,to);if(!files.has(from))throw missing();files.set(to,files.get(from));files.delete(from);});
 t.mock.method(fs,'unlinkSync',target=>{if(!owned(target))return sync.unlinkSync(target);if(!files.delete(target))throw missing();});
 const async={};for(const key of ['lstat','mkdir','open','readFile','rename','unlink'])async[key]=fsp[key];
 t.mock.method(fsp,'lstat',async target=>{
  if(target===privateRoot)return {isDirectory:()=>true,isSymbolicLink:()=>false};
  if(!owned(target))return async.lstat(target);
  if(!files.has(target))throw missing();return {isFile:()=>true,isSymbolicLink:()=>false,size:Buffer.byteLength(files.get(target))};
 });
 t.mock.method(fsp,'mkdir',(target,...args)=>owned(target)?Promise.resolve():async.mkdir(target,...args));
 t.mock.method(fsp,'open',async(target,...args)=>{if(!owned(target))return async.open(target,...args);if(files.has(target))throw Object.assign(Error('fixture lock'),{code:'EEXIST'});files.set(target,'');return {writeFile:async bytes=>files.set(target,String(bytes)),sync:async()=>{},close:async()=>{}};});
 t.mock.method(fsp,'readFile',async(target,...args)=>{if(!owned(target))return async.readFile(target,...args);if(!files.has(target))throw missing();return files.get(target);});
 t.mock.method(fsp,'rename',async(from,to)=>{if(!owned(from)||!owned(to))return async.rename(from,to);if(!files.has(from))throw missing();files.set(to,files.get(from));files.delete(from);});
 t.mock.method(fsp,'unlink',async target=>{if(!owned(target))return async.unlink(target);if(!files.delete(target))throw missing();});
 syncBuiltinESMExports();return files;
}

test('baseline cannot silently activate product requests or replace owner-selected settings',()=>{
 const runtime={...settings(),CRM_BASELINE_ENV:'synthetic-baseline'};
 configureTestServerEnvironment(process.cwd(),{env:runtime,loadBaseline:()=>{Object.assign(runtime,{CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'false',CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:'C:/foreign.json',CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS:'["foreign"]',CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:'C:/foreign-refresh.json',CRM_SEMIH_TEST_CONTINUE_ENABLED:'true'});return {parsed:{}};}});
 assert.equal(runtime.CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED,'true');assert.equal(runtime.CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE,requestFile);
 assert.equal(runtime.CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH,journalFile);assert.equal(runtime.CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS,settings().CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS);
 assert.equal(runtime.CRM_SEMIH_TEST_CONTINUE_ENABLED,'false');assert.equal(runtime.WHATSAPP_SEND_ENABLED,'false');assert.equal(runtime.CRM_PAID_AI_ENABLED,'false');
 const disabled={CRM_BASELINE_ENV:'synthetic-baseline'};configureTestServerEnvironment(process.cwd(),{env:disabled,loadBaseline:()=>{disabled.CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED='true';disabled.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF='true';return {parsed:{}};}});
 assert.equal(disabled.CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED,'false');assert.equal(disabled.CRM_CUSTOMER_PRODUCT_REQUEST_PROOF,'false');
});

test('normal shared request mount preserves role/session families, request state and upstream write denial',{skip:process.platform!=='win32'},async t=>{
 const files=inMemoryFiles(t),config=settings(),keys=Object.keys(config),before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const authBefore={...env.auth,users:env.auth.users},chatwootBefore={...env.chatwoot},whatsappBefore={...env.whatsapp};
 const nativeFetch=globalThis.fetch;
 Object.assign(process.env,config);
 const password='Only-offline-shared-request-2026!',salt='offline-request-normal',passwordHash=`scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`;
 const owner={id:'existing-patron-fixture',username:'existing-patron-fixture',displayName:'Fixture owner',role:'patron',active:true,chatwootAgentId:2,passwordHash};
 const staff={...owner,id:'crm-agent-test-20261011',username:'crm-agent-test',role:'personel',chatwootAgentId:3};
 const other={...staff,id:'other-personel-fixture',username:'other-personel-fixture',chatwootAgentId:4};
 const unselected={...owner,id:'unselected-owner-fixture',username:'unselected-owner-fixture'};
 Object.assign(env.auth,{jwtSecret:'offline-shared-request-secret-longer-than-thirty-two',issuer:'offline-shared-request',audience:'offline-request-browser',tokenExpiresIn:'5m',personnelCanSend:false,loginRateLimitMax:1000,users:[owner,staff,other,unselected]});
 Object.assign(env.chatwoot,{baseUrl:'http://fixture-chatwoot.invalid',accountId:1,inboxId:2,apiAccessToken:'offline-read-only',includeGroups:false});
 Object.assign(env.whatsapp,{testNumberOnly:true,allowedTestNumbers:['905387217733'],sendEnabled:false,liveSendApproved:false,provider:'evolution'});
 let assigned=3;const upstream=[];
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);if(!url.startsWith('http://fixture-chatwoot.invalid/'))return nativeFetch(input,options);
  upstream.push({url,method:options.method});assert.equal(options.method,'GET');
  return Response.json({id:55,account_id:1,inbox_id:2,meta:{sender:{id:101,phone_number:'+905387217733'},assignee:{id:assigned}}});
 };
 // Issue an actual official login before the feature is enabled, as an old
 // grantless browser JWT would have been issued. Never forge its claims.
 process.env.CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED='false';
 const legacyAuth=await import('../apps/gateway/src/services/crmAuthService.js?offline-shared-request-legacy');
 const legacyLogin=legacyAuth.authenticateCrmUser({username:owner.username,password});
 process.env.CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED='true';
 const auth=await import('../apps/gateway/src/services/crmAuthService.js');
 const {Router}=await import('../apps/gateway/node_modules/express/index.js');
 const {createApp}=await import('../apps/gateway/src/app.js');
 const {createTestCustomerProductRequestIntegration}=await import('../deploy/test-server.mjs');
 const product=id=>({id,stockCode:id==='erp-36724'?'8023':'101',productName:id==='erp-36724'?'CONCEPT':'BEBESSI',active:true,isActive:true,status:'active',hold:{blocked:false},photo:{verified:true,validationStatus:'CONFIRMED'},photoStatus:'guarded-path',photoPath:`/crm/catalog/products/${id}/photo`});
 const readerCalls=[];let afterSourceRead=()=>{};
 const catalogReader=async request=>{
  const verified=auth.captureNormalCrmAuthority(request.headers.get('authorization').slice(7));assert.equal(verified.user.id,owner.id);
  const url=new URL(request.url);readerCalls.push(url.pathname);afterSourceRead();
  const meta={sourceDatabaseVerified:true,cached:false,page:Number(url.searchParams.get('page')||1),limit:Number(url.searchParams.get('limit')||24),total:2,totalPages:1,hasNextPage:false,facets:{categories:[]}};
  if(url.pathname.endsWith('/photo'))return new Response(new Uint8Array([255,216,255,...Array(9).fill(1)]),{headers:{'content-type':'image/jpeg'}});
  const id=url.pathname.split('/')[4];return Response.json({success:true,data:id?product(id):[product('erp-36724'),product('erp-30740')],meta});
 };
 const binding=await createTestCustomerProductRequestIntegration({Router,catalogReader});
 const app=createApp({customerProductRequestRouter:binding.router});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin=config.CRM_UI_ORIGIN,base=`http://127.0.0.1:${server.address().port}`;
 const call=(route,{method='GET',token,body,requestOrigin=origin}={})=>nativeFetch(base+route,{method,headers:{origin:requestOrigin,...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 let issued,login,staffLogin,requestId;
 try{
  await t.test('official normal login issues a separate family without helper or changes to personel',async()=>{
   staffLogin=auth.authenticateCrmUser({username:staff.username,password});const preserved=files.get(normalFile);
   const response=await call('/auth/login',{method:'POST',body:{username:owner.username,password}});assert.equal(response.status,200);login=(await response.json()).data;
   assert(login.refreshToken);assert.equal(response.headers.get('set-cookie'),null);assert.equal(login.user.role,'patron');assert.equal(login.user.normalTestScope,undefined);assert.equal(login.user.customerProductRequestIssuer,true);
   assert.equal(auth.captureNormalCrmAuthority(login.accessToken).user.id,owner.id);assert.equal(files.get(normalFile),preserved);assert.equal(auth.verifyCrmAccessToken(staffLogin.accessToken).role,'personel');
   assert.deepEqual((await (await call('/auth/remembered')).json()).data,{enabled:false,user:null});
   const ordinary=auth.authenticateCrmUser({username:unselected.username,password});assert.equal(ordinary.refreshToken,undefined);assert.throws(()=>auth.captureNormalCrmAuthority(ordinary.accessToken),{code:'CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED'});
   assert.equal((await call('/crm/customer-product-requests/sessions',{method:'POST',token:staffLogin.accessToken,body:{conversationId:'55'}})).status,403);
   for(const secret of [password,login.accessToken,login.refreshToken])assert.equal(files.get(journalFile).includes(secret),false);
  });
  await t.test('feature-enabled me leaves official legacy login nonissuer and browser can close and relogin',async()=>{
   assert.equal(legacyLogin.refreshToken,undefined);assert.equal(legacyLogin.user.customerProductRequestIssuer,undefined);
   assert.equal(auth.publicCrmUser(auth.findCrmUserById(owner.id)).customerProductRequestIssuer,undefined);
   const legacyMe=await call('/auth/me',{token:legacyLogin.accessToken});assert.equal(legacyMe.status,200);
   const legacyUser=(await legacyMe.json()).data;assert.equal(legacyUser.customerProductRequestIssuer,undefined);
   assert.deepEqual(legacyUser.permissions,login.user.permissions);assert.equal(legacyMe.headers.get('set-cookie'),null);
   assert.throws(()=>auth.captureNormalCrmAuthority(legacyLogin.accessToken),{code:'CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED'});
   assert.equal((await call('/crm/customer-product-requests/sessions',{method:'POST',token:legacyLogin.accessToken,body:{conversationId:'55'}})).status,401);
   const journal=files.get(journalFile),personnel=files.get(normalFile);
   const browserBefore=globalThis.window,fetchBefore=globalThis.fetch,browserCalls=[];
   const storage=new Map([['melisa-crm-access-token',legacyLogin.accessToken]]);
   globalThis.window={location:{origin,pathname:'/',search:'?login=roles'},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
   globalThis.fetch=async(input,options={})=>{
    if(typeof input!=='string'||!input.startsWith('/api/live/'))return fetchBefore(input,options);
    const response=await nativeFetch(base+input.slice('/api/live'.length),{...options,headers:{origin,...options.headers}});
    browserCalls.push({path:input,status:response.status});return response;
   };
   try{
    const {liveApi}=await import('../apps/frontend/src/liveApi.js?offline-shared-request-legacy-reloaded-browser');
    assert.equal((await liveApi.session(legacyLogin.accessToken)).customerProductRequestIssuer,undefined);
    await liveApi.clearNormalSession(legacyLogin.accessToken);
    assert.equal(browserCalls.some(row=>row.path==='/api/live/auth/logout'),false);
    assert.equal(files.get(journalFile),journal);assert.equal(files.get(normalFile),personnel);
    const fresh=await liveApi.login(owner.username,password);assert.equal(fresh.user.customerProductRequestIssuer,true);
    assert.equal((await liveApi.session(fresh.accessToken)).customerProductRequestIssuer,true);
    assert.equal(browserCalls.filter(row=>row.path==='/api/live/auth/login').length,1);
    auth.logoutNormalCrmSession(fresh.refreshToken);
   }finally{globalThis.fetch=fetchBefore;if(browserBefore===undefined)delete globalThis.window;else globalThis.window=browserBefore;}
   assert.equal(auth.verifyCrmAccessToken(legacyLogin.accessToken).id,owner.id);
   assert.equal(auth.verifyCrmAccessToken(staffLogin.accessToken).id,staff.id);assert.equal(files.get(normalFile),personnel);
  });
  await t.test('shared routes issue/select/submit/reopen exactly one CRM-only request with original photo',async()=>{
   const denied=await call('/crm/customer-product-requests/sessions',{method:'POST',token:login.accessToken,body:{conversationId:'55'},requestOrigin:'http://192.168.1.47:62700'});assert.equal(denied.status,403);
   const response=await call('/crm/customer-product-requests/sessions',{method:'POST',token:login.accessToken,body:{conversationId:'55'},requestOrigin:'http://192.168.1.46:62700'});assert.equal(response.status,200);issued=(await response.json()).data;
   const list=await call('/customer-product-requests/products',{token:issued.capability});assert.equal(list.status,200);assert.equal((await list.json()).data.length,2);
   const draft=await call('/customer-product-requests/draft',{method:'PUT',token:issued.capability,body:{revision:0,items:[{productId:'erp-36724',quantity:3},{productId:'erp-30740',quantity:2}]}});assert.equal(draft.status,200);
   assert.equal((await call('/customer-product-requests/products/erp-36724/photo',{token:issued.capability})).status,200);
   const operation={revision:1,operationId:crypto.randomUUID()};
   const submitted=await call('/customer-product-requests/submit',{method:'POST',token:issued.capability,body:operation});assert.equal(submitted.status,200);const data=(await submitted.json()).data;requestId=data.request.id;assert.equal(data.request.quantityTotal,5);
   assert.equal((await call('/customer-product-requests/submit',{method:'POST',token:issued.capability,body:operation})).status,200);
   assert.equal((await (await call('/customer-product-requests/session',{token:issued.capability})).json()).data.request.id,requestId);
   assert.equal(JSON.parse(files.get(requestFile)).requests.length,1);
   for(const secret of [issued.capability,login.accessToken,login.refreshToken,password])assert.equal(files.get(requestFile).includes(secret),false);
  });
  await t.test('assigned normal personel sees same persisted request; wrong personel/role/token families cannot',async()=>{
   const visible=await call('/crm/customer-product-requests?conversationId=55',{token:staffLogin.accessToken});assert.equal(visible.status,200);assert.equal((await visible.json()).data[0].id,requestId);
   const detail=await call('/crm/customer-product-requests/'+requestId,{token:staffLogin.accessToken});assert.equal(detail.status,200);assert.equal((await detail.json()).data.quantityTotal,5);
   const stranger=auth.authenticateCrmUser({username:other.username,password});for(const path of ['/crm/customer-product-requests?conversationId=55','/crm/customer-product-requests/'+requestId])assert.equal((await call(path,{token:stranger.accessToken})).status,403);
   assert.equal((await call('/customer-product-requests/session',{token:login.accessToken})).status,401);
   assert.equal((await call('/crm/customer-product-requests?conversationId=55',{token:issued.capability})).status,401);
   const restarted=await createTestCustomerProductRequestIntegration({Router,catalogReader});const persisted=await restarted.service.staffGet(auth.verifyCrmAccessToken(staffLogin.accessToken),requestId);assert.equal(persisted.quantityTotal,5);
   await assert.rejects(()=>restarted.service.products(issued.capability),{code:'CUSTOMER_REQUEST_SOURCE_UNAVAILABLE'});
   assert.equal(JSON.parse(files.get(requestFile)).requests.length,1);
  });
  await t.test('a different official family cannot supply the retained reader and fresh role/config changes deny before source access',async()=>{
   const original=files.get(requestFile),data=JSON.parse(original),second=auth.authenticateCrmUser({username:owner.username,password});
   const secondAuthority=auth.captureNormalCrmAuthority(second.accessToken).authority;
   data.sessions.find(session=>session.id===issued.sessionId).issuer=secondAuthority;files.set(requestFile,JSON.stringify(data));
   const reads=readerCalls.length;
   assert.equal((await call('/customer-product-requests/products',{token:issued.capability})).status,503);assert.equal(readerCalls.length,reads);
   files.set(requestFile,original);auth.logoutNormalCrmSession(second.refreshToken);
   owner.role='personel';assert.equal((await call('/customer-product-requests/products',{token:issued.capability})).status,401);owner.role='patron';
   process.env.WHATSAPP_SEND_ENABLED='true';
   assert.throws(()=>createApp({customerProductRequestRouter:binding.router}),{code:'CUSTOMER_REQUEST_SHARED_TEST_REQUIRED'});
   assert.equal((await call('/customer-product-requests/products',{token:issued.capability})).status,401);process.env.WHATSAPP_SEND_ENABLED='false';
   assert.equal(readerCalls.length,reads);assert.equal(files.get(requestFile),original);assert.equal(auth.verifyCrmAccessToken(staffLogin.accessToken).id,staff.id);
  });
  await t.test('assignment changing during source read never returns data or changes the single persisted request',async()=>{
   const preserved=files.get(requestFile);afterSourceRead=()=>{assigned=4;};
   try{assert.equal((await call('/customer-product-requests/products',{token:issued.capability})).status,401);assert.equal(files.get(requestFile),preserved);}
   finally{assigned=3;afterSourceRead=()=>{};}
  });
  await t.test('upstream mutations stay closed while normal refresh/logout revoke capability without harming personel',async()=>{
   for(const [path,method]of [['/crm/conversations/55/messages','POST'],['/crm/conversations/55/assign','POST'],['/webhooks/waapi','POST']])assert.equal((await call(path,{method,token:login.accessToken,body:{}})).status,403);
   const captured=auth.captureNormalCrmAuthority(login.accessToken),preserved=files.get(normalFile);
   const rotated=await call('/auth/refresh',{method:'POST',body:{refreshToken:login.refreshToken}});assert.equal(rotated.status,200);const next=(await rotated.json()).data;assert.equal(auth.captureNormalCrmAuthority(next.accessToken).authority.normalSessionId,captured.authority.normalSessionId);
   assert.equal(next.user.customerProductRequestIssuer,true);assert.equal((await (await call('/auth/me',{token:next.accessToken})).json()).data.customerProductRequestIssuer,true);assert.equal(rotated.headers.get('set-cookie'),null);
   const stopped=await call('/auth/logout',{method:'POST',body:{refreshToken:login.refreshToken}});assert.equal(stopped.status,200);
   assert.throws(()=>auth.verifyNormalCrmAuthority(captured.authority),{statusCode:401});assert.throws(()=>auth.verifyCrmAccessToken(next.accessToken),{statusCode:401});
   const reads=readerCalls.length;assert.equal((await call('/customer-product-requests/products',{token:issued.capability})).status,401);assert.equal(readerCalls.length,reads);
   assert.equal(files.get(normalFile),preserved);assert.equal(auth.verifyCrmAccessToken(staffLogin.accessToken).id,staff.id);assert.equal(JSON.parse(files.get(requestFile)).requests.length,1);
   assert(upstream.every(row=>row.method==='GET'));
  });
  await t.test('reloaded browser access-only logout revokes only its own family and refuses mixed credentials',async()=>{
   const fresh=auth.authenticateCrmUser({username:owner.username,password}),independent=auth.authenticateCrmUser({username:owner.username,password});
   const makeLink=async token=>(await (await call('/crm/customer-product-requests/sessions',{method:'POST',token,body:{conversationId:'55'}})).json()).data;
   const ownLink=await makeLink(fresh.accessToken),otherLink=await makeLink(independent.accessToken);
   const journal=files.get(journalFile),personnel=files.get(normalFile),state=files.get(requestFile);
   for(const rejected of [
    {token:fresh.accessToken,body:{refreshToken:independent.refreshToken}},
    {token:staffLogin.accessToken,body:{}},
    {token:fresh.accessToken,body:{normalSessionId:auth.captureNormalCrmAuthority(independent.accessToken).authority.normalSessionId}},
   ])assert.equal((await call('/auth/logout',{method:'POST',...rejected})).status,401);
   assert.equal(files.get(journalFile),journal);assert.equal(files.get(normalFile),personnel);assert.equal(files.get(requestFile),state);
   // Use the production frontend API in a fresh module (page reload): only its
   // already password-issued access JWT remains; no refresh secret was persisted.
   const browserBefore=globalThis.window,fetchBefore=globalThis.fetch,browserCalls=[];
   const storage=new Map([['melisa-crm-access-token',fresh.accessToken]]);
   globalThis.window={location:{origin,pathname:'/',search:'?login=roles'},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
   globalThis.fetch=async(input,options={})=>{
    if(typeof input!=='string'||!input.startsWith('/api/live/'))return fetchBefore(input,options);
    const response=await nativeFetch(base+input.slice('/api/live'.length),{...options,headers:{origin,...options.headers}});
    browserCalls.push({path:input,status:response.status,body:options.body,authorization:options.headers?.Authorization,credentials:options.credentials});return response;
   };
   try{
    const {liveApi}=await import('../apps/frontend/src/liveApi.js?offline-shared-request-reloaded-browser');
    assert.equal((await liveApi.session(fresh.accessToken)).customerProductRequestIssuer,true);
    await liveApi.clearNormalSession(fresh.accessToken);
    const closed=browserCalls.find(row=>row.path==='/api/live/auth/logout');assert.equal(closed.status,200);assert.equal(closed.body,'{}');assert.equal(closed.authorization,'Bearer '+fresh.accessToken);assert.equal(closed.credentials,'omit');
    assert.equal(storage.has('refreshToken'),false);
   }finally{globalThis.fetch=fetchBefore;if(browserBefore===undefined)delete globalThis.window;else globalThis.window=browserBefore;}
   assert.throws(()=>auth.verifyCrmAccessToken(fresh.accessToken),{statusCode:401});assert.throws(()=>auth.refreshNormalCrmSession(fresh.refreshToken),{statusCode:401});
   assert.equal((await call('/customer-product-requests/session',{token:ownLink.capability})).status,401);
   assert.equal((await call('/customer-product-requests/session',{token:otherLink.capability})).status,200);
   assert.equal(auth.verifyCrmAccessToken(independent.accessToken).id,owner.id);assert.equal(auth.verifyCrmAccessToken(staffLogin.accessToken).id,staff.id);
   assert.equal(files.get(normalFile),personnel);assert.equal(files.get(requestFile),state);assert.equal(JSON.parse(state).requests.length,1);
  });
 }finally{
  await new Promise(resolve=>server.close(resolve));globalThis.fetch=nativeFetch;Object.assign(env.auth,authBefore);Object.assign(env.chatwoot,chatwootBefore);Object.assign(env.whatsapp,whatsappBefore);
  for(const[key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;
  t.mock.restoreAll();syncBuiltinESMExports();
 }
});
