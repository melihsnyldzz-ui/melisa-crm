import '../../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import dotenv from 'dotenv';

const ROOT = 'C:/Sirket/CRM/runtime/CRM06-TEST-ACTORS-20261014';
const STAFF_FILE = `${ROOT}/assigned-staff-refresh.json`;
const NORMAL_FILE = `${ROOT}/offline-agent3-refresh.json`;
const ISSUER_FILE = `${ROOT}/offline-issuer-refresh.json`;
const SEMIH_FILE = `${ROOT}/offline-semih-refresh.json`;
const STAFF_ID = 'crm-crm06-staff-test-20261014';
const sharedConfig = () => ({
  CRM_ASSIGNED_STAFF_REFRESH_ENABLED: 'true',
  CRM_ASSIGNED_STAFF_REFRESH_USER_ID: STAFF_ID,
  CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH: STAFF_FILE,
  CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED: 'true',
  CRM_CUSTOMER_PRODUCT_REQUEST_PROOF: 'false',
  CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS: '["offline-assigned-staff-issuer"]',
  CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE: `${ROOT}/offline-customer-request.json`,
  CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH: ISSUER_FILE,
  CRM_NORMAL_REFRESH_ENABLED: 'true',
  CRM_NORMAL_REFRESH_USER_ID: 'crm-agent-test-20261011',
  CRM_NORMAL_REFRESH_JOURNAL_PATH: NORMAL_FILE,
  CRM_SEMIH_TEST_CONTINUE_ENABLED: 'false',
  CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH: SEMIH_FILE,
  CRM_UI_ORIGIN: 'http://127.0.0.1:62700',
  CRM_TEST_PORT_BASE: '62700',
  CRM_TEST_ERP_ORIGIN: 'http://127.0.0.1:4184',
  CRM_TEST_EXPECTED_DATABASE: 'MELISA_ERP_CRM_SHARED_TEST_20261009_02',
  CRM_ISOLATED_PREPARATION: 'true',
  CRM_TEST_LAN_ADDRESS: '',
  WHATSAPP_SEND_ENABLED: 'false',
  WHATSAPP_LIVE_SEND_APPROVED: 'false',
  CRM_PAID_AI_ENABLED: 'false',
});

// No filesystem fallback is permitted for these exact synthetic private paths.
// The real configured factory still validates Windows canonical path rules.
function memoryJournals(t, filenames) {
  const files = new Map(), handles = new Map(); let sequence = 100000;
  const normalize = value => typeof value === 'string' ? path.resolve(value).toLowerCase() : '';
  const names = filenames.map(normalize), directories = new Set(filenames.map(file => normalize(path.dirname(file))));
  const owned = target => names.some(file => normalize(target) === file || normalize(target).startsWith(`${file}.`));
  const missing = () => Object.assign(Error('Synthetic journal missing'), {code: 'ENOENT'});
  const original = Object.fromEntries(['mkdirSync','readFileSync','openSync','writeFileSync','fsyncSync','closeSync','renameSync','unlinkSync'].map(key => [key, fs[key]]));
  t.mock.method(fs, 'mkdirSync', (directory, ...args) => directories.has(normalize(directory)) ? undefined : original.mkdirSync(directory, ...args));
  t.mock.method(fs, 'readFileSync', (target, ...args) => {
    if (!owned(target)) return original.readFileSync(target, ...args);
    if (!files.has(normalize(target))) throw missing();
    return files.get(normalize(target));
  });
  t.mock.method(fs, 'openSync', (target, ...args) => {
    if (!owned(target)) return original.openSync(target, ...args);
    const name = normalize(target);
    if (files.has(name)) throw Object.assign(Error('Synthetic journal lock'), {code: 'EEXIST'});
    files.set(name, ''); const fd = sequence++; handles.set(fd, name); return fd;
  });
  t.mock.method(fs, 'writeFileSync', (target, content, ...args) => {
    const name = handles.get(target) || target;
    if (!handles.has(target) && !owned(name)) return original.writeFileSync(target, content, ...args);
    files.set(normalize(name), String(content));
  });
  t.mock.method(fs, 'fsyncSync', fd => { if (!handles.has(fd)) return original.fsyncSync(fd); });
  t.mock.method(fs, 'closeSync', fd => { if (!handles.delete(fd)) return original.closeSync(fd); });
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (!owned(from) || !owned(to)) return original.renameSync(from, to);
    if (!files.has(normalize(from))) throw missing();
    files.set(normalize(to), files.get(normalize(from))); files.delete(normalize(from));
  });
  t.mock.method(fs, 'unlinkSync', target => {
    if (!owned(target)) return original.unlinkSync(target);
    if (!files.delete(normalize(target))) throw missing();
  });
  return {read: file => files.get(normalize(file)), seed: (file, value) => files.set(normalize(file), value)};
}

test('finite assigned staff uses actual configured auth and router with isolated in-memory journals', async t => {
  const policy = await import('./assignedStaffRefreshSession.mjs');
  const config = sharedConfig();
  const {configuredAssignedStaffRefreshStore} = policy;
  assert.equal(configuredAssignedStaffRefreshStore({config:{},resolveUser:()=>null}), null);
  if (process.platform !== 'win32') {
    // Linux must reject Windows private paths, rather than silently skipping or
    // treating a cwd-relative C: directory as an approved private runtime.
    const actor = {id:STAFF_ID,username:'crm-crm06-staff',role:'personel',active:true,chatwootAgentId:2,permissions:['crm.view']};
    assert.throws(() => configuredAssignedStaffRefreshStore({config,resolveUser:()=>actor}), /configuration is invalid/);
    return;
  }

  const journal = memoryJournals(t, [STAFF_FILE,NORMAL_FILE,ISSUER_FILE,SEMIH_FILE,config.CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE]);
  journal.seed(SEMIH_FILE, JSON.stringify({schema:1,grants:[],syntheticPreserved:true}));
  t.mock.method(dotenv, 'config', () => ({parsed:{}}));
  const previous = Object.fromEntries(Object.keys(config).map(key => [key, process.env[key]]));
  Object.assign(process.env, config);
  const {env} = await import('../config/env.js');
  const authBefore = {...env.auth}, whatsappBefore = {...env.whatsapp};
  const password = crypto.randomBytes(24).toString('base64url'), salt = 'offline-assigned-staff';
  const passwordHash = `scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`;
  const staff = {id:STAFF_ID,username:'crm-crm06-staff',displayName:'Synthetic assigned staff',role:'personel',active:true,chatwootAgentId:2,passwordHash};
  const oldNormal = {...staff,id:'crm-agent-test-20261011',username:'crm-agent-test',chatwootAgentId:3};
  const issuer = {...staff,id:'offline-assigned-staff-issuer',username:'offline-assigned-staff-issuer',role:'mudur'};
  const ordinary = {...staff,id:'offline-ordinary-staff',username:'offline-ordinary-staff'};
  Object.assign(env.auth, {jwtSecret:crypto.randomBytes(48).toString('hex'),issuer:'offline-assigned-staff',audience:'offline-assigned-staff-ui',tokenExpiresIn:'5m',personnelCanSend:false,loginRateLimitMax:1000,users:[staff,oldNormal,issuer,ordinary]});
  Object.assign(env.whatsapp, {sendEnabled:false,liveSendApproved:false,provider:'evolution'});
  let server;
  try {
    const auth = await import('./crmAuthService.js');
    const {authRoutes} = await import('../routes/authRoutes.js');
    const app = express(); app.use(express.json()); app.use(authRoutes);
    app.use((error,_req,res,_next) => res.status(error.statusCode || 500).json({success:false,error:{code:error.code}}));
    server = app.listen(0,'127.0.0.1'); await new Promise(resolve => server.once('listening',resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (route, {body,token,headers={}}={}) => fetch(base+route,{method:body===undefined?'GET':'POST',headers:{origin:config.CRM_UI_ORIGIN,...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:`Bearer ${token}`} : {}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const login = actor => auth.authenticateCrmUser({username:actor.username,password});
    const rejects = fn => assert.throws(fn, {statusCode:401});
    const legacy = login(oldNormal), issuerSession = login(issuer);
    const preserved = () => [NORMAL_FILE,ISSUER_FILE,SEMIH_FILE].map(file => journal.read(file));
    const oldState = preserved();

    await t.test('password login and me verify finite SID with only assigned personnel permissions', async () => {
      const response = await call('/auth/login',{body:{username:staff.username,password}});
      assert.equal(response.status,200); const result = (await response.json()).data;
      assert.equal(typeof result.refreshToken,'string'); assert.equal(Number.isSafeInteger(result.refreshExpiresAt),true);
      assert.equal(Number.isSafeInteger(result.expiresAt),true); assert.equal(result.refreshExpiresAt>result.expiresAt,true);
      assert.equal(typeof jwt.decode(result.accessToken).normalSessionId,'string');
      const me = await call('/auth/me',{token:result.accessToken}); assert.equal(me.status,200);
      const user = (await me.json()).data;
      assert.equal(user.id,STAFF_ID); assert.equal(user.role,'personel'); assert.equal(user.chatwootAgentId,2);
      assert.deepEqual(user.permissions,['crm.view']); assert.equal(user.assignedStaffRefresh,true);
      assert.equal(Object.hasOwn(user,'customerProductRequestIssuer'),false);
      assert.equal(user.liveSendEnabled,false); assert.equal(user.paidAiEnabled,false);
      assert.equal(auth.publicCrmUser(auth.findCrmUserById(STAFF_ID)).assignedStaffRefresh,undefined);
      assert.equal(auth.publicCrmUser(auth.verifyCrmAccessToken(result.accessToken)).assignedStaffRefresh,true);
      const state = journal.read(STAFF_FILE);
      for (const secret of [password,passwordHash,result.accessToken,result.refreshToken]) assert.equal(state.includes(secret),false);
      const grantless = jwt.sign({username:staff.username,role:staff.role},env.auth.jwtSecret,{subject:STAFF_ID,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:'5m'});
      rejects(() => auth.verifyCrmAccessToken(grantless));
      const expired = jwt.sign({username:staff.username,role:staff.role,normalSessionId:jwt.decode(result.accessToken).normalSessionId},env.auth.jwtSecret,{subject:STAFF_ID,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:-1});
      assert.throws(() => auth.verifyCrmAccessToken(expired), {code:'AUTH_TOKEN_EXPIRED',statusCode:401});
      assert.equal(auth.canAccessConversation(auth.verifyCrmAccessToken(result.accessToken),{chatwootAgentId:2}),true);
      assert.equal(auth.canAccessConversation(auth.verifyCrmAccessToken(result.accessToken),{chatwootAgentId:3}),false);
      rejects(() => auth.logoutCustomerRequestIssuerSession(result.accessToken));
    });

    await t.test('rotation rejects replay; current and retired logout revoke only their own staff family', async () => {
      const first = login(staff), sibling = login(staff);
      const refreshResponse = await call('/auth/refresh',{body:{refreshToken:first.refreshToken}});
      assert.equal(refreshResponse.status,200); const rotated = (await refreshResponse.json()).data;
      assert.equal(rotated.user.assignedStaffRefresh,true);
      assert.equal(Object.hasOwn(rotated.user,'customerProductRequestIssuer'),false);
      assert.equal(rotated.refreshToken!==first.refreshToken,true);
      assert.equal(jwt.decode(rotated.accessToken).normalSessionId===jwt.decode(first.accessToken).normalSessionId,true);
      assert.equal(rotated.refreshExpiresAt,first.refreshExpiresAt);
      rejects(() => auth.refreshNormalCrmSession(first.refreshToken));
      assert.equal((await call('/auth/refresh',{body:{refreshToken:first.refreshToken}})).status,401);
      assert.equal(auth.verifyCrmAccessToken(rotated.accessToken).id,STAFF_ID);
      const retiredLogout = await call('/auth/logout',{body:{refreshToken:first.refreshToken}});
      assert.equal(retiredLogout.status,200);
      rejects(() => auth.verifyCrmAccessToken(first.accessToken)); rejects(() => auth.verifyCrmAccessToken(rotated.accessToken));
      rejects(() => auth.refreshNormalCrmSession(rotated.refreshToken));
      assert.equal(auth.verifyCrmAccessToken(sibling.accessToken).id,STAFF_ID);
      assert.equal((await call('/auth/logout',{body:{refreshToken:sibling.refreshToken}})).status,200);
      rejects(() => auth.verifyCrmAccessToken(sibling.accessToken));
    });

    await t.test('bearer empty-body logout works after RAM loss and rejects mixed families and ordinary JWTs', async () => {
      const own = login(staff), sibling = login(staff), ordinarySession = login(ordinary);
      for (const request of [
        {token:own.accessToken,body:{refreshToken:sibling.refreshToken}},
        {token:own.accessToken,body:[],headers:{}},
        {token:own.accessToken,body:{},headers:{cookie:'melisa-crm-semih-test-refresh=synthetic'}},
      ]) assert.equal((await call('/auth/logout',request)).status,401);
      assert.equal((await call('/auth/logout?extra=true',{token:own.accessToken,body:{}})).status,401);
      assert.equal((await call('/auth/logout',{token:ordinarySession.accessToken,body:{}})).status,401);
      rejects(() => auth.logoutNormalAccessSession(legacy.accessToken));
      const loggedOut = await call('/auth/logout',{token:own.accessToken,body:{}}); assert.equal(loggedOut.status,200);
      assert.equal((await loggedOut.json()).data.loggedOut,true);
      rejects(() => auth.verifyCrmAccessToken(own.accessToken)); rejects(() => auth.refreshNormalCrmSession(own.refreshToken));
      assert.equal(auth.verifyCrmAccessToken(sibling.accessToken).id,STAFF_ID);
      assert.equal((await call('/auth/me',{token:own.accessToken})).status,401);
    });

    await t.test('a valid signature cannot transplant another identity SID across staff and issuer journals', () => {
      const session = login(staff), before = journal.read(STAFF_FILE);
      const tokenWithSid = (actor,sid) => jwt.sign({username:actor.username,role:actor.role,normalSessionId:sid},env.auth.jwtSecret,{subject:actor.id,issuer:env.auth.issuer,audience:env.auth.audience,expiresIn:'5m'});
      const staffWithIssuerSid = tokenWithSid(staff,jwt.decode(issuerSession.accessToken).normalSessionId);
      const issuerWithStaffSid = tokenWithSid(issuer,jwt.decode(session.accessToken).normalSessionId);
      const staffWithAgent3Sid = tokenWithSid(staff,jwt.decode(legacy.accessToken).normalSessionId);
      for (const token of [staffWithIssuerSid,issuerWithStaffSid,staffWithAgent3Sid]) {
        rejects(() => auth.verifyCrmAccessToken(token)); rejects(() => auth.logoutNormalAccessSession(token));
      }
      assert.equal(journal.read(STAFF_FILE)===before,true); assert.deepEqual(preserved(),oldState);
      assert.equal(auth.verifyCrmAccessToken(session.accessToken).id,STAFF_ID);
    });

    await t.test('role assignment password active status and permissions changes invalidate existing staff grant', () => {
      const original = {...staff};
      for (const change of [{role:'mudur'},{chatwootAgentId:3},{passwordHash:`scrypt$changed$${'a'.repeat(128)}`},{active:false},{username:'changed-staff'}]) {
        const session = login(staff); Object.assign(staff,change);
        try {
          rejects(() => auth.verifyCrmAccessToken(session.accessToken));
          rejects(() => auth.refreshNormalCrmSession(session.refreshToken));
          rejects(() => auth.logoutNormalAccessSession(session.accessToken));
          if (!Object.hasOwn(change,'passwordHash')) rejects(() => login(staff));
        } finally {Object.assign(staff,original);}
      }
      const session = login(staff); env.auth.personnelCanSend=true;
      try {rejects(() => auth.verifyCrmAccessToken(session.accessToken)); rejects(() => login(staff));}
      finally {env.auth.personnelCanSend=false;}
    });

    await t.test('changed finite and shared TEST policy revokes access without legacy-family journal writes', () => {
      for (const [key,value] of [
        ['CRM_ASSIGNED_STAFF_REFRESH_ENABLED','false'],['CRM_ASSIGNED_STAFF_REFRESH_USER_ID','wrong-id'],
        ['CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH',`${ROOT}/changed.json`],
        ['CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED','false'],['CRM_CUSTOMER_PRODUCT_REQUEST_PROOF','true'],
        ['CRM_ISOLATED_PREPARATION','false'],['CRM_TEST_EXPECTED_DATABASE','LIVE'],
        ['CRM_UI_ORIGIN','http://127.0.0.1:62800'],['CRM_TEST_PORT_BASE','62800'],
        ['CRM_TEST_ERP_ORIGIN','http://127.0.0.1:4100'],['CRM_SEMIH_TEST_CONTINUE_ENABLED','true'],
        ['WHATSAPP_SEND_ENABLED','true'],['WHATSAPP_LIVE_SEND_APPROVED','true'],['CRM_PAID_AI_ENABLED','true'],
      ]) {
        const session = login(staff), before = process.env[key]; process.env[key]=value;
        try {rejects(() => auth.verifyCrmAccessToken(session.accessToken)); rejects(() => auth.refreshNormalCrmSession(session.refreshToken)); rejects(() => login(staff));}
        finally {process.env[key]=before;}
      }
      assert.deepEqual(preserved(),oldState);
      assert.equal(auth.verifyCrmAccessToken(legacy.accessToken).id,oldNormal.id);
      assert.equal(auth.verifyCrmAccessToken(issuerSession.accessToken).id,issuer.id);
      assert.equal(auth.publicCrmUser(auth.verifyCrmAccessToken(issuerSession.accessToken)).customerProductRequestIssuer,true);
      assert.equal(auth.publicCrmUser(auth.verifyCrmAccessToken(issuerSession.accessToken)).assignedStaffRefresh,undefined);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    Object.assign(env.auth,authBefore); Object.assign(env.whatsapp,whatsappBefore);
    for (const [key,value] of Object.entries(previous)) if (value===undefined) delete process.env[key]; else process.env[key]=value;
  }
});
