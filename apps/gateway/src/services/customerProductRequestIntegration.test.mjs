import test from 'node:test';
import assert from 'node:assert/strict';
import {customerRequestProofConfig,createCustomerProductRequestIntegration} from './customerProductRequestIntegration.mjs';
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
