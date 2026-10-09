import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTestEndpoints } from '../deploy/test-endpoints.mjs';
import { resolveTestTailscaleNetwork, testUiRequestAllowed, testAdminBootstrapAllowed, configureTestServerEnvironment } from '../deploy/test-server.mjs';
const endpoints = resolveTestEndpoints({ CRM_TEST_PORT_BASE: '62600', CRM_ISOLATED_PREPARATION: 'true',
  CRM_TEST_ERP_ORIGIN: 'http://127.0.0.1:4174', CRM_TEST_EXPECTED_DATABASE: 'MELISA_ERP_CRM_SHARED_TEST_20261009_01' });
const interfaces = { Tailscale: [{ address: '100.87.188.3', family: 'IPv4', internal: false }] };
const request = (remote = '100.90.192.55', method = 'GET') => ({ method, url: '/', socket: {
  localAddress: '100.87.188.3', remoteAddress: remote }, headers: { host: '100.87.188.3:62600', origin: 'http://100.87.188.3:62600' } });

test('Tailscale UI opt-in accepts only named peers on an existing isolated TEST interface', () => {
  assert.equal(resolveTestTailscaleNetwork(), null);
  const network = resolveTestTailscaleNetwork('100.87.188.3', '100.90.192.55', interfaces, endpoints);
  assert.equal(testUiRequestAllowed(request(), null, endpoints, network), true);
  assert.equal(testUiRequestAllowed(request('100.90.192.56'), null, endpoints, network), false);
  assert.equal(testUiRequestAllowed({ ...request(), headers: { ...request().headers, 'x-forwarded-for': '127.0.0.1' } }, null, endpoints, network), false);
  assert.equal(testUiRequestAllowed({ ...request(undefined, 'POST'), headers: { ...request().headers, origin: 'http://other.invalid' } }, null, endpoints, network), false);
  assert.equal(testAdminBootstrapAllowed({ ...request(undefined, 'POST'), url: '/api/test-admin/session' }, endpoints), false);
});
test('broad CIDRs, ordinary LAN addresses, self peers and non-local interfaces cannot open Tailscale UI', () => {
  for (const address of ['100.63.1.1', '100.128.1.1', '192.168.1.46', '100.87.188.3/10']) {
    assert.throws(() => resolveTestTailscaleNetwork(address, '100.90.192.55', interfaces, endpoints));
  }
  assert.throws(() => resolveTestTailscaleNetwork('100.87.188.3', '100.87.188.3', interfaces, endpoints));
  assert.throws(() => resolveTestTailscaleNetwork('100.87.188.3', '100.90.192.55', {}, endpoints));
  assert.throws(() => resolveTestTailscaleNetwork('100.87.188.3', '100.90.192.55', interfaces, resolveTestEndpoints({})));
});
test('baseline cannot silently enable Tailscale listener or customer catalog profile', () => {
  const env = { CRM_BASELINE_ENV: 'synthetic', CRM_TEST_PORT_BASE: '62600', CRM_ISOLATED_PREPARATION: 'true',
    CRM_TEST_ERP_ORIGIN: 'http://127.0.0.1:4174', CRM_TEST_EXPECTED_DATABASE: 'MELISA_ERP_CRM_SHARED_TEST_20261009_01' };
  configureTestServerEnvironment(process.cwd(), { env, loadBaseline: () => {
    Object.assign(env, { CRM_TEST_TAILSCALE_ADDRESS: '100.87.188.3', CRM_TEST_TAILSCALE_PEERS: '100.90.192.55',
      CRM_CUSTOMER_CATALOG_PROFILE_PATH: 'C:/private/unapproved.json' }); return {};
  } });
  assert.equal(env.CRM_TEST_TAILSCALE_ADDRESS, ''); assert.equal(env.CRM_TEST_TAILSCALE_PEERS, '');
  assert.equal(env.CRM_CUSTOMER_CATALOG_PROFILE_PATH, ''); assert.equal(env.WHATSAPP_SEND_ENABLED, 'false');
});
