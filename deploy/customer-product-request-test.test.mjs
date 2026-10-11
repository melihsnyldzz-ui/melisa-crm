import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { once } from 'node:events';
import { validateProofConfig, proofEnvironment, proofRequestAllowed, createProofUiHandler,
  verifyProofErp, REQUEST_PROOF_DATABASE, REQUEST_PROOF_ORIGIN } from './customer-product-request-test.mjs';

const privateRoot = path.join(os.tmpdir(), 'crm-proof-config-private');
const sourceRoot = path.join(os.tmpdir(), 'crm-proof-config-package');
const config = () => ({ version: 1, sourceCommit: 'a'.repeat(40), packageRoot: sourceRoot,
  packageManifestSha256: 'b'.repeat(64), runtimeDirectory: path.join(privateRoot, 'CUSTOMER-PRODUCT-REQUEST-PROOF-20261012'),
  baselineEnvPath: path.join(privateRoot, 'pinned', 'normal-users.env'), baselineEnvSha256: 'c'.repeat(64),
  catalogAccessPath: path.join(privateRoot, 'pinned', 'catalog-access.json'), catalogAccessSha256: 'd'.repeat(64),
  readerPasswordPath: path.join(privateRoot, 'pinned', 'password.dpapi'), readerPasswordSha256: 'e'.repeat(64),
  dpapiExecutablePath: path.join(os.tmpdir(), 'powershell-runtime', 'pwsh.exe'), dpapiExecutableSha256: 'f'.repeat(64),
  semihAgentId: 2, erpSourceCommit: '1'.repeat(40), erpPackageId: 'CANONICAL-TEST-source',
  erpCopyId: 'e16b70f0-4057-428b-9abc-6bbcaf35fe82' });
const validate = input => validateProofConfig(input, { sourceRoot, privateRoot });

test('proof configuration is explicit, pinned and a separate direct child realm', () => {
  const c = config(), valid = validate(c);
  assert.equal(valid.packageRoot, sourceRoot);
  assert.equal(valid.runtimeDirectory, c.runtimeDirectory);
  for (const mutation of [
    { version: 2 }, { unexpectedEnvironmentOverride: 'true' }, { sourceCommit: 'main' },
    { sourceCommit: 'A'.repeat(40) }, { packageManifestSha256: '' }, { semihAgentId: 0 },
    { semihAgentId: '2' }, { erpSourceCommit: '' }, { erpCopyId: 'guessed' },
    { erpPackageId: '../LIVE' }, { baselineEnvSha256: 'missing' }, { readerPasswordSha256: '' },
    { packageRoot: path.join(sourceRoot, 'other-package') },
    { runtimeDirectory: path.join(privateRoot, 'ERP-FINAL04-20261010') },
    { runtimeDirectory: path.join(privateRoot, 'SEMIH-TEST-20261012') },
    { runtimeDirectory: path.join(privateRoot, 'CUSTOMER-CATALOG-TEST-20261010') },
    { runtimeDirectory: path.join(privateRoot, 'nested', 'CUSTOMER-PRODUCT-REQUEST-PROOF-20261012') },
    { runtimeDirectory: path.join(sourceRoot, 'CUSTOMER-PRODUCT-REQUEST-PROOF-20261012') },
    { baselineEnvPath: path.join(sourceRoot, 'baseline.env') },
    { readerPasswordPath: path.join(c.runtimeDirectory, 'password.dpapi') },
    { catalogAccessPath: c.baselineEnvPath }, { dpapiExecutablePath: path.join(os.tmpdir(), 'powershell.exe') },
  ]) assert.throws(() => validate({ ...c, ...mutation }), { code: 'CUSTOMER_REQUEST_PROOF_CONFIG_REJECTED' });
});

test('inherited baseline cannot open providers, paid AI, databases or shared journals', () => {
  const c = config(), baseline = { WHATSAPP_CRM_AUTH_USERS_JSON: '[protected-existing-users]',
    WHATSAPP_CRM_AUTH_JWT_SECRET: 'protected-existing-secret', WHATSAPP_SEND_ENABLED: 'true',
    CRM_PAID_AI_ENABLED: 'true', CRM_NORMAL_REFRESH_JOURNAL_PATH: 'shared-personel-journal',
    CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH: 'shared-semih-journal', WHATSAPP_CRM_POSTGRES_URL: 'shared-pg',
    OPENAI_API_KEY: 'private-key', WAAPI_API_TOKEN: 'private-token', WHATSAPP_CRM_REDIS_URL: 'shared-redis' };
  const result = proofEnvironment(c, baseline);
  assert.equal(baseline.WHATSAPP_SEND_ENABLED, 'true');
  assert.equal(result.WHATSAPP_CRM_AUTH_USERS_JSON, baseline.WHATSAPP_CRM_AUTH_USERS_JSON);
  assert.equal(result.WHATSAPP_CRM_AUTH_JWT_SECRET, baseline.WHATSAPP_CRM_AUTH_JWT_SECRET);
  for (const key of ['WHATSAPP_SEND_ENABLED', 'WHATSAPP_LIVE_SEND_APPROVED', 'WHATSAPP_AUTO_REPLY_ENABLED',
    'WAAPI_CHATWOOT_BRIDGE_ENABLED', 'WAAPI_INCOMING_READER_ENABLED', 'WAAPI_OUTBOUND_MEDIA_ENABLED',
    'CRM_PAID_AI_ENABLED', 'CRM_TEST_AUTOSTART_CONFIGURED']) assert.equal(result[key], 'false');
  for (const key of ['OPENAI_API_KEY', 'WAAPI_API_TOKEN', 'WHATSAPP_CRM_POSTGRES_URL', 'WHATSAPP_CRM_REDIS_URL',
    'CRM_TEST_LAN_ADDRESS', 'CRM_TEST_TAILSCALE_ADDRESS', 'CRM_TEST_TAILSCALE_PEERS']) assert.equal(result[key], '');
  assert.equal(result.CRM_UI_ORIGIN, REQUEST_PROOF_ORIGIN);
  assert.equal(result.CRM_TEST_EXPECTED_DATABASE, REQUEST_PROOF_DATABASE);
  assert.equal(result.CRM_TEST_PORT_BASE, '62700');
  assert.equal(result.WHATSAPP_CRM_PORT, '62801');
  assert.equal(result.CRM_ERP_CATALOG_ORIGIN, 'http://127.0.0.1:62802');
  const state = ['CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE', 'CRM_NORMAL_REFRESH_JOURNAL_PATH', 'CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH'];
  assert.equal(new Set(state.map(key => result[key])).size, 3);
  for (const key of state) assert.equal(path.dirname(result[key]), c.runtimeDirectory);
});

function request({ url = '/', method = 'GET', port = 62800, headers = {}, localAddress = '127.0.0.1', remoteAddress = '127.0.0.1' } = {}) {
  const req = Readable.from([]);
  Object.assign(req, { url, method, headers: { host: `127.0.0.1:${port}`, ...headers }, socket: { localAddress, remoteAddress } });
  return req;
}

test('loopback socket, exact Host/Origin and non-forwarded same-origin metadata are mandatory', () => {
  assert.equal(proofRequestAllowed(request()), true);
  assert.equal(proofRequestAllowed(request({ port: 62801 }), 62801), true);
  assert.equal(proofRequestAllowed(request({ headers: { origin: REQUEST_PROOF_ORIGIN, 'sec-fetch-site': 'same-origin' } })), true);
  for (const input of [ { remoteAddress: '192.168.1.51' }, { localAddress: '0.0.0.0' },
    { headers: { host: 'localhost:62800' } }, { headers: { origin: 'http://127.0.0.1:62700' } },
    { headers: { origin: 'http://127.0.0.1:62801' } }, { headers: { 'sec-fetch-site': 'same-site' } },
    { headers: { forwarded: 'for=127.0.0.1' } }, { headers: { 'x-forwarded-host': '127.0.0.1:62800' } },
    { headers: { 'x-forwarded-for': '127.0.0.1' } }, { headers: { 'x-forwarded-proto': 'http' } },
    { headers: { 'x-real-ip': '127.0.0.1' } },
  ]) assert.equal(proofRequestAllowed(request(input)), false);
});

class ResponseCapture extends Writable {
  constructor() { super(); this.statusCode = 200; this.headers = {}; this.chunks = []; }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers = {}) { this.statusCode = status; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); this.headersSent = true; }
  _write(chunk, encoding, done) { this.chunks.push(Buffer.from(chunk)); done(); }
  get body() { return Buffer.concat(this.chunks).toString(); }
}
async function callUi(handler, input) {
  const res = new ResponseCapture(), completed = once(res, 'finish');
  handler(request(input), res); await completed; return res;
}

test('normal UI gets only availability metadata; no anonymous bootstrap or native/order proxy', async () => {
  let calls = 0;
  const handler = createProofUiHandler({ assets: sourceRoot, sourceCommit: 'a'.repeat(40), proxyRequest: () => { calls++; throw Error('Unexpected proxy'); } });
  const enabled = await callUi(handler, { url: '/api/customer-product-request-state' });
  assert.deepEqual(JSON.parse(enabled.body), { success: true, data: { enabled: true } });
  const health = JSON.parse((await callUi(handler, { url: '/test-health' })).body);
  assert.equal(health.customerProductRequests, true); assert.equal(health.nativeOrders, false);
  assert.equal(health.whatsappSend, false); assert.equal(health.paidAi, false);
  assert.equal(JSON.stringify(health).includes(privateRoot), false);
  for (const url of ['/api/test-admin/session', '/api/test-personnel/session', '/api/native/orders', '/api/live/crm/erp/orders']) {
    assert.equal((await callUi(handler, { url, method: 'POST' })).statusCode, 403);
  }
  assert.equal((await callUi(handler, { url: '/api/unknown' })).statusCode, 404);
  assert.equal((await callUi(handler, { url: '/api/catalog/products', method: 'POST' })).statusCode, 405);
  assert.equal(calls, 0);
});

test('UI proxy keeps exact proof ports, path and normal cookie/auth transport', async () => {
  const calls = [];
  const proxyRequest = (options, callback) => {
    calls.push(options);
    const upstream = new Writable({ write(chunk, encoding, done) { done(); } });
    upstream.once('finish', () => { const response = Readable.from(['{"success":true}']); response.statusCode = 200;
      response.headers = { 'content-type': 'application/json' }; callback(response); });
    return upstream;
  };
  const handler = createProofUiHandler({ assets: sourceRoot, sourceCommit: 'a'.repeat(40), proxyRequest });
  await callUi(handler, { url: '/api/live/auth/remembered', headers: { cookie: 'proof-cookie=value' } });
  await callUi(handler, { url: '/api/catalog/products?hasImage=true&page=2', headers: { authorization: 'Bearer normal-token' } });
  assert.equal(calls[0].port, 62801); assert.equal(calls[0].path, '/auth/remembered');
  assert.equal(calls[0].headers.host, '127.0.0.1:62801'); assert.equal(calls[0].headers.cookie, 'proof-cookie=value');
  assert.equal(calls[1].port, 62802); assert.equal(calls[1].path, '/api/crm-catalog/products?hasImage=true&page=2');
  assert.equal(calls[1].headers.authorization, 'Bearer normal-token');
});

test('SPA serves customer route, preserves missing-asset errors and rejects encoded traversal', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-proof-static-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  fs.mkdirSync(path.join(folder, 'assets')); fs.writeFileSync(path.join(folder, 'index.html'), '<html>real built app</html>');
  fs.writeFileSync(path.join(folder, 'assets', 'app.js'), 'export const built=true;');
  const handler = createProofUiHandler({ assets: folder, sourceCommit: 'a'.repeat(40) });
  assert.equal((await callUi(handler, { url: '/katalog' })).body, '<html>real built app</html>');
  assert.equal((await callUi(handler, { url: '/assets/app.js' })).body, 'export const built=true;');
  assert.equal((await callUi(handler, { url: '/assets/missing.js' })).statusCode, 404);
  assert.equal((await callUi(handler, { url: '/%2e%2e%5cprivate.env' })).statusCode, 400);
  assert.equal((await callUi(handler, { url: '/%00private.env' })).statusCode, 400);
});

const safeErp = c => ({ ok: true, environment: 'ISOLATED_TEST_COPY', serverName: 'Semih\\MELISADEV',
  originalDatabaseAccess: 0, liveDatabaseAccess: 0, sysadmin: 0, databaseControl: 0,
  externalOperations: false, automaticJobs: false, actualT1: false, writes: true,
  databaseName: REQUEST_PROOF_DATABASE, port: 4184, mode: 'erp', sourceCommit: c.erpSourceCommit,
  packageId: c.erpPackageId, copyId: c.erpCopyId });
test('ERP copy, package, source and all existing isolation guards are fresh and exact', async () => {
  const c = config(), calls = [];
  const fetchImpl = async (url, options) => { calls.push([url, options]); return Response.json(safeErp(c)); };
  assert.deepEqual(await verifyProofErp(c, { fetchImpl }), { sourceCommit: c.erpSourceCommit, packageId: c.erpPackageId, copyId: c.erpCopyId });
  assert.equal(calls[0][0], 'http://127.0.0.1:4184/test-health'); assert.equal(calls[0][1].redirect, 'error');
  for (const mutation of [ { environment: 'LIVE' }, { databaseName: 'other-TEST-copy' }, { port: 4174 },
    { sourceCommit: 'old-source' }, { packageId: 'old-package' }, { copyId: 'other-copy' },
    { originalDatabaseAccess: 1 }, { liveDatabaseAccess: 1 }, { sysadmin: 1 }, { databaseControl: 1 },
    { actualT1: true }, { externalOperations: true }, { automaticJobs: true }, { mode: 'terminal' },
  ]) await assert.rejects(verifyProofErp(c, { fetchImpl: async () => Response.json({ ...safeErp(c), ...mutation }) }),
    { code: 'CUSTOMER_REQUEST_PROOF_ERP_IDENTITY_REJECTED' });
});
