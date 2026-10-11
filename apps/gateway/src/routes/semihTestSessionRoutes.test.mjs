import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {env} from '../config/env.js';
import {SEMIH_TEST_COOKIE} from '../services/semihTestCookie.mjs';

// The production private-path policy is exercised unchanged. Only this exact
// fixture journal is in memory: tests never read or write a real runtime file.
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

test('Semih TEST remembered browser auth uses only normal credentials, a private cookie and revocable grants',{skip:process.platform!=='win32'},async t=>{
 const keys=['CRM_NORMAL_REFRESH_ENABLED','CRM_SEMIH_TEST_CONTINUE_ENABLED','CRM_NORMAL_REFRESH_USER_ID','CRM_NORMAL_REFRESH_JOURNAL_PATH','CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH','CRM_SEMIH_TEST_AGENT_ID','CRM_ISOLATED_PREPARATION','CRM_TEST_EXPECTED_DATABASE','CRM_PAID_AI_ENABLED'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const authBefore={...env.auth,users:env.auth.users};
 const whatsappBefore={...env.whatsapp};
 const file='C:/Sirket/CRM/runtime/offline-semih-fixture/refresh.json';
 const normalFile='C:/Sirket/CRM/runtime/offline-semih-fixture/normal-refresh.json';
 const normalJournal=memoryJournal(t,normalFile);
 const journal=memoryJournal(t,file);
 Object.assign(process.env,{CRM_NORMAL_REFRESH_ENABLED:'true',CRM_SEMIH_TEST_CONTINUE_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'crm-agent-test-20261011',CRM_NORMAL_REFRESH_JOURNAL_PATH:normalFile,CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH:file,CRM_SEMIH_TEST_AGENT_ID:'2',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',CRM_PAID_AI_ENABLED:'false'});
 const password='Only-Offline-Fixture-Semih!';
 const salt='offline-semih-salt';
 const user={id:'crm-semih-test-20261012',username:'crm-semih-test',displayName:'Semih TEST',role:'patron',active:true,chatwootAgentId:2,passwordHash:`scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`};
 const staff={...user,id:'crm-agent-test-20261011',username:'crm-agent-test',displayName:'TEST personeli',role:'personel',chatwootAgentId:3};
 Object.assign(env.auth,{jwtSecret:'offline-semih-jwt-secret-more-than-thirty-two',issuer:'offline-semih',audience:'offline-semih-ui',tokenExpiresIn:'5m',personnelCanSend:false,loginRateLimitMax:1000,users:[user,staff]});
 Object.assign(env.whatsapp,{sendEnabled:false,liveSendApproved:false,provider:'evolution'});
 const {createApp}=await import('../app.js');
 const server=createApp().listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const base=`http://127.0.0.1:${server.address().port}`;
 const origin='http://127.0.0.1:62700';
 const cookieFrom=response=>response.headers.get('set-cookie')?.split(';')[0]||'';
 const call=(route,{body,cookie,headers={}}={})=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{origin}:{'content-type':'application/json',origin}),...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const login=()=>call('/auth/login',{body:{username:user.username,password}});
 const originalUser={...user};
 const originalStaff={...staff};
 t.afterEach(()=>{for(const [entry,original] of [[user,originalUser],[staff,originalStaff]]){for(const key of Object.keys(entry))if(!(key in original))delete entry[key];Object.assign(entry,original);}});
 try{
  await t.test('anonymous discovery is safe, anonymous resume and invalid credentials issue no session',async()=>{
   const response=await call('/auth/remembered');assert.equal(response.status,200);assert.deepEqual((await response.json()).data,{enabled:true,user:null});assert.equal(response.headers.get('cache-control'),'no-store');
   for(let attempt=0;attempt<2;attempt++){const emptyLogout=await call('/auth/logout',{body:{}});assert.equal(emptyLogout.status,200);assert.deepEqual((await emptyLogout.json()).data,{loggedOut:true});assert(!journal.has(file));}
   const anonymous=await call('/auth/refresh',{body:{}});assert.equal(anonymous.status,401);assert(!journal.has(file));
   const failed=await call('/auth/login',{body:{username:user.username,password:'wrong'}});assert.equal(failed.status,401);assert(!journal.has(file));assert.equal(failed.headers.get('set-cookie'),null);
  });
  await t.test('normal credentials create HttpOnly/Strict/host-only cookie; JSON and discovery contain no refresh/JWT secret',async()=>{
   const response=await login();assert.equal(response.status,200);const data=(await response.json()).data;
   assert.equal(data.user.normalTestScope.semihTestContinue,true);assert.equal(data.user.displayName,'Semih TEST');assert.equal(data.refreshToken,undefined);assert.equal(data.user.liveSendEnabled,false);assert.equal(data.user.paidAiEnabled,false);
   const header=response.headers.get('set-cookie');assert(header.includes('HttpOnly'));assert(header.includes('SameSite=Strict'));assert(header.includes('Path=/api/live/auth'));assert(!/Domain=/i.test(header));
   const cookie=cookieFrom(response);const raw=cookie.split('=')[1];assert(!journal.get(file).includes(raw));
   const discovery=await call('/auth/remembered',{cookie});const seen=(await discovery.json()).data;assert.equal(seen.user.id,user.id);assert.equal(seen.accessToken,undefined);assert.equal(seen.refreshToken,undefined);assert(!JSON.stringify(seen).includes(data.accessToken));
   const me=await call('/auth/me',{headers:{authorization:`Bearer ${data.accessToken}`}});assert.equal(me.status,200);assert.equal((await me.json()).data.normalTestScope.semihTestContinue,true);
  });
  await t.test('foreign origin, cross-site, missing write origin, wrong content type and nonempty cookie body cannot refresh',async()=>{
   const response=await login(),cookie=cookieFrom(response),before=journal.get(file);
   for(const headers of [{origin:'https://attacker.invalid'},{origin:'http://127.0.0.1:62701'},{origin:''},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{'content-type':'text/plain'}]){
    for(const route of ['/auth/refresh','/auth/logout']){const failed=await call(route,{body:{},cookie,headers});assert.equal(failed.status,403);assert.equal(failed.headers.get('set-cookie'),null);assert.equal(journal.get(file),before);}
   }
   const foreign=await call('/auth/remembered',{cookie,headers:{origin:'https://attacker.invalid'}});assert.equal(foreign.status,403);assert.equal(foreign.headers.get('set-cookie'),null);
   const nonempty=await call('/auth/refresh',{body:{ignored:true},cookie});assert.equal(nonempty.status,401);assert.equal(journal.get(file),before);
  });
  await t.test('LAN origin is exact; duplicate/malformed cookies and a JWT without a normal grant cannot become Semih',async()=>{
   const response=await call('/auth/login',{body:{username:user.username,password},headers:{origin:'http://192.168.1.46:62700'}});assert.equal(response.status,200);const cookie=cookieFrom(response);
   const seen=await call('/auth/remembered',{cookie,headers:{origin:'http://192.168.1.46:62700'}});assert.equal((await seen.json()).data.user.id,user.id);
   const duplicate=await call('/auth/remembered',{cookie:`${cookie}; ${cookie}`});assert.equal(duplicate.status,403);
   const malformed=await call('/auth/remembered',{cookie:`${SEMIH_TEST_COOKIE}=bad`});assert.equal((await malformed.json()).data.user,null);assert(malformed.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
   const {default:jwt}=await import('jsonwebtoken');
   const unsignedGrant=jwt.sign({username:user.username,role:user.role},env.auth.jwtSecret,{subject:user.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:'5m'});
   assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${unsignedGrant}`}})).status,401);
  });
  await t.test('cookie refresh rotates and retired cookie cannot resume; concurrent old-token logout revokes the whole family',async()=>{
   const response=await login(),old=cookieFrom(response);
   const refreshed=await call('/auth/refresh',{body:{},cookie:old});assert.equal(refreshed.status,200);const data=(await refreshed.json()).data,newCookie=cookieFrom(refreshed);
   assert.notEqual(newCookie,old);assert.equal(data.refreshToken,undefined);
   const retired=await call('/auth/remembered',{cookie:old});assert.equal((await retired.json()).data.user,null);assert(retired.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
   const loggedOut=await call('/auth/logout',{body:{},cookie:old});assert.equal(loggedOut.status,200);assert(loggedOut.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
   const rejected=await call('/auth/me',{cookie:newCookie,headers:{authorization:`Bearer ${data.accessToken}`}});assert.equal(rejected.status,401);assert(rejected.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
   assert.equal((await call('/auth/remembered',{cookie:newCookie})).status,200);
  });
  await t.test('invalid access from another port cannot erase a valid cookie; trusted UI rejection still cleans it',async()=>{
   const response=await login(),cookie=cookieFrom(response),before=journal.get(file);
   for(const headers of [{origin:'http://127.0.0.1:62701'},{'sec-fetch-site':'same-site'},{origin:''}]){
    const rejected=await call('/auth/me',{cookie,headers:{authorization:'Bearer invalid-offline-access',...headers}});assert.equal(rejected.status,401);assert.equal(rejected.headers.get('set-cookie'),null);assert.equal(journal.get(file),before);
   }
   const trusted=await call('/auth/me',{cookie,headers:{authorization:'Bearer invalid-offline-access'}});assert.equal(trusted.status,401);assert(trusted.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
   assert.equal((await (await call('/auth/remembered',{cookie})).json()).data.user.id,user.id);
  });
  await t.test('role, password, active state and pinned agent changes revoke discovery and already-issued access',async()=>{
   for(const change of [{role:'mudur'},{passwordHash:`scrypt$changed$${'1'.repeat(128)}`},{active:false},{chatwootAgentId:4},{displayName:'Other user'},{testAdmin:true}]){
    const response=await login(),cookie=cookieFrom(response),data=(await response.json()).data;const saved={...user};Object.assign(user,change);
    const seen=await call('/auth/remembered',{cookie});assert.equal((await seen.json()).data.user,null);
    const me=await call('/auth/me',{headers:{authorization:`Bearer ${data.accessToken}`}});assert.equal(me.status,401);
    for(const key of Object.keys(user))if(!(key in saved))delete user[key];Object.assign(user,saved);
   }
  });
  await t.test('normal personnel cannot become Semih; changing user clears and revokes prior Semih session',async()=>{
   const response=await login(),cookie=cookieFrom(response),data=(await response.json()).data;
   const changed=await call('/auth/login',{body:{username:staff.username,password},cookie});assert.equal(changed.status,200);const normal=(await changed.json()).data;
   assert.equal(normal.user.role,'personel');assert.deepEqual(normal.user.permissions,['crm.view']);assert.equal(normal.user.normalTestScope.chatwootAgentId,3);assert.equal(normal.user.normalTestScope.semihTestContinue,undefined);assert.equal(typeof normal.refreshToken,'string');assert(changed.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
   assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${data.accessToken}`}})).status,401);
   assert.equal((await call('/auth/remembered',{cookie})).status,200);
  });
  await t.test('native body-token mode remains supported and expires/revokes exactly as normal grants',async()=>{
   const response=await call('/auth/login',{body:{username:user.username,password,transport:'native'}});assert.equal(response.status,200);const data=(await response.json()).data;assert.equal(response.headers.get('set-cookie'),null);assert.equal(typeof data.refreshToken,'string');
   const refresh=await call('/auth/refresh',{body:{refreshToken:data.refreshToken},headers:{origin:''}});assert.equal(refresh.status,200);const next=(await refresh.json()).data;assert.notEqual(next.refreshToken,data.refreshToken);assert.equal(refresh.headers.get('set-cookie'),null);
   const logout=await call('/auth/logout',{body:{refreshToken:data.refreshToken},headers:{origin:''}});assert.equal(logout.status,200);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${next.accessToken}`}})).status,401);
   const fresh=await login(),cookie=cookieFrom(fresh),record=JSON.parse(journal.get(file));record.grants.at(-1).expiresAt=Date.now()-1;journal.set(file,JSON.stringify(record));assert.equal((await (await call('/auth/remembered',{cookie})).json()).data.user,null);
  });
  await t.test('expired/revoked logout cleans a trusted cookie; real revoke/storage failure is not reported as success',async()=>{
   const response=await login(),cookie=cookieFrom(response),record=JSON.parse(journal.get(file));record.grants.at(-1).expiresAt=Date.now()-1;journal.set(file,JSON.stringify(record));
   const expired=await call('/auth/logout',{body:{},cookie});assert.equal(expired.status,200);assert.equal(JSON.parse(journal.get(file)).grants.at(-1).revoked,true);assert(expired.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));
   const repeated=await call('/auth/logout',{body:{},cookie});assert.equal(repeated.status,200);
   const fresh=await login(),valid=cookieFrom(fresh),before=journal.get(file);journal.set(`${file}.lock`,'offline-held-lock');
   try{const failed=await call('/auth/logout',{body:{},cookie:valid});assert.equal(failed.status,503);assert.equal(failed.headers.get('set-cookie'),null);assert.equal(journal.get(file),before);}finally{journal.delete(`${file}.lock`);}
   assert.equal((await (await call('/auth/remembered',{cookie:valid})).json()).data.user.id,user.id);
   const malformed=await call('/auth/logout',{body:{},cookie:`${SEMIH_TEST_COOKIE}=bad`});assert.equal(malformed.status,401);assert(malformed.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'));assert.equal(journal.get(file),before);
   const badNative=await call('/auth/logout',{body:{refreshToken:''}});assert.equal(badNative.status,401);
  });
  await t.test('both dedicated profiles retain their original native/cookie contracts and isolated journals',async()=>{
   const staffLogin=await call('/auth/login',{body:{username:staff.username,password,transport:'native'}});assert.equal(staffLogin.status,200);const oldStaff=(await staffLogin.json()).data;
   assert.equal(typeof oldStaff.refreshToken,'string');assert.equal(oldStaff.user.normalTestScope.chatwootAgentId,3);assert.equal(oldStaff.user.normalTestScope.semihTestContinue,undefined);
   const staffMe=await call('/auth/me',{headers:{authorization:`Bearer ${oldStaff.accessToken}`}});assert.equal(staffMe.status,200);assert.equal((await staffMe.json()).data.id,staff.id);
   const semihLogin=await login(),semihCookie=cookieFrom(semihLogin),semihBefore=journal.get(file);
   const staffRefresh=await call('/auth/refresh',{body:{refreshToken:oldStaff.refreshToken}});assert.equal(staffRefresh.status,200);const newStaff=(await staffRefresh.json()).data;assert.notEqual(newStaff.refreshToken,oldStaff.refreshToken);assert.equal(staffRefresh.headers.get('set-cookie'),null);assert.equal(journal.get(file),semihBefore);
   const normalBefore=normalJournal.get(normalFile);
   const semihRefresh=await call('/auth/refresh',{body:{},cookie:semihCookie});assert.equal(semihRefresh.status,200);const semih=(await semihRefresh.json()).data,latestCookie=cookieFrom(semihRefresh);assert.equal(semih.refreshToken,undefined);assert.equal(normalJournal.get(normalFile),normalBefore);
   assert(JSON.parse(normalBefore).grants.every(grant=>grant.userId===staff.id));assert(JSON.parse(journal.get(file)).grants.every(grant=>grant.userId===user.id));assert.equal(JSON.parse(normalBefore).schema,1);assert.equal(JSON.parse(journal.get(file)).schema,1);
   const beforeCookieProbe=journal.get(file);
   const wrongCookie=await call('/auth/refresh',{body:{},cookie:`${SEMIH_TEST_COOKIE}=${newStaff.refreshToken}`});assert.equal(wrongCookie.status,401);assert.equal(normalJournal.get(normalFile),normalBefore);assert.equal(journal.get(file),beforeCookieProbe);
   const wrongCookieSeen=await call('/auth/remembered',{cookie:`${SEMIH_TEST_COOKIE}=${newStaff.refreshToken}`});assert.equal((await wrongCookieSeen.json()).data.user,null);assert.equal(normalJournal.get(normalFile),normalBefore);
   const wrongCookieLogout=await call('/auth/logout',{body:{},cookie:`${SEMIH_TEST_COOKIE}=${newStaff.refreshToken}`});assert.equal(wrongCookieLogout.status,200);assert.equal(normalJournal.get(normalFile),normalBefore);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${newStaff.accessToken}`}})).status,200);
   const {default:jwt}=await import('jsonwebtoken');
   for(const [actor,otherToken] of [[user,newStaff.accessToken],[staff,semih.accessToken]]){
    const mixed=jwt.sign({username:actor.username,role:actor.role,normalSessionId:jwt.decode(otherToken).normalSessionId},env.auth.jwtSecret,{subject:actor.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:'5m'});
    assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${mixed}`}})).status,401);
   }
   user.role='mudur';assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${semih.accessToken}`}})).status,401);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${newStaff.accessToken}`}})).status,200);user.role=originalUser.role;
   const semihLogout=await call('/auth/logout',{body:{},cookie:latestCookie});assert.equal(semihLogout.status,200);assert.equal(normalJournal.get(normalFile),normalBefore);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${newStaff.accessToken}`}})).status,200);
   const semihAgain=await login(),remainingSemih=(await semihAgain.json()).data,semihJournalBefore=journal.get(file);
   staff.role='mudur';assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${newStaff.accessToken}`}})).status,401);assert.equal((await call('/auth/login',{body:{username:staff.username,password}})).status,401);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${remainingSemih.accessToken}`}})).status,200);staff.role=originalStaff.role;
   const staffLogout=await call('/auth/logout',{body:{refreshToken:oldStaff.refreshToken}});assert.equal(staffLogout.status,200);assert.equal(journal.get(file),semihJournalBefore);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${remainingSemih.accessToken}`}})).status,200);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${newStaff.accessToken}`}})).status,401);
  });
  await t.test('turning off only Semih helper leaves the accepted personnel session/scope/refresh operational',async()=>{
   const staffLogin=await call('/auth/login',{body:{username:staff.username,password,transport:'native'}}),normal=(await staffLogin.json()).data;
   const semihLogin=await login(),semih=(await semihLogin.json()).data;
   process.env.CRM_SEMIH_TEST_CONTINUE_ENABLED='false';
   try{
    const current=await call('/auth/me',{headers:{authorization:`Bearer ${normal.accessToken}`}});assert.equal(current.status,200);assert.equal((await current.json()).data.normalTestScope.chatwootAgentId,3);
    const refreshed=await call('/auth/refresh',{body:{refreshToken:normal.refreshToken}});assert.equal(refreshed.status,200);assert.equal((await refreshed.json()).data.user.role,'personel');
    assert.equal((await login()).status,401);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${semih.accessToken}`}})).status,401);
   }finally{process.env.CRM_SEMIH_TEST_CONTINUE_ENABLED='true';}
  });
  await t.test('expired personnel native grant and retired-token logout remain scoped to the old profile',async()=>{
   const first=await call('/auth/login',{body:{username:staff.username,password,transport:'native'}}),old=(await first.json()).data;
   const refreshed=await call('/auth/refresh',{body:{refreshToken:old.refreshToken}});assert.equal(refreshed.status,200);const current=(await refreshed.json()).data;
   const semihResponse=await login(),semih=(await semihResponse.json()).data,semihBefore=journal.get(file);
   const record=JSON.parse(normalJournal.get(normalFile));record.grants.at(-1).expiresAt=Date.now()-1;normalJournal.set(normalFile,JSON.stringify(record));const before=normalJournal.get(normalFile);
   for(const token of [old.refreshToken,current.refreshToken]){const denied=await call('/auth/refresh',{body:{refreshToken:token}});assert.equal(denied.status,401);assert.equal(normalJournal.get(normalFile),before);assert.equal(journal.get(file),semihBefore);}
   assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${current.accessToken}`}})).status,401);assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${semih.accessToken}`}})).status,200);
   const loggedOut=await call('/auth/logout',{body:{refreshToken:old.refreshToken}});assert.equal(loggedOut.status,200);assert.equal(JSON.parse(normalJournal.get(normalFile)).grants.at(-1).revoked,true);assert.equal(journal.get(file),semihBefore);assert.equal(loggedOut.headers.get('set-cookie'),null);
   assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${semih.accessToken}`}})).status,200);
  });
  await t.test('disabled or LIVE feature exposes no remembered user and cannot resume cookie; existing access fails closed',async()=>{
   const response=await login(),cookie=cookieFrom(response),data=(await response.json()).data;
   const {default:jwt}=await import('jsonwebtoken');
   const noGrant=jwt.sign({username:user.username,role:user.role},env.auth.jwtSecret,{subject:user.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:'5m'});
   for(const [key,value] of [['CRM_SEMIH_TEST_CONTINUE_ENABLED','false'],['CRM_ISOLATED_PREPARATION','false'],['CRM_NORMAL_REFRESH_ENABLED','false'],['CRM_NORMAL_REFRESH_USER_ID','wrong-user'],['CRM_TEST_EXPECTED_DATABASE','LIVE'],['CRM_SEMIH_TEST_AGENT_ID','4']]){
    const saved=process.env[key];process.env[key]=value;
    try{
     const seen=(await (await call('/auth/remembered',{cookie})).json()).data;assert.equal(seen.user,null);if(key!=='CRM_SEMIH_TEST_AGENT_ID')assert.equal(seen.enabled,false);
     const before=journal.get(file);assert.equal((await login()).status,401);assert.equal(journal.get(file),before);
     assert.equal((await call('/auth/refresh',{body:{},cookie})).status,key==='CRM_NORMAL_REFRESH_ENABLED'?403:401);
     for(const access of [data.accessToken,noGrant])assert.equal((await call('/auth/me',{headers:{authorization:`Bearer ${access}`}})).status,401);
     const normal=await call('/auth/login',{body:{username:staff.username,password}});
     const normalExpected=['CRM_SEMIH_TEST_CONTINUE_ENABLED','CRM_SEMIH_TEST_AGENT_ID','CRM_NORMAL_REFRESH_USER_ID'].includes(key)?200:401;
     assert.equal(normal.status,normalExpected);if(normalExpected===200)assert.equal((await normal.json()).data.user.role,'personel');
    }finally{process.env[key]=saved;}
   }
  });
 }finally{
  server.close();Object.assign(env.auth,authBefore);Object.assign(env.whatsapp,whatsappBefore);
  for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});
