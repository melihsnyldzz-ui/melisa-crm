import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
import {createTestOrderHandler} from '../deploy/test-erp-orders.mjs';
const env={CRM_TEST_PORT_BASE:'62700',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'};
const endpoints=resolveTestEndpoints(env),source='a'.repeat(40),packageId='SYNTHETIC-BUSINESS-SCOPE';
const peer='905550000001',conversationId='88',requestId='00000000-0000-4000-8000-000000000001';
const health={database:endpoints.database,environment:'ISOLATED_TEST_COPY',purpose:'crm-order-draft-only',serverName:'Semih\\MELISADEV',originalDatabaseAccess:0,liveDatabaseAccess:0,sysadmin:0,databaseControl:0,externalOperations:false,automaticJobs:false,actualT1:false,reservationEffect:false,stockEffect:false,ledgerEffect:false,sourceCommit:source,packageId,port:62704};
function fixture({phone=peer,denied=false,moved=false,receipt={request:{conversationId,peer}}}={}){
 const calls=[];let reads=0;
 const handler=createTestOrderHandler({testEndpoints:endpoints,nativeSourceCommit:source,nativePackageId:packageId,fetchFn:async(url,options)=>{
  calls.push({url:String(url),options});
  if(url.pathname==='/auth/me')return Response.json({data:{id:'synthetic',permissions:['crm.send','crm.view']}});
  if(url.pathname==='/crm/conversations/'+conversationId){reads++;if(denied||moved&&reads>1)return Response.json({error:{code:'WHATSAPP_CRM_CONVERSATION_FORBIDDEN'}},{status:403});return Response.json({data:{id:Number(conversationId),phone:'+'+phone}});}
  if(url.pathname==='/test-health')return Response.json({data:health});
  return Response.json({data:receipt});
 }});return {handler,calls};
}
async function invoke(f,method,path,input){let status,body;const req=Readable.from(input?[JSON.stringify(input)]:[]);Object.assign(req,{method,url:path,headers:{authorization:'Bearer synthetic','x-erp-token':'synthetic-native'}});await f.handler(req,{setHeader(){},writeHead(n){status=n;},end(s){body=JSON.parse(s);}});return {status,...body};}
const lookup='/crm/erp/v2/customers?'+new URLSearchParams({conversationId,phone:peer});
test('business scope exact tuple accepts new topology and rejects cross-environment combinations',()=>{
 assert.deepEqual([endpoints.ui,endpoints.gateway,endpoints.catalog,endpoints.orders,endpoints.native],[62700,62701,62702,62703,62704]);assert.equal(endpoints.erpUiOrigin,'http://127.0.0.1:5234');
 for(const override of [{CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4174'},{CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_01'},{CRM_ISOLATED_PREPARATION:'false'},{CRM_TEST_PORT_BASE:'62600'}])assert.throws(()=>resolveTestEndpoints({...env,...override}));
});
test('business customers and drafts require current assigned conversation exact phone before native transport',async()=>{
 for(const options of [{denied:true},{phone:'905550000002'}])for(const [method,path,input] of [['GET',lookup],['POST','/crm/erp/v2/drafts',{conversationId,peer}]]){const f=fixture(options);assert.equal((await invoke(f,method,path,input)).status,403);assert.equal(f.calls.filter(c=>c.url.startsWith(endpoints.nativeOrigin)).length,0);}
 const f=fixture();assert.equal((await invoke(f,'GET',lookup)).status,200);assert.equal(f.calls.filter(c=>c.url.endsWith('/crm/conversations/'+conversationId)).length,2);
 assert.equal((await invoke(f,'POST','/crm/erp/v2/drafts',{conversationId,peer})).status,200);assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
test('reassigned customer read and foreign receipt are never returned; no write replay occurs',async()=>{
 const moved=fixture({moved:true});assert.equal((await invoke(moved,'GET',lookup)).status,403);
 const foreign=fixture({receipt:{request:{conversationId,peer:'905550000002'}}});assert.equal((await invoke(foreign,'GET','/crm/erp/v2/drafts/'+requestId)).status,403);assert.equal(foreign.calls.filter(c=>c.options.method==='POST').length,0);
 const valid=fixture();assert.equal((await invoke(valid,'GET','/crm/erp/v2/drafts/'+requestId)).status,200);
});

test('business runtime retains AI provider and outbound off with exact ERP catalog/login origins',async()=>{
 const {configureTestServerEnvironment,testTerminalFrameAllowed}=await import('../deploy/test-server.mjs');
 const {createCanonicalCatalogReader,assertCatalogTestIdentity}=await import('../packages/erp-adapter/services/canonicalCatalogReader.mjs');
 const {getErpAuthorization}=await import('../deploy/test-erp-catalog.mjs');
 const runtime={...env,CRM_BASELINE_ENV:'synthetic',CRM_PAID_AI_ENABLED:'true',CRM_AI_SALES_MODE:'copilot'};
 configureTestServerEnvironment(process.cwd(),{env:runtime,loadBaseline:()=>({parsed:{}})});
 assert.equal(runtime.CRM_PAID_AI_ENABLED,'false');assert.equal(runtime.WHATSAPP_SEND_ENABLED,'false');assert.equal(runtime.WAAPI_INCOMING_READER_ENABLED,'false');assert.equal(runtime.CRM_AI_SALES_MODE,'off');assert.equal(runtime.CRM_ERP_CATALOG_ORIGIN,'http://127.0.0.1:62702');
 assert.equal(testTerminalFrameAllowed({method:'GET',url:'/?terminal=1',headers:{'sec-fetch-site':'same-site','sec-fetch-dest':'iframe',referer:'http://192.168.1.46:5234/terminal.html'}},'192.168.1.46:62700'),true);
 assert.doesNotThrow(()=>createCanonicalCatalogReader({erpOrigin:endpoints.erpOrigin,expectedDatabase:endpoints.database}));assert.throws(()=>createCanonicalCatalogReader({erpOrigin:endpoints.erpOrigin,expectedDatabase:'MELISA_ERP_CRM_SHARED_TEST_20261009_01'}));
 const catalogHealth={...health,databaseName:endpoints.database,port:4184,mode:'erp',writes:true};assert.doesNotThrow(()=>assertCatalogTestIdentity(catalogHealth,{database:endpoints.database,port:4184}));assert.throws(()=>assertCatalogTestIdentity({...catalogHealth,actualT1:true},{database:endpoints.database,port:4184}));
 const calls=[];await getErpAuthorization({refresh:true,testEndpoints:endpoints,environment:{CRM_ERP_CATALOG_ACCESS_PATH:process.cwd()+'/synthetic.json'},readFileFn:async()=>JSON.stringify({ilker:{username:'synthetic',password:'synthetic'}}),fetchFn:async(url,options)=>{calls.push({url,options});return Response.json({data:{accessToken:'synthetic',user:{permissions:['product.view','sales.view']}}});}});assert.equal(calls[0].url,endpoints.erpOrigin+'/api/auth/login');assert.equal(calls[0].options.headers.origin,endpoints.erpUiOrigin);
});
