import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import dotenv from '../apps/gateway/node_modules/dotenv/lib/main.js';
import {resolveTestDirectories} from './test-supervisor.mjs';
import {installTestAdminSession} from '../apps/gateway/src/services/testAdminSession.mjs';
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };

export function validateTestLanAddress(value='') {
  if(value==='')return '';
  if(typeof value!=='string'||! /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(value))throw Error('TEST_LAN_ADDRESS_INVALID');
  const parts=value.split('.').map(Number);
  if(parts.some(part=>part>255)||!(parts[0]===10||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168))throw Error('TEST_LAN_ADDRESS_INVALID');
  return value;
}
const ipv4Number=value=>value.split('.').reduce((number,part)=>(number*256+Number(part))>>>0,0);
export function resolveTestLanNetwork(value,interfaces=os.networkInterfaces()) {
  const address=validateTestLanAddress(value);if(!address)return null;
  for(const entries of Object.values(interfaces))for(const entry of entries||[]){
    if(entry.internal||entry.family!=='IPv4'||entry.address!==address)continue;
    if(! /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(entry.netmask||'')||entry.netmask.split('.').some(part=>Number(part)>255))throw Error('TEST_LAN_NETMASK_INVALID');
    const mask=ipv4Number(entry.netmask),bits=mask.toString(2).padStart(32,'0');
    const minimum=address.startsWith('10.')?8:address.startsWith('172.')?12:16;
    if(!/^1+0+$/.test(bits)||bits.indexOf('0')<minimum||bits.indexOf('0')>30)throw Error('TEST_LAN_NETMASK_INVALID');
    return{address,mask,network:(ipv4Number(address)&mask)>>>0,origin:`http://${address}:62400`};
  }
  throw Error('TEST_LAN_INTERFACE_REQUIRED');
}
export function testUiRequestAllowed(req,lanNetwork=null) {
  const local=req.socket?.localAddress,remote=req.socket?.remoteAddress;
  let host;
  if(local==='127.0.0.1'&&remote==='127.0.0.1')host='127.0.0.1:62400';
  else if(lanNetwork&&local===lanNetwork.address){
    try{if(!remote||!validateTestLanAddress(remote))return false}catch{return false}
    if(((ipv4Number(remote)&lanNetwork.mask)>>>0)!==lanNetwork.network)return false;
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==lanNetwork.origin)return false;
    host=lanNetwork.address+':62400';
  }else return false;
  return req.headers.host===host&&(!req.headers.origin||req.headers.origin==='http://'+host)
    &&!req.headers['x-forwarded-host']&&!req.headers['x-forwarded-for']
    &&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']));
}

export function testAdminBootstrapAllowed(req) {
  return req.method==='POST' && req.url==='/api/test-admin/session'
    && req.socket?.remoteAddress==='127.0.0.1' && req.headers.host==='127.0.0.1:62400'
    && req.headers.origin==='http://127.0.0.1:62400'
    && !req.headers['x-forwarded-host'] && !req.headers['x-forwarded-for']
    && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site']==='same-origin');
}

const root = fileURLToPath(new URL('../', import.meta.url));
export function configureTestServerEnvironment(repoRoot,{env=process.env,loadBaseline=options=>dotenv.config(options)}={}){
if (!env.CRM_BASELINE_ENV) throw Error('CRM_BASELINE_ENV_REQUIRED');
// Capture the validated TEST locations before baseline dotenv can override them.
const {runtime,logs}=resolveTestDirectories(repoRoot,env);
const lanAddress=validateTestLanAddress(env.CRM_TEST_LAN_ADDRESS||'');
const uiOrigins=['http://127.0.0.1:62400',...(lanAddress?[`http://${lanAddress}:62400`]:[])];
// AI activation is explicit for this TEST session, never inherited from baseline dotenv.
const salesMode=env.CRM_AI_SALES_MODE==='copilot'?'copilot':'off';
// Sales rules belong to this validated TEST runtime, never a baseline/LIVE policy file.
const salesRules=path.join(runtime,'ai-sales-rules.json');
// Read the existing protected configuration in process memory; never copy or log it.
const loaded=loadBaseline({ path: env.CRM_BASELINE_ENV, processEnv:env, override: true, quiet: true });
if(loaded?.error)throw Error('CRM_BASELINE_ENV_UNAVAILABLE');
Object.assign(env, {
  WHATSAPP_CRM_PORT: '62401', CRM_UI_ORIGIN: 'http://127.0.0.1:62400',
  WHATSAPP_CRM_CORS_ORIGINS: uiOrigins.join(','),
  CRM_CATALOG_UI_ORIGINS:uiOrigins.join(','),CRM_TEST_LAN_ADDRESS:lanAddress,
  WHATSAPP_PROVIDER: 'waapi', WHATSAPP_TEST_NUMBER_ONLY: 'true',
  CHATWOOT_INBOX_FALLBACK_ENABLED: 'false',
  WHATSAPP_ALLOWED_TEST_NUMBERS: '905387217733', WAAPI_TEST_RECIPIENT: '905387217733',
  WAAPI_OUTBOUND_MEDIA_ENABLED: 'true', WAAPI_CHATWOOT_BRIDGE_ENABLED: 'true', WAAPI_INCOMING_TEST_ONLY: 'false', WHATSAPP_AUTO_REPLY_ENABLED: 'false',
  WHATSAPP_SEND_ENABLED: 'true', WHATSAPP_LIVE_SEND_APPROVED: 'true',
  CRM_OUTBOUND_NAMESPACE: 'melisa-crm:test-completion',
  CRM_ERP_CATALOG_ORIGIN: 'http://127.0.0.1:62402',
  CRM_ERP_CATALOG_PHOTO_CRM_AUTH: 'true',
  CRM_TEST_RUNTIME_DIR:runtime, CRM_TEST_LOG_DIR:logs,
  CRM_WAAPI_JOURNAL_DIR: path.join(runtime,'waapi'),
  CRM_AI_SALES_MODE:salesMode, CRM_AI_SALES_CONVERSATION_ID:'55',
  CRM_AI_SALES_TEST_PEER:'905387217733',
  CRM_AI_SALES_RULES_FILE:salesRules,
});
}
async function startTestServer(){
configureTestServerEnvironment(root);
const lanNetwork=resolveTestLanNetwork(process.env.CRM_TEST_LAN_ADDRESS);
const createTestSession=installTestAdminSession({uiOrigin:process.env.CRM_UI_ORIGIN,gatewayOrigin:'http://127.0.0.1:62401'});
// Passive incoming messages use existing identity/journal handling. Outbound and AI stay scoped to 7733.
const { createApp } = await import('../apps/gateway/src/app.js');
const { startTestIncomingReader } = await import('../apps/gateway/src/services/testIncomingReader.js');
const { startWaapiWorker } = await import('../apps/gateway/src/services/waapiChatwootBridge.js');
const stopIncoming = startTestIncomingReader();
const stopWorker = startWaapiWorker();
const gateway = createApp().listen(62401, '127.0.0.1');
const assets = path.join(root, 'apps/frontend/dist/client');
const handler=createTestUiHandler({assets,createTestSession,lanNetwork});
const ui=http.createServer(handler).listen(62400,'127.0.0.1',()=>console.log('Melisa CRM TEST hazır: http://127.0.0.1:62400'));
const lanUi=lanNetwork?http.createServer(handler).listen(62400,lanNetwork.address,()=>console.log('Melisa CRM LAN UI hazır.')):null;
for (const server of [ui,lanUi,gateway].filter(Boolean)) server.on('error', error => { console.error(error.code || 'TEST_START_FAILED'); process.exit(1); });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stopIncoming(); stopWorker(); ui.close(); lanUi?.close(); gateway.close(); setTimeout(() => process.exit(0), 500).unref(); });
}
export function createTestUiHandler({assets,createTestSession,lanNetwork=null}) {
return (req,res)=>{
  if(!testUiRequestAllowed(req,lanNetwork)){res.writeHead(403,{'cache-control':'no-store'});res.end('TEST_UI_ORIGIN_REQUIRED');return;}
  if (req.url.startsWith('/api/test-admin/')) {
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');
    if(!testAdminBootstrapAllowed(req)){res.writeHead(403);res.end(JSON.stringify({error:'TEST_ADMIN_ORIGIN_REQUIRED'}));return;}
    res.writeHead(200);res.end(JSON.stringify(createTestSession()));return;
  }
  if (req.url.startsWith('/api/live/')) {
    const headers = { ...req.headers, host: '127.0.0.1:62401' };
    const upstream = http.request({ hostname:'127.0.0.1', port:req.url.startsWith('/api/live/crm/erp/')?62403:62401, path:req.url.slice('/api/live'.length), method:req.method, headers }, response => {
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
