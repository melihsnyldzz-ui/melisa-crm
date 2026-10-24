import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {resolveTestDirectories} from '../deploy/test-supervisor.mjs';
import {configureTestServerEnvironment,validateTestLanAddress,resolveTestLanNetwork,testUiRequestAllowed,createTestUiHandler,testAdminBootstrapAllowed} from '../deploy/test-server.mjs';
import {createCrmCatalogReadSource,normalizeCrmOrigin} from '../packages/erp-adapter/services/crmCatalogReadSource.mjs';

test('TEST supervisor state and logs default outside the canonical checkout',()=>{
  const checkout=path.resolve('fixture-crm','melisa-crm');
  assert.deepEqual(resolveTestDirectories(checkout,{}),{
    runtime:path.resolve('fixture-crm','runtime','test-completion'),
    logs:path.resolve('fixture-crm','logs','test-completion'),
  });
  for(const key of ['CRM_TEST_RUNTIME_DIR','CRM_TEST_LOG_DIR']){
    for(const directory of [checkout,path.join(checkout,'runtime')])assert.throws(()=>resolveTestDirectories(checkout,{[key]:directory}),/TEST_STATE_MUST_BE_OUTSIDE_CHECKOUT/);
  }
  const runtime=path.resolve('private-test-runtime'),logs=path.resolve('private-test-logs');
  assert.deepEqual(resolveTestDirectories(checkout,{CRM_TEST_RUNTIME_DIR:runtime,CRM_TEST_LOG_DIR:logs}),{runtime,logs});
});

test('TEST auth origin rejects external hosts, credentials and non-origin URLs',()=>{
  for(const host of ['127.0.0.1','localhost','[::1]'])assert.equal(normalizeCrmOrigin(`http://${host}:62401/`,{loopbackOnly:true}),`http://${host}:62401`);
  for(const value of ['http://example.com:62401','http://127.0.0.1.example.com:62401'])assert.throws(()=>normalizeCrmOrigin(value,{loopbackOnly:true}),/TEST_CRM_LOOPBACK_REQUIRED/);
  for(const value of ['file:///tmp/test','http://user:secret@127.0.0.1:62401','http://127.0.0.1:62401/auth/me','http://127.0.0.1:62401/?token=x','http://127.0.0.1:62401/#token'])assert.throws(()=>normalizeCrmOrigin(value,{loopbackOnly:true}),/CRM_ORIGIN_INVALID/);
});

test('LAN configuration is opt-in, RFC1918 only, and cannot be inherited from baseline',()=>{
  for(const address of ['192.168.1.46','10.2.3.4','172.16.2.4','172.31.2.4',''])assert.equal(validateTestLanAddress(address),address);
  for(const address of ['0.0.0.0','127.0.0.1','100.64.1.2','8.8.8.8','172.32.1.2','192.168.1.256','192.168.01.46','192.168.1.46:62400',null])assert.throws(()=>validateTestLanAddress(address));
  for(const selected of ['', '192.168.1.46']){
    const env={CRM_BASELINE_ENV:'fixture',CRM_TEST_LAN_ADDRESS:selected};
    configureTestServerEnvironment(path.resolve('fixture-crm','melisa-crm'),{env,loadBaseline:()=>{env.CRM_TEST_LAN_ADDRESS='8.8.8.8';env.CRM_CATALOG_UI_ORIGINS='*';return{parsed:{}}}});
    const origins='http://127.0.0.1:62400'+(selected?',http://192.168.1.46:62400':'');
    assert.equal(env.CRM_TEST_LAN_ADDRESS,selected);assert.equal(env.WHATSAPP_CRM_CORS_ORIGINS,origins);assert.equal(env.CRM_CATALOG_UI_ORIGINS,origins);assert.equal(env.CRM_UI_ORIGIN,'http://127.0.0.1:62400');
  }
});

const lanInterface={address:'192.168.1.46',netmask:'255.255.255.0',family:'IPv4',internal:false};
const lan=()=>resolveTestLanNetwork('192.168.1.46',{Ethernet:[lanInterface]});
const uiRequest=(remote='192.168.1.20')=>({method:'POST',url:'/api/live/auth/login',socket:{localAddress:'192.168.1.46',remoteAddress:remote},headers:{host:'192.168.1.46:62400',origin:'http://192.168.1.46:62400'}});
test('LAN network requires an existing exact IPv4 interface and a contiguous private subnet',()=>{
  assert.equal(resolveTestLanNetwork('',{}),null);assert.equal(lan().origin,'http://192.168.1.46:62400');
  for(const interfaces of [{},{Ethernet:[{...lanInterface,internal:true}]},{Ethernet:[{...lanInterface,netmask:'255.0.255.0'}]},{Ethernet:[{...lanInterface,netmask:'0.0.0.0'}]},{Ethernet:[{...lanInterface,netmask:'255.0.0.0'}]}])assert.throws(()=>resolveTestLanNetwork('192.168.1.46',interfaces));
});

test('LAN requests require exact host/origin, local subnet and cannot obtain TEST ADMIN',()=>{
  const network=lan();assert.equal(testUiRequestAllowed(uiRequest(),network),true);
  for(const remote of ['192.168.2.20','10.0.0.20','100.100.1.1','8.8.8.8','127.0.0.1'])assert.equal(testUiRequestAllowed(uiRequest(remote),network),false);
  for(const headers of [{host:'127.0.0.1:62400'},{origin:'http://192.168.1.99:62400'},{origin:undefined},{'x-forwarded-for':'127.0.0.1'},{'x-forwarded-host':'127.0.0.1:62400'}])assert.equal(testUiRequestAllowed({...uiRequest(),headers:{...uiRequest().headers,...headers}},network),false);
  const read={...uiRequest(),method:'GET',headers:{host:'192.168.1.46:62400'}};assert.equal(testUiRequestAllowed(read,network),true);
  const loopback={...uiRequest(),socket:{localAddress:'127.0.0.1',remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:62400',origin:'http://127.0.0.1:62400'}};assert.equal(testUiRequestAllowed(loopback),true);
  const bootstrap={...uiRequest(),url:'/api/test-admin/session'};assert.equal(testAdminBootstrapAllowed(bootstrap),false);
  let sessionCalls=0,status,body;
  const handler=createTestUiHandler({assets:path.resolve('fixture-assets'),lanNetwork:network,createTestSession:()=>{sessionCalls++;return{}}});
  handler(bootstrap,{setHeader(){},writeHead(value){status=value},end(value){body=value}});
  assert.equal(status,403);assert.equal(sessionCalls,0);assert.match(body,/TEST_ADMIN_ORIGIN_REQUIRED/);
});

test('baseline dotenv cannot route TEST journal or runtime into LIVE locations',()=>{
  const checkout=path.resolve('fixture-crm','melisa-crm'),runtime=path.resolve('isolated-test-runtime');
  for(const override of [undefined,runtime]){
    const env={CRM_BASELINE_ENV:'synthetic-private-config',CRM_WAAPI_JOURNAL_DIR:path.resolve('live-journal'),...(override?{CRM_TEST_RUNTIME_DIR:override}:{})};
    configureTestServerEnvironment(checkout,{env,loadBaseline:options=>{
      assert.equal(options.processEnv,env);assert.equal(options.quiet,true);
      Object.assign(env,{CRM_WAAPI_JOURNAL_DIR:path.resolve('another-live-journal'),CRM_TEST_RUNTIME_DIR:path.resolve('live-runtime'),CRM_TEST_LOG_DIR:path.resolve('live-logs')});return{parsed:{}};
    }});
    const expectedRuntime=override||path.resolve('fixture-crm','runtime','test-completion');
    assert.equal(env.CRM_TEST_RUNTIME_DIR,expectedRuntime);assert.equal(env.CRM_WAAPI_JOURNAL_DIR,path.join(expectedRuntime,'waapi'));
    assert.equal(env.CRM_TEST_LOG_DIR,path.resolve('fixture-crm','logs','test-completion'));
    assert.equal(env.WHATSAPP_ALLOWED_TEST_NUMBERS,'905387217733');assert.equal(env.WHATSAPP_TEST_NUMBER_ONLY,'true');
    assert.equal(env.WAAPI_INCOMING_TEST_ONLY,'false');
    assert.equal(env.CHATWOOT_INBOX_FALLBACK_ENABLED,'false');
    assert.equal(env.CRM_ERP_CATALOG_ORIGIN,'http://127.0.0.1:62402');assert.equal(env.CRM_ERP_CATALOG_PHOTO_CRM_AUTH,'true');
  }
  let loaded=false;
  assert.throws(()=>configureTestServerEnvironment(checkout,{env:{CRM_BASELINE_ENV:'fixture',CRM_TEST_RUNTIME_DIR:checkout},loadBaseline:()=>{loaded=true}}),/TEST_STATE_MUST_BE_OUTSIDE_CHECKOUT/);
  assert.equal(loaded,false);
});

test('catalog authentication uses the explicit TEST gateway; default origin stays compatible',async()=>{
  for(const origin of [undefined,'http://127.0.0.1:62401']){
    const calls=[];let sqlCalls=0;
    const handle=createCrmCatalogReadSource({activationApproved:true,crmOrigin:origin,
      transport:async(url,options)=>{calls.push({url:String(url),options});return Response.json({success:false,error:{code:'AUTH_TOKEN_INVALID'}},{status:401});},
      getSqlPool:async()=>{sqlCalls++;throw Error('SQL_NOT_EXPECTED');},getSqlDriver:()=>({}),readExistingStock:async()=>{throw Error('STOCK_NOT_EXPECTED');},
    });
    const response=await handle(new Request('http://127.0.0.1:62402/api/crm-catalog/products',{headers:{authorization:'Bearer synthetic-fixture'}}));
    assert.equal(response.status,401);assert.equal(sqlCalls,0);
    assert.equal(calls.length,1);assert.equal(calls[0].url,`${origin||'http://127.0.0.1:4200'}/auth/me`);
    assert.equal(calls[0].options.redirect,'manual');assert.equal(calls[0].options.headers.authorization,'Bearer synthetic-fixture');
    assert.equal((await response.json()).error.code,'AUTH_TOKEN_INVALID');
  }
});

test('TEST copilot activation and rule storage cannot be inherited or broadened by baseline dotenv',()=>{
  for(const mode of [undefined,'off','copilot']){
    const env={CRM_BASELINE_ENV:'synthetic-private-config',CRM_AI_SALES_RULES_FILE:path.resolve('live-runtime','sales-rules.json'),...(mode?{CRM_AI_SALES_MODE:mode}:{})};
    configureTestServerEnvironment(path.resolve('fixture-crm','melisa-crm'),{env,loadBaseline:()=>{
      Object.assign(env,{CRM_AI_SALES_MODE:'copilot',CRM_AI_SALES_CONVERSATION_ID:'777',CRM_AI_SALES_RULES_FILE:'unapproved-policy'});
      return {parsed:{}};
    }});
    assert.equal(env.CRM_AI_SALES_MODE,mode==='copilot'?'copilot':'off');
    assert.equal(env.CRM_AI_SALES_CONVERSATION_ID,'55');
    assert.equal(env.CRM_AI_SALES_TEST_PEER,'905387217733');
    assert.equal(env.CRM_AI_SALES_RULES_FILE,path.resolve('fixture-crm','runtime','test-completion','ai-sales-rules.json'));
  }
});

test('passive general TEST inbound does not broaden outbound, AI or automatic replies',()=>{
  const env={CRM_BASELINE_ENV:'synthetic-private-config'};
  configureTestServerEnvironment(path.resolve('fixture-crm','melisa-crm'),{env,loadBaseline:()=>{
    Object.assign(env,{WAAPI_INCOMING_TEST_ONLY:'true',WHATSAPP_TEST_NUMBER_ONLY:'false',WHATSAPP_ALLOWED_TEST_NUMBERS:'12345678901',
      WAAPI_TEST_RECIPIENT:'12345678901',WHATSAPP_AUTO_REPLY_ENABLED:'true',CRM_AI_SALES_CONVERSATION_ID:'999'});
    return {parsed:{}};
  }});
  assert.equal(env.WAAPI_INCOMING_TEST_ONLY,'false');
  assert.equal(env.WHATSAPP_TEST_NUMBER_ONLY,'true');
  assert.equal(env.WHATSAPP_ALLOWED_TEST_NUMBERS,'905387217733');
  assert.equal(env.WAAPI_TEST_RECIPIENT,'905387217733');
  assert.equal(env.WHATSAPP_AUTO_REPLY_ENABLED,'false');
  assert.equal(env.CRM_AI_SALES_CONVERSATION_ID,'55');
  assert.equal(env.CRM_AI_SALES_TEST_PEER,'905387217733');
});
