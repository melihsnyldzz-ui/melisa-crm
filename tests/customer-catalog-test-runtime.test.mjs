import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCustomerCatalogTestRuntime, readCustomerCatalogTestProfile, customerCatalogLinkOrigin } from '../deploy/customer-catalog-test-runtime.mjs';
import { createCustomerCatalogHandler } from '../apps/gateway/src/services/customerCatalogHandler.mjs';

test('missing reviewed profile leaves customer catalog disabled', async () => {
  const handler = createCustomerCatalogTestRuntime();
  const response = await handler(new Request('http://test.invalid/customer-catalog/session', { headers: { authorization: 'Bearer ' + 'a'.repeat(43) } }));
  assert.equal(response.status, 503); assert.equal((await response.json()).error.code, 'CUSTOMER_CATALOG_PILOT_DISABLED');
});
test('profile stays outside source, in existing runtime and requires isolated approval', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-profile-test-'));
  try {
    const file = path.join(directory, 'profile.json'); fs.writeFileSync(file, '{}');
    assert.equal(readCustomerCatalogTestProfile('', process.cwd(), directory), null);
    assert.throws(() => readCustomerCatalogTestProfile(file, process.cwd(), directory), { code: 'CUSTOMER_CATALOG_TEST_PROFILE_REQUIRED' });
    assert.throws(() => readCustomerCatalogTestProfile(file, directory, directory), { code: 'CUSTOMER_CATALOG_PRIVATE_PROFILE_REQUIRED' });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('loopback operator receives the bound phone origin, preferring Tailscale over LAN', async () => {
  const endpoints = { isolated: true, ui: 62600 };
  const lanNetwork = { origin: 'http://192.168.1.46:62600' };
  const tailscaleNetwork = { origin: 'http://100.87.188.3:62600' };
  const linkOrigin = customerCatalogLinkOrigin({ endpoints, lanNetwork, tailscaleNetwork });
  const handler = createCustomerCatalogHandler({ linkOrigin, authorizeStaff: () => ({ id: 'owner' }),
    service: { issue: () => ({ url: '/katalog#' + 'a'.repeat(43), testOnly: true }) } });
  const response = await handler(new Request('http://127.0.0.1:62600/crm/customer-catalog/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:62600' }, body: '{}' }));
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.linkOrigin, tailscaleNetwork.origin);
  assert.equal(new URL(data.url, data.linkOrigin).hostname, '100.87.188.3');
  assert.equal(customerCatalogLinkOrigin({ endpoints, lanNetwork }), lanNetwork.origin);
  for (const origin of ['http://127.0.0.1:62600', 'https://outside.invalid', 'http://100.87.188.3:62600/path']) {
    assert.throws(() => customerCatalogLinkOrigin({ endpoints, tailscaleNetwork: { origin } }), { code: 'CUSTOMER_CATALOG_PHONE_ORIGIN_REQUIRED' });
  }
  assert.throws(() => customerCatalogLinkOrigin({ endpoints }), { code: 'CUSTOMER_CATALOG_PHONE_ORIGIN_REQUIRED' });
});
