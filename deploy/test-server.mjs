import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from '../apps/gateway/node_modules/dotenv/lib/main.js';
import {resolveTestDirectories} from './test-supervisor.mjs';
import {installTestAdminSession} from '../apps/gateway/src/services/testAdminSession.mjs';
import {installTestPersonnelSession} from '../apps/gateway/src/services/testPersonnelSession.mjs';
import {resolveTestEndpoints} from './test-endpoints.mjs';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };

export function validateTestLanAddress(value='') {
  if(value==='')return '';
  if(typeof value!=='string'||! /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(value))throw Error('TEST_LAN_ADDRESS_INVALID');
  const parts=value.split('.').map(Number);
  if(parts.some(part=>part>255)||!(parts[0]===10||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168))throw Error('TEST_LAN_ADDRESS_INVALID');
  return value;
}
const ipv4Number=value=>value.split('.').reduce((number,part)=>(number*256+Number(part))>>>0,0);
export function resolveTestLanNetwork(value,interfaces=os.networkInterfaces(),endpoints=resolveTestEndpoints()) {
  const address=validateTestLanAddress(value);if(!address)return null;
  for(const entries of Object.values(interfaces))for(const entry of entries||[]){
    if(entry.internal||entry.family!=='IPv4'||entry.address!==address)continue;
    if(! /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(entry.netmask||'')||entry.netmask.split('.').some(part=>Number(part)>255))throw Error('TEST_LAN_NETMASK_INVALID');
    const mask=ipv4Number(entry.netmask),bits=mask.toString(2).padStart(32,'0');
    const minimum=address.startsWith('10.')?8:address.startsWith('172.')?12:16;
    if(!/^1+0+$/.test(bits)||bits.indexOf('0')<minimum||bits.indexOf('0')>30)throw Error('TEST_LAN_NETMASK_INVALID');
    return{address,mask,network:(ipv4Number(address)&mask)>>>0,origin:`http://${address}:${endpoints.ui}`};
  }
  throw Error('TEST_LAN_INTERFACE_REQUIRED');
}
export function testUiRequestAllowed(req,lanNetwork=null,endpoints=resolveTestEndpoints()) {
  const local=req.socket?.localAddress,remote=req.socket?.remoteAddress;
  let host;
  if(local==='127.0.0.1'&&remote==='127.0.0.1')host=`127.0.0.1:${endpoints.ui}`;
  else if(lanNetwork&&local===lanNetwork.address){
    try{if(!remote||!validateTestLanAddress(remote))return false}catch{return false}
    if(((ipv4Number(remote)&lanNetwork.mask)>>>0)!==lanNetwork.network)return false;
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==lanNetwork.origin)return false;
    host=lanNetwork.address+':'+endpoints.ui;
  }else return false;
  return req.headers.host===host&&(!req.headers.origin||req.headers.origin==='http://'+host)
    &&!req.headers['x-forwarded-host']&&!req.headers['x-forwarded-for']
    &&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site'])||testTerminalFrameAllowed(req,host));
}

export function testTerminalFrameAllowed(req,host) {
  if(!['GET','HEAD'].includes(req.method)||req.headers['sec-fetch-site']!=='same-site'||req.headers['sec-fetch-dest']!=='iframe')return false;
  if(!req.url.startsWith('/?terminal=1')||req.headers.origin)return false;
  try {
    const parent=new URL(req.headers.referer||'');
    const expected = host.endsWith(':62600') ? host.replace(':62600',':5224') : host.replace(':62400',':5194');
    return parent.origin==='http://'+expected&&parent.pathname==='/terminal.html';
  } catch { return false; }
}

export function testAdminBootstrapAllowed(req,endpoints=resolveTestEndpoints()) {
  return req.method==='POST' && req.url==='/api/test-admin/session'
    && req.socket?.remoteAddress==='127.0.0.1' && req.headers.host===`127.0.0.1:${endpoints.ui}`
    && req.headers.origin===endpoints.uiOrigin
    && !req.headers['x-forwarded-host'] && !req.headers['x-forwarded-for']
    && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin');
}

export function testPersonnelBootstrapAllowed(req,endpoints=resolveTestEndpoints()) {
  return testAdminBootstrapAllowed({method:req.method,socket:req.socket,headers:req.headers,url:req.url==='/api/test-personnel/session'?'/api/test-admin/session':req.url},endpoints)
    && req.url==='/api/test-personnel/session'
    && !req.headers['forwarded']&&!req.headers['x-real-ip']&&!req.headers['x-forwarded-proto'];
}

const root = fileURLToPath(new URL('../', import.meta.url));
export function configureTestServerEnvironment(repoRoot,{env=process.env,loadBaseline=options=>dotenv.config(options)}={}){
if (!env.CRM_BASELINE_ENV) throw Error('CRM_BASELINE_ENV_REQUIRED');
// Capture the validated TEST locations before baseline dotenv can override them.
const {runtime,logs}=resolveTestDirectories(repoRoot,env);
const endpoints=resolveTestEndpoints(env);
const paidAi=env.CRM_PAID_AI_ENABLED==='true'&&!endpoints.isolated;
const lanAddress=validateTestLanAddress(env.CRM_TEST_LAN_ADDRESS||'');
if(endpoints.isolated&&lanAddress&&lanAddress!=='192.168.1.46')throw Error('SHARED_TEST_LAN_ADDRESS_REQUIRED');
const uiOrigins=[endpoints.uiOrigin,...(lanAddress?[`http://${lanAddress}:${endpoints.ui}`]:[])];
// AI activation is explicit for this TEST session, never inherited from baseline dotenv.
const salesMode=env.CRM_AI_SALES_MODE==='copilot'?'copilot':'off';
const terminalPersonnel=env.CRM_TEST_TERMINAL_PERSONNEL_USERNAME||(endpoints.isolated?'crm-ahmet':'');
if(terminalPersonnel!==''&&terminalPersonnel!=='crm-ahmet')throw Error('TEST_PERSONNEL_IDENTITY_REQUIRED');
// Sales rules belong to this validated TEST runtime, never a baseline/LIVE policy file.
const salesRules=path.join(runtime,'ai-sales-rules.json');
// Read the existing protected configuration in process memory; never copy or log it.
const loaded=loadBaseline({ path: env.CRM_BASELINE_ENV, processEnv:env, override: true, quiet: true });
if(loaded?.error)throw Error('CRM_BASELINE_ENV_UNAVAILABLE');
Object.assign(env, {
  WHATSAPP_CRM_PORT: String(endpoints.gateway), CRM_UI_ORIGIN: endpoints.uiOrigin,
  WHATSAPP_CRM_CORS_ORIGINS: uiOrigins.join(','),
  CRM_CATALOG_UI_ORIGINS:uiOrigins.join(','),CRM_TEST_LAN_ADDRESS:lanAddress,
  WHATSAPP_PROVIDER: 'waapi', WHATSAPP_TEST_NUMBER_ONLY: 'true',
  CHATWOOT_INBOX_FALLBACK_ENABLED: 'false',
  WHATSAPP_ALLOWED_TEST_NUMBERS: '905387217733', WAAPI_TEST_RECIPIENT: '905387217733',
  WAAPI_OUTBOUND_MEDIA_ENABLED: 'true', WAAPI_CHATWOOT_BRIDGE_ENABLED: 'true', WAAPI_INCOMING_TEST_ONLY: 'false', WHATSAPP_AUTO_REPLY_ENABLED: 'false',
  WHATSAPP_SEND_ENABLED: 'true', WHATSAPP_LIVE_SEND_APPROVED: 'true',
  CRM_OUTBOUND_NAMESPACE: endpoints.isolated?'melisa-crm:shared-preparation-20261009':'melisa-crm:test-completion',
  CRM_ERP_CATALOG_ORIGIN: endpoints.catalogOrigin,
  CRM_ERP_CATALOG_PHOTO_CRM_AUTH: 'true',
  CRM_TEST_RUNTIME_DIR:runtime, CRM_TEST_LOG_DIR:logs,
  CRM_WAAPI_JOURNAL_DIR: path.join(runtime,'waapi'),
  CRM_AI_SALES_MODE:salesMode, CRM_AI_SALES_CONVERSATION_ID:'55',
  CRM_AI_SALES_TEST_PEER:'905387217733',
  CRM_AI_SALES_RULES_FILE:salesRules,
  CRM_TEST_TERMINAL_PERSONNEL_USERNAME:terminalPersonnel,
  CRM_TEST_PORT_BASE:String(endpoints.ui),CRM_TEST_ERP_ORIGIN:endpoints.erpOrigin,CRM_TEST_EXPECTED_DATABASE:endpoints.database,
  CRM_ISOLATED_PREPARATION:String(endpoints.isolated),CRM_PAID_AI_ENABLED:String(paidAi),
});
if(endpoints.isolated)Object.assign(env,{WHATSAPP_SEND_ENABLED:'false',WHATSAPP_LIVE_SEND_APPROVED:'false',WAAPI_CHATWOOT_BRIDGE_ENABLED:'false',WAAPI_INCOMING_READER_ENABLED:'false',CRM_AI_SALES_MODE:'off'});
}
async function startTestServer(){
configureTestServerEnvironment(root);
const endpoints=resolveTestEndpoints();
const lanNetwork=resolveTestLanNetwork(process.env.CRM_TEST_LAN_ADDRESS);
const createTestSession=installTestAdminSession({uiOrigin:process.env.CRM_UI_ORIGIN,gatewayOrigin:endpoints.gatewayOrigin});
const {findCrmUserByUsername}=await import('../apps/gateway/src/services/crmAuthService.js');
const createPersonnelSession=process.env.CRM_TEST_TERMINAL_PERSONNEL_USERNAME?installTestPersonnelSession({uiOrigin:process.env.CRM_UI_ORIGIN,gatewayOrigin:endpoints.gatewayOrigin,username:process.env.CRM_TEST_TERMINAL_PERSONNEL_USERNAME,resolveUser:findCrmUserByUsername}):null;
// Passive incoming messages use existing identity/journal handling. Outbound and AI stay scoped to 7733.
const { createApp } = await import('../apps/gateway/src/app.js');
const { startTestIncomingReader } = await import('../apps/gateway/src/services/testIncomingReader.js');
const { startWaapiWorker } = await import('../apps/gateway/src/services/waapiChatwootBridge.js');
const stopIncoming = endpoints.isolated?()=>{}:startTestIncomingReader();
const stopWorker = endpoints.isolated?()=>{}:startWaapiWorker();
const gateway = createApp().listen(endpoints.gateway, '127.0.0.1');
const assets = path.join(root, 'apps/frontend/dist/client');
const handler=createTestUiHandler({assets,createTestSession,createPersonnelSession,lanNetwork});
const ui=http.createServer(handler).listen(endpoints.ui,'127.0.0.1',()=>console.log('Melisa CRM TEST hazır: '+endpoints.uiOrigin));
const lanUi=lanNetwork?http.createServer(handler).listen(endpoints.ui,lanNetwork.address,()=>console.log('Melisa CRM LAN UI hazır.')):null;
for (const server of [ui,lanUi,gateway].filter(Boolean)) server.on('error', error => { console.error(error.code || 'TEST_START_FAILED'); process.exit(1); });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stopIncoming(); stopWorker(); ui.close(); lanUi?.close(); gateway.close(); setTimeout(() => process.exit(0), 500).unref(); });
}
export function createTestUiHandler({assets,createTestSession,createPersonnelSession=null,lanNetwork=null,endpoints=resolveTestEndpoints()}) {
return (req,res)=>{
  if(!testUiRequestAllowed(req,lanNetwork,endpoints)){res.writeHead(403,{'cache-control':'no-store'});res.end('TEST_UI_ORIGIN_REQUIRED');return;}
  if(req.url.startsWith('/api/test-personnel/')) {
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
    if(!createPersonnelSession||!testPersonnelBootstrapAllowed(req,endpoints)){res.writeHead(403);res.end(JSON.stringify({error:'TEST_PERSONNEL_ORIGIN_REQUIRED'}));return;}
    let body='';req.setEncoding('utf8');
    req.on('data',chunk=>{body+=chunk;if(body.length>32)req.destroy();});
    req.on('end',()=>{
      if(body.trim()!=='{}'){res.writeHead(400);res.end(JSON.stringify({error:'TEST_PERSONNEL_BODY_INVALID'}));return;}
      try {const response=JSON.stringify(createPersonnelSession());res.writeHead(200);res.end(response);}
      catch {res.writeHead(403);res.end(JSON.stringify({error:'TEST_PERSONNEL_IDENTITY_REQUIRED'}));}
    });return;
  }
  if (req.url.startsWith('/api/test-admin/')) {
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
    if(!testAdminBootstrapAllowed(req,endpoints)){res.writeHead(403);res.end(JSON.stringify({error:'TEST_ADMIN_ORIGIN_REQUIRED'}));return;}
    res.writeHead(200);res.end(JSON.stringify(createTestSession()));return;
  }
  if (req.url.startsWith('/api/live/')) {
    const headers = { ...req.headers, host: `127.0.0.1:${endpoints.gateway}` };
    const upstream = http.request({ hostname:'127.0.0.1', port:req.url.startsWith('/api/live/crm/erp/')?endpoints.orders:endpoints.gateway, path:req.url.slice('/api/live'.length), method:req.method, headers }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end('TEST servisine ulaşılamadı.'); });
    req.pipe(upstream); return;
  }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); res.end(); return; }
  const target = path.resolve(assets, '.' + name);
  if (!target.startsWith(assets + path.sep) && target !== assets) { res.writeHead(403); res.end(); return; }
  if (name.startsWith('/assets/') && !fs.existsSync(target)) { res.writeHead(404); res.end(); return; }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(assets,'index.html');
  res.writeHead(200, { 'content-type':mime[path.extname(file)] || 'application/octet-stream', 'cache-control':'no-store', 'x-content-type-options':'nosniff' });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await startTestServer();
