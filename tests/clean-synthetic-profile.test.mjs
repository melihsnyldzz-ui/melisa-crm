// In-memory contracts and an ephemeral HTTP fixture; no SQL, fixed/runtime listener, installed TEST or user acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
import {createTestOrderHandler} from '../deploy/test-erp-orders.mjs';
import {createCanonicalCatalogReader} from '../packages/erp-adapter/services/canonicalCatalogReader.mjs';
import {canonicalProduct,canonicalMeta} from '../packages/erp-adapter/services/canonicalCatalog.mjs';
import {assertCanonicalMeta} from '../apps/frontend/src/catalog/canonicalStock.js';
import {verifiedBusinessCurrencies} from '../apps/frontend/src/catalog/model.js';
import {configureTestServerEnvironment,testAdminBootstrapAllowed,testPersonnelBootstrapAllowed} from '../deploy/test-server.mjs';
import {isTestCatalogPhotoOrigin} from '../apps/gateway/src/services/catalogBridge.mjs';
import path from 'node:path';
import http from 'node:http';
import {createApp} from '../apps/gateway/src/app.js';
import {env} from '../apps/gateway/src/config/env.js';
import {createPasswordHash} from '../apps/gateway/src/services/crmAuthService.js';
import {getErpAuthorization} from '../deploy/test-erp-catalog.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateNativeSource} from '../apps/frontend/src/lib/nativeOrder.js';

const clean={CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_TEST_PORT_BASE:'62800',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022'};
const sourceCommit='a'.repeat(40),packageId='clean-source-synthetic-fixture';
const health={environment:'CLEAN_SYNTHETIC_TEST',synthetic:true,serverName:'Semih\\MELISADEV',originalDatabaseAccess:0,liveDatabaseAccess:0,sysadmin:0,databaseControl:0,externalOperations:false,automaticJobs:false,actualT1:false};
const erpHealth={...health,ok:true,databaseName:clean.CRM_TEST_EXPECTED_DATABASE,port:4194,mode:'erp',writes:true};
const nativeHealth={...health,database:clean.CRM_TEST_EXPECTED_DATABASE,port:4196,purpose:'crm-order-draft-only',sourceCommit,packageId,stockEffect:false,ledgerEffect:false,reservationEffect:false};
const scope={scopeKind:'VERIFIED_CLEAN_SYNTHETIC_TEST',database:clean.CRM_TEST_EXPECTED_DATABASE,supportedCurrencies:['TRY','USD','EUR']};
const row=()=>({id:1,stockCode:'SYN-1',displayCode:'SYN-1',productName:'Yapay TEST ürünü',isActive:true,hold:{blocked:false},provenance:{kind:'synthetic-test',verified:true,sourceKey:'synthetic-clean:1'},barcodes:[],salePrices:[{id:1,unitSourceId:1,type:'sale',tier:1,currency:'TRY',isMainUnit:true,sourceKey:'synthetic-price:1',priceExact:'25.00000000'}],stockQuantityExact:'10.00000000',photo:{status:'missing',verified:false}});
const meta=()=>({schemaVersion:'melisa-catalog.v1',readOnly:true,freshLive:false,readAt:new Date().toISOString(),sourceAsOf:'2026-10-22',scopeCounts:{syntheticTest:1},total:1,page:1,limit:50,filters:{brands:[],productTypes:[]}});
const body={requestId:'c06a0001-0000-4000-8000-000000000001',conversationId:'55',peer:'905550000001',customerId:1,customerMatch:{basis:'exact-phone',phone:'905550000001',revision:'b'.repeat(64),reason:null},documentCurrency:'TRY',exchangeRateExact8:'1.00000000',items:[{productId:1,stockCode:'SYN-1',quantity:2,priceId:1,unitSourceId:1,tier:1,currency:'TRY',priceExact8:'25.00000000',priceSourceKey:'synthetic-price:1'}]};

test('clean profile is a separate exact topology and cannot borrow a legacy identity',()=>{
 const e=resolveTestEndpoints(clean);
 assert.deepEqual([e.ui,e.gateway,e.catalog,e.orders,e.native,e.erpPort],[62800,62801,62802,62803,4196,4194]);
 assert.equal(e.cleanSynthetic,true);assert.equal(e.erpUiOrigin,'http://127.0.0.1:5244');
 for(const override of [{CRM_TEST_PROFILE:''},{CRM_TEST_PROFILE:'other'},{CRM_ISOLATED_PREPARATION:'false'},{CRM_TEST_PORT_BASE:'62700'},{CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184'},{CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'},{CRM_TEST_ERP_ORIGIN:'http://localhost:4194'}])assert.throws(()=>resolveTestEndpoints({...clean,...override}));
 assert.equal(resolveTestEndpoints({}).ui,62400);
});

test('clean setup keeps ordinary login and closes helpers, providers, paid AI and inherited activation',()=>{
 const env={...clean,CRM_BASELINE_ENV:'synthetic-owner-config',CRM_PAID_AI_ENABLED:'true'};
 configureTestServerEnvironment(path.resolve('fixture','melisa-crm'),{env,loadBaseline:()=>{Object.assign(env,{CRM_TEST_PROFILE:'legacy',CHATWOOT_INBOX_READ_ENABLED:'true',WHATSAPP_SEND_ENABLED:'true',CRM_AI_SALES_MODE:'copilot',CRM_TEST_TERMINAL_PERSONNEL_USERNAME:'crm-ahmet',OPENAI_API_KEY:'synthetic-only'});return {parsed:{}};}});
 assert.equal(env.CRM_TEST_PROFILE,clean.CRM_TEST_PROFILE);assert.equal(env.CRM_TEST_TERMINAL_PERSONNEL_USERNAME,'');
 for(const key of ['WHATSAPP_SEND_ENABLED','WHATSAPP_LIVE_SEND_APPROVED','WAAPI_CHATWOOT_BRIDGE_ENABLED','WAAPI_INCOMING_READER_ENABLED','CHATWOOT_INBOX_READ_ENABLED','CRM_PAID_AI_ENABLED'])assert.equal(env[key],'false',key);
 assert.equal(env.CRM_AI_SALES_MODE,'off');assert.equal(env.OPENAI_API_KEY,'');
 assert.equal(env.CRM_ERP_CATALOG_ORIGIN,'http://127.0.0.1:62802');
 const e=resolveTestEndpoints(env),req={method:'POST',url:'/api/test-admin/session',socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:62800',origin:e.uiOrigin}};
 assert.equal(testAdminBootstrapAllowed(req,e),false);assert.equal(testPersonnelBootstrapAllowed({...req,url:'/api/test-personnel/session'},e),false);
});

test('synthetic SQL products are explicit clean data and remain rejected on the old catalog contract',()=>{
 assert.throws(()=>canonicalProduct(row()));assert.throws(()=>canonicalMeta(meta(),{}, {id:'synthetic-crm'}));
 const product=canonicalProduct(row(),{cleanSynthetic:true});assert.equal(product.erpProductId,1);assert.equal(product.salePrices[0].priceExact,'25.00000000');
 const m=canonicalMeta(meta(),{}, {id:'synthetic-crm',role:'patron'},scope);
 assert.equal(m.environment,'CLEAN_SYNTHETIC_TEST');assert.equal(m.synthetic,true);assertCanonicalMeta(m);assert.deepEqual(verifiedBusinessCurrencies(scope),['TRY','USD','EUR']);
 for(const bad of [{...scope,database:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'},{...scope,scopeKind:'VERIFIED_BUSINESS_TEST'}])assert.throws(()=>verifiedBusinessCurrencies(bad));
 assert.throws(()=>assertCanonicalMeta({...m,environment:'CANONICAL_TEST'}));assert.throws(()=>canonicalProduct({...row(),provenance:{...row().provenance,kind:'vega'}},{cleanSynthetic:true}));
});

test('catalog reads use the real HTTP contract after current CRM and exact clean SQL identity checks',async()=>{
 for(const override of [{},{environment:'ISOLATED_TEST_COPY'},{synthetic:false},{databaseName:'OTHER'},{actualT1:true},{originalDatabaseAccess:1}]){
  const calls=[];const reader=createCanonicalCatalogReader({erpOrigin:clean.CRM_TEST_ERP_ORIGIN,expectedDatabase:clean.CRM_TEST_EXPECTED_DATABASE,crmOrigin:'http://127.0.0.1:62801',getErpAuthorization:async()=> 'Bearer synthetic-erp',transport:async(input)=>{const url=new URL(input);calls.push(url.pathname);if(url.pathname==='/auth/me')return Response.json({data:{id:'synthetic-crm',role:'patron',permissions:['crm.view']}});if(url.pathname==='/test-health')return Response.json({data:{...erpHealth,...override}});return Response.json({success:true,data:[row()],meta:meta()});}});
  const response=await reader(new Request('http://127.0.0.1:62802/api/crm-catalog/products',{headers:{authorization:'Bearer synthetic-crm'}}));
  assert.equal(response.status,Object.keys(override).length?503:200);
  assert.equal(calls.includes('/api/catalog/products'),!Object.keys(override).length);
  if(response.ok){const value=await response.json();assert.equal(value.data[0].id,'erp-1');assertCanonicalMeta(value.meta);}
 }
});

async function invoke(handler,method,url,input,extra={}){
 const req=Readable.from(input===undefined?[]:[JSON.stringify(input)]);Object.assign(req,{method,url,headers:{authorization:'Bearer synthetic-crm',...extra}});
 let status,value;await handler(req,{setHeader(){},writeHead(code){status=code;},end(text){value=JSON.parse(text);}});return {status,...value};
}
test('clean v2 proxy preserves the request UUID/body and both current authorities; unsafe targets cannot write',async()=>{
 for(const override of [{},{synthetic:false},{environment:'ISOLATED_TEST_COPY'},{stockEffect:true},{sourceCommit:'b'.repeat(40)}]){
  const writes=[];const e=resolveTestEndpoints(clean);
  const handler=createTestOrderHandler({testEndpoints:e,nativeSourceCommit:sourceCommit,nativePackageId:packageId,fetchFn:async(input,options={})=>{const url=new URL(input);if(url.pathname==='/auth/me')return Response.json({data:{id:'synthetic-crm',permissions:['crm.send']}});if(url.pathname==='/crm/conversations/55')return Response.json({data:{id:'55',phone:'+905550000001'}});if(url.pathname==='/test-health')return Response.json({data:url.port==='4196'?{...nativeHealth,...override}:erpHealth});if(options.method==='POST'){writes.push({url:String(url),...options});return Response.json({data:{request:body}});}throw Error('UNEXPECTED_FIXTURE_REQUEST');}});
  const result=await invoke(handler,'POST','/crm/erp/v2/drafts',body,{'x-erp-token':'synthetic-erp'});
  assert.equal(result.status,Object.keys(override).length?503:200);assert.equal(writes.length,Object.keys(override).length?0:1);
  if(writes.length){assert.equal(writes[0].url,'http://127.0.0.1:4196/api/test/crm/orders/v2/drafts');assert.deepEqual(JSON.parse(writes[0].body),body);assert.equal(writes[0].headers.Authorization,'Bearer synthetic-erp');assert.equal(writes[0].headers['X-CRM-Authorization'],'Bearer synthetic-crm');}
 }
});

test('photo CRM authorization is limited to the explicit clean catalog tuple',()=>{
 const old={};for(const [key,value]of Object.entries(clean)){old[key]=process.env[key];process.env[key]=value;}
 try{assert.equal(isTestCatalogPhotoOrigin('http://127.0.0.1:62802'),true);process.env.CRM_TEST_PROFILE='';assert.equal(isTestCatalogPhotoOrigin('http://127.0.0.1:62802'),false);assert.equal(isTestCatalogPhotoOrigin('http://example.com:62802'),false);}
 finally{for(const key of Object.keys(clean)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});

test('clean conversation seed uses ordinary HTTP login/JWT, fresh users and existing personnel assignment checks',async t=>{
 const projection={version:1,environment:'CLEAN_SYNTHETIC_TEST',synthetic:true,environmentId:'E662FD94-D797-4B3B-938A-D143AD758B67',database:clean.CRM_TEST_EXPECTED_DATABASE,conversations:[{id:'55',phone:'905550000001',name:'Örnek Mağaza',assigneeAgentId:2}]};
 const changes={...clean,CRM_CLEAN_CONVERSATION_PROJECTION_JSON:JSON.stringify(projection),CRM_NORMAL_REFRESH_ENABLED:'false',CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED:'false',CRM_SEMIH_TEST_CONTINUE_ENABLED:'false',CRM_PAID_AI_ENABLED:'false'};
 const prior=new Map(Object.keys(changes).map(key=>[key,process.env[key]]));Object.assign(process.env,changes);
 const priorAuth={...env.auth},priorCors=env.cors.origins,priorRead=env.chatwoot.inboxReadEnabled;
 const password='synthetic-only-fixture-20261022';
 env.auth.jwtSecret='synthetic-only-fixture-'.repeat(3);env.chatwoot.inboxReadEnabled=false;
 env.auth.users=[['manager','patron',1],['assigned','personel',2],['stranger','personel',3]].map(([name,role,agent])=>({id:'clean-'+name,username:'clean-'+name,displayName:'Yapay '+name,role,active:true,chatwootAgentId:agent,passwordHash:createPasswordHash(password,'synthetic-clean-'+name)}));
 const server=http.createServer(createApp());
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));Object.assign(env.auth,priorAuth);env.cors.origins=priorCors;env.chatwoot.inboxReadEnabled=priorRead;for(const [key,value]of prior){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;env.cors.origins=[origin];
 const call=async(route,token,body)=>{const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{origin,...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,...await response.json()};};
 const login=async name=>{const result=await call('/auth/login',null,{username:'clean-'+name,password});assert.equal(result.status,200);assert.equal(result.meta.source,'crm-auth');assert.equal(result.data.user.testAdmin,undefined);assert.equal(result.data.user.testPersonnel,undefined);assert.equal(result.data.user.passwordHash,undefined);return result.data.accessToken;};
 const manager=await login('manager'),assigned=await login('assigned'),stranger=await login('stranger');
 assert.equal((await call('/crm/inbox')).status,401);
 const list=await call('/crm/inbox',manager);assert.equal(list.status,200);assert.equal(list.data.summary.source,'clean-synthetic-projection');assert.equal(list.data.conversations[0].phone,'+905550000001');
 assert.equal((await call('/crm/inbox',assigned)).data.summary.total,1);assert.equal((await call('/crm/inbox',stranger)).data.summary.total,0);
 assert.equal((await call('/crm/conversations/55',manager)).data.id,'55');assert.equal((await call('/crm/conversations/55',stranger)).status,403);
 const agents=await call('/crm/agents',manager);assert.equal(agents.status,200);assert.equal(agents.data.agents.length,3);
 assert.equal((await call('/crm/conversations/55/messages',manager,{text:'never sent'})).status,403);
 env.auth.users[1].active=false;assert.equal((await call('/crm/inbox',assigned)).status,401);
 process.env.CRM_CLEAN_CONVERSATION_PROJECTION_JSON=JSON.stringify({...projection,environmentId:'OTHER'});assert.equal((await call('/crm/inbox',manager)).status,503);
 env.auth.users[1].active=true;process.env.CRM_CLEAN_CONVERSATION_PROJECTION_JSON=JSON.stringify({...projection,environmentId:projection.environmentId.toLowerCase()});assert.equal((await call('/crm/inbox',manager)).status,200);
});

test('clean ERP catalog credentials stay in the owner-provided process environment and never read a plaintext file',async()=>{
 const environment={...clean,CRM_CLEAN_ERP_CATALOG_ACCESS_JSON:JSON.stringify({ilker:{username:'synthetic-sales',password:'synthetic-only-fixture'}})},calls=[];
 const options={testEndpoints:resolveTestEndpoints(clean),environment,readFileFn:async()=>{throw Error('MUST_NOT_READ_A_FILE');},fetchFn:async(url,options)=>{calls.push({url,options});return Response.json({data:{accessToken:'synthetic-token-'+calls.length,user:{permissions:['product.view','sales.view']}}});}};
 assert.equal(await getErpAuthorization({...options,refresh:true}),'Bearer synthetic-token-1');assert.equal(calls[0].url,'http://127.0.0.1:4194/api/auth/login');assert.equal(calls[0].options.headers.origin,'http://127.0.0.1:5244');
 assert.equal(await getErpAuthorization(options),'Bearer synthetic-token-1');assert.equal(calls.length,1);
 environment.CRM_CLEAN_ERP_CATALOG_ACCESS_JSON=JSON.stringify({ilker:{username:'synthetic-new-sales',password:'synthetic-new-fixture'}});
 assert.equal(await getErpAuthorization(options),'Bearer synthetic-token-2');
 await assert.rejects(()=>getErpAuthorization({...options,environment:{...environment,CRM_CLEAN_ERP_CATALOG_ACCESS_JSON:''}}),/ERP_AUTH_REQUIRED/);
 await assert.rejects(()=>getErpAuthorization({...options,testEndpoints:resolveTestEndpoints({})}),/ERP_AUTH_REQUIRED/);
});

test('the actual dialog keeps PRODUCT source required for old shared builds and does not invent one for clean SQL',async()=>{
 const source=await readFile(new URL('../apps/frontend/src/ERPOrderDialog.jsx',import.meta.url),'utf8');
 const line=source.split('\n').find(line=>line.includes('async function readCustomers('));assert.ok(line);
 for(const [cleanBuild,sourceValue,accepted]of [[false,undefined,false],[true,undefined,true],[true,{},false]]){
  let committed=false;const result={phone:'905550000001',status:'matched',entries:[{id:1,revision:'a'.repeat(64),blocked:false,exactPhoneMatch:true,currency:'TRY'}],...(sourceValue===undefined?{}:{currentSource:sourceValue})};
  const readCustomers=vm.runInNewContext('('+line.replaceAll('import.meta.env','buildEnv')+')',{buildEnv:{VITE_CRM_ISOLATED_PREPARATION:'1',VITE_CRM_CLEAN_SYNTHETIC_TEST:cleanBuild?'1':undefined},liveApi:{erpV2Customers:async()=>result},token:'synthetic-crm',erpToken:'synthetic-erp',search:'',conversation:{id:'55',phone:'+905550000001'},rows:[{currency:'TRY'}],current:()=>true,validateNativeSource,setCustomers:()=>{committed=true;},setCustomerId(){},setReason(){}});
  if(accepted)await readCustomers();else await assert.rejects(readCustomers());assert.equal(committed,accepted);
 }
});
