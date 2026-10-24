import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { env } from '../config/env.js';
import { SEMIH_TEST_COOKIE, SEMIH_TEST_REQUEST_PROOF_COOKIE } from './semihTestCookie.mjs';

// Exact canonical private paths are synthetic and intercepted in memory.
function memoryJournal(t, file) {
  const files = new Map(), handles = new Map(); let counter = 100000;
  const owned = value => typeof value === 'string' && (value === file || value.startsWith(`${file}.`));
  const missing = () => Object.assign(Error('fixture missing'), { code: 'ENOENT' });
  const original = {}; for (const name of ['mkdirSync', 'readFileSync', 'openSync', 'writeFileSync', 'fsyncSync', 'closeSync', 'renameSync', 'unlinkSync']) original[name] = fs[name];
  t.mock.method(fs, 'mkdirSync', (directory, ...args) => directory === file.slice(0, file.lastIndexOf('/')) ? undefined : original.mkdirSync(directory, ...args));
  t.mock.method(fs, 'readFileSync', (target, ...args) => { if (!owned(target)) return original.readFileSync(target, ...args); if (!files.has(target)) throw missing(); return files.get(target); });
  t.mock.method(fs, 'openSync', (target, ...args) => { if (!owned(target)) return original.openSync(target, ...args); if (files.has(target)) throw Object.assign(Error('fixture lock'), { code: 'EEXIST' }); files.set(target, ''); const fd = counter++; handles.set(fd, target); return fd; });
  t.mock.method(fs, 'writeFileSync', (target, value, ...args) => { const name = handles.get(target) || target; if (!owned(name)) return original.writeFileSync(target, value, ...args); files.set(name, String(value)); });
  t.mock.method(fs, 'fsyncSync', fd => { if (!handles.has(fd)) return original.fsyncSync(fd); });
  t.mock.method(fs, 'closeSync', fd => { if (!handles.has(fd)) return original.closeSync(fd); handles.delete(fd); });
  t.mock.method(fs, 'renameSync', (from, to) => { if (!owned(from) || !owned(to)) return original.renameSync(from, to); if (!files.has(from)) throw missing(); files.set(to, files.get(from)); files.delete(from); });
  t.mock.method(fs, 'unlinkSync', target => { if (!owned(target)) return original.unlinkSync(target); if (!files.delete(target)) throw missing(); });
  return files;
}

test('internal customer authority uses verified existing normal SID and independent proof browser cookie', { skip: process.platform !== 'win32' }, async t => {
  const keys = ['CRM_NORMAL_REFRESH_ENABLED','CRM_NORMAL_REFRESH_USER_ID','CRM_NORMAL_REFRESH_JOURNAL_PATH','CRM_SEMIH_TEST_CONTINUE_ENABLED','CRM_SEMIH_TEST_AGENT_ID','CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH','CRM_ISOLATED_PREPARATION','CRM_TEST_EXPECTED_DATABASE','CRM_CUSTOMER_PRODUCT_REQUEST_PROOF','CRM_UI_ORIGIN'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]])), authBefore = { ...env.auth, users: env.auth.users }, whatsappBefore = { ...env.whatsapp };
  const normalFile = 'C:/Sirket/CRM/runtime/offline-request-authority/normal.json', semihFile = 'C:/Sirket/CRM/runtime/offline-request-authority/semih.json';
  const normalJournal = memoryJournal(t, normalFile), semihJournal = memoryJournal(t, semihFile);
  Object.assign(process.env, { CRM_NORMAL_REFRESH_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'crm-agent-test-20261011',CRM_NORMAL_REFRESH_JOURNAL_PATH:normalFile,
    CRM_SEMIH_TEST_CONTINUE_ENABLED:'true',CRM_SEMIH_TEST_AGENT_ID:'2',CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH:semihFile,
    CRM_ISOLATED_PREPARATION:'true',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'true',CRM_UI_ORIGIN:'http://127.0.0.1:62800' });
  const password = 'Offline-Customer-Authority-2026!', salt = 'offline-request-salt', passwordHash = `scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`;
  const user = { id:'crm-semih-test-20261012',username:'crm-semih-test',displayName:'Semih TEST',role:'patron',active:true,chatwootAgentId:2,passwordHash };
  const personel = { ...user,id:'crm-agent-test-20261011',username:'crm-agent-test',displayName:'Personel fixture',role:'personel',chatwootAgentId:3 };
  const ordinary = { ...user,id:'ordinary-normal-fixture',username:'ordinary-normal-fixture' };
  Object.assign(env.auth, { jwtSecret:'offline-customer-authority-secret-more-than-thirty-two',issuer:'offline-request-authority',audience:'offline-request-ui',tokenExpiresIn:'5m',personnelCanSend:false,loginRateLimitMax:1000,users:[user,personel,ordinary] });
  Object.assign(env.whatsapp, { sendEnabled:false,liveSendApproved:false,provider:'evolution' });
  const auth = await import('./crmAuthService.js'), { authRoutes } = await import('../routes/authRoutes.js');
  const app = express(); app.use(express.json()); app.use(authRoutes);
  app.use((error,_req,res,_next) => res.status(error.statusCode || 500).json({success:false,error:{code:error.code}}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`, origin = 'http://127.0.0.1:62800';
  const call = (route,{body,cookie,headers={}}={}) => fetch(base+route,{method:body===undefined?'GET':'POST',headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const login = () => auth.authenticateCrmUser({username:user.username,password});
  try {
    await t.test('protected normal password login captures only SID/fingerprint/expiry; grantless and bootstrap tokens are rejected', async () => {
      const result = login(), captured = auth.captureNormalCrmAuthority(result.accessToken);
      assert.equal(captured.user.id,user.id); assert.deepEqual(Object.keys(captured.authority).sort(),['expiresAt','fingerprint','id','normalSessionId']);
      assert.equal(captured.authority.fingerprint.length,64); assert.equal(auth.verifyNormalCrmAuthority(captured.authority).id,user.id);
      for(const secret of [result.accessToken,result.refreshToken,password])assert.equal(JSON.stringify(captured.authority).includes(secret),false);
      const standard=auth.authenticateCrmUser({username:ordinary.username,password});
      assert.throws(()=>auth.captureNormalCrmAuthority(standard.accessToken),{code:'CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED'});
      assert.throws(()=>auth.captureNormalCrmAuthority('invalid'),{statusCode:401});
      const {installTestAdminSession}=await import('./testAdminSession.mjs');
      const bootstrap=installTestAdminSession({uiOrigin:'http://127.0.0.1:62400',gatewayOrigin:'http://127.0.0.1:62401'})();
      assert.throws(()=>auth.captureNormalCrmAuthority(bootstrap.accessToken),{code:'CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED'});
    });
    await t.test('authority expiry/logout/role/password/assignment/inactive changes revoke customer scope', () => {
      const original={...user};
      for(const change of [{role:'personel'},{passwordHash:'scrypt$changed$'+'a'.repeat(128)},{chatwootAgentId:3},{active:false}]){
        const captured=auth.captureNormalCrmAuthority(login().accessToken);Object.assign(user,change);
        assert.throws(()=>auth.verifyNormalCrmAuthority(captured.authority),{statusCode:401});Object.assign(user,original);
      }
      const result=login(),captured=auth.captureNormalCrmAuthority(result.accessToken);
      assert.throws(()=>auth.verifyNormalCrmAuthority({...captured.authority,expiresAt:Date.now()-1}),{statusCode:401});
      auth.logoutNormalCrmSession(result.refreshToken);assert.throws(()=>auth.verifyNormalCrmAuthority(captured.authority),{statusCode:401});
      const current=auth.captureNormalCrmAuthority(login().accessToken);process.env.CRM_SEMIH_TEST_CONTINUE_ENABLED='false';
      assert.throws(()=>auth.verifyNormalCrmAuthority(current.authority),{statusCode:401});process.env.CRM_SEMIH_TEST_CONTINUE_ENABLED='true';
      assert.throws(()=>auth.verifyNormalCrmAuthority({...current.authority,id:'missing-normal-user'}),{statusCode:401});
    });
    await t.test('personel normal grant is preserved while proof credentials create separate host-only cookie with no refresh JSON', async () => {
      const existing=auth.authenticateCrmUser({username:personel.username,password}),normalBefore=normalJournal.get(normalFile);
      const response=await call('/auth/login',{body:{username:user.username,password}});assert.equal(response.status,200);
      const result=(await response.json()).data,header=response.headers.get('set-cookie');
      assert.equal(result.refreshToken,undefined);assert.equal(result.user.normalTestScope.semihTestContinue,true);
      assert(header.startsWith(`${SEMIH_TEST_REQUEST_PROOF_COOKIE}=`));assert(header.includes('HttpOnly'));assert(header.includes('SameSite=Strict'));assert(header.includes('Path=/api/live/auth'));assert(!header.includes('Domain='));
      assert.equal(normalJournal.get(normalFile),normalBefore);assert.equal(auth.verifyCrmAccessToken(existing.accessToken).id,personel.id);
      const cookie=header.split(';')[0],combined=`${SEMIH_TEST_COOKIE}=${'a'.repeat(43)}; ${cookie}`;
      const discovered=await call('/auth/remembered',{cookie:combined});assert.equal((await discovered.json()).data.user.id,user.id);
      const regularOnly=await call('/auth/remembered',{cookie:`${SEMIH_TEST_COOKIE}=${'a'.repeat(43)}`});assert.equal((await regularOnly.json()).data.user,null);assert.equal(regularOnly.headers.get('set-cookie'),null);
      const rotated=await call('/auth/refresh',{body:{},cookie:combined});assert.equal(rotated.status,200);assert.equal((await rotated.json()).data.refreshToken,undefined);assert(rotated.headers.get('set-cookie').startsWith(`${SEMIH_TEST_REQUEST_PROOF_COOKIE}=`));
    });
    await t.test('actual login controller rejects wrong/LIVE/same-site proof origins before grant issuance', async () => {
      const before=semihJournal.get(semihFile);
      for(const headers of [{origin:'http://127.0.0.1:62700'},{origin:'http://192.168.1.46:62800'},{origin:'http://127.0.0.1:62801'},{origin:''},{'sec-fetch-site':'same-site'}]){
        const rejected=await call('/auth/login',{body:{username:user.username,password},headers});assert.equal(rejected.status,403);assert.equal(rejected.headers.get('set-cookie'),null);assert.equal(semihJournal.get(semihFile),before);
      }
      const remembered=await call('/auth/remembered',{cookie:`${SEMIH_TEST_COOKIE}=${'a'.repeat(43)}`,headers:{origin:'http://127.0.0.1:62700'}});assert.equal(remembered.status,403);assert.equal(remembered.headers.get('set-cookie'),null);
      for(const[key,value]of [['CRM_ISOLATED_PREPARATION','false'],['CRM_TEST_EXPECTED_DATABASE','LIVE'],['CRM_SEMIH_TEST_CONTINUE_ENABLED','false']]){
        const original=process.env[key];process.env[key]=value;
        const rejected=await call('/auth/login',{body:{username:user.username,password}});assert.equal(rejected.status,403);assert.equal(rejected.headers.get('set-cookie'),null);assert.equal(semihJournal.get(semihFile),before);
        process.env[key]=original;
      }
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));Object.assign(env.auth,authBefore);Object.assign(env.whatsapp,whatsappBefore);
    for(const[key,value]of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
