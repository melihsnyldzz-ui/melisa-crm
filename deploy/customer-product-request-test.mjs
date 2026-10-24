import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyTestPackage, TEST_PACKAGE_MANIFEST } from './test-package.mjs';
import { sharedTestHealthSafe } from './test-endpoints.mjs';

const executionRoot = fileURLToPath(new URL('../', import.meta.url));
export const REQUEST_PROOF_ORIGIN = 'http://127.0.0.1:62800';
export const REQUEST_PROOF_DATABASE = 'MELISA_ERP_CRM_SHARED_TEST_20261009_02';
const gatewayOrigin = 'http://127.0.0.1:62801';
const catalogOrigin = 'http://127.0.0.1:62802';
const erpOrigin = 'http://127.0.0.1:4184';
const canonicalPrivateRoot = 'C:/Sirket/CRM/runtime';
const fields = ['version', 'sourceCommit', 'packageRoot', 'packageManifestSha256', 'runtimeDirectory',
  'baselineEnvPath', 'baselineEnvSha256', 'catalogAccessPath', 'catalogAccessSha256',
  'readerPasswordPath', 'readerPasswordSha256', 'dpapiExecutablePath', 'dpapiExecutableSha256',
  'semihAgentId', 'erpSourceCommit', 'erpPackageId', 'erpCopyId'];
const hex = (value, size = 64) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const samePath = (left, right) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);
const within = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
};
const reject = (code = 'CUSTOMER_REQUEST_PROOF_CONFIG_REJECTED') => {
  throw Object.assign(new Error(code), { code });
};

/** Pure shape/path checks. Actual files, package seals and ERP identity are
 * checked again before imports, credential use or any listener starts. */
export function validateProofConfig(value, { sourceRoot = executionRoot, privateRoot = canonicalPrivateRoot } = {}) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== [...fields].sort().join(',') || value.version !== 1
    || !hex(value.sourceCommit, 40) || !hex(value.erpSourceCommit, 40)
    || !hex(value.packageManifestSha256) || !Number.isSafeInteger(value.semihAgentId) || value.semihAgentId < 1
    || typeof value.erpPackageId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(value.erpPackageId)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.erpCopyId || '')) reject();
  for (const name of ['packageRoot', 'runtimeDirectory', 'baselineEnvPath', 'catalogAccessPath', 'readerPasswordPath', 'dpapiExecutablePath']) {
    if (typeof value[name] !== 'string' || !path.isAbsolute(value[name]) || /[\u0000-\u001f\u007f]/.test(value[name])) reject();
  }
  if (!samePath(value.packageRoot, sourceRoot) || within(value.packageRoot, value.runtimeDirectory)
    || !samePath(path.dirname(value.runtimeDirectory), privateRoot)
    || !/^CUSTOMER-PRODUCT-REQUEST-PROOF-[A-Za-z0-9-]{1,80}$/.test(path.basename(value.runtimeDirectory))) reject();
  for (const [filename, digest] of [['baselineEnvPath', 'baselineEnvSha256'], ['catalogAccessPath', 'catalogAccessSha256'],
    ['readerPasswordPath', 'readerPasswordSha256'], ['dpapiExecutablePath', 'dpapiExecutableSha256']]) {
    if (!hex(value[digest]) || within(value.packageRoot, value[filename]) || within(value.runtimeDirectory, value[filename])) reject();
  }
  if (new Set(['baselineEnvPath', 'catalogAccessPath', 'readerPasswordPath', 'dpapiExecutablePath']
    .map(name => path.resolve(value[name]).toLowerCase())).size !== 4
    || !samePath(path.basename(value.dpapiExecutablePath), 'pwsh.exe')) reject();
  return { ...value, packageRoot: path.resolve(value.packageRoot), runtimeDirectory: path.resolve(value.runtimeDirectory) };
}

function regularPath(filename, directory = false) {
  let cursor = path.resolve(filename);
  let first = true;
  while (true) {
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink() || !samePath(fs.realpathSync.native(cursor), cursor)
      || first && (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)
      || !first && !stat.isDirectory()) reject('CUSTOMER_REQUEST_PROOF_PRIVATE_PATH_REJECTED');
    if (first && !directory) first = false;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent; first = false;
  }
}

function pinnedBytes(filename, digest, limit = 256 * 1024) {
  regularPath(filename);
  if (fs.statSync(filename).size > limit) reject('CUSTOMER_REQUEST_PROOF_PRIVATE_FILE_REJECTED');
  const bytes = fs.readFileSync(filename);
  if (hash(bytes) !== digest) reject('CUSTOMER_REQUEST_PROOF_PRIVATE_HASH_MISMATCH');
  return bytes;
}

export async function verifyProofErp(config, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(erpOrigin + '/test-health', {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) reject('CUSTOMER_REQUEST_PROOF_ERP_UNAVAILABLE');
  const payload = await response.json(), health = payload.data ?? payload;
  if (health.ok !== true || !sharedTestHealthSafe(health) || health.databaseName !== REQUEST_PROOF_DATABASE
    || health.port !== 4184 || health.mode !== 'erp' || health.writes !== true
    || health.sourceCommit !== config.erpSourceCommit || health.packageId !== config.erpPackageId
    || health.copyId !== config.erpCopyId) reject('CUSTOMER_REQUEST_PROOF_ERP_IDENTITY_REJECTED');
  return { sourceCommit: health.sourceCommit, packageId: health.packageId, copyId: health.copyId };
}

/** Baseline identities remain password verified. Private state and the cookie
 * realm are separate from the running personel/Semih/customer catalog sessions. */
export function proofEnvironment(config, baseline) {
  return { ...baseline,
    CRM_TEST_PORT_BASE: '62700', CRM_ISOLATED_PREPARATION: 'true',
    CRM_TEST_EXPECTED_DATABASE: REQUEST_PROOF_DATABASE, CRM_TEST_ERP_ORIGIN: erpOrigin,
    CRM_TEST_SOURCE_COMMIT: config.sourceCommit, CRM_TEST_PACKAGE_ROOT: config.packageRoot,
    CRM_TEST_PACKAGE_MANIFEST_SHA256: config.packageManifestSha256,
    CRM_TEST_RUNTIME_DIR: config.runtimeDirectory, CRM_BASELINE_ENV: config.baselineEnvPath,
    CRM_ERP_CATALOG_ACCESS_PATH: config.catalogAccessPath, CRM_UI_ORIGIN: REQUEST_PROOF_ORIGIN,
    WHATSAPP_CRM_PORT: '62801', WHATSAPP_CRM_CORS_ORIGINS: REQUEST_PROOF_ORIGIN,
    CRM_CATALOG_UI_ORIGINS: REQUEST_PROOF_ORIGIN, CRM_ERP_CATALOG_ORIGIN: catalogOrigin,
    // The canonical branch always uses its authenticated CRM read lease for
    // photo bytes. This legacy photo-origin option is deliberately disabled.
    CRM_ERP_CATALOG_PHOTO_CRM_AUTH: 'false',
    CRM_CUSTOMER_PRODUCT_REQUEST_PROOF: 'true',
    CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE: path.join(config.runtimeDirectory, 'customer-product-requests.json'),
    CRM_NORMAL_REFRESH_ENABLED: 'true', CRM_NORMAL_REFRESH_USER_ID: 'crm-agent-test-20261011',
    CRM_NORMAL_REFRESH_JOURNAL_PATH: path.join(config.runtimeDirectory, 'normal-proof-refresh-journal.json'),
    CRM_SEMIH_TEST_CONTINUE_ENABLED: 'true', CRM_SEMIH_TEST_AGENT_ID: String(config.semihAgentId),
    CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH: path.join(config.runtimeDirectory, 'semih-proof-refresh-journal.json'),
    CRM_TEST_LAN_ADDRESS: '', CRM_TEST_TAILSCALE_ADDRESS: '', CRM_TEST_TAILSCALE_PEERS: '',
    CRM_TEST_TERMINAL_PERSONNEL_USERNAME: '', CRM_TEST_AUTOSTART_CONFIGURED: 'false',
    WHATSAPP_PROVIDER: 'waapi', WHATSAPP_TEST_NUMBER_ONLY: 'true',
    WHATSAPP_ALLOWED_TEST_NUMBERS: '905387217733', WAAPI_TEST_RECIPIENT: '905387217733',
    WHATSAPP_SEND_ENABLED: 'false', WHATSAPP_LIVE_SEND_APPROVED: 'false',
    WHATSAPP_AUTO_REPLY_ENABLED: 'false', WAAPI_CHATWOOT_BRIDGE_ENABLED: 'false',
    WAAPI_INCOMING_READER_ENABLED: 'false', WAAPI_OUTBOUND_MEDIA_ENABLED: 'false',
    CHATWOOT_INBOX_FALLBACK_ENABLED: 'false',
    CRM_PAID_AI_ENABLED: 'false', CRM_AI_SALES_MODE: 'off', CRM_AI_CUSTOMER_CATALOG_ORIGIN: '',
    OPENAI_API_KEY: '', WAAPI_API_TOKEN: '', WHATSAPP_CRM_POSTGRES_URL: '', WHATSAPP_CRM_REDIS_URL: '',
    CRM_WAAPI_JOURNAL_DIR: path.join(config.runtimeDirectory, 'closed-provider-journal'),
    CRM_OUTBOUND_NAMESPACE: 'melisa-crm:customer-product-request-proof',
  };
}

const forwardedHeaders = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'];
export function proofRequestAllowed(req, port = 62800) {
  const site = req.headers['sec-fetch-site'];
  return req.socket?.localAddress === '127.0.0.1' && req.socket?.remoteAddress === '127.0.0.1'
    && req.headers.host === `127.0.0.1:${port}`
    && (!req.headers.origin || req.headers.origin === REQUEST_PROOF_ORIGIN)
    && (!site || ['same-origin', 'none'].includes(site))
    && !forwardedHeaders.some(name => req.headers[name]);
}

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store',
    'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(data));
};

export function createProofUiHandler({ assets, sourceCommit, proxyRequest = http.request } = {}) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
  return (req, res) => {
    res.setHeader('cache-control', 'no-store'); res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('x-content-type-options', 'nosniff');
    if (!proofRequestAllowed(req)) return json(res, 403, { error: 'CUSTOMER_REQUEST_PROOF_ORIGIN_REQUIRED' });
    let url;
    try {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) throw Error();
      url = new URL(req.url, REQUEST_PROOF_ORIGIN);
    } catch { return json(res, 400, { error: 'CUSTOMER_REQUEST_PROOF_PATH_INVALID' }); }
    if (url.pathname === '/test-health' && ['GET', 'HEAD'].includes(req.method)) return json(res, 200, {
      ok: true, testOnly: true, environment: 'ISOLATED_TEST_COPY', database: REQUEST_PROOF_DATABASE,
      sourceCommit, ports: { ui: 62800, gateway: 62801, catalog: 62802 },
      customerProductRequests: true, externalOperations: false, paidAi: false, whatsappSend: false,
      nativeOrders: false, stockEffect: false, ledgerEffect: false, reservationEffect: false, autostart: false,
    });
    if (url.pathname === '/api/test-session' && req.method === 'GET') return json(res, 200, {
      enabled: true, user: null, normalLogin: true, semihTestContinue: true,
      customerProductRequests: true, testOnly: true, sourceCommit,
    });
    if (url.pathname === '/api/customer-product-request-state' && req.method === 'GET')
      return json(res, 200, { success: true, data: { enabled: true } });
    if (/^\/api\/(?:test-(?:admin|personnel)|native|live\/crm\/erp)(?:\/|$)/.test(url.pathname))
      return json(res, 403, { error: 'CUSTOMER_REQUEST_PROOF_BUSINESS_WRITE_DISABLED' });
    let port, upstreamPath;
    if (url.pathname.startsWith('/api/live/')) { port = 62801; upstreamPath = req.url.slice('/api/live'.length); }
    else if (url.pathname.startsWith('/api/catalog/')) {
      if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'GET_ONLY' });
      port = 62802; upstreamPath = '/api/crm-catalog' + req.url.slice('/api/catalog'.length);
    }
    if (port) {
      const upstream = proxyRequest({ hostname: '127.0.0.1', port, path: upstreamPath, method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${port}` } }, response => {
        if (res.destroyed) return;
        res.writeHead(response.statusCode, { ...response.headers, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
        response.pipe(res);
      });
      upstream.once('error', () => { if (!res.destroyed && !res.writableEnded) {
        if (!res.headersSent) json(res, 502, { error: 'CUSTOMER_REQUEST_PROOF_SERVICE_UNAVAILABLE' }); else res.end();
      } });
      req.once('aborted', () => upstream.destroy()); req.pipe(upstream); return;
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'NOT_FOUND' });
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'GET_ONLY' });
    let name;
    try { name = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'INVALID_PATH' }); }
    if (/[\u0000-\u001f\u007f\\]/.test(name)) return json(res, 400, { error: 'INVALID_PATH' });
    const target = path.resolve(assets, '.' + name);
    if (!within(assets, target)) return json(res, 403, { error: 'INVALID_PATH' });
    const exists = fs.existsSync(target) && fs.statSync(target).isFile();
    if (name.startsWith('/assets/') && !exists) return json(res, 404, { error: 'NOT_FOUND' });
    const filename = exists ? target : path.join(assets, 'index.html');
    const stream = fs.createReadStream(filename);
    stream.once('error', () => { if (!res.headersSent) json(res, 404, { error: 'NOT_FOUND' }); else res.destroy(); });
    res.setHeader('content-type', types[path.extname(filename)] || 'application/octet-stream');
    if (req.method === 'HEAD') { stream.destroy(); res.writeHead(200); res.end(); }
    else stream.pipe(res);
  };
}

const dpapiCommand = '$cipher=[Console]::In.ReadToEnd();$secret=ConvertTo-SecureString -String $cipher;'
  + '$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret);'
  + 'try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))}'
  + 'finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secret.Dispose()}';
function protectedPassword(config, spawnImpl = spawn) {
  const encrypted = pinnedBytes(config.readerPasswordPath, config.readerPasswordSha256, 65536);
  pinnedBytes(config.dpapiExecutablePath, config.dpapiExecutableSha256, 16 * 1024 * 1024);
  return new Promise((resolve, fail) => {
    const child = spawnImpl(config.dpapiExecutablePath, ['-NoProfile', '-NonInteractive', '-Command', dpapiCommand],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', settled = false;
    const timer = setTimeout(() => { child.kill(); finish(false); }, 10000);
    function finish(success) {
      if (settled) return; settled = true; clearTimeout(timer);
      if (!success || stdout.length < 16 || stdout.length > 512 || /[\r\n\u0000]/.test(stdout)) {
        stdout = ''; fail(Object.assign(new Error('CUSTOMER_REQUEST_PROOF_CREDENTIAL_UNAVAILABLE'), { code: 'CUSTOMER_REQUEST_PROOF_CREDENTIAL_UNAVAILABLE' }));
      } else { const value = stdout; stdout = ''; resolve(value); }
    }
    child.stdout.setEncoding('utf8'); child.stdout.on('data', value => { stdout += value; if (stdout.length > 512) { child.kill(); finish(false); } });
    child.stderr.resume(); // Decryption diagnostics may contain private material; never forward them.
    child.once('error', () => finish(false)); child.once('close', code => finish(code === 0));
    child.stdin.once('error', () => finish(false)); child.stdin.end(encrypted);
  });
}

function listen(server, port) {
  return new Promise((resolve, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', fail); resolve(); });
  });
}
const close = server => !server.listening ? Promise.resolve() : new Promise(resolve => server.close(resolve));

/** An explicit ephemeral proof launch, not the shared supervisor or autostart.
 * It never starts provider workers, modifies ERP or exposes a remote listener. */
export async function startCustomerProductRequestProof({ configPath, configSha256, dependencies = {} } = {}) {
  const { sourceRoot = executionRoot, environment = process.env, fetchImpl = fetch,
    verifyPackage = verifyTestPackage, spawnImpl = spawn } = dependencies;
  if (!path.isAbsolute(configPath || '') || !hex(configSha256)) reject();
  const config = validateProofConfig(JSON.parse(pinnedBytes(configPath, configSha256, 65536)), { sourceRoot });
  if (!samePath(path.dirname(configPath), config.runtimeDirectory)) reject();
  regularPath(config.runtimeDirectory, true);
  const verified = verifyPackage({ packageRoot: config.packageRoot, manifestSha256: config.packageManifestSha256 });
  const manifest = JSON.parse(fs.readFileSync(path.join(config.packageRoot, TEST_PACKAGE_MANIFEST), 'utf8'));
  if (verified?.environment !== 'TEST' || verified.sourceCommit !== config.sourceCommit || manifest.build?.isolatedPreparation !== true
    || !manifest.sourceFiles?.some(row => row.path === 'deploy/customer-product-request-test.mjs')
    || !manifest.sourceFiles?.some(row => row.path === 'apps/gateway/src/services/customerProductRequestIntegration.mjs')) reject('CUSTOMER_REQUEST_PROOF_PACKAGE_REJECTED');
  const baselineBytes = pinnedBytes(config.baselineEnvPath, config.baselineEnvSha256);
  pinnedBytes(config.catalogAccessPath, config.catalogAccessSha256);
  pinnedBytes(config.readerPasswordPath, config.readerPasswordSha256, 65536);
  pinnedBytes(config.dpapiExecutablePath, config.dpapiExecutableSha256, 16 * 1024 * 1024);
  await verifyProofErp(config, { fetchImpl });
  const { default: dotenv } = await import('../apps/gateway/node_modules/dotenv/lib/main.js');
  Object.assign(environment, proofEnvironment(config, dotenv.parse(baselineBytes)));
  // All authentication modules are imported only after this pinned private
  // configuration has closed provider/AI/PG/Redis writes and isolated journals.
  const [{ createApp }, { Router }, auth, { createCanonicalCatalogReader }, { getErpAuthorization }, integrationModule] = await Promise.all([
    import('../apps/gateway/src/app.js'), import('../apps/gateway/node_modules/express/index.js'),
    import('../apps/gateway/src/services/crmAuthService.js'), import('../packages/erp-adapter/services/canonicalCatalogReader.mjs'),
    import('./test-erp-catalog.mjs'), import('../apps/gateway/src/services/customerProductRequestIntegration.mjs'),
  ]);
  let readerSession = null, loginPending = null;
  const getCrmAuthorization = async () => {
    if (readerSession) {
      try { auth.verifyCrmAccessToken(readerSession.accessToken); return 'Bearer ' + readerSession.accessToken; }
      catch { auth.logoutNormalCrmSession(readerSession.refreshToken); readerSession = null; }
    }
    if (!loginPending) loginPending = (async () => {
      let password = await protectedPassword(config, spawnImpl);
      try { readerSession = auth.authenticateCrmUser({ username: 'crm-semih-test', password }); }
      finally { password = ''; }
      if (readerSession.user?.id !== 'crm-semih-test-20261012' || readerSession.user.normalTestScope?.semihTestContinue !== true
        || readerSession.user.role !== 'patron' || readerSession.user.chatwootAgentId !== config.semihAgentId || !readerSession.refreshToken) {
        if (readerSession.refreshToken) auth.logoutNormalCrmSession(readerSession.refreshToken);
        readerSession = null; reject('CUSTOMER_REQUEST_PROOF_READER_IDENTITY_REJECTED');
      }
      return 'Bearer ' + readerSession.accessToken;
    })().finally(() => { loginPending = null; });
    return loginPending;
  };
  const catalogReader = createCanonicalCatalogReader({ crmOrigin: gatewayOrigin, erpOrigin,
    expectedDatabase: REQUEST_PROOF_DATABASE, transport: fetchImpl, getErpAuthorization });
  const integration = integrationModule.createCustomerProductRequestIntegration({ Router, environment,
    crmOrigin: gatewayOrigin, catalogReader, getCrmAuthorization });
  if (!integration.enabled || !integration.router) reject('CUSTOMER_REQUEST_PROOF_INTEGRATION_DISABLED');
  const app = createApp({ customerProductRequestRouter: integration.router });
  const servers = [];
  try {
    const gateway = http.createServer((req, res) => {
      if (!proofRequestAllowed(req, 62801)) return json(res, 403, { error: 'CUSTOMER_REQUEST_PROOF_ORIGIN_REQUIRED' });
      if (/^\/(?:webhooks?|crm\/erp)(?:\/|$)/.test(req.url)) return json(res, 403, { error: 'CUSTOMER_REQUEST_PROOF_BUSINESS_WRITE_DISABLED' });
      app(req, res);
    }); servers.push(gateway); await listen(gateway, 62801);
    const catalog = http.createServer(async (req, res) => {
      if (!proofRequestAllowed(req, 62802)) return json(res, 403, { error: 'CUSTOMER_REQUEST_PROOF_ORIGIN_REQUIRED' });
      const controller = new AbortController(), cancel = () => { if (!res.writableEnded) controller.abort(); };
      req.once('aborted', cancel); res.once('close', cancel);
      try {
        const result = await catalogReader(new Request(catalogOrigin + req.url,
          { method: req.method, headers: req.headers, signal: controller.signal }));
        const bytes = Buffer.from(await result.arrayBuffer());
        if (!controller.signal.aborted) { res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(bytes); }
      } catch { if (!res.destroyed && !res.writableEnded) json(res, 503, { error: 'CUSTOMER_REQUEST_PROOF_CATALOG_UNAVAILABLE' }); }
      finally { req.removeListener('aborted', cancel); res.removeListener('close', cancel); }
    }); servers.push(catalog); await listen(catalog, 62802);
    const ui = http.createServer(createProofUiHandler({ assets: path.join(config.packageRoot, 'apps/frontend/dist/client'), sourceCommit: config.sourceCommit }));
    servers.push(ui); await listen(ui, 62800);
    await getCrmAuthorization();
  } catch (error) {
    await Promise.all(servers.map(close));
    if (readerSession?.refreshToken) auth.logoutNormalCrmSession(readerSession.refreshToken);
    readerSession = null; throw error;
  }
  let closing;
  return { origin: REQUEST_PROOF_ORIGIN, sourceCommit: config.sourceCommit,
    close: () => closing ??= (async () => {
      await Promise.all(servers.map(close));
      if (readerSession?.refreshToken) auth.logoutNormalCrmSession(readerSession.refreshToken);
      readerSession = null;
    })() };
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  let proof;
  try {
    if (process.argv.length !== 6 || process.argv[2] !== '--config' || process.argv[4] !== '--sha256') reject();
    proof = await startCustomerProductRequestProof({ configPath: process.argv[3], configSha256: process.argv[5] });
    console.log('CUSTOMER_PRODUCT_REQUEST_PROOF_READY ' + proof.origin);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void proof.close().then(() => process.exit(0)); });
  } catch (error) {
    console.error(/^CUSTOMER_REQUEST_PROOF_[A-Z_]+$/.test(error?.code || '') ? error.code : 'CUSTOMER_REQUEST_PROOF_START_FAILED');
    process.exitCode = 1;
  }
}
