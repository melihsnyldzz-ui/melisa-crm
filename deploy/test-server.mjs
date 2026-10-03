import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import dotenv from '../apps/gateway/node_modules/dotenv/lib/main.js';
import {resolveTestDirectories} from './test-supervisor.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function configureTestServerEnvironment(repoRoot,{env=process.env,loadBaseline=options=>dotenv.config(options)}={}){
if (!env.CRM_BASELINE_ENV) throw Error('CRM_BASELINE_ENV_REQUIRED');
// Capture the validated TEST locations before baseline dotenv can override them.
const {runtime,logs}=resolveTestDirectories(repoRoot,env);
// Read the existing protected configuration in process memory; never copy or log it.
const loaded=loadBaseline({ path: env.CRM_BASELINE_ENV, processEnv:env, override: true, quiet: true });
if(loaded?.error)throw Error('CRM_BASELINE_ENV_UNAVAILABLE');
Object.assign(env, {
  WHATSAPP_CRM_PORT: '62401', CRM_UI_ORIGIN: 'http://127.0.0.1:62400',
  WHATSAPP_CRM_CORS_ORIGINS: 'http://127.0.0.1:62400',
  WHATSAPP_PROVIDER: 'waapi', WHATSAPP_TEST_NUMBER_ONLY: 'true',
  WHATSAPP_ALLOWED_TEST_NUMBERS: '905387217733', WAAPI_TEST_RECIPIENT: '905387217733',
  WAAPI_OUTBOUND_MEDIA_ENABLED: 'true', WAAPI_CHATWOOT_BRIDGE_ENABLED: 'true', WHATSAPP_AUTO_REPLY_ENABLED: 'false',
  WHATSAPP_SEND_ENABLED: 'true', WHATSAPP_LIVE_SEND_APPROVED: 'true',
  CRM_OUTBOUND_NAMESPACE: 'melisa-crm:test-completion',
  CRM_ERP_CATALOG_ORIGIN: 'http://127.0.0.1:62402',
  CRM_ERP_CATALOG_PHOTO_CRM_AUTH: 'true',
  CRM_TEST_RUNTIME_DIR:runtime, CRM_TEST_LOG_DIR:logs,
  CRM_WAAPI_JOURNAL_DIR: path.join(runtime,'waapi'),
});
}
async function startTestServer(){
configureTestServerEnvironment(root);
// TEST receiver only reads the approved peer and imports into conversation 55.
const { createApp } = await import('../apps/gateway/src/app.js');
const { startTestIncomingReader } = await import('../apps/gateway/src/services/testIncomingReader.js');
const stopIncoming = startTestIncomingReader();
const gateway = createApp().listen(62401, '127.0.0.1');
const assets = path.join(root, 'apps/frontend/dist/client');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const ui = http.createServer((req, res) => {
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
}).listen(62400, '127.0.0.1', () => console.log('Melisa CRM TEST hazır: http://127.0.0.1:62400'));
for (const server of [ui,gateway]) server.on('error', error => { console.error(error.code || 'TEST_START_FAILED'); process.exit(1); });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { stopIncoming(); ui.close(); gateway.close(); setTimeout(() => process.exit(0), 500).unref(); });
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await startTestServer();
