import test from 'node:test';
import assert from 'node:assert/strict';
import {customerRequestProofConfig,customerRequestRuntimeConfig,createCustomerProductRequestIntegration} from './customerProductRequestIntegration.mjs';
import {customerRequestSharedConfig,configuredCustomerRequestIssuerStore} from './customerRequestIssuerSession.mjs';
const valid=()=>({CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'true',CRM_UI_ORIGIN:'http://127.0.0.1:62800',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',CRM_PAID_AI_ENABLED:'false',CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:process.platform==='win32'?'C:\\private-fixture\\request.json':'/private-fixture/request.json'});
test('default runtime never mounts the customer request path',()=>{
  assert.equal(customerRequestProofConfig({}),null);
  assert.deepEqual(createCustomerProductRequestIntegration({environment:{}}),{enabled:false,router:null,service:null});
});
test('proof requires exact private read-only DB02 loopback configuration',()=>{
  assert.equal(customerRequestProofConfig(valid()).database,'MELISA_ERP_CRM_SHARED_TEST_20261009_02');
  for(const [key,value]of Object.entries({CRM_UI_ORIGIN:'http://192.168.1.46:62800',CRM_ISOLATED_PREPARATION:'false',CRM_TEST_EXPECTED_DATABASE:'LIVE',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4174',WHATSAPP_SEND_ENABLED:'true',WHATSAPP_LIVE_SEND_APPROVED:'true',CRM_PAID_AI_ENABLED:'true',CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:'./request.json'})){
    assert.throws(()=>customerRequestProofConfig({...valid(),[key]:value}),error=>error.code==='CUSTOMER_REQUEST_PROOF_REQUIRED');
  }
});
test('enabled flag alone cannot replace normal SID auth or a verified source reader',()=>{
  assert.throws(()=>createCustomerProductRequestIntegration({environment:valid()}),error=>error.code==='CUSTOMER_REQUEST_PROOF_REQUIRED');
});

const shared=()=>({...valid(),CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'false',CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'true',
 CRM_UI_ORIGIN:'http://127.0.0.1:62700',CRM_TEST_PORT_BASE:'62700',CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS:'["existing-owner"]',
 CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:'C:/Sirket/CRM/runtime/offline-shared-requests/requests.json',
 CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/runtime/offline-shared-requests/issuer.json'});

test('shared normal configuration is explicit, helper-free and closed outside exact read-only DB02',()=>{
 assert.equal(customerRequestSharedConfig({}),null);
 if(process.platform==='win32')assert.equal(customerRequestRuntimeConfig(shared()).mode,'shared');
 for(const[key,value]of Object.entries({CRM_CUSTOMER_PRODUCT_REQUEST_PROOF:'true',CRM_SEMIH_TEST_CONTINUE_ENABLED:'true',CRM_UI_ORIGIN:'http://127.0.0.1:62800',CRM_TEST_PORT_BASE:'62400',CRM_ISOLATED_PREPARATION:'false',CRM_TEST_EXPECTED_DATABASE:'LIVE',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4114',WHATSAPP_SEND_ENABLED:'true',WHATSAPP_LIVE_SEND_APPROVED:'true',CRM_PAID_AI_ENABLED:'true',CRM_TEST_LAN_ADDRESS:'192.168.1.47',CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS:'["crm-semih-test-20261012"]',CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE:'./requests.json',CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:'C:/Sirket/CRM/melisa-crm/issuer.json'})){
  assert.throws(()=>customerRequestSharedConfig({...shared(),[key]:value}),{code:'CUSTOMER_REQUEST_SHARED_TEST_REQUIRED'});
 }
 if(process.platform==='win32'){
  for(const ids of ['[]','["x","x"]','[1]','["crm-agent-test-20261011"]','not-json'])assert.throws(()=>customerRequestSharedConfig({...shared(),CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS:ids}));
  for(const file of [shared().CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE,'C:/Sirket/CRM/runtime/offline-shared-requests/normal.json'])assert.throws(()=>customerRequestSharedConfig({...shared(),CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH:file,CRM_NORMAL_REFRESH_JOURNAL_PATH:file}));
  assert.throws(()=>createCustomerProductRequestIntegration({environment:shared(),crmOrigin:'http://127.0.0.1:62701',catalogReader:async()=>{}}),{code:'CUSTOMER_REQUEST_PROOF_REQUIRED'});
 }
});

test('issuer configuration cannot turn a missing user or existing personel into an administrator',{skip:process.platform!=='win32'},()=>{
 const owner={id:'existing-owner',role:'patron',active:true,chatwootAgentId:2,permissions:['crm.view','crm.manage']};
 for(const user of [null,{...owner,role:'personel'},{...owner,testAdmin:true},{...owner,active:false},{...owner,permissions:['crm.view']}])assert.throws(()=>configuredCustomerRequestIssuerStore({config:shared(),resolveUser:()=>user}));
 const current=configuredCustomerRequestIssuerStore({config:shared(),resolveUser:()=>owner});assert(current.allows(owner));assert.equal(current.includes('existing-other'),false);
 const config=shared(),store=configuredCustomerRequestIssuerStore({config,resolveUser:()=>owner});config.WHATSAPP_SEND_ENABLED='true';assert.equal(store.allows(owner),false);
});
