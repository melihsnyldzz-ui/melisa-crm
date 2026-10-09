import {offlineBuildEnvironment} from '../deploy/test-package.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
import {configureTestServerEnvironment,testAdminBootstrapAllowed,testPersonnelBootstrapAllowed,testUiRequestAllowed,resolveTestLanNetwork,testTerminalFrameAllowed} from '../deploy/test-server.mjs';
import {createCanonicalCatalogReader,assertCatalogTestIdentity} from '../packages/erp-adapter/services/canonicalCatalogReader.mjs';
const shared={CRM_TEST_PORT_BASE:'62600',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4174',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_01'};
test('shared ports require the exact isolated ERP target and never fall back to normal TEST',()=>{
  const e=resolveTestEndpoints(shared);assert.deepEqual([e.ui,e.gateway,e.catalog,e.orders,e.native],[62600,62601,62602,62603,62604]);
  for(const override of [{CRM_ISOLATED_PREPARATION:'false'},{CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4144'},{CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_SIRKET_TEST_20260929_01'},{CRM_TEST_ERP_ORIGIN:'http://example.com:4174'},{CRM_TEST_PORT_BASE:'62601'}])assert.throws(()=>resolveTestEndpoints({...shared,...override}));
  const req={method:'POST',url:'/api/test-admin/session',socket:{remoteAddress:'127.0.0.1',localAddress:'127.0.0.1'},headers:{host:'127.0.0.1:62600',origin:e.uiOrigin}};
  assert.equal(testAdminBootstrapAllowed(req,e),true);assert.equal(testAdminBootstrapAllowed(req,resolveTestEndpoints({})),false);assert.equal(testUiRequestAllowed(req,null,e),true);
});
test('isolated configuration overrides inherited provider/model/send activation',()=>{
  const env={...shared,CRM_BASELINE_ENV:'synthetic',CRM_PAID_AI_ENABLED:'true',CRM_AI_SALES_MODE:'copilot'};
  configureTestServerEnvironment(path.resolve('fixture','melisa-crm'),{env,loadBaseline:()=>{Object.assign(env,{CRM_PAID_AI_ENABLED:'true',WHATSAPP_SEND_ENABLED:'true',CRM_ISOLATED_PREPARATION:'false',CRM_TEST_PORT_BASE:'62400'});return {parsed:{}};}});
  assert.equal(env.CRM_TEST_PORT_BASE,'62600');assert.equal(env.CRM_ISOLATED_PREPARATION,'true');assert.equal(env.CRM_PAID_AI_ENABLED,'false');assert.equal(env.CRM_AI_SALES_MODE,'off');assert.equal(env.WHATSAPP_SEND_ENABLED,'false');assert.equal(env.WAAPI_CHATWOOT_BRIDGE_ENABLED,'false');assert.equal(env.CRM_ERP_CATALOG_ORIGIN,'http://127.0.0.1:62602');
});
test('catalog target pin prevents using normal DB on isolated origin or LIVE origin',()=>{
  assert.doesNotThrow(()=>createCanonicalCatalogReader({erpOrigin:shared.CRM_TEST_ERP_ORIGIN,expectedDatabase:shared.CRM_TEST_EXPECTED_DATABASE}));
  assert.throws(()=>createCanonicalCatalogReader({erpOrigin:shared.CRM_TEST_ERP_ORIGIN}));
  assert.throws(()=>createCanonicalCatalogReader({erpOrigin:'http://127.0.0.1:4114',expectedDatabase:shared.CRM_TEST_EXPECTED_DATABASE}));
});

test('offline shared build pins only the public isolated profile, without inherited VITE or credentials',()=>{
 const env=offlineBuildEnvironment(path.resolve('fixture-staging'),{isolatedPreparation:true});
 assert.equal(env.VITE_CRM_ISOLATED_PREPARATION,'1');assert.equal(env.VITE_ERP_ORDER_TEST_DATABASE,'MELISA_ERP_CRM_SHARED_TEST_20261009_01');assert.equal(env.CRM_ISOLATED_PREPARATION,undefined);
 assert.throws(()=>offlineBuildEnvironment(path.resolve('fixture-staging'),{isolatedPreparation:'true'}));
});
test('shared LAN uses the existing exact interface without LAN bootstrap privileges',()=>{
 const e=resolveTestEndpoints(shared),env={...shared,CRM_BASELINE_ENV:'synthetic',CRM_TEST_LAN_ADDRESS:'192.168.1.46'};
 configureTestServerEnvironment(path.resolve('fixture','melisa-crm'),{env,loadBaseline:()=>({parsed:{}})});
 assert.equal(env.CRM_TEST_LAN_ADDRESS,'192.168.1.46');assert.equal(env.CRM_PAID_AI_ENABLED,'false');assert.equal(env.WHATSAPP_SEND_ENABLED,'false');
 const lan=resolveTestLanNetwork(env.CRM_TEST_LAN_ADDRESS,{Ethernet:[{internal:false,family:'IPv4',address:'192.168.1.46',netmask:'255.255.255.0'}]},e);
 const req={method:'POST',url:'/api/test-admin/session',socket:{localAddress:'192.168.1.46',remoteAddress:'192.168.1.50'},headers:{host:'192.168.1.46:62600',origin:lan.origin}};
 assert.equal(testUiRequestAllowed(req,lan,e),true);assert.equal(testAdminBootstrapAllowed(req,e),false);assert.equal(testPersonnelBootstrapAllowed({...req,url:'/api/test-personnel/session'},e),false);
 assert.equal(testTerminalFrameAllowed({method:'GET',url:'/?terminal=1',headers:{'sec-fetch-site':'same-site','sec-fetch-dest':'iframe',referer:'http://192.168.1.46:5224/terminal.html'}},req.headers.host),true);
 assert.throws(()=>configureTestServerEnvironment(path.resolve('fixture','melisa-crm'),{env:{...shared,CRM_BASELINE_ENV:'synthetic',CRM_TEST_LAN_ADDRESS:'192.168.1.47'},loadBaseline:()=>({parsed:{}})}),/SHARED_TEST_LAN_ADDRESS_REQUIRED/);
});

test('shared ERP and native dependency probes accept only exact isolated health',async()=>{
 const {probeTestDependencies}=await import('../deploy/test-supervisor.mjs');
 const e=resolveTestEndpoints(shared),base={ok:true,environment:'ISOLATED_TEST_COPY',serverName:'Semih\\MELISADEV',originalDatabaseAccess:0,liveDatabaseAccess:0,sysadmin:0,databaseControl:0,externalOperations:false,automaticJobs:false,actualT1:false};
 const erp={...base,port:4174,databaseName:e.database,mode:'erp',writes:true},native={...base,port:62604,database:e.database,purpose:'crm-order-draft-only',stockEffect:false,ledgerEffect:false,reservationEffect:false,automaticJobs:false,sourceCommit:'n',packageId:'p'};
 assert.doesNotThrow(()=>assertCatalogTestIdentity(erp,{database:e.database,port:4174}));
 for(const override of [{},{databaseName:'OTHER'},{actualT1:true},{originalDatabaseAccess:1},{environment:'CANONICAL_TEST'}]){
  const health={...erp,...override},result=await probeTestDependencies({endpoints:e,expectedDatabase:e.database,nativeSourceCommit:'n',nativePackageId:'p',fetchImpl:async url=>({ok:true,json:async()=>url.includes('62604')?native:health})});
  assert.equal(result.erp.state,Object.keys(override).length?'identity-mismatch':'ready');assert.equal(result.native.state,'ready');
  if(Object.keys(override).length)assert.throws(()=>assertCatalogTestIdentity(health,{database:e.database,port:4174}));
 }
});

test('catalog ordinary login sends exact shared ERPweb Origin only for shared4174',async()=>{
 const {getErpAuthorization}=await import('../deploy/test-erp-catalog.mjs');
 for(const endpoints of [resolveTestEndpoints({}),resolveTestEndpoints(shared)]){
  const calls=[];await getErpAuthorization({refresh:true,testEndpoints:endpoints,environment:{CRM_ERP_CATALOG_ACCESS_PATH:path.resolve('fixture-private-access.json')},readFileFn:async()=>JSON.stringify({ilker:{username:'existing-fixture',password:'synthetic-only'}}),fetchFn:async(url,options)=>{calls.push({url,options});return Response.json({data:{accessToken:'synthetic-only',user:{permissions:['product.view','sales.view']}}});}});
  assert.equal(calls.length,1);assert.equal(calls[0].url,endpoints.erpOrigin+'/api/auth/login');assert.equal(calls[0].options.headers.origin,endpoints.isolated?'http://127.0.0.1:5224':undefined);assert.equal(calls[0].options.redirect,'error');
 }
});
