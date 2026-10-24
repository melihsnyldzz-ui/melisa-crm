import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import {Readable, Writable} from 'node:stream';
import {once} from 'node:events';
import * as server from '../deploy/test-server.mjs';
import {resolveTestEndpoints} from '../deploy/test-endpoints.mjs';

const clean={CRM_TEST_PROFILE:'clean-synthetic-20261022',CRM_TEST_PORT_BASE:'62800',CRM_ISOLATED_PREPARATION:'true',CRM_TEST_ERP_ORIGIN:'http://127.0.0.1:4194',CRM_TEST_EXPECTED_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022'};
// These two peer addresses are synthetic test inputs, not device acceptance.
const networkEnv={...clean,CRM_TEST_LAN_ADDRESS:'192.168.1.46',CRM_TEST_TAILSCALE_ADDRESS:'100.87.188.3',CRM_TEST_TAILSCALE_PEERS:'100.100.1.20,100.100.1.21'};
const interfaces={Ethernet:[{address:'192.168.1.46',netmask:'255.255.255.0',family:'IPv4',internal:false}],Tailscale:[{address:'100.87.188.3',netmask:'255.255.255.255',family:'IPv4',internal:false}]};
const endpoints=resolveTestEndpoints(clean);
const checkout=path.resolve('fixture-crm','melisa-crm');
function networks(env=networkEnv,ifs=interfaces){return server.resolveTestUiNetworks(env,ifs,resolveTestEndpoints(env));}
function request(local='100.87.188.3',remote='100.100.1.20',method='POST',url='/api/live/auth/login'){
 return {method,url,socket:{localAddress:local,remoteAddress:remote},headers:{host:`${local}:62800`,origin:`http://${local}:62800`,'sec-fetch-site':'same-origin'}};
}
function configure(selected=networkEnv){
 const env={...selected,CRM_BASELINE_ENV:'synthetic-private-configuration'};
 server.configureTestServerEnvironment(checkout,{env,loadBaseline:()=>{
  Object.assign(env,{CRM_TEST_LAN_ADDRESS:'10.0.0.1',CRM_TEST_TAILSCALE_ADDRESS:'100.64.0.1',CRM_TEST_TAILSCALE_PEERS:'100.64.0.2',WHATSAPP_CRM_CORS_ORIGINS:'*',CRM_CATALOG_UI_ORIGINS:'*',CRM_TEST_TERMINAL_PERSONNEL_USERNAME:'crm-ahmet'});
  return {parsed:{}};
 }});
 return env;
}

test('clean terminal iframe admits only the same-host ERP5244 GET and still requires normal CRM authentication',()=>{
  const ns=networks();
  for(const [local,remote]of [['127.0.0.1','127.0.0.1'],['192.168.1.46','192.168.1.20']]){
    const req=request(local,remote,'GET',`/?terminal=1&erpOrigin=${encodeURIComponent(`http://${local}:5244`)}`);
    req.headers={host:`${local}:62800`,'sec-fetch-site':'same-site','sec-fetch-dest':'iframe',referer:`http://${local}:5244/terminal.html`};
    assert.equal(server.testUiRequestAllowed(req,ns,endpoints),true);
    for(const patch of [{referer:`http://${local}:5234/terminal.html`},{referer:'http://example.com:5244/terminal.html'},
      {referer:`http://${local}:5244/other.html`},{'sec-fetch-dest':'document'},{'sec-fetch-site':'cross-site'},
      {origin:`http://${local}:5244`},{'x-forwarded-for':remote}])
      assert.equal(server.testUiRequestAllowed({...req,headers:{...req.headers,...patch}},ns,endpoints),false);
    assert.equal(server.testUiRequestAllowed({...req,method:'POST'},ns,endpoints),false);
    assert.equal(server.testUiRequestAllowed({...req,url:'/api/live/auth/refresh'},ns,endpoints),false);
  }
});

test('clean UI enables both exact origins from owner configuration, never baseline inheritance or bootstrap',()=>{
 const configured=configure();
 const origins='http://127.0.0.1:62800,http://192.168.1.46:62800,http://100.87.188.3:62800';
 for(const key of ['WHATSAPP_CRM_CORS_ORIGINS','CRM_CATALOG_UI_ORIGINS'])assert.equal(configured[key],origins);
 for(const key of ['CRM_TEST_LAN_ADDRESS','CRM_TEST_TAILSCALE_ADDRESS','CRM_TEST_TAILSCALE_PEERS'])assert.equal(configured[key],networkEnv[key]);
 assert.equal(configured.CRM_UI_ORIGIN,endpoints.uiOrigin);
 assert.equal(configured.CRM_ERP_CATALOG_ORIGIN,endpoints.catalogOrigin);
 assert.equal(configured.CRM_TEST_TERMINAL_PERSONNEL_USERNAME,'');
 for(const key of ['WHATSAPP_SEND_ENABLED','CRM_PAID_AI_ENABLED','CRM_NORMAL_REFRESH_ENABLED','CRM_SEMIH_TEST_CONTINUE_ENABLED','CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED'])assert.equal(configured[key],'false');
 const loopback=configure(clean);
 assert.equal(loopback.WHATSAPP_CRM_CORS_ORIGINS,endpoints.uiOrigin);
 for(const key of ['CRM_TEST_LAN_ADDRESS','CRM_TEST_TAILSCALE_ADDRESS','CRM_TEST_TAILSCALE_PEERS'])assert.equal(loopback[key],'');
 assert.deepEqual([endpoints.gatewayOrigin,endpoints.catalogOrigin,endpoints.nativeOrigin],['http://127.0.0.1:62801','http://127.0.0.1:62802','http://127.0.0.1:4196']);
});

test('clean remote configuration rejects wrong interfaces, broad subnets and unspecified or unsafe peers',()=>{
 assert.deepEqual(networks(clean,{}),[]);
 assert.deepEqual(networks().map(n=>n.address),['192.168.1.46','100.87.188.3']);
 for(const patch of [{CRM_TEST_LAN_ADDRESS:'192.168.1.47'},{CRM_TEST_LAN_ADDRESS:'0.0.0.0'},{CRM_TEST_TAILSCALE_ADDRESS:'100.87.188.4'},{CRM_TEST_TAILSCALE_ADDRESS:'0.0.0.0'},{CRM_TEST_TAILSCALE_PEERS:''},{CRM_TEST_TAILSCALE_PEERS:'100.100.1.20,'},{CRM_TEST_TAILSCALE_PEERS:'100.64.0.0/10'},{CRM_TEST_TAILSCALE_PEERS:'192.168.1.20'},{CRM_TEST_TAILSCALE_PEERS:'100.128.0.1'},{CRM_TEST_TAILSCALE_PEERS:'100.064.0.1'},{CRM_TEST_TAILSCALE_PEERS:'8.8.8.8'},{CRM_TEST_TAILSCALE_ADDRESS:''}])assert.throws(()=>networks({...networkEnv,...patch}),JSON.stringify(patch));
 for(const ifs of [{},{...interfaces,Ethernet:[{...interfaces.Ethernet[0],netmask:'255.255.0.0'}]},{...interfaces,Tailscale:[{...interfaces.Tailscale[0],internal:true}]},{...interfaces,Tailscale:[{...interfaces.Tailscale[0],netmask:'255.0.255.0'}]}])assert.throws(()=>networks(networkEnv,ifs));
 assert.throws(()=>configure({CRM_TEST_TAILSCALE_ADDRESS:networkEnv.CRM_TEST_TAILSCALE_ADDRESS,CRM_TEST_TAILSCALE_PEERS:networkEnv.CRM_TEST_TAILSCALE_PEERS}));
});

test('both listeners enforce their own exact local/remote/host/origin tuple and reject forwarded identities',()=>{
 const ns=networks();
 for(const [local,remote]of [['127.0.0.1','127.0.0.1'],['192.168.1.46','192.168.1.20'],['100.87.188.3','100.100.1.20'],['100.87.188.3','100.100.1.21']]){
  const req=request(local,remote);
  assert.equal(server.testUiRequestAllowed(req,ns,endpoints),true);
  assert.equal(server.testUiRequestAllowed({...req,method:'GET',headers:{host:req.headers.host}},ns,endpoints),true);
  for(const headers of [{host:'localhost:62800'},{host:`${local}:62801`},{origin:'null'},{origin:'http://example.com:62800'},{origin:'http://192.168.1.46:62800/path'},{'sec-fetch-site':'cross-site'},...['forwarded','x-real-ip','x-forwarded-for','x-forwarded-host','x-forwarded-proto'].map(key=>({[key]:'127.0.0.1'}))])assert.equal(server.testUiRequestAllowed({...req,headers:{...req.headers,...headers}},ns,endpoints),false,JSON.stringify(headers));
  assert.equal(server.testUiRequestAllowed({...req,headers:{...req.headers,forwarded:''}},ns,endpoints),false);
  if(local!=='127.0.0.1')assert.equal(server.testUiRequestAllowed({...req,headers:{...req.headers,origin:undefined}},ns,endpoints),false);
 }
 for(const [local,remote]of [['127.0.0.1','100.100.1.20'],['192.168.1.46','192.168.2.20'],['192.168.1.46','192.168.1.0'],['192.168.1.46','192.168.1.255'],['192.168.1.46','100.100.1.20'],['100.87.188.3','192.168.1.20'],['100.87.188.3','100.100.1.22'],['100.87.188.3','127.0.0.1'],['0.0.0.0','100.100.1.20'],['::ffff:100.87.188.3','100.100.1.20']])assert.equal(server.testUiRequestAllowed(request(local,remote),ns,endpoints),false,`${local}/${remote}`);
 assert.equal(server.testUiRequestAllowed({...request(),headers:{host:'192.168.1.46:62800',origin:'http://192.168.1.46:62800'}},ns,endpoints),false);
});

test('clean bootstrap remains denied on loopback, LAN and Tailscale even with session callbacks',()=>{
 const ns=networks();let calls=0;
 const handler=server.createTestUiHandler({assets:path.resolve('fixture-assets'),endpoints,lanNetwork:ns,createTestSession:()=>{calls++;return{};},createPersonnelSession:()=>{calls++;return{};}});
 for(const [local,remote]of [['127.0.0.1','127.0.0.1'],['192.168.1.46','192.168.1.20'],['100.87.188.3','100.100.1.20']])for(const url of ['/api/test-admin/session','/api/test-personnel/session']){
  let status;handler(request(local,remote,'POST',url),{setHeader(){},writeHead(code){status=code;},end(){}});
  assert.equal(status,403);
 }
 assert.equal(calls,0);
});

class Sink extends Writable {
 constructor(){super();this.chunks=[];}
 _write(chunk,_encoding,callback){this.chunks.push(Buffer.from(chunk));callback();}
 writeHead(status,headers){this.status=status;this.headers=headers;}
}
test('LAN/Tailscale normal login, catalog and orders retain same-origin proxy, bearer and upstream auth failures',async t=>{
 const calls=[];
 async function fixture(kind){
  const backend=http.createServer(async(req,res)=>{
   let body='';for await(const chunk of req)body+=chunk;
   calls.push({kind,url:req.url,headers:req.headers,body});
   const status=req.url==='/auth/login'?200:req.headers.authorization==='Bearer synthetic-current'?200:req.headers.authorization?403:401;
   res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify({kind,url:req.url,status}));
  }).listen(0,'127.0.0.1');
  await once(backend,'listening');t.after(()=>backend.close());return backend.address().port;
 }
 const gateway=await fixture('gateway'),orders=await fixture('orders');
 const handler=server.createTestUiHandler({assets:path.resolve('fixture-assets'),endpoints:{...endpoints,gateway,orders},lanNetwork:networks()});
 for(const [local,remote]of [['192.168.1.46','192.168.1.20'],['100.87.188.3','100.100.1.20']])for(const [url,token,status,kind]of [['/api/live/auth/login',null,200,'gateway'],['/api/live/crm/catalog/products','synthetic-current',200,'gateway'],['/api/live/crm/erp/v2/drafts/request-fixture','synthetic-current',200,'orders'],['/api/live/crm/catalog/products',null,401,'gateway'],['/api/live/crm/erp/v2/drafts/request-fixture','synthetic-revoked',403,'orders']]){
  const incoming=Object.assign(Readable.from(['{"synthetic":true}']),request(local,remote,'POST',url));
  Object.assign(incoming.headers,{'content-type':'application/json','x-erp-token':'synthetic-erp',...(token?{authorization:'Bearer '+token}:{})});
  const sink=new Sink(),done=once(sink,'finish');handler(incoming,sink);await done;
  assert.equal(sink.status,status);
  const call=calls.at(-1);assert.equal(call.kind,kind);assert.equal(call.url,url.slice('/api/live'.length));assert.equal(call.headers.origin,`http://${local}:62800`);assert.equal(call.headers.authorization,token?'Bearer '+token:undefined);assert.equal(call.headers['x-erp-token'],'synthetic-erp');assert.equal(call.body,'{"synthetic":true}');
 }
});
