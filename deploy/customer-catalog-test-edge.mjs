import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyTestPackage, TEST_PACKAGE_MANIFEST } from './test-package.mjs';
import { resolveTestEndpoints, sharedTestHealthSafe } from './test-endpoints.mjs';
import { createTestUiHandler, resolveTestTailscaleNetwork, testUiRequestAllowed } from './test-server.mjs';
import { createCustomerCatalogTestRuntime, readCustomerCatalogTestProfile, customerCatalogLinkOrigin } from './customer-catalog-test-runtime.mjs';
import { getErpAuthorization } from './test-erp-catalog.mjs';

const executionRoot = fileURLToPath(new URL('../', import.meta.url));
const EDGE_ADDRESS = '100.87.188.3';
const handles = new WeakMap();
const fail = code => { throw Object.assign(new Error(code), { code }); };
const samePath = (left, right) => process.platform === 'win32'
  ? path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
  : path.resolve(left) === path.resolve(right);
const outside = (root, filename) => {
  const relative = path.relative(path.resolve(root), path.resolve(filename));
  return path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep);
};

function privateLocation(filename, root, directory = false) {
  if (!path.isAbsolute(filename || '') || !outside(root, filename)) fail('CUSTOMER_CATALOG_EDGE_PRIVATE_PATH_REQUIRED');
  let stat;
  try { stat = fs.lstatSync(filename); } catch { fail('CUSTOMER_CATALOG_EDGE_PRIVATE_PATH_REQUIRED'); }
  if (stat.isSymbolicLink() || !samePath(fs.realpathSync.native(filename), filename)
      || (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1 || stat.size > 65536)) {
    fail('CUSTOMER_CATALOG_EDGE_PRIVATE_PATH_REQUIRED');
  }
  return path.resolve(filename);
}

/** All locations and identities are explicit. This does not load a baseline env,
 * install an auth signer, start another service, or read ERP credentials. */
export function resolveCustomerCatalogEdgeConfiguration(environment = process.env, {
  sourceRoot = executionRoot, interfaces = os.networkInterfaces(), verifyPackage = verifyTestPackage,
} = {}) {
  for (const name of ['CRM_TEST_PORT_BASE', 'CRM_ISOLATED_PREPARATION', 'CRM_TEST_ERP_ORIGIN',
    'CRM_TEST_EXPECTED_DATABASE', 'CRM_TEST_PACKAGE_ROOT', 'CRM_TEST_PACKAGE_MANIFEST_SHA256',
    'CRM_TEST_RUNTIME_DIR', 'CRM_CUSTOMER_CATALOG_PROFILE_PATH', 'CRM_ERP_CATALOG_ACCESS_PATH',
    'CRM_TEST_TAILSCALE_ADDRESS', 'CRM_TEST_TAILSCALE_PEERS', 'WAAPI_TEST_RECIPIENT']) {
    if (typeof environment[name] !== 'string' || !environment[name]) fail('CUSTOMER_CATALOG_EDGE_CONFIGURATION_REQUIRED');
  }
  const endpoints = resolveTestEndpoints(environment);
  if (!endpoints.isolated || endpoints.ui !== 62600 || environment.CRM_TEST_TAILSCALE_ADDRESS !== EDGE_ADDRESS) {
    fail('CUSTOMER_CATALOG_EDGE_ISOLATED_IDENTITY_REQUIRED');
  }
  const packageRoot = environment.CRM_TEST_PACKAGE_ROOT;
  const pin = environment.CRM_TEST_PACKAGE_MANIFEST_SHA256.toLowerCase();
  if (!path.isAbsolute(packageRoot) || !samePath(packageRoot, sourceRoot) || !/^[a-f0-9]{64}$/.test(pin)) {
    fail('CUSTOMER_CATALOG_EDGE_SEALED_PACKAGE_REQUIRED');
  }
  const packageIdentity = verifyPackage({ packageRoot: path.resolve(packageRoot), manifestSha256: pin });
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, TEST_PACKAGE_MANIFEST), 'utf8'));
  if (packageIdentity?.environment !== 'TEST' || manifest.build?.isolatedPreparation !== true
      || !manifest.sourceFiles?.some(row => row.path === 'deploy/customer-catalog-test-edge.mjs')) {
    fail('CUSTOMER_CATALOG_EDGE_ISOLATED_PACKAGE_REQUIRED');
  }
  const tailscaleNetwork = resolveTestTailscaleNetwork(environment.CRM_TEST_TAILSCALE_ADDRESS,
    environment.CRM_TEST_TAILSCALE_PEERS, interfaces, endpoints);
  // The verified local interface can be used by the authenticated operator on
  // this host. It never enables the TEST admin/personnel bootstrap on the edge.
  tailscaleNetwork.peers.add(tailscaleNetwork.address);
  const runtimeDirectory = privateLocation(environment.CRM_TEST_RUNTIME_DIR, sourceRoot, true);
  const accessPath = privateLocation(environment.CRM_ERP_CATALOG_ACCESS_PATH, sourceRoot);
  privateLocation(environment.CRM_CUSTOMER_CATALOG_PROFILE_PATH, sourceRoot);
  const profile = readCustomerCatalogTestProfile(environment.CRM_CUSTOMER_CATALOG_PROFILE_PATH, sourceRoot, runtimeDirectory);
  if (!profile || profile.peer !== environment.WAAPI_TEST_RECIPIENT || String(profile.pilot?.conversationId) !== '55') {
    fail('CUSTOMER_CATALOG_EDGE_OWNER_PROFILE_REQUIRED');
  }
  return { endpoints, tailscaleNetwork, runtimeDirectory, profile, accessPath, packageIdentity,
    assets: path.join(path.resolve(packageRoot), 'apps/frontend/dist/client'),
    linkOrigin: customerCatalogLinkOrigin({ endpoints, tailscaleNetwork }) };
}

async function readJson(transport, url, options = {}) {
  let response, payload;
  try {
    response = await transport(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000), ...options });
    payload = await response.json();
  } catch { fail('CUSTOMER_CATALOG_EDGE_BASELINE_UNAVAILABLE'); }
  if (!response.ok || payload?.success === false) fail('CUSTOMER_CATALOG_EDGE_BASELINE_UNAVAILABLE');
  return payload?.data ?? payload;
}

export async function assertCustomerCatalogEdgeBaseline({ endpoints, profile, transport = fetch, native = true }) {
  const health = await readJson(transport, endpoints.gatewayOrigin + '/health', { headers: { origin: endpoints.uiOrigin } });
  if (health?.status !== 'ok' || health.authMode !== 'crm-local' || health.provider !== 'disabled-preparation'
      || ['providerConnected', 'sendReady', 'bridgeReady', 'sendEnabled', 'translationEnabled'].some(key => health[key] !== false)) {
    fail('CUSTOMER_CATALOG_EDGE_BASELINE_UNSAFE');
  }
  if (native) {
    const identity = await readJson(transport, endpoints.nativeOrigin + '/test-health');
    if (!identity?.ok || !sharedTestHealthSafe(identity) || identity.database !== endpoints.database
        || identity.port !== endpoints.native || identity.purpose !== 'crm-order-draft-only'
        || identity.sourceCommit !== profile.nativeSourceCommit || identity.packageId !== profile.nativePackageId
        || ['stockEffect', 'ledgerEffect', 'reservationEffect'].some(key => identity[key] !== false)) {
      fail('CUSTOMER_CATALOG_EDGE_NATIVE_IDENTITY_MISMATCH');
    }
  }
}

/** Boundary checks use the original phone origin and socket identity. Only then
 * do staff proxies use the old loopback UI origin accepted by existing CORS. */
export function createCustomerCatalogEdgeHandler({ assets, endpoints, tailscaleNetwork, customerCatalogHandler,
  checkBaseline, proxyRequest = http.request } = {}) {
  const ui = createTestUiHandler({ assets, endpoints, tailscaleNetwork, customerCatalogHandler });
  return async (req, res) => {
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.socket?.localAddress !== tailscaleNetwork.address
        || !testUiRequestAllowed(req, null, endpoints, tailscaleNetwork)
        || ['forwarded', 'x-real-ip', 'x-forwarded-proto'].some(key => req.headers[key])) {
      res.writeHead(403); res.end('TEST_UI_ORIGIN_REQUIRED'); return;
    }
    let pathname;
    try {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) throw Error();
      pathname = new URL(req.url, tailscaleNetwork.origin).pathname;
    } catch { res.writeHead(400); res.end(); return; }
    if (/^\/api\/test-(?:admin|personnel)(?:\/|$)/.test(pathname)) {
      res.writeHead(403); res.end('TEST_EDGE_BOOTSTRAP_DISABLED'); return;
    }
    try {
      if (pathname.startsWith('/api/live/') && !pathname.startsWith('/api/live/crm/customer-catalog/')) {
        await checkBaseline();
        const port = pathname.startsWith('/api/live/crm/erp/') ? endpoints.orders : endpoints.gateway;
        const headers = { ...req.headers, host: '127.0.0.1:' + port, origin: endpoints.uiOrigin };
        delete headers.referer;
        const upstream = proxyRequest({ hostname: '127.0.0.1', port,
          path: req.url.slice('/api/live'.length), method: req.method, headers }, response => {
          if (res.destroyed) return;
          res.writeHead(response.statusCode, { ...response.headers, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
          response.pipe(res);
        });
        upstream.once('error', () => {
          if (res.destroyed || res.writableEnded) return;
          if (!res.headersSent) res.writeHead(502);
          res.end('TEST servisine ulaşılamadı.');
        });
        req.once('aborted', () => upstream.destroy());
        req.pipe(upstream); return;
      }
      await ui(req, res);
    } catch {
      if (res.destroyed || res.writableEnded) return;
      if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { code: 'CUSTOMER_CATALOG_SOURCE_UNAVAILABLE',
        message: 'TEST servisi şu anda doğrulanamıyor. Lütfen daha sonra tekrar deneyin.' } }));
    }
  };
}

/** Starts one new listener and borrows existing HTTP auth/catalog/native services.
 * Injectable dependencies are for offline verification; CLI uses the defaults. */
export async function startCustomerCatalogTestEdge({ environment = process.env, dependencies = {} } = {}) {
  const { transport = fetch, createServer = http.createServer, createRuntime = createCustomerCatalogTestRuntime,
    erpAuthorization = getErpAuthorization, ...configurationDependencies } = dependencies;
  const config = resolveCustomerCatalogEdgeConfiguration(environment, configurationDependencies);
  const { endpoints, profile, tailscaleNetwork } = config;
  const actorAuthorizations = new Map();
  const checkBaseline = () => assertCustomerCatalogEdgeBaseline({ ...config, transport, native: false });
  await assertCustomerCatalogEdgeBaseline({ ...config, transport });
  const verifyToken = async token => {
    if (typeof token !== 'string' || !token || /\s/.test(token)) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED');
    await checkBaseline();
    const authorization = 'Bearer ' + token;
    const user = await readJson(transport, endpoints.gatewayOrigin + '/auth/me', {
      headers: { authorization, origin: endpoints.uiOrigin },
    });
    if (String(user?.id) !== String(profile.pilot.actorId) || user.active === false
        || !['patron', 'mudur'].includes(user.role) || !user.permissions?.includes('crm.manage')
        || !user.permissions.includes('crm.send')) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED');
    actorAuthorizations.set(String(user.id), authorization);
    return user;
  };
  const customerCatalogHandler = createRuntime({ ...config, transport, verifyToken,
    allowedTestPeer: environment.WAAPI_TEST_RECIPIENT,
    getErpAuthorization: () => erpAuthorization({ accountName: 'seller', environment: { CRM_ERP_CATALOG_ACCESS_PATH: config.accessPath },
      testEndpoints: endpoints, fetchFn: transport }),
    readConversation: async (scope, user) => {
      if (String(scope.actorId) !== String(user?.id) || String(scope.conversationId) !== '55') fail('CUSTOMER_CATALOG_PEER_MISMATCH');
      const authorization = actorAuthorizations.get(String(user.id));
      if (!authorization) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED');
      return readJson(transport, endpoints.gatewayOrigin + '/crm/conversations/55', { headers: { authorization, origin: endpoints.uiOrigin } });
    },
  });
  const handler = createCustomerCatalogEdgeHandler({ ...config, customerCatalogHandler, checkBaseline,
    ...(dependencies.proxyRequest ? { proxyRequest: dependencies.proxyRequest } : {}) });
  const server = createServer(handler);
  server.requestTimeout = 60000; server.headersTimeout = 15000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(endpoints.ui, tailscaleNetwork.address, () => { server.removeListener('error', reject); resolve(); });
    });
  } catch (error) { actorAuthorizations.clear(); throw error; }
  let closePromise;
  const handle = { server, handler, customerCatalogHandler, origin: tailscaleNetwork.origin, sourceCommit: config.packageIdentity.sourceCommit,
    issueOwnerLink: () => issueCustomerCatalogOwnerLink(handle),
    close: () => {
      if (!closePromise) {
        handles.delete(handle); actorAuthorizations.clear();
        closePromise = new Promise((resolve, reject) => {
          server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
          server.closeIdleConnections?.();
        });
      }
      return closePromise;
    },
  };
  handles.set(handle, { config, transport, customerCatalogHandler });
  return handle;
}

/** Explicit owner-only issuance. The old localhost bootstrap supplies its own
 * signer; the new handler verifies that JWT through old /auth/me. The private
 * capability is returned only to this caller in RAM. No provider, log or file. */
export async function issueCustomerCatalogOwnerLink(handle) {
  const context = handles.get(handle);
  if (!context) fail('CUSTOMER_CATALOG_EDGE_NOT_RUNNING');
  const { config, transport, customerCatalogHandler } = context;
  await assertCustomerCatalogEdgeBaseline({ ...config, transport });
  const session = await readJson(transport, config.endpoints.uiOrigin + '/api/test-admin/session', {
    method: 'POST', headers: { origin: config.endpoints.uiOrigin, 'content-type': 'application/json' }, body: '{}',
  });
  if (typeof session?.accessToken !== 'string' || !session.accessToken || /\s/.test(session.accessToken)
      || session.tokenType !== 'Bearer') fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED');
  const response = await customerCatalogHandler(new Request(config.linkOrigin + '/crm/customer-catalog/sessions', {
    method: 'POST', headers: { authorization: 'Bearer ' + session.accessToken, origin: config.linkOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId: '55' }),
  }));
  let payload;
  try { payload = await response.json(); } catch { fail('CUSTOMER_CATALOG_EDGE_ISSUE_FAILED'); }
  const data = payload?.data;
  if (response.status !== 201 || payload.success !== true || data?.testOnly !== true
      || data.linkOrigin !== config.linkOrigin || !/^\/katalog#[A-Za-z0-9_-]{43}$/.test(data.url || '')) {
    fail('CUSTOMER_CATALOG_EDGE_ISSUE_FAILED');
  }
  return { ...data, link: new URL(data.url, config.linkOrigin).href };
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    if (process.argv.slice(2).length > 1 || process.argv[2] && process.argv[2] !== 'start') fail('CUSTOMER_CATALOG_EDGE_ARGUMENTS_INVALID');
    const edge = await startCustomerCatalogTestEdge();
    console.log('CUSTOMER_CATALOG_EDGE_READY ' + edge.origin);
    const stop = () => edge.close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    edge.server.on('error', stop);
  } catch (error) {
    console.error(/^[A-Z][A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'CUSTOMER_CATALOG_EDGE_START_FAILED');
    process.exitCode = 1;
  }
}
