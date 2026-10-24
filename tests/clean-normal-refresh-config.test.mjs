import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
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
