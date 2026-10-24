// Optional read-only cross-repository source conformance. The ERP normal-auth
// callbacks and native vault below are synthetic; this is not an installed GUI,
// physical device or human acceptance test. No SQL/shared file/port is used.
import '../../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {env} from '../../../../apps/gateway/src/config/env.js';
import {createRememberedNormalSession} from '../../../../apps/frontend/src/nativeSessionBridge.js';
import {createTerminalSessionLoader} from '../../../../apps/frontend/src/sessionLoader.js';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const argument=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const erpRoot=argument('erp-source-root'),erpCommit=argument('erp-source-commit');
if(!erpRoot||!path.isAbsolute(erpRoot)||!/^[a-f0-9]{40}$/.test(erpCommit||''))throw Error('Explicit absolute ERP source root and exact commit are required.');
for(const name of ['services/terminalHandoffProvider.mjs','routes/terminalHandoffRoutes.mjs']){
 const relative='apps/api/src/'+name,expected=execFileSync('git',['show',erpCommit+':'+relative],{cwd:erpRoot,encoding:'utf8'});
 assert.equal(fs.readFileSync(path.join(erpRoot,relative),'utf8').replaceAll('\r\n','\n'),expected.replaceAll('\r\n','\n'));
}
const {createTerminalHandoffProvider}=await import(pathToFileURL(path.join(erpRoot,'apps/api/src/services/terminalHandoffProvider.mjs')).href);
const {createTerminalHandoffRoutes}=await import(pathToFileURL(path.join(erpRoot,'apps/api/src/routes/terminalHandoffRoutes.mjs')).href);
const {default:express}=await import(pathToFileURL(path.join(root,'apps/gateway/node_modules/express/index.js')).href);
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

test('ERP/CRM exact source wire and protected consumer conformance',{skip:process.platform!=='win32'},async t=>{
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

 const familyId=crypto.randomUUID(),familyEnd=Date.now()+600000,erpAccess=random(),erpRefresh=random();
 let familyActive=true,relationActive=true;
 const provider=createTerminalHandoffProvider({context:{environment:'CLEAN_SYNTHETIC_TEST',environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',synthetic:true,actualT1:false,externalOperations:false},peerKey:config.CRM_TERMINAL_PEER_KEY,
  confirmErpPair:async(access,refresh)=>{if(!familyActive||access!==erpAccess||refresh!==erpRefresh)throw Error('synthetic pair denied');return {confirmed:true,user:{id:15},normalTestSessionId:familyId,expiresAt:familyEnd};},
  readErpFamily:async(id,sid)=>{if(!familyActive||id!==15||sid!==familyId)throw Error('synthetic family denied');return {user:{id:15},normalTestSessionId:familyId,expiresAt:familyEnd};},
  relationFor:async id=>id===15?{erpUserId:15,crmUserId:user.id,chatwootAgentId:2,bindingRevision:'b'.repeat(64),active:relationActive}:null});
 const erp=express();erp.use(express.json({limit:'4kb'}));erp.use('/api',createTerminalHandoffRoutes({provider,requireAuth:(_req,_res,next)=>next()}));
 const erpServer=erp.listen(0,'127.0.0.1');await new Promise(resolve=>erpServer.once('listening',resolve));
 const erpOrigin='http://127.0.0.1:'+erpServer.address().port,originalFetch=globalThis.fetch;
 const peerBodies=[];
 t.mock.method(globalThis,'fetch',(url,options)=>{
  if(String(url).startsWith('http://127.0.0.1:4194/')){peerBodies.push(options.body);return originalFetch(erpOrigin+new URL(url).pathname,options);}
  return originalFetch(url,options);
 });
 const {createApp}=await import('../../../../apps/gateway/src/app.js');
 const crmServer=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>crmServer.once('listening',resolve));
 const crmOrigin='http://127.0.0.1:'+crmServer.address().port;env.cors.origins=[crmOrigin];
 t.after(async()=>{
  provider.close();for(const server of [erpServer,crmServer]){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  Object.assign(env.auth,beforeAuth);env.cors.origins=beforeCors;Object.assign(env.whatsapp,beforeWa);env.chatwoot.inboxReadEnabled=beforeRead;
  for(const[key,value]of Object.entries(beforeEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 });
 const request=async(origin,route,body,token)=>{
  const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,payload:await response.json()};
 };
 const result=reply=>{if(reply.status!==200)throw Object.assign(Error('source-conformance fixture denied'),{status:reply.status,code:reply.payload.error?.code});return reply.payload.data;};
 async function prepare(){
  const verifier=random(),binding={requestId:crypto.randomUUID(),deviceBinding:crypto.createHash('sha256').update(random()).digest('hex'),erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800'};
  const prepared=result(await request(erpOrigin,'/api/auth/terminal-handoff/prepare',{refreshToken:erpRefresh,...binding,codeChallenge:crypto.createHash('sha256').update(verifier).digest('base64url')},erpAccess));
  return {code:prepared.code,...binding,codeVerifier:verifier};
 }
 let saved=null,preparations=0,visible=false,lastBody;const logoutReceipts=[],errors=[];
 const vault={get:async()=>{if(!saved){lastBody=await prepare();preparations++;const normal=result(await request(crmOrigin,'/auth/terminal-handoff',lastBody));saved={accessToken:normal.accessToken,refreshToken:normal.refreshToken,userId:normal.user.id,username:normal.user.username,expiresAt:normal.expiresAt};}return structuredClone(saved);},put:async value=>{saved=structuredClone(value);},clear:async()=>{saved=null;}};
 const make=()=>{
  const epochs=new WeakMap(),manager=createRememberedNormalSession({bridge:vault,refresh:async token=>result(await request(crmOrigin,'/auth/refresh',{refreshToken:token})),logout:async token=>{const reply=await request(crmOrigin,'/auth/logout',{refreshToken:token});logoutReceipts.push(reply);return result(reply);}});
  return createTerminalSessionLoader({location:{origin:'http://127.0.0.1:62800',hostname:'127.0.0.1',search:'?terminal=1&erpOrigin=http%3A%2F%2F127.0.0.1%3A5244'},
   api:{resumeNormalSession:async options=>{const resumed=await manager.resume(options);if(!resumed)return null;epochs.set(resumed.result,resumed.epoch);return resumed.result;},rememberNormalSession:(value,actor)=>manager.remember(value,actor,epochs.get(value)),
    session:async token=>result(await request(crmOrigin,'/auth/me',undefined,token)),inbox:async token=>result(await request(crmOrigin,'/crm/inbox',undefined,token)),clearNormalSession:()=>manager.clear()},
   onCommit:()=>{visible=true;},onInvalidate:()=>{visible=false;},onError:error=>errors.push(error),onBusy:()=>{}});
 };
 let loader=make(),session;
 await t.test('actual ERP prepare/redeem/verify routes issue own CRM normal grant and assigned inbox from an empty realm',async()=>{
  session=await loader.start();assert(session);assert.equal(session.session.terminalIdentity.erpNormalSessionId,familyId);assert.equal(session.session.id,user.id);
  assert.deepEqual(session.inbox.conversations.map(row=>row.id),['55']);assert.equal(preparations,1);assert(visible);
  for(const secret of [erpAccess,erpRefresh,config.CRM_TERMINAL_PEER_KEY,lastBody.code,lastBody.codeVerifier])assert(!journal.get(file).includes(secret));
  assert(peerBodies.every(body=>!body.includes(erpAccess)&&!body.includes(erpRefresh)));
 });
 await t.test('actual ERP atomic take rejects reused and wrong-device/PKCE tickets without another CRM grant',async()=>{
  const before=grants().length;assert.equal((await request(crmOrigin,'/auth/terminal-handoff',lastBody)).status,403);
  const wrong=await prepare();assert.equal((await request(crmOrigin,'/auth/terminal-handoff',{...wrong,codeVerifier:random()})).status,403);
  const other=await prepare();assert.equal((await request(crmOrigin,'/auth/terminal-handoff',{...other,deviceBinding:'c'.repeat(64)})).status,403);
  assert.equal(grants().length,before);
 });
 await t.test('existing protected manager reopens the same normal CRM family without another handoff',async()=>{
  const old=grants().find(row=>!row.revoked).sid;loader.cancel();loader=make();session=await loader.start();assert(session);assert.equal(preparations,1);assert.equal(grants().find(row=>!row.revoked).sid,old);
 });
 await t.test('actual ERP relation revoke closes own CRM family and vault; repeated missing-link revoke is idempotent',async()=>{
  const closingRefresh=saved.refreshToken;relationActive=false;await assert.rejects(()=>loader.verifySession(session.key));assert.equal(visible,false);assert.equal(saved,null);assert(grants().every(row=>row.revoked));
  assert.equal(logoutReceipts.at(-1)?.status,200);assert.equal(logoutReceipts.at(-1).payload.data.loggedOut,true);
  assert(!errors.some(error=>error.code==='CRM_TERMINAL_CLOSE_UNCONFIRMED'));
  const repeated=await request(crmOrigin,'/auth/logout',{refreshToken:closingRefresh});assert.equal(repeated.status,200);assert.equal(repeated.payload.data.loggedOut,true);
  familyActive=false;const rejected=await request(erpOrigin,'/api/auth/terminal-handoff/prepare',{refreshToken:erpRefresh,requestId:crypto.randomUUID(),deviceBinding:'a'.repeat(64),codeChallenge:random(),erpOrigin:'http://127.0.0.1:5244',crmOrigin:'http://127.0.0.1:62800'},erpAccess);assert.equal(rejected.status,403);
 });
 for(const name of ['services/terminalHandoffProvider.mjs','routes/terminalHandoffRoutes.mjs']){
  const relative='apps/api/src/'+name,expected=execFileSync('git',['show',erpCommit+':'+relative],{cwd:erpRoot,encoding:'utf8'});
  assert.equal(fs.readFileSync(path.join(erpRoot,relative),'utf8').replaceAll('\r\n','\n'),expected.replaceAll('\r\n','\n'));
 }
});
