import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import {configureTestServerEnvironment} from '../deploy/test-server.mjs';

const clean={CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_TEST_PORT_BASE:'62800',CRM_ISOLATED_PREPARATION:'true',
  CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',CRM_BASELINE_ENV:'synthetic-only'};
const opted={CRM_NORMAL_REFRESH_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'clean-staff-20261022',
  CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json'};
const root=path.resolve('fixture','melisa-crm');

test('clean refresh never inherits activation, actor or journal from the baseline',()=>{
  const env={...clean};
  configureTestServerEnvironment(root,{env,loadBaseline:()=>{Object.assign(env,opted);return {parsed:{}};}});
  assert.equal(env.CRM_NORMAL_REFRESH_ENABLED,'false');
  assert.equal(env.CRM_NORMAL_REFRESH_USER_ID,'');assert.equal(env.CRM_NORMAL_REFRESH_JOURNAL_PATH,'');
});

test('only the explicit exact owner-selected existing clean identity survives baseline overrides',()=>{
  const env={...clean,...opted};
  configureTestServerEnvironment(root,{env,loadBaseline:()=>{
    Object.assign(env,{CRM_NORMAL_REFRESH_ENABLED:'false',CRM_NORMAL_REFRESH_USER_ID:'foreign',CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/foreign.json'});return {parsed:{}};
  }});
  for(const [key,value]of Object.entries(opted))assert.equal(env[key],value);
  for(const key of ['WHATSAPP_SEND_ENABLED','WHATSAPP_LIVE_SEND_APPROVED','CRM_PAID_AI_ENABLED','CRM_SEMIH_TEST_CONTINUE_ENABLED'])assert.equal(env[key],'false');
  for(const override of [{CRM_NORMAL_REFRESH_USER_ID:'clean-semih-20261023'},{CRM_NORMAL_REFRESH_USER_ID:'crm-agent-test-20261011'},
    {CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/melisa-crm/session.json'}])
    assert.throws(()=>configureTestServerEnvironment(root,{env:{...clean,...opted,...override},loadBaseline:()=>({parsed:{}})}));
});

test('terminal handoff cannot inherit activation or a peer key from baseline credentials',()=>{
 const peerKey=crypto.randomBytes(32).toString('base64url'),env={...clean,...opted};
 configureTestServerEnvironment(root,{env,loadBaseline:()=>{Object.assign(env,{CRM_TERMINAL_HANDOFF_ENABLED:'true',CRM_TERMINAL_PEER_KEY:peerKey});return {parsed:{}};}});
 assert.equal(env.CRM_TERMINAL_HANDOFF_ENABLED,'false');assert.equal(env.CRM_TERMINAL_PEER_KEY,'');
});

test('explicit clean owner handoff settings survive baseline but require their own key and existing grant policy',()=>{
 const key=crypto.randomBytes(32).toString('base64url'),settings={CRM_TERMINAL_HANDOFF_ENABLED:'true',CRM_TERMINAL_PEER_KEY:key};
 const env={...clean,...opted,...settings};
 configureTestServerEnvironment(root,{env,loadBaseline:()=>{Object.assign(env,{CRM_TERMINAL_HANDOFF_ENABLED:'false',CRM_TERMINAL_PEER_KEY:'foreign'});return {parsed:{}};}});
 assert.equal(env.CRM_TERMINAL_HANDOFF_ENABLED,'true');assert(env.CRM_TERMINAL_PEER_KEY===key);
 for(const changes of [{CRM_NORMAL_REFRESH_ENABLED:'false'},{CRM_TERMINAL_PEER_KEY:''},{WHATSAPP_CRM_AUTH_JWT_SECRET:key}])
  assert.throws(()=>configureTestServerEnvironment(root,{env:{...clean,...opted,...settings,...changes},loadBaseline:()=>({parsed:{}})}));
});

test('clean management cannot inherit activation/file from baseline, and explicit activation is bound to existing normal journal',()=>{
 const settings={CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED:'true',CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE:'C:/Sirket/ERP/clean/20261022/runtime/crm-managed-users.json'};
 let env={...clean,...opted};configureTestServerEnvironment(root,{env,loadBaseline:()=>{Object.assign(env,settings);return {parsed:{}};}});
 assert.equal(env.CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED,'false');assert.equal(env.CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE,'');
 env={...clean,...opted,...settings};configureTestServerEnvironment(root,{env,loadBaseline:()=>{Object.assign(env,{CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED:'false',CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE:'C:/foreign.json'});return {parsed:{}};}});
 assert.equal(env.CRM_CLEAN_ACCOUNT_MANAGEMENT_ENABLED,'true');assert.equal(env.CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE,settings.CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE);
 for(const change of [{CRM_NORMAL_REFRESH_ENABLED:'false'},{CRM_CLEAN_ACCOUNT_MANAGEMENT_FILE:'C:/foreign.json'}])assert.throws(()=>configureTestServerEnvironment(root,{env:{...clean,...opted,...settings,...change},loadBaseline:()=>({parsed:{}})}));
});
