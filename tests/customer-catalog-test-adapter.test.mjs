import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerCatalogTestAdapter } from '../deploy/customer-catalog-test-adapter.mjs';
import { resolveTestEndpoints } from '../deploy/test-endpoints.mjs';

const hash = 'a'.repeat(64), commit = 'b'.repeat(40);
const source = { runId: 'PRODUCT-11111111-1111-4111-8111-111111111111', sourceAsOf: '2026-10-08', sourceHash: hash,
  planHash: hash, bindingsHash: hash, snapshotHash: hash, actualT1: false, counts: { products: 2, prices: 2 } };
const endpoints = resolveTestEndpoints({ CRM_TEST_PORT_BASE: '62600', CRM_ISOLATED_PREPARATION: 'true',
  CRM_TEST_ERP_ORIGIN: 'http://127.0.0.1:4174', CRM_TEST_EXPECTED_DATABASE: 'MELISA_ERP_CRM_SHARED_TEST_20261009_01' });
function fixture() {
  const profile = { nativeSourceCommit: commit, nativePackageId: 'TEST-fixture', erpActorId: '7', peer: '905550007733',
    customerCode: 'TEST-C', customerMatch: { basis: 'operator-confirmed', phone: '905550007733', revision: hash, reason: 'Sentetik TEST müşteri eşlemesi' },
    expectedSource: source, prices: [101, 102].map((id, index) => ({ productId: 'erp-' + id, priceId: id + 100,
      unitSourceId: 1, currency: 'TRY', priceSourceKey: 'TEST-P-' + id })) };
  const scope = { actorId: 'owner', customerId: 44, conversationId: '55' }, writes = [];
  let receipt, stockEffect = false, postFailure = false;
  const json = data => Response.json({ success: true, data });
  const transport = async (input, options = {}) => {
    const url = new URL(input), pathname = url.pathname;
    if (pathname === '/test-health') return json({ ok: true, environment: 'ISOLATED_TEST_COPY', serverName: 'Semih\\MELISADEV',
      originalDatabaseAccess: 0, liveDatabaseAccess: 0, sysadmin: 0, databaseControl: 0, externalOperations: false, automaticJobs: false,
      actualT1: false, database: endpoints.database, port: endpoints.native, purpose: 'crm-order-draft-only', sourceCommit: commit,
      packageId: 'TEST-fixture', stockEffect, ledgerEffect: false, reservationEffect: false });
    if (pathname === '/api/auth/me') return json({ user: { id: 7, permissions: ['sales.create'] } });
    const product = /\/crm\/catalog\/products\/erp-(101|102)$/.exec(pathname);
    if (product) {
      const id = Number(product[1]);
      return Response.json({ success: true, data: { id: 'erp-' + id, erpProductId: id, stockCode: 'MB' + id,
        status: 'active', hold: { blocked: false }, revision: hash, stockQuantity: 120,
        salePrices: [{ id: id + 100, tier: 1, isMainUnit: true, currency: 'TRY', unitSourceId: 1,
          sourceKey: 'TEST-P-' + id, priceExact: id === 101 ? '100.00000000' : '120.00000000' }] }, meta: { source: 'melisa-erp-catalog' } });
    }
    if (pathname === '/crm/erp/v2/customers') return json({ status: 'missing', currentSource: source,
      entries: [{ id: 44, code: 'TEST-C', blocked: false, currency: 'TRY', revision: hash }] });
    if (pathname === '/crm/erp/v2/drafts' && options.method === 'POST') {
      const body = JSON.parse(options.body); writes.push(body);
      if (postFailure) return new Response(null, { status: 503 });
      receipt = { id: 1, request: body, status: 'draft', erpPersisted: true, testOnly: true,
        stockEffect: false, ledgerEffect: false, collectionEffect: false, reservationEffect: false,
        currentSource: source, sourceMetadataStatus: 'sealed-current-source', items: body.items.map(row => ({
          productId: row.productId, stockCode: row.stockCode, quantity: row.quantity, currency: row.currency,
          unitPriceExact4: Number(row.priceExact8).toFixed(4), lineTotalExact4: (Number(row.priceExact8) * row.quantity).toFixed(4),
        })), grandTotalExact4: '1680.0000', amountTryExact4: '1680.0000' };
      return json(receipt);
    }
    if (pathname.startsWith('/crm/erp/v2/drafts/')) return receipt ? json(receipt) : new Response(null, { status: 404 });
    throw Error('Unexpected fixture route');
  };
  const adapter = createCustomerCatalogTestAdapter({ profile, endpoints, transport,
    getCrmAuthorization: () => 'Bearer synthetic-crm-session', getErpAuthorization: () => 'Bearer synthetic-erp-session',
    verifyActor: () => ({ id: 'owner', role: 'patron', permissions: ['crm.manage', 'crm.send'] }),
    readConversation: () => ({ id: 55, phone: profile.peer }),
  });
  return { adapter, profile, scope, writes, setStockEffect: value => { stockEffect = value; }, setPostFailure: value => { postFailure = value; } };
}

test('existing isolated native contract receives piece quantities and returns independent exact readback', async () => {
  const { adapter, scope, writes } = fixture();
  const items = [];
  for (const [id, quantity] of [[101, 12], [102, 4]]) {
    const product = (await adapter.readProduct('erp-' + id, scope)).data;
    items.push({ productId: product.id, quantity, expectedRevision: product.revision,
      expectedPriceExact: product.priceExact, expectedCurrency: 'TRY' });
  }
  const result = await adapter.createDraft({ scope, requestId: '11111111-1111-4111-8111-111111111111', items });
  assert.equal(writes.length, 1); assert.deepEqual(writes[0].items.map(row => row.quantity), [12, 4]);
  assert.equal(result.productTotalExact, '1680.00000000'); assert.equal(result.stockEffect, false);
  assert.equal(result.collectionEffect, false); assert.equal(result.reservationEffect, false);
});
test('identity with stock effect blocks before customer/order writes', async () => {
  const { adapter, scope, writes, setStockEffect } = fixture(); setStockEffect(true);
  await assert.rejects(adapter.readProduct('erp-101', scope), { code: 'CUSTOMER_CATALOG_TEST_IDENTITY_MISMATCH' });
  await assert.rejects(adapter.createDraft({ scope, requestId: '11111111-1111-4111-8111-111111111111', items: [] }),
    { code: 'CUSTOMER_CATALOG_TEST_IDENTITY_MISMATCH', beforeTransport: true });
  assert.equal(writes.length, 0);
});

test('once native POST begins an upstream failure never claims safe pretransport rejection', async () => {
  const { adapter, scope, writes, setPostFailure } = fixture();
  const items = [];
  for (const [id, quantity] of [[101, 12], [102, 4]]) {
    const product = (await adapter.readProduct('erp-' + id, scope)).data;
    items.push({ productId: product.id, quantity, expectedRevision: product.revision,
      expectedPriceExact: product.priceExact, expectedCurrency: 'TRY' });
  }
  setPostFailure(true);
  await assert.rejects(adapter.createDraft({ scope, requestId: '11111111-1111-4111-8111-111111111111', items }),
    error => error.code === 'CUSTOMER_CATALOG_UPSTREAM_INVALID' && error.beforeTransport !== true);
  assert.equal(writes.length, 1);
});
test('authenticated verified missing draft returns null before any create, including empty 404 body', async () => {
  const { adapter, scope, writes } = fixture();
  assert.equal(await adapter.readDraft('11111111-1111-4111-8111-111111111111', scope), null);
  assert.equal(writes.length, 0);
});
test('unreviewed or canonical runtime cannot use customer isolated adapter', () => {
  assert.throws(() => createCustomerCatalogTestAdapter({}), { code: 'CUSTOMER_CATALOG_TEST_PROFILE_REQUIRED' });
});
