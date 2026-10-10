import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCustomerCatalogService } from './customerCatalog.mjs';
import { createCustomerCatalogHandler } from './customerCatalogHandler.mjs';

test('staff sales context is read only, scoped, secret free and refuses stale cart/historical intent', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crm-sales-context-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const actor = { id: 'fixture-staff', permissions: ['crm.send'] }, file = path.join(dir, 'sessions.json');
  let price = '100.00000000', writes = 0;
  const service = createCustomerCatalogService({ storeFile: file, config: { enabled: true, approved: true,
    environment: 'ISOLATED_TEST_COPY', database: 'SYNTHETIC', conversationId: '55', customerId: 593,
    actorId: actor.id, customerLabel: 'Synthetic', currency: 'TRY', products: [{ id: 'erp-101',
      series: { verified: true, evidence: 'Synthetic', totalPieces: 6, composition: [{ label: '3 ay', quantity: 6 }],
        stockCompositionVerified: true, stockEvidence: 'Synthetic', availableSeries: 10 } }] },
    verifyScope: async () => true, readProduct: async () => ({ success: true, data: { id: 'erp-101', erpProductId: 101,
      stockCode: 'SYNTHETIC', productName: 'Synthetic', revision: 'a'.repeat(64), status: 'active', hold: { blocked: false },
      unit: { verified: true, factorExact8: '1.00000000' }, stockQuantity: 60,
      salePrices: [{ id: 1, unitSourceId: 1, sourceKey: 'synthetic', tier: 1, isMainUnit: true, currency: 'TRY', priceExact: price }],
      privateNote: 'SECRET_SENTINEL', supplierName: 'SECRET_SENTINEL' }, meta: { source: 'melisa-erp-catalog', catalogVersion: 'melisa-catalog.v1',
        environment: 'CANONICAL_TEST', sourceDatabaseVerified: true, stockFreshness: 'native-test', freshLive: false, cached: false, fetchedAt: new Date().toISOString() } }),
    createDraft: async () => { writes++; throw Object.assign(Error(), { code: 'CUSTOMER_CATALOG_ORDER_PENDING', statusCode: 503 }); }, readDraft: async () => null });
  const issued = await service.issue(actor, { conversationId: '55' }), token = issued.url.split('#')[1];
  await service.updateCart(token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
  const before = await readFile(file, 'utf8'), context = await service.staffSalesContext(actor, issued.sessionId);
  assert.equal(context.cart.pieceCount, 12); assert.equal(context.cart.productTotalExact, '1200.00000000');
  assert.equal(context.products.length, 1); assert(!JSON.stringify(context).includes(token));
  for (const forbidden of ['tokenHash', 'SECRET_SENTINEL', 'phone']) assert(!JSON.stringify(context).includes(forbidden));
  assert.equal(await readFile(file, 'utf8'), before); assert.equal(writes, 0);
  const handler = createCustomerCatalogHandler({ service, authorizeStaff: async () => actor });
  const list = await handler(new Request('http://fixture/crm/customer-catalog/sessions?conversationId=55'));
  assert.equal(list.status, 200); assert.equal((await list.json()).data.sessions[0].sessionId, issued.sessionId);
  assert.equal((await handler(new Request('http://fixture/crm/customer-catalog/sessions?conversationId=56'))).status, 403);
  await assert.rejects(service.staffSalesContext({ ...actor, id: 'other' }, issued.sessionId), e => e.statusCode === 403);
  price = '101.00000000'; await assert.rejects(service.staffSalesContext(actor, issued.sessionId), e => e.code === 'CUSTOMER_CATALOG_PRICE_CHANGED');
  assert.equal(await readFile(file, 'utf8'), before);
  price = '100.00000000'; await assert.rejects(service.submitOrder(token, { revision: 1 }));
  const pending = await readFile(file, 'utf8');
  await assert.rejects(service.staffSalesContext(actor, issued.sessionId), e => e.code === 'CUSTOMER_CATALOG_ORDER_LOCKED');
  assert.equal(await readFile(file, 'utf8'), pending); assert.equal(writes, 1);
  await service.revoke(actor, issued.sessionId); await assert.rejects(service.staffSalesContext(actor, issued.sessionId), e => e.statusCode === 401);
});
