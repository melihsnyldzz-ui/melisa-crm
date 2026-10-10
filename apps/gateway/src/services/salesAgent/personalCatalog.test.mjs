import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPersonalCatalogAdapter } from './personalCatalog.mjs';
import { createSalesPreview } from './preview.mjs';
import { createSalesCatalogAdapter } from './catalogAdapter.mjs';

const time = 1800000000000, id = 'aaabbbcc-1234-4234-8234-123456789abc';
const digest = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
function snapshot(changes = {}) {
  const s = { sessionId: id, conversationId: '55', customerId: 593, actorId: 'staff', customerLabel: 'Synthetic', revision: 0,
    configRevision: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64), expiresAt: new Date(time + 600000).toISOString(),
    products: [{ id: 'erp-101', stockCode: 'SYNTHETIC-A', productName: 'Synthetic A', currency: 'TRY', unitPrice: 100,
      unitPriceExact: '100.00000000', photoPath: '/api/customer-catalog/products/erp-101/photo',
      series: { verified: true, isTestExample: true, totalPieces: 6, composition: [{ label: '3 ay', quantity: 6 }] } }],
    cart: { valid: true, revision: 0, items: [] }, source: 'melisa-personal-test-catalog', sourceEnvironment: 'CANONICAL_TEST',
    sourceDatabaseVerified: true, testOnly: true, readOnly: true, orderPending: false, ...changes };
  return { ...s, fingerprint: digest(s), fetchedAt: new Date(time).toISOString() };
}
function fixture() {
  let current = snapshot(), reads = 0, status = 200, permitted = true, clock = time;
  const controller = new AbortController();
  const adapter = createPersonalCatalogAdapter({ sessionId: id, conversationId: '55', actorId: 'staff', now: () => clock, signal: controller.signal,
    assertAccess: () => { if (!permitted) throw Object.assign(Error(), { code: 'AI_AUTH_REQUIRED' }); },
    readSnapshot: async request => {
      reads++; assert.equal(request.method, 'GET'); assert.equal(new URL(request.url).origin, 'http://100.87.188.3:62600');
      assert.equal(new URL(request.url).pathname, `/api/live/crm/customer-catalog/sessions/${id}/sales-context`);
      return Response.json({ success: true, data: current }, { status });
    } });
  const conversation = { id: '55', messages: [{ direction: 'incoming', text: 'Which models are in my catalog?' }] };
  const proposal = { action: 'recommend', reply: 'Review this TEST card.', summaryTr: 'TEST kartını inceleyin.', productIds: ['erp-101'], lines: [], handoffReason: '' };
  const preview = generate => createSalesPreview({ getMode: () => 'copilot', loadPolicy: async () => ({}), readConversation: async () => conversation,
    generate, catalogAdapter: adapter, now: () => clock });
  return { adapter, proposal, preview, reads: () => reads, set: x => { current = x; }, status: x => { status = x; }, deny: () => { permitted = false; }, clock: x => { clock = x; }, abort: () => controller.abort() };
}
test('personal preview skips planner/global search and sends minimized series/cart, server builds price cards', async () => {
  const f = fixture(); let calls = 0;
  const result = await f.preview(async request => {
    calls++; assert(!request.schema.properties.queries); assert.equal(request.context.recordedProducts.length, 1);
    assert.equal(request.context.personalCatalog.products[0].series.totalPieces, 6);
    const body = JSON.stringify(request.context); assert(!body.includes('100.00000000')); assert(!body.includes('actorId'));
    assert(!body.includes('customerId')); assert(!body.includes('sessionId')); assert(!body.includes('fingerprint'));
    return f.proposal;
  })({ conversationId: '55', user: { id: 'staff' } });
  assert.equal(calls, 1); assert(f.reads() >= 4); assert.equal(result.recommendedProducts[0].unitPriceExact, '100.00000000');
  assert.equal(result.personalCatalog.sessionId, id); assert.equal(result.autoSend, false); assert.equal(result.erpWrite, false);
});
for (const [name, change] of [['cart', { revision: 1, cart: { valid: true, revision: 1, items: [{ productId: 'erp-101', seriesCount: 1 }] } }],
  ['source', { sourceFingerprint: 'c'.repeat(64) }], ['customer', { customerId: 594 }]]) {
  test(`${name} changes during model reject the entire proposal`, async () => {
    const f = fixture(); await assert.rejects(f.preview(async () => { f.set(snapshot(change)); return f.proposal; })({ conversationId: '55', user: { id: 'staff' } }), e => e.code === 'AI_PERSONAL_CATALOG_CHANGED');
  });
}
test('revocation and expiry during model fail closed', async () => {
  for (const mutate of [f => f.status(401), f => f.clock(time + 600001), f => f.deny(), f => f.abort()]) {
    const f = fixture(); await assert.rejects(f.preview(async () => { mutate(f); return f.proposal; })({ conversationId: '55', user: { id: 'staff' } }));
  }
});
test('wrong actor/conversation and historical order are rejected before model', async () => {
  for (const change of [{ actorId: 'other' }, { conversationId: '56' }, { orderPending: true }]) {
    const f = fixture(); f.set(snapshot(change)); let calls = 0;
    await assert.rejects(f.preview(async () => { calls++; return f.proposal; })({ conversationId: '55', user: { id: 'staff' } }), e => e.code === 'AI_PERSONAL_CATALOG_INVALID');
    assert.equal(calls, 0);
  }
});
test('model cannot select a global product outside personal cards', async () => {
  const f = fixture(); await assert.rejects(f.preview(async () => ({ ...f.proposal, productIds: ['erp-999'] }))({ conversationId: '55', user: { id: 'staff' } }), e => e.code === 'AI_PRODUCT_UNKNOWN');
});
test('generic source errors expose only allowlisted classifications, never raw upstream content', async () => {
  for (const [code, expected] of [['ERP_SOURCE_IDENTITY_REQUIRED', 'AI_ERP_SOURCE_IDENTITY_REQUIRED'],
    ['RAW_SECRET_SENTINEL', 'AI_CATALOG_UNAVAILABLE']]) {
    const adapter = createSalesCatalogAdapter({ authorization: 'Bearer synthetic', assertAccess: () => {},
      readCatalog: async () => Response.json({ success: false, error: { code, message: 'RAW_SECRET_SENTINEL' } }, { status: 502 }) });
    await assert.rejects(adapter.search(['synthetic']), error => error.code === expected && !error.message.includes('RAW_SECRET_SENTINEL'));
  }
});
