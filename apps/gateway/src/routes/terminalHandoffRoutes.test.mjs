import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
import {createRememberedNormalSession} from '../../../frontend/src/nativeSessionBridge.js';
import {createTerminalSessionLoader} from '../../../frontend/src/sessionLoader.js';

// Same exact Windows journal/policy as production; only its bytes are replaced
// by this test-local memory filesystem. Shared runtime/SQL is never touched.
function memoryJournal(t,file){
 const files=new Map(),handles=new Map();let counter=100000;
 const owned=v=>typeof v==='string'&&(v===file||v.startsWith(file+'.'));
 const missing=()=>Object.assign(Error('fixture missing'),{code:'ENOENT'});
 const original={};for(const n of ['mkdirSync','readFileSync','openSync','writeFileSync','fsyncSync','closeSync','renameSync','unlinkSync'])original[n]=fs[n];
 t.mock.method(fs,'mkdirSync',(dir,...args)=>dir===file.slice(0,file.lastIndexOf('/'))?undefined:original.mkdirSync(dir,...args));
 t.mock.method(fs,'readFileSync',(target,...args)=>{if(!owned(target))return original.readFileSync(target,...args);if(!files.has(target))throw missing();return files.get(target);});
 t.mock.method(fs,'openSync',(target,...args)=>{if(!owned(target))return original.openSync(target,...args);if(files.has(target))throw Object.assign(Error('fixture lock'),{code:'EEXIST'});files.set(target,'');const fd=counter++;handles.set(fd,target);return fd;});
 t.mock.method(fs,'writeFileSync',(target,value,...args)=>{const name=handles.get(target)||target;if(!owned(name))return original.writeFileSync(target,value,...args);files.set(name,String(value));});
 t.mock.method(fs,'fsyncSync',fd=>{if(!handles.has(fd))return original.fsyncSync(fd);});
 t.mock.method(fs,'closeSync',fd=>{if(!handles.has(fd))return original.closeSync(fd);handles.delete(fd);});
 t.mock.method(fs,'renameSync',(a,b)=>{if(!owned(a)||!owned(b))return original.renameSync(a,b);if(!files.has(a))throw missing();files.set(b,files.get(a));files.delete(a);});
 t.mock.method(fs,'unlinkSync',target=>{if(!owned(target))return original.unlinkSync(target);if(!files.delete(target))throw missing();});
 return files;
}

test('terminal handoff uses the existing real CRM routes and normal grant engine',{skip:process.platform!=='win32'},async t=>{
 const random=()=>crypto.randomBytes(32).toString('base64url'),file='C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json';
 const config={CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_PORT_BASE:'62800',
  CRM_UI_ORIGIN:'http://127.0.0.1:62800',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',
  CRM_NORMAL_REFRESH_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'clean-staff-20261022',CRM_NORMAL_REFRESH_JOURNAL_PATH:file,
  CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'false',CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'false',CRM_SEMIH_TEST_CONTINUE_ENABLED:'false',CRM_ASSIGNED_STAFF_REFRESH_ENABLED:'false',
  WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',CRM_TERMINAL_HANDOFF_ENABLED:'true',CRM_TERMINAL_PEER_KEY:random(),
  CRM_CLEAN_CONVERSATION_PROJECTION_JSON:JSON.stringify({version:1,environment:'CLEAN_SYNTHETIC_TEST',synthetic:true,environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',conversations:[
   {id:'55',phone:'905550000001',name:'Örnek Mağaza',assigneeAgentId:2},{id:'56',phone:'905550000002',name:'Diğer Örnek Mağaza',assigneeAgentId:3}]})};
 const beforeEnv=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]]));Object.assign(process.env,config);
 const beforeAuth={...env.auth},beforeCors=env.cors.origins,beforeWa={...env.whatsapp},beforeRead=env.chatwoot.inboxReadEnabled;
 const password=random(),salt='isolated-terminal-fixture';
 const user={id:'clean-staff-20261022',username:'ornek-personel',displayName:'Örnek Personel',role:'personel',active:true,chatwootAgentId:2,
  passwordHash:`scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`};
 const originalUser={...user};
 const stranger={...user,id:'clean-stranger-20261022',username:'ornek-diger',displayName:'Diğer Örnek Personel',chatwootAgentId:3};
 Object.assign(env.auth,{jwtSecret:random()+random(),issuer:'isolated-terminal-normal',audience:'isolated-terminal-ui',tokenExpiresIn:'5m',personnelCanSend:true,loginRateLimitMax:1000,users:[user,stranger]});
 Object.assign(env.whatsapp,{sendEnabled:false,liveSendApproved:false,provider:'evolution'});env.chatwoot.inboxReadEnabled=false;
 const journal=memoryJournal(t,file),grants=()=>JSON.parse(journal.get(file)||'{"grants":[]}').grants;
 const codes=new Map(),links=new Map(),peerCalls=[];let peerDenied=false,peerDown=false,failVerifyAt=0,verifyCount=0,holdVerify=null;
 const freshIdentity=changes=>({version:1,environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',
  erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800',erpUserId:15,erpNormalSessionId:'e1000001-0000-4000-8000-000000000001',
  crmUserId:user.id,chatwootAgentId:2,bindingRevision:'b'.repeat(64),expiresAt:Date.now()+15000,...changes});
 function prepare({identity={},expiresAt=Date.now()+30000}={}){
  const body={code:random(),requestId:crypto.randomUUID(),deviceBinding:crypto.createHash('sha256').update(random()).digest('hex'),codeVerifier:random(),erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800'};
  codes.set(body.code,{body,identity,expiresAt,used:false});return body;
 }
 const originalFetch=globalThis.fetch;let server;
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  if(!String(url).startsWith('http://127.0.0.1:4194/'))return originalFetch(url,options);
  assert(options.headers['x-melisa-terminal-peer']===config.CRM_TERMINAL_PEER_KEY);assert.equal(options.redirect,'error');
  const operation=new URL(url).pathname.split('/').at(-1),body=JSON.parse(options.body);peerCalls.push(operation);
  const denied=()=>Response.json({success:false,error:{code:'fixture-denied'}},{status:403});
  if(peerDown)return new Response(null,{status:503});
  if(operation==='redeem'){
   const code=codes.get(body.code);
   if(peerDenied||!code||code.used||code.expiresAt<=Date.now()||JSON.stringify(body)!==JSON.stringify(code.body))return denied();
   code.used=true;const linkId=random(),linkExpiresAt=Date.now()+90000;
   links.set(linkId,{body,identity:code.identity,linkExpiresAt,revoked:false});
   return Response.json({success:true,data:{version:1,linkId,linkExpiresAt,terminalIdentity:freshIdentity(code.identity)}});
  }
  const link=links.get(body.linkId);
  if(!link||['requestId','deviceBinding','erpOrigin','crmOrigin'].some(key=>link.body[key]!==body[key]))return denied();
  if(operation==='revoke'){link.revoked=true;return Response.json({success:true,data:{revoked:true}});}
  if(operation==='verify'){
   verifyCount++;if(holdVerify)await holdVerify();
   if(peerDenied||link.revoked||verifyCount===failVerifyAt)return denied();
   return Response.json({success:true,data:{version:1,linkExpiresAt:link.linkExpiresAt,terminalIdentity:freshIdentity(link.identity)}});
  }
  throw Error('unexpected peer operation');
 });
 t.after(async()=>{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  Object.assign(env.auth,beforeAuth);env.cors.origins=beforeCors;Object.assign(env.whatsapp,beforeWa);env.chatwoot.inboxReadEnabled=beforeRead;
  for(const[key,value]of Object.entries(beforeEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 });
 const {createApp}=await import('../app.js');const auth=await import('../services/crmAuthService.js');
 server=createApp().listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const origin=`http://127.0.0.1:${server.address().port}`;env.cors.origins=[origin,'http://127.0.0.1:62800'];
 const call=async(path,{body,token,headers={}}={})=>{
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`}:{ }),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,payload:await response.json()};
 };
 const handoff=async body=>call('/auth/terminal-handoff',{body});
 let active;
 await t.test('empty CRM realm receives a normal own-person grant without password or anonymous actor',async()=>{
  const body=prepare(),reply=await handoff(body);assert.equal(reply.status,200);active=reply.payload.data;
  assert(active.refreshToken);assert(active.user.normalRefreshSession);assert.equal(active.user.id,user.id);assert.equal(active.user.terminalIdentity.erpUserId,15);
  assert.equal(grants().length,1);assert(grants()[0].terminalLink);assert(!grants()[0].revoked);
  assert(jwt.decode(active.accessToken).exp*1000<=grants()[0].terminalLink.linkExpiresAt);
  for(const secret of [body.code,body.codeVerifier,config.CRM_TERMINAL_PEER_KEY,password])assert(!journal.get(file).includes(secret));
  const me=await call('/auth/me',{token:active.accessToken});assert.equal(me.status,200);assert.equal(me.payload.data.terminalIdentity.crmUserId,user.id);
  const before=verifyCount,inbox=await call('/crm/inbox',{token:active.accessToken});assert.equal(inbox.status,200);assert.deepEqual(inbox.payload.data.conversations.map(row=>String(row.id)),['55']);assert.equal(verifyCount,before+1);
  assert.equal((await call('/crm/conversations/56',{token:active.accessToken})).status,403);
  assert.equal((await handoff(body)).status,403);
 });
 await t.test('malformed credentials/query/cookie/origin and wrong proof binding never issue another family',async()=>{
  const count=grants().length;
  for(const body of [{...prepare(),username:'other'},{...prepare(),accessToken:random()},{...prepare(),confirmed:true},{...prepare(),deviceBinding:'not-a-device'},{...prepare(),crmOrigin:'http://192.168.1.46:62800'}])assert.equal((await handoff(body)).status,403);
  for(const changes of [{codeVerifier:random()},{requestId:crypto.randomUUID()},{deviceBinding:'c'.repeat(64)}])assert.equal((await handoff({...prepare(),...changes})).status,403);
  assert.equal((await handoff(prepare({expiresAt:Date.now()-1}))).status,403);
  assert.equal((await call('/auth/terminal-handoff?code=refused',{body:prepare()})).status,403);
  assert.equal((await call('/auth/terminal-handoff',{body:prepare(),headers:{cookie:'untrusted=1'}})).status,403);
  assert.equal((await call('/auth/terminal-handoff',{body:prepare(),headers:{origin:'http://other.invalid'}})).status,403);
  assert.equal(grants().length,count);
 });
 await t.test('wrong/unbound ERP-to-CRM person or agent cannot produce a normal grant',async()=>{
  const count=grants().length;
  for(const identity of [{crmUserId:'unbound-user'},{chatwootAgentId:3},{database:'LIVE'},{erpNormalSessionId:[]}])assert.equal((await handoff(prepare({identity}))).status,403);
  assert.equal(grants().length,count);
 });
 await t.test('publish failure revokes only its provisional family and preserves an earlier valid sibling',async()=>{
  failVerifyAt=verifyCount+1;const reply=await handoff(prepare());assert.equal(reply.status,403);failVerifyAt=0;
  assert(grants().at(-1).revoked);assert.equal((await call('/auth/me',{token:active.accessToken})).status,200);
 });
 await t.test('linked refresh rotates normally, rejects replay and cannot use the sync unverified shortcut',async()=>{
  assert.throws(()=>auth.refreshNormalCrmSession(active.refreshToken),{statusCode:403});
  const previous=active,reply=await call('/auth/refresh',{body:{refreshToken:active.refreshToken}});assert.equal(reply.status,200);active=reply.payload.data;
  assert.equal(active.user.terminalIdentity.crmUserId,user.id);assert.notEqual(active.refreshToken,previous.refreshToken);
  assert.equal((await call('/auth/refresh',{body:{refreshToken:previous.refreshToken}})).status,401);
 });
 await t.test('peer outage fails closed without deleting the normal refresh grant',async()=>{
  peerDown=true;assert.equal((await call('/auth/me',{token:active.accessToken})).status,503);peerDown=false;
  assert.equal((await call('/auth/me',{token:active.accessToken})).status,200);
 });
 await t.test('fresh ERP relationship change revokes own CRM family but not a standalone normal sibling',async()=>{
  const sibling=auth.authenticateCrmUser({username:user.username,password});
  const current=grants().find(g=>g.sid===jwt.decode(active.accessToken).normalSessionId);links.get(current.terminalLink.linkId).identity={bindingRevision:'d'.repeat(64)};
  assert.equal((await call('/auth/me',{token:active.accessToken})).status,403);
  assert.equal((await call('/auth/refresh',{body:{refreshToken:active.refreshToken}})).status,401);
  assert.equal((await call('/auth/me',{token:sibling.accessToken})).status,200);
 });
 await t.test('logout while a peer read is pending cannot publish a stale authenticated response',async()=>{
  const reply=await handoff(prepare());assert.equal(reply.status,200);const session=reply.payload.data;
  let entered,release;const began=new Promise(resolve=>entered=resolve),pending=new Promise(resolve=>release=resolve);
  holdVerify=async()=>{entered();await pending;};const me=call('/auth/me',{token:session.accessToken});await began;
  auth.logoutNormalCrmSession(session.refreshToken);holdVerify=null;release();assert.equal((await me).status,401);
 });
 await t.test('ERP revoke is rechecked on the next read and local logout still closes an already-revoked ERP link',async()=>{
  const reply=await handoff(prepare());assert.equal(reply.status,200);const session=reply.payload.data;
  peerDenied=true;assert.equal((await call('/auth/me',{token:session.accessToken})).status,403);
  assert.equal((await call('/auth/logout',{body:{refreshToken:session.refreshToken}})).status,200);peerDenied=false;
  assert.equal((await call('/auth/me',{token:session.accessToken})).status,401);
 });
 await t.test('current CRM role/permission change denies handoff without widening normal policy',async()=>{
  const count=grants().length;user.role='mudur';assert.equal((await handoff(prepare())).status,403);Object.assign(user,originalUser);assert.equal(grants().length,count);
 });
 await t.test('empty protected realm, real CRM API, native refresh manager and assigned loader reopen one normal family',async()=>{
  let saved=null,preparations=0,visible=false;
  const resultOf=reply=>{if(reply.status!==200)throw Object.assign(Error('synthetic API denied'),{status:reply.status,code:reply.payload.error?.code});return reply.payload.data;};
  // The native provider's transport is the fixture here; all downstream CRM
  // issuance, JWT/store/refresh, protected-manager and loader code is real.
  const bridge={get:async()=>{if(!saved){preparations++;const result=resultOf(await handoff(prepare()));
    saved={accessToken:result.accessToken,refreshToken:result.refreshToken,userId:result.user.id,username:result.user.username,expiresAt:result.expiresAt};}return structuredClone(saved);},
   put:async value=>{saved=structuredClone(value);},clear:async()=>{saved=null;}};
  const make=()=>{
   const epochs=new WeakMap(),normal=createRememberedNormalSession({bridge,
    refresh:async refreshToken=>resultOf(await call('/auth/refresh',{body:{refreshToken}})),logout:async refreshToken=>resultOf(await call('/auth/logout',{body:{refreshToken}}))});
   return createTerminalSessionLoader({location:{origin:'http://127.0.0.1:62800',hostname:'127.0.0.1',search:'?terminal=1&erpOrigin=http%3A%2F%2F127.0.0.1%3A5244'},
    api:{resumeNormalSession:async options=>{const resumed=await normal.resume(options);if(!resumed)return null;epochs.set(resumed.result,resumed.epoch);return resumed.result;},
     rememberNormalSession:(result,actor)=>normal.remember(result,actor,epochs.get(result)),
     session:async token=>resultOf(await call('/auth/me',{token})),inbox:async token=>resultOf(await call('/crm/inbox',{token})),clearNormalSession:()=>normal.clear()},
    onCommit:()=>{visible=true;},onInvalidate:()=>{visible=false;},onError:()=>{},onBusy:()=>{}});
  };
  const first=make(),opened=await first.start();assert(opened);assert(visible);assert.equal(preparations,1);assert.equal(opened.session.id,user.id);
  assert.deepEqual(opened.inbox.conversations.map(row=>row.id),['55']);const sid=jwt.decode(saved.accessToken).normalSessionId;
  first.cancel();const reopened=make(),again=await reopened.start();assert(again);assert.equal(preparations,1);assert.equal(jwt.decode(saved.accessToken).normalSessionId,sid);
  const family=grants().find(row=>row.sid===sid);links.get(family.terminalLink.linkId).identity={crmUserId:'clean-stranger-20261022',chatwootAgentId:3};
  await assert.rejects(()=>reopened.verifySession(again.key));assert.equal(visible,false);assert.equal(saved,null);assert(grants().find(row=>row.sid===sid).revoked);
 });
 assert(peerCalls.includes('redeem')&&peerCalls.includes('verify')&&peerCalls.includes('revoke'));
});
