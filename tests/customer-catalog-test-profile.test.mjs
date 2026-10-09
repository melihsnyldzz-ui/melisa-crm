import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareCustomerCatalogTestProfile, writeCustomerCatalogTestProfile } from '../deploy/customer-catalog-test-profile.mjs';

const hash = 'a'.repeat(64), commit = 'b'.repeat(40), peer = '905387217733';
function fixture() {
  const environment = { CRM_TEST_PORT_BASE: '62600', CRM_ISOLATED_PREPARATION: 'true', CRM_TEST_ERP_ORIGIN: 'http://127.0.0.1:4174',
    CRM_TEST_EXPECTED_DATABASE: 'MELISA_ERP_CRM_SHARED_TEST_20261009_01', WAAPI_TEST_RECIPIENT: peer };
  const source = { runId: 'PRODUCT-11111111-1111-4111-8111-111111111111', sourceAsOf: '2026-10-08', sourceHash: hash,
    planHash: hash, bindingsHash: hash, snapshotHash: hash, actualT1: false, counts: { products: 2, prices: 2 } };
  const options = { environment, productIds: [101, 102], customerId: 44, expectedPeer: peer, nativeSourceCommit: commit, nativePackageId: 'TEST-fixture' };
  const requests = [], state = { stock: 60, exact: true, priceCount: 1, blocked: false, sourceCommit: commit };
  const json = data => Response.json({ success: true, data });
  options.authorizeErp = async input => { assert.equal(input.accountName, 'seller'); assert.equal(input.environment, environment); return 'Bearer synthetic-erp-secret'; };
  options.transport = async (input, settings = {}) => {
    const url = new URL(input); requests.push([url.pathname, settings.method || 'GET']);
    if (url.pathname === '/api/test-admin/session') { assert.equal(settings.headers.origin, 'http://127.0.0.1:62600'); return json({ accessToken: 'synthetic-crm-secret' }); }
    if (url.pathname === '/auth/me') return json({ id: 'owner', role: 'patron', permissions: ['crm.manage', 'crm.send'] });
    if (url.pathname === '/crm/conversations/55') return json({ conversation: { id: 55, phone: peer } });
    if (url.pathname === '/api/auth/me') return json({ user: { id: 7, permissions: ['sales.create'] } });
    if (url.pathname === '/test-health') return json({ ok: true, environment: 'ISOLATED_TEST_COPY', serverName: 'Semih\\MELISADEV',
      originalDatabaseAccess: 0, liveDatabaseAccess: 0, sysadmin: 0, databaseControl: 0, externalOperations: false, automaticJobs: false,
      actualT1: false, database: environment.CRM_TEST_EXPECTED_DATABASE, port: 62604, purpose: 'crm-order-draft-only',
      sourceCommit: state.sourceCommit, packageId: 'TEST-fixture', stockEffect: false, ledgerEffect: false, reservationEffect: false });
    if (url.pathname.startsWith('/crm/catalog/products/erp-')) {
      const id = Number(url.pathname.split('erp-')[1]); assert(options.productIds.includes(id));
      return Response.json({ success: true, meta: { source: 'melisa-erp-catalog', catalogVersion: 'melisa-catalog.v1', environment: 'ISOLATED_TEST_COPY',
        sourceDatabaseVerified: true, stockFreshness: 'native-test', freshLive: false, cached: false, fetchedAt: new Date().toISOString() },
        data: { id: 'erp-' + id, erpProductId: id, stockCode: 'TEST-' + id, status: 'active', hold: { blocked: false }, revision: hash,
          unit: { verified: true, factorExact8: '1.00000000' }, stockQuantity: state.stock,
          photoStatus: 'guarded-path', photo: { validationStatus: 'CONFIRMED' }, photoPath: url.pathname + '/photo',
          salePrices: Array.from({ length: state.priceCount }, (_, index) => ({ id: id + index, unitSourceId: 1, tier: 1, isMainUnit: true,
            currency: 'TRY', priceExact: '109.25000000', sourceKey: 'TEST-PRICE' })) } });
    }
    if (url.pathname === '/crm/erp/v2/customers') { assert.equal(settings.headers['x-erp-token'], 'synthetic-erp-secret');
      return json({ status: state.exact ? 'matched' : 'missing', currentSource: source,
        entries: [{ id: 44, code: 'TEST-C', blocked: state.blocked, currency: 'TRY', revision: hash, exactPhoneMatch: state.exact }] }); }
    throw Error('Unexpected route');
  };
  return { options, requests, state };
}

test('profile prepares only selected reads, preserves actual price ids and writes privately without credentials or overwrite', async t => {
  const f = fixture(), profile = await prepareCustomerCatalogTestProfile(f.options);
  assert.equal(profile.customerMatch.basis, 'exact-phone'); assert.equal(profile.customerMatch.reason, null);
  assert.deepEqual(profile.pilot.products.map(row => row.series.totalPieces), [6, 4]);
  assert(profile.pilot.products.every(row => row.series.isTestExample && row.series.stockCompositionVerified === false));
  assert.equal(profile.prices[0].priceId, 101); assert(!JSON.stringify(profile).includes('synthetic-crm-secret')); assert(!JSON.stringify(profile).includes('synthetic-erp-secret'));
  assert.deepEqual(f.requests.filter(([, method]) => method === 'POST'), [['/api/test-admin/session', 'POST']]);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'catalog-profile-helper-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const repoRoot = path.join(directory, 'repo'), runtimeDirectory = path.join(directory, 'runtime'); await mkdir(repoRoot); await mkdir(runtimeDirectory);
  const profilePath = path.join(runtimeDirectory, 'pilot.json'); await writeCustomerCatalogTestProfile({ profile, profilePath, repoRoot, runtimeDirectory });
  assert.deepEqual(JSON.parse(await readFile(profilePath, 'utf8')), profile);
  await assert.rejects(writeCustomerCatalogTestProfile({ profile, profilePath, repoRoot, runtimeDirectory }));
  await assert.rejects(writeCustomerCatalogTestProfile({ profile, profilePath: path.join(repoRoot, 'bad.json'), repoRoot, runtimeDirectory: repoRoot }));
});

test('unsafe input, identity, ambiguous prices and insufficient stock fail closed without a draft POST', async () => {
  for (const input of [{ productIds: [101, 101] }, { customerId: 0 }, { expectedPeer: '905550007733' }, { nativeSourceCommit: '' }, { environment: {} }]) {
    const f = fixture(); await assert.rejects(prepareCustomerCatalogTestProfile({ ...f.options, ...input }), { code: 'CUSTOMER_CATALOG_PROFILE_REJECTED' }); assert.equal(f.requests.length, 0);
  }
  for (const change of [{ stock: 3 }, { priceCount: 2 }, { sourceCommit: 'c'.repeat(40) }, { blocked: true }]) {
    const f = fixture(); Object.assign(f.state, change); await assert.rejects(prepareCustomerCatalogTestProfile(f.options), { code: 'CUSTOMER_CATALOG_PROFILE_REJECTED' });
    assert(!f.requests.some(([pathname]) => pathname.includes('drafts')));
  }
});

test('nonmatched selected customer needs explicit TEST reason and authentication errors are sanitized', async () => {
  const f = fixture(); f.state.exact = false;
  await assert.rejects(prepareCustomerCatalogTestProfile(f.options), { code: 'CUSTOMER_CATALOG_PROFILE_REJECTED' });
  const profile = await prepareCustomerCatalogTestProfile({ ...f.options, operatorReason: 'Operator selected synthetic TEST customer' });
  assert.equal(profile.customerMatch.basis, 'operator-confirmed'); assert.equal(profile.customerMatch.reason, 'Operator selected synthetic TEST customer');
  await assert.rejects(prepareCustomerCatalogTestProfile({ ...f.options, authorizeErp: async () => { throw Error('synthetic-private-password'); } }),
    error => error.message === 'CUSTOMER_CATALOG_PROFILE_REJECTED');
});
