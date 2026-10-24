import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
import {createRememberedNormalSession} from '../../../frontend/src/nativeSessionBridge.js';

// The exact production path/identity policy runs unchanged. Its journal alone
// is in memory, as in the existing Semih route fixture; no runtime file is used.
function memoryJournal(t,file){
  const files=new Map(),handles=new Map();let counter=100000;
  const owned=value=>typeof value==='string'&&(value===file||value.startsWith(`${file}.`));
  const missing=()=>Object.assign(Error('fixture missing'),{code:'ENOENT'});
  const original={};for(const name of ['mkdirSync','readFileSync','openSync','writeFileSync','fsyncSync','closeSync','renameSync','unlinkSync'])original[name]=fs[name];
  t.mock.method(fs,'mkdirSync',(directory,...args)=>directory===file.slice(0,file.lastIndexOf('/'))?undefined:original.mkdirSync(directory,...args));
  t.mock.method(fs,'readFileSync',(target,...args)=>{if(!owned(target))return original.readFileSync(target,...args);if(!files.has(target))throw missing();return files.get(target);});
  t.mock.method(fs,'openSync',(target,...args)=>{if(!owned(target))return original.openSync(target,...args);if(files.has(target))throw Object.assign(Error('fixture lock'),{code:'EEXIST'});files.set(target,'');const fd=counter++;handles.set(fd,target);return fd;});
  t.mock.method(fs,'writeFileSync',(target,value,...args)=>{const name=handles.get(target)||target;if(!owned(name))return original.writeFileSync(target,value,...args);files.set(name,String(value));});
  t.mock.method(fs,'fsyncSync',fd=>{if(!handles.has(fd))return original.fsyncSync(fd);});
  t.mock.method(fs,'closeSync',fd=>{if(!handles.has(fd))return original.closeSync(fd);handles.delete(fd);});
  t.mock.method(fs,'renameSync',(from,to)=>{if(!owned(from)||!owned(to))return original.renameSync(from,to);if(!files.has(from))throw missing();files.set(to,files.get(from));files.delete(from);});
  t.mock.method(fs,'unlinkSync',target=>{if(!owned(target))return original.unlinkSync(target);if(!files.delete(target))throw missing();});
  return files;
}

test('clean normal password, personnel inbox, refresh, own-family logout and revocation use the existing application',{skip:process.platform!=='win32'},async t=>{
  const file='C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json';
  const config={CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_ISOLATED_PREPARATION:'true',
    CRM_TEST_PORT_BASE:'62800',CRM_UI_ORIGIN:'http://127.0.0.1:62800',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',
    CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',CRM_NORMAL_REFRESH_ENABLED:'true',
    CRM_NORMAL_REFRESH_USER_ID:'clean-staff-20261022',CRM_NORMAL_REFRESH_JOURNAL_PATH:file,
    CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'false',CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'false',
    CRM_SEMIH_TEST_CONTINUE_ENABLED:'false',CRM_ASSIGNED_STAFF_REFRESH_ENABLED:'false',
    WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',
    CRM_CLEAN_CONVERSATION_PROJECTION_JSON:JSON.stringify({version:1,environment:'CLEAN_SYNTHETIC_TEST',synthetic:true,
      environmentId:'e662fd94-d797-4b3b-938a-d143ad758b67',database:'MELISA_ERP_CLEAN_TEST_20261022',conversations:[
        {id:'55',phone:'905550000001',name:'Örnek Mağaza',assigneeAgentId:2},
        {id:'56',phone:'905550000002',name:'Diğer Örnek Mağaza',assigneeAgentId:3},
      ]})};
  const beforeEnv=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]]));
  Object.assign(process.env,config);
  const beforeAuth={...env.auth},beforeCors=env.cors.origins,beforeWa={...env.whatsapp},beforeRead=env.chatwoot.inboxReadEnabled;
  const password=crypto.randomBytes(24).toString('base64url'),salt='isolated-clean-session';
  const user={id:'clean-staff-20261022',username:'ornek-personel',displayName:'Örnek Personel',role:'personel',active:true,
    chatwootAgentId:2,passwordHash:`scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`};
  const originalUser={...user};
  const stranger={...user,id:'clean-stranger-20261022',username:'ornek-diger',displayName:'Örnek Diğer Personel',chatwootAgentId:3};
  Object.assign(env.auth,{jwtSecret:crypto.randomBytes(48).toString('base64url'),issuer:'isolated-clean-normal',audience:'isolated-clean-ui',
    tokenExpiresIn:'5m',personnelCanSend:true,loginRateLimitMax:1000,users:[user,stranger]});
  Object.assign(env.whatsapp,{sendEnabled:false,liveSendApproved:false,provider:'evolution'});env.chatwoot.inboxReadEnabled=false;
  const journal=memoryJournal(t,file);
  let server;
  t.after(async()=>{
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    Object.assign(env.auth,beforeAuth);env.cors.origins=beforeCors;Object.assign(env.whatsapp,beforeWa);env.chatwoot.inboxReadEnabled=beforeRead;
    for(const [key,value]of Object.entries(beforeEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  });
  const {createApp}=await import('../app.js');
  server=createApp().listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const origin=`http://127.0.0.1:${server.address().port}`;env.cors.origins=[origin];
  const call=async(route,{body,token}={})=>{
    const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{origin,
      ...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,headers:response.headers,...await response.json()};
  };
  const login=async(username=user.username)=>{const reply=await call('/auth/login',{body:{username,password,transport:'native'}});assert.equal(reply.status,200);return reply.data;};
  const refresh=async token=>{const reply=await call('/auth/refresh',{body:{refreshToken:token}});assert.equal(reply.status,200);return reply.data;};

  await t.test('anonymous, wrong password and cookie mode cannot issue the clean normal grant',async()=>{
    assert.equal((await call('/auth/me')).status,401);
    assert.equal((await call('/auth/login',{body:{username:user.username,password:'incorrect'}})).status,401);
    assert.equal((await call('/auth/refresh',{body:{}})).status,401);
    assert.deepEqual((await call('/auth/remembered')).data,{enabled:false,user:null});assert.equal(journal.size,0);
  });
  await t.test('normal credentials and me preserve only the assigned synthetic customer and closed writes',async()=>{
    const signedIn=await login(),me=await call('/auth/me',{token:signedIn.accessToken});
    assert.equal(me.data.id,user.id);assert.equal(me.data.normalRefreshSession,true);assert.equal(me.data.liveSendEnabled,false);
    assert.equal(me.data.paidAiEnabled,false);assert.equal(me.data.passwordHash,undefined);assert.equal(me.data.erpUserId,undefined);
    const inbox=await call('/crm/inbox',{token:signedIn.accessToken});assert.equal(inbox.status,200);
    assert.deepEqual(inbox.data.conversations.map(row=>row.id),['55']);assert.equal(inbox.data.summary.total,1);
    assert.equal((await call('/crm/conversations/56',{token:signedIn.accessToken})).status,403);
    assert.equal((await call('/crm/conversations/55/messages',{token:signedIn.accessToken,body:{text:'never sent'}})).status,403);
    assert.equal((await call('/crm/conversations/55/assign',{token:signedIn.accessToken,body:{agentId:3}})).status,403);
    const other=await login(stranger.username);assert.equal(other.refreshToken,undefined);assert.equal(other.user.normalRefreshSession,undefined);
    assert.equal((await call('/crm/conversations/55',{token:other.accessToken})).status,403);
    for(const value of [signedIn.refreshToken,signedIn.accessToken,password,user.passwordHash])assert(!journal.get(file).includes(value));
  });
  await t.test('existing native consumer reopens the same CRM account, rotates, then independently verifies me and inbox',async()=>{
    const signedIn=await login();let saved=null;
    const bridge={get:async()=>saved,put:async value=>{saved=value;},clear:async()=>{saved=null;}};
    const make=()=>createRememberedNormalSession({bridge,refresh,logout:async refreshToken=>{
      assert.equal((await call('/auth/logout',{body:{refreshToken}})).status,200);
    }});
    const first=make(),epoch=await first.begin();assert.equal(await first.remember(signedIn,(await call('/auth/me',{token:signedIn.accessToken})).data,epoch),true);
    const reopened=make(),resumed=await reopened.resume();assert.equal(resumed.result.user.id,user.id);assert.equal(saved.userId,user.id);
    assert.equal(Object.hasOwn(saved,'password'),false);assert.notEqual(saved.refreshToken,signedIn.refreshToken);
    assert.equal((await call('/auth/refresh',{body:{refreshToken:signedIn.refreshToken}})).status,401);
    const me=(await call('/auth/me',{token:resumed.result.accessToken})).data;
    assert.equal(await reopened.remember(resumed.result,me,resumed.epoch),true);
    assert.deepEqual((await call('/crm/inbox',{token:resumed.result.accessToken})).data.conversations.map(x=>x.id),['55']);
    const expired=jwt.sign({username:user.username,role:user.role,normalSessionId:jwt.decode(resumed.result.accessToken).normalSessionId},env.auth.jwtSecret,
      {subject:user.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:-1});
    assert.equal((await call('/auth/me',{token:expired})).status,401);assert.equal((await reopened.resume()).result.user.id,user.id);
    await reopened.clear();assert.equal(saved,null);assert.equal((await call('/auth/me',{token:resumed.result.accessToken})).status,401);
  });
  await t.test('grantless access is refused and lost-RAM access logout closes only its own family',async()=>{
    const one=await login(),two=await login();
    const grantless=jwt.sign({username:user.username,role:user.role},env.auth.jwtSecret,{subject:user.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:'5m'});
    assert.equal((await call('/auth/me',{token:grantless})).status,401);
    assert.equal((await call('/auth/logout',{token:one.accessToken,body:{refreshToken:two.refreshToken}})).status,401);
    assert.equal((await call('/auth/me',{token:two.accessToken})).status,200);
    assert.equal((await call('/auth/logout',{token:one.accessToken,body:{}})).status,200);
    assert.equal((await call('/auth/me',{token:one.accessToken})).status,401);
    assert.equal((await call('/auth/refresh',{body:{refreshToken:one.refreshToken}})).status,401);
    assert.equal((await call('/auth/me',{token:two.accessToken})).status,200);
  });
  await t.test('a retired refresh can log out its own rotated family but cannot renew it',async()=>{
    const one=await login(),rotated=await refresh(one.refreshToken);
    assert.equal((await call('/auth/refresh',{body:{refreshToken:one.refreshToken}})).status,401);
    assert.equal((await call('/auth/logout',{body:{refreshToken:one.refreshToken}})).status,200);
    assert.equal((await call('/auth/refresh',{body:{refreshToken:rotated.refreshToken}})).status,401);
    assert.equal((await call('/auth/me',{token:rotated.accessToken})).status,401);
  });
  await t.test('password, active, role, representative, permission and scope changes revoke current access and refresh',async()=>{
    const changes=[()=>{user.passwordHash='changed';},()=>{user.active=false;},()=>{user.role='patron';},
      ()=>{user.chatwootAgentId=3;},()=>{env.auth.personnelCanSend=false;},
      ()=>{process.env.CRM_TEST_EXPECTED_DATABASE='LIVE';},()=>{process.env.WHATSAPP_SEND_ENABLED='true';}];
    for(const change of changes){
      const signedIn=await login(),before=journal.get(file);change();
      try{
        assert.equal((await call('/auth/me',{token:signedIn.accessToken})).status,401);
        assert.equal((await call('/auth/refresh',{body:{refreshToken:signedIn.refreshToken}})).status,401);
        assert.equal(journal.get(file),before);
      }finally{Object.assign(user,originalUser);env.auth.personnelCanSend=true;Object.assign(process.env,config);}
    }
  });
});
