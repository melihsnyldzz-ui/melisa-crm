import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { startCustomerCatalogTestEdge, resolveCustomerCatalogEdgeConfiguration,
  issueCustomerCatalogOwnerLink } from '../deploy/customer-catalog-test-edge.mjs';
import { createCustomerCatalogTestRuntime } from '../deploy/customer-catalog-test-runtime.mjs';

const address = '100.87.188.3', phone = '100.101.102.103';
const origin = 'http://' + address + ':62600';
const hash = 'a'.repeat(64), commit = 'b'.repeat(40);
const peer = '905550007733'; // Synthetic fixture only.

class FixtureServer extends EventEmitter {
  constructor(handler) { super(); this.handler = handler; this.listens = []; this.closes = 0; this.idleCloses = 0; }
  listen(port, host, callback) { this.listens.push({ port, host }); queueMicrotask(callback); return this; }
  close(callback) { this.closes++; queueMicrotask(() => callback()); }
  closeIdleConnections() { this.idleCloses++; }
}
class FixtureResponse extends Writable {
  constructor() { super(); this.parts = []; this.headers = {}; this.statusCode = 200; this.headersSent = false; }
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; }
  writeHead(status, headers = {}) {
    this.statusCode = status; this.headersSent = true;
    for (const [key, value] of Object.entries(headers)) this.setHeader(key, value);
    return this;
  }
  _write(chunk, encoding, callback) { this.parts.push(Buffer.from(chunk)); callback(); }
  get body() { return Buffer.concat(this.parts).toString(); }
}
async function request(handler, { method = 'GET', url = '/katalog', local = address, remote = phone, headers = {}, body = '' } = {}) {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  req.method = method; req.url = url; req.socket = { localAddress: local, remoteAddress: remote };
  req.headers = { host: address + ':62600', ...headers };
  const res = new FixtureResponse(), finished = new Promise((resolve, reject) => {
    res.once('finish', resolve); res.once('error', reject);
  });
  await handler(req, res); await finished; return res;
}

function fixture(t, { actualRuntime = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-edge-test-'));
  const sourceRoot = path.join(directory, 'package'), runtime = path.join(directory, 'runtime');
  fs.mkdirSync(path.join(sourceRoot, 'apps/frontend/dist/client'), { recursive: true }); fs.mkdirSync(runtime);
  fs.writeFileSync(path.join(sourceRoot, 'apps/frontend/dist/client/index.html'), '<main>SEALED TEST catalog</main>');
  const manifest = { build: { isolatedPreparation: true }, source: { commit },
    sourceFiles: [{ path: 'deploy/customer-catalog-test-edge.mjs' }] };
  fs.writeFileSync(path.join(sourceRoot, 'release-manifest.json'), JSON.stringify(manifest));
  const source = { runId: 'PRODUCT-11111111-1111-4111-8111-111111111111', sourceAsOf: '2026-10-08',
    sourceHash: hash, planHash: hash, bindingsHash: hash, snapshotHash: hash, actualT1: false, counts: { products: 1, prices: 1 } };
  const profile = { version: 1, peer, nativeSourceCommit: commit, nativePackageId: 'fixture-native', erpActorId: '15',
    customerMatch: { basis: 'operator-confirmed', phone: peer, revision: hash, reason: 'Synthetic TEST match' },
    expectedSource: source, prices: [{ productId: 'erp-101', priceId: 201, unitSourceId: 1, currency: 'TRY', priceSourceKey: 'FIXTURE-PRICE' }],
    pilot: { enabled: true, approved: true, environment: 'ISOLATED_TEST_COPY', database: 'MELISA_ERP_CRM_SHARED_TEST_20261009_01',
      actorId: 'crm-test-admin', conversationId: '55', customerId: 44, customerLabel: 'Synthetic owner fixture', currency: 'TRY',
      sourceEnvironment: 'ISOLATED_TEST_COPY', sourceLabel: 'SENTETİK ÖNİZLEME',
      products: [{ id: 'erp-101', recommended: true, maxSeries: 10, series: { verified: true,
        evidence: 'Synthetic TEST series fixture', totalPieces: 6, composition: [{ label: '3 ay', quantity: 2 },
          { label: '9 ay', quantity: 2 }, { label: '12 ay', quantity: 2 }], stockCompositionVerified: true,
        stockEvidence: 'Synthetic TEST stock fixture', availableSeries: 10 } }] } };
  const profilePath = path.join(runtime, 'profile.json'), accessPath = path.join(runtime, 'erp-access.json');
  fs.writeFileSync(profilePath, JSON.stringify(profile)); fs.writeFileSync(accessPath, '{}');
  const environment = { CRM_TEST_PORT_BASE: '62600', CRM_ISOLATED_PREPARATION: 'true',
    CRM_TEST_ERP_ORIGIN: 'http://127.0.0.1:4174', CRM_TEST_EXPECTED_DATABASE: profile.pilot.database,
    CRM_TEST_PACKAGE_ROOT: sourceRoot, CRM_TEST_PACKAGE_MANIFEST_SHA256: hash, CRM_TEST_RUNTIME_DIR: runtime,
    CRM_CUSTOMER_CATALOG_PROFILE_PATH: profilePath, CRM_ERP_CATALOG_ACCESS_PATH: accessPath,
    CRM_TEST_TAILSCALE_ADDRESS: address, CRM_TEST_TAILSCALE_PEERS: phone, WAAPI_TEST_RECIPIENT: peer,
    CRM_BASELINE_ENV: path.join(directory, 'never-loaded.env') };
  const health = { status: 'ok', authMode: 'crm-local', provider: 'disabled-preparation', providerConnected: false,
    sendReady: false, bridgeReady: false, sendEnabled: false, translationEnabled: false };
  const nativeHealth = { ok: true, environment: 'ISOLATED_TEST_COPY', serverName: 'Semih\\MELISADEV',
    originalDatabaseAccess: 0, liveDatabaseAccess: 0, sysadmin: 0, databaseControl: 0, externalOperations: false,
    automaticJobs: false, actualT1: false, database: profile.pilot.database, port: 62604, purpose: 'crm-order-draft-only',
    sourceCommit: commit, packageId: 'fixture-native', stockEffect: false, ledgerEffect: false, reservationEffect: false };
  const actor = { id: 'crm-test-admin', active: true, role: 'patron', permissions: ['crm.manage', 'crm.send'] };
  const conversation = { id: 55, phone: peer }, calls = [], servers = [], proxies = [], erpCalls = [], verifyCalls = [];
  let runtimeOptions, baselineMissing = false;
  const transport = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url: url.href, options });
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(options.redirect, 'error');
    const json = data => Response.json({ success: true, data });
    if (url.href === 'http://127.0.0.1:62601/health') {
      if (baselineMissing) throw Error('Unavailable fixture');
      assert.equal(options.headers.origin, 'http://127.0.0.1:62600'); return json(health);
    }
    if (url.href === 'http://127.0.0.1:62604/test-health') return json(nativeHealth);
    if (url.href === 'http://127.0.0.1:62601/auth/me') {
      assert.equal(options.headers.authorization, 'Bearer synthetic-old-session'); return json(actor);
    }
    if (url.href === 'http://127.0.0.1:62601/crm/conversations/55') {
      assert.equal(options.headers.authorization, 'Bearer synthetic-old-session'); return json(conversation);
    }
    if (url.href === 'http://127.0.0.1:62600/api/test-admin/session') {
      assert.equal(options.method, 'POST'); assert.equal(options.body, '{}');
      assert.equal(options.headers.origin, 'http://127.0.0.1:62600');
      return Response.json({ accessToken: 'synthetic-old-session', tokenType: 'Bearer', expiresIn: '8h' });
    }
    if (url.href === 'http://127.0.0.1:62601/crm/catalog/products/erp-101') {
      assert.equal(options.headers.authorization, 'Bearer synthetic-old-session');
      return Response.json({ success: true, data: { id: 'erp-101', erpProductId: 101, stockCode: 'FIXTURE-A',
        productName: 'Sentetik takım', revision: hash, status: 'active', hold: { blocked: false }, stockQuantity: 60,
        unit: { verified: true, factorExact8: '1.00000000' }, salePrices: [{ id: 201, tier: 1, isMainUnit: true,
          unitSourceId: 1, currency: 'TRY', sourceKey: 'FIXTURE-PRICE', priceExact: '100.00000000' }] },
      meta: { source: 'melisa-erp-catalog', catalogVersion: 'melisa-catalog.v1', environment: 'ISOLATED_TEST_COPY',
        sourceDatabaseVerified: true, stockFreshness: 'native-test', freshLive: false, cached: false, fetchedAt: new Date().toISOString() } });
    }
    assert.fail('No fixture authorizes another HTTP endpoint or provider call');
  };
  const dependencies = { sourceRoot, interfaces: { Tailscale: [{ family: 'IPv4', address, internal: false }] },
    verifyPackage: args => {
      verifyCalls.push(args); assert.deepEqual(args, { packageRoot: sourceRoot, manifestSha256: hash });
      return { environment: 'TEST', sourceCommit: commit };
    }, transport,
    createRuntime: options => {
      runtimeOptions = options;
      return actualRuntime ? createCustomerCatalogTestRuntime(options) : async () => Response.json({ success: true, data: {} });
    },
    erpAuthorization: async options => { erpCalls.push(options); return 'Bearer synthetic-erp-session'; },
    createServer: handler => { const server = new FixtureServer(handler); servers.push(server); return server; },
    proxyRequest: (options, callback) => {
      proxies.push(options);
      return new Writable({ write(chunk, encoding, done) { done(); }, final(done) {
        const response = Readable.from(['fixture upstream']); response.statusCode = 200; response.headers = { 'content-type': 'text/plain' };
        callback(response); done();
      } });
    },
  };
  const handles = [];
  const start = async () => { const handle = await startCustomerCatalogTestEdge({ environment, dependencies }); handles.push(handle); return handle; };
  t.after(async () => {
    for (const handle of handles) await handle.close();
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { environment, dependencies, health, nativeHealth, actor, conversation, profile, manifest, sourceRoot,
    profilePath, runtime, calls, servers, proxies, erpCalls, verifyCalls, start,
    runtimeOptions: () => runtimeOptions, setBaselineMissing: value => { baselineMissing = value; } };
}

test('import has no listener, fetch, credentials, signer or provider side effect', async () => {
  const originalServer = http.createServer, originalFetch = globalThis.fetch;
  let listeners = 0, requests = 0;
  try {
    http.createServer = () => { listeners++; throw Error('Unexpected listener'); };
    globalThis.fetch = () => { requests++; throw Error('Unexpected request'); };
    await import(pathToFileURL(path.resolve('deploy/customer-catalog-test-edge.mjs')).href + '?import-only');
    assert.equal(listeners, 0); assert.equal(requests, 0);
  } finally { http.createServer = originalServer; globalThis.fetch = originalFetch; }
});

test('sealed isolated startup opens one exact Tail listener and close only closes that listener', async t => {
  const f = fixture(t), edge = await f.start();
  assert.equal(edge.origin, origin); assert.equal(edge.sourceCommit, commit); assert.equal(f.verifyCalls.length, 1);
  assert.equal(f.servers.length, 1); assert.deepEqual(edge.server.listens, [{ port: 62600, host: address }]);
  assert.deepEqual(f.calls.map(call => call.url), ['http://127.0.0.1:62601/health', 'http://127.0.0.1:62604/test-health']);
  assert.equal(f.proxies.length, 0); assert.equal(f.erpCalls.length, 0);
  assert.equal(fs.existsSync(path.join(f.runtime, 'customer-catalog-sessions.json')), false);
  await edge.close(); await edge.close(); assert.equal(edge.server.closes, 1); assert.equal(edge.server.idleCloses, 1);
  await assert.rejects(issueCustomerCatalogOwnerLink(edge), { code: 'CUSTOMER_CATALOG_EDGE_NOT_RUNNING' });
});

test('every explicit configuration pin is required before any service or listener opens', async t => {
  const f = fixture(t);
  for (const key of Object.keys(f.environment).filter(key => key !== 'CRM_BASELINE_ENV')) {
    const value = f.environment[key]; delete f.environment[key];
    await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_CONFIGURATION_REQUIRED' }); f.environment[key] = value;
  }
  assert.equal(f.servers.length, 0); assert.equal(f.calls.length, 0);
});

test('altered package, unsealed execution root and canonical package cannot open a listener', async t => {
  const f = fixture(t);
  f.dependencies.verifyPackage = () => { throw Object.assign(Error('PACKAGE_PAYLOAD_MISMATCH'), { code: 'PACKAGE_PAYLOAD_MISMATCH' }); };
  await assert.rejects(f.start(), { code: 'PACKAGE_PAYLOAD_MISMATCH' });
  f.dependencies.verifyPackage = () => ({ environment: 'TEST' });
  f.environment.CRM_TEST_PACKAGE_ROOT = path.join(f.sourceRoot, 'foreign');
  await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_SEALED_PACKAGE_REQUIRED' });
  f.environment.CRM_TEST_PACKAGE_ROOT = f.sourceRoot;
  f.manifest.build.isolatedPreparation = false;
  fs.writeFileSync(path.join(f.sourceRoot, 'release-manifest.json'), JSON.stringify(f.manifest));
  await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_ISOLATED_PACKAGE_REQUIRED' });
  assert.equal(f.servers.length, 0); assert.equal(f.calls.length, 0);
});

test('LAN, loopback, other Tail, absent interface and unsafe peers are rejected before listen', async t => {
  const f = fixture(t);
  for (const candidate of ['127.0.0.1', '0.0.0.0', '192.168.1.46', '100.87.188.4']) {
    f.environment.CRM_TEST_TAILSCALE_ADDRESS = candidate;
    await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_ISOLATED_IDENTITY_REQUIRED' });
  }
  f.environment.CRM_TEST_TAILSCALE_ADDRESS = address;
  f.dependencies.interfaces = {};
  await assert.rejects(f.start(), /TEST_TAILSCALE_INTERFACE_REQUIRED/);
  f.dependencies.interfaces = { Tail: [{ family: 'IPv4', address, internal: false }] };
  for (const peers of [address, '127.0.0.1', phone + ',' + phone, phone + ',8.8.8.8']) {
    f.environment.CRM_TEST_TAILSCALE_PEERS = peers;
    await assert.rejects(f.start(), /TEST_TAILSCALE_IDENTITY_REQUIRED/);
  }
  assert.equal(f.servers.length, 0); assert.equal(f.calls.length, 0);
});

test('source-contained private files, wrong owner and unapproved profile fail before listen', async t => {
  const f = fixture(t);
  f.environment.CRM_ERP_CATALOG_ACCESS_PATH = path.join(f.sourceRoot, 'release-manifest.json');
  await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_PRIVATE_PATH_REQUIRED' });
  f.environment.CRM_ERP_CATALOG_ACCESS_PATH = path.join(f.runtime, 'erp-access.json');
  f.environment.WAAPI_TEST_RECIPIENT = '905550001122';
  await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_OWNER_PROFILE_REQUIRED' });
  f.environment.WAAPI_TEST_RECIPIENT = peer; f.profile.pilot.approved = false;
  fs.writeFileSync(f.profilePath, JSON.stringify(f.profile));
  await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_TEST_PROFILE_REQUIRED' });
  assert.equal(f.servers.length, 0); assert.equal(f.calls.length, 0);
});

test('unavailable or sending/bridge/AI/provider baseline prevents creating even the edge server', async t => {
  const f = fixture(t); f.setBaselineMissing(true);
  await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_BASELINE_UNAVAILABLE' }); f.setBaselineMissing(false);
  for (const key of ['sendReady', 'bridgeReady', 'sendEnabled', 'translationEnabled', 'providerConnected']) {
    f.health[key] = true;
    await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_BASELINE_UNSAFE' }); f.health[key] = false;
  }
  f.health.provider = 'waapi';
  await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_BASELINE_UNSAFE' });
  assert.equal(f.servers.length, 0); assert.equal(f.erpCalls.length, 0); assert.equal(f.proxies.length, 0);
  assert(f.calls.every(call => call.url === 'http://127.0.0.1:62601/health'));
});

test('native source, package, database and no-effect pins are checked before listen', async t => {
  const f = fixture(t);
  for (const [key, unsafe] of [['sourceCommit', 'c'.repeat(40)], ['packageId', 'different-package'], ['database', 'LIVE'],
    ['port', 62404], ['environment', 'CANONICAL_TEST'], ['stockEffect', true], ['ledgerEffect', true], ['reservationEffect', true]]) {
    const value = f.nativeHealth[key]; f.nativeHealth[key] = unsafe;
    await assert.rejects(f.start(), { code: 'CUSTOMER_CATALOG_EDGE_NATIVE_IDENTITY_MISMATCH' }); f.nativeHealth[key] = value;
  }
  assert.equal(f.servers.length, 0); assert.equal(f.proxies.length, 0);
});

test('approved peers and same-host Tail receive sealed UI; loopback, wrong host/origin and forwarded trust fail', async t => {
  const f = fixture(t), edge = await f.start();
  for (const remote of [phone, address]) {
    const response = await request(edge.server.handler, { remote });
    assert.equal(response.statusCode, 200); assert.equal(response.body, '<main>SEALED TEST catalog</main>');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
  }
  for (const input of [{ remote: '100.101.102.104' }, { local: '127.0.0.1', remote: '127.0.0.1', headers: { host: '127.0.0.1:62600' } },
    { headers: { host: 'outside.invalid' } }, { headers: { origin: 'https://outside.invalid' } },
    { headers: { forwarded: 'for=100.101.102.103' } }, { headers: { 'x-forwarded-for': phone } },
    { headers: { 'x-real-ip': phone } }, { headers: { 'x-forwarded-proto': 'http' } }]) {
    assert.equal((await request(edge.server.handler, input)).statusCode, 403);
  }
  assert.equal(f.proxies.length, 0); assert.equal(f.calls.length, 2);
});

test('TEST bootstrap remains denied for the phone and verified same-host Tail operator', async t => {
  const f = fixture(t), edge = await f.start();
  for (const remote of [phone, address]) for (const url of ['/api/test-admin/session', '/api/test-personnel/session']) {
    const response = await request(edge.server.handler, { remote, url, method: 'POST', headers: { origin }, body: '{}' });
    assert.equal(response.statusCode, 403); assert.equal(response.body, 'TEST_EDGE_BOOTSTRAP_DISABLED');
  }
  assert.equal(f.calls.length, 2); assert.equal(f.proxies.length, 0);
});

test('validated staff proxy uses existing loopback UI origin and immutable gateway/orders ports', async t => {
  const f = fixture(t), edge = await f.start();
  for (const [url, port, method] of [['/api/live/auth/me', 62601, 'GET'], ['/api/live/crm/erp/v2/customers', 62603, 'GET'],
    ['/api/live/auth/login', 62601, 'POST']]) {
    const response = await request(edge.server.handler, { url, method, headers: { origin, authorization: 'Bearer synthetic-old-session', referer: origin + '/staff' }, body: method === 'POST' ? '{}' : '' });
    assert.equal(response.statusCode, 200); assert.equal(response.body, 'fixture upstream');
    const proxy = f.proxies.at(-1); assert.equal(proxy.hostname, '127.0.0.1'); assert.equal(proxy.port, port);
    assert.equal(proxy.headers.origin, 'http://127.0.0.1:62600'); assert.equal(proxy.headers.host, '127.0.0.1:' + port);
    assert.equal(proxy.headers.authorization, 'Bearer synthetic-old-session'); assert.equal(proxy.headers.referer, undefined);
    assert.equal(proxy.path, url.slice('/api/live'.length));
  }
  const before = f.proxies.length;
  assert.equal((await request(edge.server.handler, { url: '/api/live/auth/login', method: 'POST', body: '{}' })).statusCode, 403);
  assert.equal((await request(edge.server.handler, { url: '/api/live/auth/login', method: 'POST', headers: { origin: 'http://127.0.0.1:62600' }, body: '{}' })).statusCode, 403);
  f.health.sendEnabled = true;
  assert.equal((await request(edge.server.handler, { url: '/api/live/auth/me' })).statusCode, 503);
  assert.equal(f.proxies.length, before);
});

test('ERP seller access is requested only explicitly with the existing private path and TEST endpoints', async t => {
  const f = fixture(t), edge = await f.start();
  assert.equal(f.erpCalls.length, 0);
  assert.equal(await f.runtimeOptions().getErpAuthorization(), 'Bearer synthetic-erp-session');
  const options = f.erpCalls[0]; assert.equal(options.accountName, 'seller');
  assert.deepEqual(options.environment, { CRM_ERP_CATALOG_ACCESS_PATH: f.environment.CRM_ERP_CATALOG_ACCESS_PATH });
  assert.equal(options.testEndpoints.erpOrigin, 'http://127.0.0.1:4174');
  assert.equal(options.testEndpoints.orders, 62603); assert.equal(options.testEndpoints.native, 62604);
  await edge.close();
});

test('explicit owner issue reuses old HTTP JWT verification and returns only an in-memory private link', async t => {
  const f = fixture(t), edge = await f.start();
  const issued = await issueCustomerCatalogOwnerLink(edge);
  assert.equal(issued.testOnly, true); assert.equal(issued.linkOrigin, origin);
  assert.match(issued.link, /^http:\/\/100\.87\.188\.3:62600\/katalog#[A-Za-z0-9_-]{43}$/);
  assert.equal(f.calls.filter(call => call.url.endsWith('/api/test-admin/session')).length, 1);
  assert(f.calls.some(call => call.url.endsWith('/auth/me')));
  assert(f.calls.some(call => call.url.endsWith('/crm/conversations/55')));
  assert.equal(f.proxies.length, 0); assert.equal(f.erpCalls.length, 0);
  const capability = issued.url.split('#')[1], journal = fs.readFileSync(path.join(f.runtime, 'customer-catalog-sessions.json'), 'utf8');
  assert(!journal.includes(capability)); assert(!journal.includes('synthetic-old-session')); assert(!journal.includes(issued.link));
  assert.deepEqual(fs.readdirSync(f.runtime).sort(), ['customer-catalog-sessions.json', 'erp-access.json', 'profile.json']);
  const session = await request(edge.server.handler, { url: '/api/customer-catalog/session', headers: { authorization: 'Bearer ' + capability } });
  assert.equal(session.statusCode, 200); assert.equal(JSON.parse(session.body).data.products[0].unitPriceExact, '100.00000000');
  assert.equal(f.servers.length, 1); assert.deepEqual(edge.server.listens, [{ port: 62600, host: address }]);
});

test('current role/owner/conversation/native changes reject issuance or further customer reads', async t => {
  const f = fixture(t), edge = await f.start();
  f.actor.role = 'personel';
  await assert.rejects(issueCustomerCatalogOwnerLink(edge), { code: 'CUSTOMER_CATALOG_EDGE_ISSUE_FAILED' });
  assert.equal(fs.existsSync(path.join(f.runtime, 'customer-catalog-sessions.json')), false);
  f.actor.role = 'patron'; f.conversation.phone = '905550001122';
  await assert.rejects(issueCustomerCatalogOwnerLink(edge), { code: 'CUSTOMER_CATALOG_EDGE_ISSUE_FAILED' });
  f.conversation.phone = peer;
  const issued = await issueCustomerCatalogOwnerLink(edge), capability = issued.url.split('#')[1];
  f.nativeHealth.packageId = 'changed-after-listen';
  const response = await request(edge.server.handler, { url: '/api/customer-catalog/session', headers: { authorization: 'Bearer ' + capability } });
  assert.equal(response.statusCode, 503); assert.equal(JSON.parse(response.body).error.code, 'CUSTOMER_CATALOG_TEST_IDENTITY_MISMATCH');
  assert.equal(f.proxies.length, 0); assert.equal(f.erpCalls.length, 0);
});

test('configuration resolver keeps explicit external peers and only the verified local Tail exception', t => {
  const f = fixture(t), config = resolveCustomerCatalogEdgeConfiguration(f.environment, f.dependencies);
  assert.deepEqual([...config.tailscaleNetwork.peers].sort(), [address, phone].sort());
  assert.equal(config.endpoints.isolated, true); assert.equal(config.linkOrigin, origin);
  assert.equal(config.endpoints.ui, 62600); assert.equal(config.endpoints.gateway, 62601);
  assert.equal(config.endpoints.catalog, 62602); assert.equal(config.endpoints.orders, 62603); assert.equal(config.endpoints.native, 62604);
});
