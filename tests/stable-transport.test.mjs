import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {SHARED_STABLE_ORIGIN,resolveStableTransport,stableCrmRequestAllowed,crmUpstreamRoute} from '../deploy/stable-transport.mjs';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';
import {configureTestServerEnvironment,createTestUiHandler} from '../deploy/test-server.mjs';
const env=()=>({CRM_BASELINE_ENV:'fixture',CRM_TEST_PORT_BASE:'62700',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4184',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CRM_SHARED_TEST_20261009_02'});
const endpoints=()=>resolveTestEndpoints(env());
const req=()=>({method:'POST',url:'/crm/api/live/auth/login',socket:{localAddress:'127.0.0.1',remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:62700',origin:SHARED_STABLE_ORIGIN,'sec-fetch-site':'same-origin'}});
test('stable transport opt-in is captured before baseline and limited to isolated DB02',()=>{
 assert.equal(resolveStableTransport({},endpoints()),false);
 assert.equal(resolveStableTransport({CRM_STABLE_TRANSPORT:'true'},endpoints()),true);
 for(const flag of ['1','TRUE','https://anything'])assert.throws(()=>resolveStableTransport({CRM_STABLE_TRANSPORT:flag},endpoints()),/INVALID/);
 for(const change of [{businessScope:false},{isolated:false},{database:'LIVE'}])assert.throws(()=>resolveStableTransport({CRM_STABLE_TRANSPORT:'true'},{...endpoints(),...change}),/DB02/);
 for(const selected of [undefined,'true']){
  const config={...env(),...(selected?{CRM_STABLE_TRANSPORT:selected}:{})};
  configureTestServerEnvironment(path.resolve('fixture-crm'),{env:config,loadBaseline:()=>{config.CRM_STABLE_TRANSPORT=selected?'false':'true';config.WHATSAPP_CRM_CORS_ORIGINS='*';return{};}});
  assert.equal(config.CRM_STABLE_TRANSPORT,String(selected==='true'));
  assert.equal(config.WHATSAPP_CRM_CORS_ORIGINS,'http://127.0.0.1:62700'+(selected?','+SHARED_STABLE_ORIGIN:''));
  assert.equal(config.WHATSAPP_SEND_ENABLED,'false');assert.equal(config.CRM_PAID_AI_ENABLED,'false');
 }
});
test('stable mount accepts only explicit loopback transport, exact Origin and no forwarded identity',()=>{
 assert.equal(stableCrmRequestAllowed(req(),true,endpoints()),true);
 assert.equal(stableCrmRequestAllowed(req(),false,endpoints()),false);
 assert.equal(stableCrmRequestAllowed(req(),true,{...endpoints(),database:'LIVE'}),false);
 for(const patch of [{method:'GET',headers:{host:'127.0.0.1:62700'}},{method:'HEAD',headers:{host:'127.0.0.1:62700'}}])assert.equal(stableCrmRequestAllowed({...req(),...patch},true,endpoints()),true);
 for(const changed of [{origin:undefined},{origin:'http://127.0.0.1:62700'},{origin:SHARED_STABLE_ORIGIN+'.evil'},{host:'semih.tail295701.ts.net:8443'},{'sec-fetch-site':'cross-site'},...['forwarded','x-forwarded-for','x-forwarded-host','x-forwarded-proto','x-real-ip'].map(key=>({[key]:'fixture'}))])assert.equal(stableCrmRequestAllowed({...req(),headers:{...req().headers,...changed}},true,endpoints()),false);
 for(const socket of [{localAddress:'0.0.0.0',remoteAddress:'127.0.0.1'},{localAddress:'127.0.0.1',remoteAddress:'100.64.1.2'}])assert.equal(stableCrmRequestAllowed({...req(),socket},true,endpoints()),false);
 assert.equal(stableCrmRequestAllowed({...req(),url:'/api/live/auth/login'},true,endpoints()),false);
});
test('ordinary CRM and actual ERP login/v2 draft paths retain their separate upstream and query',()=>{
 for(const url of ['/api/live/auth/login','/api/live/auth/me','/api/live/crm/catalog/products?search=0161','/api/live/crm/catalog/photo/36724?variant=original'])assert.deepEqual(crmUpstreamRoute(url,endpoints()),{port:62701,path:url.slice('/api/live'.length)});
 for(const url of ['/api/live/crm/erp/login','/api/live/crm/erp/v2/drafts','/api/live/crm/erp/v2/customers?conversationId=55&phone=fixture','/api/live/crm/erp/v2/drafts/fixture'])assert.deepEqual(crmUpstreamRoute(url,endpoints()),{port:62703,path:url.slice('/api/live'.length)});
 assert.equal(crmUpstreamRoute('/api/test-admin/session',endpoints()),null);
});
test('real handler serves distinct stable assets and forwards ordinary login permissions, never bootstrap',async(t)=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crm-stable-fixture-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const assets=path.join(dir,'legacy'),stableAssets=path.join(dir,'stable');fs.mkdirSync(assets);fs.mkdirSync(stableAssets);fs.writeFileSync(path.join(assets,'index.html'),'legacy');fs.writeFileSync(path.join(stableAssets,'index.html'),'stable');
 const calls=[];const listen=async handler=>{const server=http.createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));return server;};
 const gateway=await listen((request,response)=>{calls.push({kind:'gateway',url:request.url,headers:request.headers});response.writeHead(401,{'content-type':'application/json'});response.end('{"error":"AUTH_INVALID_CREDENTIALS"}');});
 const orders=await listen((request,response)=>{calls.push({kind:'orders',url:request.url,headers:request.headers});response.writeHead(403,{'content-type':'application/json'});response.end('{"error":"ERP_PERMISSION_REQUIRED"}');});
 const ep={...endpoints(),gateway:gateway.address().port,orders:orders.address().port};let bootstraps=0;
 const ui=await listen(createTestUiHandler({assets,stableAssets,stableTransport:true,endpoints:ep,createTestSession:()=>{bootstraps++;return{};}}));ep.ui=ui.address().port;
 const url='http://127.0.0.1:'+ep.ui;
 assert.equal(await(await fetch(url+'/crm/')).text(),'stable');assert.equal(await(await fetch(url+'/')).text(),'legacy');
 for(const name of ['test-admin','test-personnel'])assert.equal((await fetch(url+'/crm/api/'+name+'/session',{method:'POST',headers:{origin:SHARED_STABLE_ORIGIN}})).status,403);
 for(const route of ['/auth/login','/crm/erp/login','/crm/erp/v2/drafts']){
  const response=await fetch(url+'/crm/api/live'+route,{method:'POST',headers:{origin:SHARED_STABLE_ORIGIN,authorization:'Bearer fixture','x-erp-token':'fixture-erp','x-crm-conversation-id':'55','content-type':'application/json'},body:'{}'});
  assert.equal(response.status,route==='/auth/login'?401:403);
 }
 assert.deepEqual(calls.map(call=>[call.kind,call.url]),[['gateway','/auth/login'],['orders','/crm/erp/login'],['orders','/crm/erp/v2/drafts']]);
 assert(calls.every(call=>call.headers.origin===SHARED_STABLE_ORIGIN&&call.headers.authorization==='Bearer fixture'&&call.headers['x-erp-token']==='fixture-erp'&&call.headers['x-crm-conversation-id']==='55'));
 assert.equal(bootstraps,0);
 const missing=await fetch(url+'/crm/assets/no-such.js');assert.equal(missing.status,404);
 assert.equal((await fetch(url+'/crm/api/live/auth/login',{method:'POST',headers:{origin:'https://evil.invalid'}})).status,403);
 assert.equal(calls.length,3);
});
