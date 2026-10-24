import test from 'node:test';
import assert from 'node:assert/strict';
import {normalRefreshUserPolicy,configuredNormalRefreshStore} from './normalRefreshSession.mjs';

const journal='C:/Sirket/ERP/clean/20261022/runtime/crm-normal-refresh.json';
export const cleanRefreshConfig=()=>({
  CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_ISOLATED_PREPARATION:'true',
  CRM_TEST_PORT_BASE:'62800',CRM_UI_ORIGIN:'http://127.0.0.1:62800',
  CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022',
  CRM_NORMAL_REFRESH_ENABLED:'true',CRM_NORMAL_REFRESH_USER_ID:'clean-staff-20261022',
  CRM_NORMAL_REFRESH_JOURNAL_PATH:journal,
  WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',
  CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'false',CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'false',
  CRM_SEMIH_TEST_CONTINUE_ENABLED:'false',CRM_ASSIGNED_STAFF_REFRESH_ENABLED:'false',
});
const actor=()=>({id:'clean-staff-20261022',username:'ornek-personel',role:'personel',active:true,
  chatwootAgentId:2,permissions:['crm.view','crm.send'],passwordHash:'synthetic-fixture-only'});

test('existing clean personnel refresh is exact, default-off and does not grant an ERP identity',()=>{
  const config=cleanRefreshConfig(),user=actor(),allowed=normalRefreshUserPolicy(config);
  assert.equal(allowed(user),true);
  assert.equal(configuredNormalRefreshStore({config:{}}),null);
  for(const change of [{id:'clean-stranger-20261022'},{id:'clean-semih-20261023'},
    {username:'another'},{role:'patron'},{chatwootAgentId:3},{active:false},
    {permissions:['crm.view']},{permissions:['crm.view','crm.send','crm.manage']},
    {testAdmin:true},{testPersonnel:true}])assert.equal(allowed({...user,...change}),false);
  assert.equal(allowed({...user,erpUserId:18}),true); // No trust or matching is derived from this unrelated field.
  for(const change of [{CRM_TEST_PROFILE:'legacy'},{CRM_ISOLATED_PREPARATION:'false'},
    {CRM_TEST_PORT_BASE:'62700'},{CRM_UI_ORIGIN:'http://127.0.0.1:62700'},
    {CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184'},{CRM_TEST_EXPECTED_DATABASE:'LIVE'},
    {CRM_NORMAL_REFRESH_USER_ID:'clean-semih-20261023'},{CRM_NORMAL_REFRESH_ENABLED:'false'},
    {WHATSAPP_SEND_ENABLED:'true'},{WHATSAPP_LIVE_SEND_APPROVED:'true'},{CRM_PAID_AI_ENABLED:'true'},
    {CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'true'},{CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'true'},
    {CRM_SEMIH_TEST_CONTINUE_ENABLED:'true'},{CRM_ASSIGNED_STAFF_REFRESH_ENABLED:'true'},
    {CRM_NORMAL_REFRESH_JOURNAL_PATH:journal+'.'},
    {CRM_NORMAL_REFRESH_JOURNAL_PATH:journal+':stream'},
    {CRM_NORMAL_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/melisa-crm/journal.json'},
    {CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH:journal.toUpperCase()},
    {CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH:journal+'.'},
    {CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:journal+':stream'},
    {CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:journal},
    {CRM_ASSIGNED_STAFF_REFRESH_JOURNAL_PATH:journal.replace('/runtime/','/runtime/./')}])
    assert.throws(()=>normalRefreshUserPolicy({...config,...change}));
  config.WHATSAPP_SEND_ENABLED='true';assert.equal(allowed(user),false);
});

test('clean factory requires the existing exact actor and a journal outside its source checkout',()=>{
  const config=cleanRefreshConfig();
  for(const user of [null,{...actor(),role:'patron'},{...actor(),chatwootAgentId:3}])
    assert.throws(()=>configuredNormalRefreshStore({config,resolveUser:()=>user,repoRoot:'C:/Sirket/CRM/melisa-crm'}));
  assert.throws(()=>configuredNormalRefreshStore({config,resolveUser:()=>actor(),repoRoot:'C:/Sirket/ERP/clean/20261022'}));
  if(process.platform==='win32')assert(configuredNormalRefreshStore({config,resolveUser:()=>actor(),repoRoot:'C:/Sirket/CRM/melisa-crm'}));
});
