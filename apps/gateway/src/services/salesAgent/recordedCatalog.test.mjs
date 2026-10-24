import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG_RESPONSE_GUARD } from '../catalogBridge.mjs';
import { createSalesCatalogAdapter } from './catalogAdapter.mjs';
import { recordedProduct, validateRecordedCatalog, validateSearchPlan, recordedCatalogFacts } from './recordedCatalog.mjs';
import { containsNumericPriceProse, prepareSalesDraft } from './agent.mjs';
import { createSalesPreview } from './preview.mjs';

const now = 1_800_000_000_000;
const meta = (overrides = {}) => ({ source: 'melisa-existing-erp-stock-read', catalogVersion: 'existing-stock-v1',
  sourceDatabaseVerified: true, sourceDatabases: { products: 'VEGA2026', images: 'MELISA_ERP_V2' },
  stockFreshness: 'unverified', fetchedAt: new Date(now).toISOString(), ...overrides });
const row = (overrides = {}) => ({ id: 'vega-101', stockCode: '41140', productName: 'Synthetic test product',
  salePrice: 196, currency: 'TRY', priceStatus: 'recorded', priceBasis: 'per-item', priceBasisStatus: 'user-confirmed',
  stockQuantity: 99, stockStatus: 'in-stock', photoStatus: 'guarded-path', photoPath: '/crm/catalog/products/vega-101/photo', ...overrides });
const payload = (rows = [row()], changes = {}) => ({ success: true, data: rows, meta: meta(changes) });
const guarded = (data, guard = () => {}) => {
  const response = Response.json(data);
  Object.defineProperty(response, CATALOG_RESPONSE_GUARD, { value: guard });
  return response;
};
const snapshot = () => ({ products: [recordedProduct(row())], facts: recordedCatalogFacts(meta(), now) });
const conversation = () => ({ id: 55, assignedUserId: 'synthetic-staff', chatwootAgentId: 3,
  messages: [{ id: 1, direction: 'incoming', text: 'Please show product 41140.' }] });
const proposal = (overrides = {}) => ({ action: 'recommend', reply: 'Please review this product card.',
  summaryTr: 'Gerçek ürün kartı önerildi.', productIds: ['vega-101'], lines: [], handoffReason: '', ...overrides });
const code = expected => error => error.code === expected;

test('recorded facts preserve known price but do not expose stock as verified or invent series', () => {
  const result = validateRecordedCatalog(payload(), now);
  assert.equal(result.products[0].salePrice, 196); assert.equal(result.products[0].currency, 'TRY');
  assert.equal(result.products[0].priceBasis, 'per-item'); assert.equal(result.products[0].photoEligible, true);
  assert.equal(result.products[0].stockQuantity, undefined); assert.equal(result.products[0].seriesSize, undefined);
  assert.equal(result.facts.stockFreshness, 'unverified'); assert.equal(result.facts.seriesVerified, false);
  assert.equal(Date.parse(result.facts.expiresAt), now + 300_000);
});
for (const price of [undefined, null, 0, -1, '196', Infinity, 1.23456, Number.MAX_SAFE_INTEGER / 1000]) {
  test(`unknown or unsupported price is null, never rounded: ${String(price)}`, () => {
    assert.equal(recordedProduct(row({ salePrice: price })).salePrice, null);
  });
}
test('four-decimal recorded price is preserved exactly and unsupported currency grants no price', () => {
  assert.equal(recordedProduct(row({ salePrice: 1.2345 })).salePrice, 1.2345);
  const result = recordedProduct(row({ currency: 'GBP' }));
  assert.equal(result.currency, null); assert.equal(result.salePrice, null);
});
test('only the exact existing guarded photo route is eligible', () => {
  assert.equal(recordedProduct(row({ photoPath: 'https://untrusted.invalid/photo.jpg' })).photoEligible, false);
  assert.equal(recordedProduct(row({ photoPath: '/crm/catalog/products/vega-102/photo' })).photoEligible, false);
});
for (const change of [ { sourceDatabaseVerified: false }, { stockFreshness: 'verified' },
  { sourceDatabases: { products: 'WRONG', images: 'MELISA_ERP_V2' } },
  { fetchedAt: new Date(now - 300_001).toISOString() }, { fetchedAt: new Date(now + 1).toISOString() } ]) {
  test(`reject wrong source, forged freshness or stale observation: ${JSON.stringify(change)}`, () => {
    assert.throws(() => validateRecordedCatalog(payload([row()], change), now), code('AI_RECORDED_CATALOG_INVALID'));
  });
}
test('planner accepts at most two bounded locators, never product/business facts', () => {
  assert.deepEqual(validateSearchPlan({ queries: [] }), []);
  assert.deepEqual(validateSearchPlan({ queries: ['41140', '41140'] }), ['41140']);
  for (const value of [{ queries: ['a', 'b', 'c'] }, { queries: ['x'.repeat(121)] },
    { queries: ['a'], unitPrice: 1 }, { queries: ['\ncontrol'] }]) {
    assert.throws(() => validateSearchPlan(value));
  }
});
test('adapter performs bounded GET searches and ID readback, returns deterministic price cards', async () => {
  const requests = []; let reads = 0;
  const adapter = createSalesCatalogAdapter({ authorization: 'Bearer synthetic-token', now: () => now,
    assertAccess: () => {}, readCatalog: async request => {
      requests.push(new URL(request.url)); reads++;
      assert.equal(request.method, 'GET');
      return guarded(requests.at(-1).pathname.endsWith('/vega-101')
        ? { success: true, data: row(), meta: meta() } : payload());
    } });
  const candidates = await adapter.search(['41140']);
  assert.equal(requests[0].searchParams.get('limit'), '8'); assert.equal(requests[0].searchParams.get('page'), '1');
  const selected = await adapter.readSelected(['vega-101'], candidates.products, candidates.facts);
  assert.equal(reads, 2); assert.equal(selected[0].salePrice, 196);
  assert.equal(requests[1].pathname, '/crm/catalog/products/vega-101');
});
test('empty planner requires no catalog GET, unique candidates are capped at eight across searches', async () => {
  let reads = 0;
  const adapter = createSalesCatalogAdapter({ authorization: 'Bearer synthetic-token', now: () => now,
    assertAccess: () => {}, readCatalog: async () => {
      const offset = reads++ * 8;
      return guarded(payload(Array.from({ length: 8 }, (_, index) => row({ id: `vega-${101 + offset + index}`, photoPath: null }))));
    } });
  assert.deepEqual(await adapter.search([]), { products: [], facts: null }); assert.equal(reads, 0);
  assert.equal((await adapter.search(['a', 'b'])).products.length, 8); assert.equal(reads, 2);
});
for (const change of [{ salePrice: 197 }, { currency: 'EUR' }, { stockCode: 'OTHER' }, { productName: 'Changed' }]) {
  test(`changed identity/price during selected readback is rejected: ${JSON.stringify(change)}`, async () => {
    const adapter = createSalesCatalogAdapter({ authorization: 'Bearer synthetic-token', now: () => now,
      assertAccess: () => {}, readCatalog: async () => guarded({ success: true, data: row(change), meta: meta() }) });
    await assert.rejects(adapter.readSelected(['vega-101'], snapshot().products, snapshot().facts), code('AI_CATALOG_CHANGED'));
  });
}
test('forged selection and more than three selections cannot start an ID read', async () => {
  let reads = 0;
  const adapter = createSalesCatalogAdapter({ authorization: 'Bearer synthetic-token', assertAccess: () => {},
    readCatalog: async () => { reads++; return guarded(payload()); } });
  await assert.rejects(adapter.readSelected(['vega-999'], snapshot().products, snapshot().facts), code('AI_PRODUCT_UNKNOWN'));
  await assert.rejects(adapter.readSelected(['vega-1', 'vega-2', 'vega-3', 'vega-4'], [], null), code('AI_RECOMMENDATION_LIMIT'));
  assert.equal(reads, 0);
});
test('unguarded reader, abort, source failure and late lease revocation fail closed', async () => {
  const make = readCatalog => createSalesCatalogAdapter({ authorization: 'Bearer synthetic-token', now: () => now,
    assertAccess: () => {}, readCatalog });
  await assert.rejects(make(async () => Response.json(payload())).search(['41140']), code('AI_CATALOG_LEASE_REQUIRED'));
  await assert.rejects(make(async () => new Response('', { status: 503 })).search(['41140']), code('AI_CATALOG_UNAVAILABLE'));
  const controller = new AbortController(); controller.abort();
  const aborted = createSalesCatalogAdapter({ authorization: 'Bearer synthetic-token', signal: controller.signal,
    assertAccess: () => {}, readCatalog: async () => assert.fail('Must not read') });
  await assert.rejects(aborted.search(['41140']), code('AI_SALES_CANCELLED'));
  let valid = true;
  const adapter = make(async () => guarded(payload(), () => { if (!valid) throw Error('CATALOG_SESSION_REVOKED'); }));
  await adapter.search(['41140']); valid = false;
  assert.throws(adapter.assertCurrent, /CATALOG_SESSION_REVOKED/);
});
test('recorded recommendation is allowed, but recorded stock/series cannot authorize a quote', async () => {
  const dependencies = { now: () => now, readCurrentConversation: async () => conversation(), generate: async () => proposal() };
  const result = await prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot() }, dependencies);
  assert.equal(result.action, 'recommend'); assert.equal(result.quote, null); assert.deepEqual(result.recommendedProducts, []);
  await assert.rejects(prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(),
    policy: { minimumOrder: { amountMinor: 1, currency: 'TRY' } } }, { ...dependencies,
    generate: async () => proposal({ action: 'quote', lines: [{ productId: 'vega-101', quantity: 1 }] }),
  }), code('AI_RECORDED_QUOTE_FORBIDDEN'));
});
test('manual real-candidate request constrains schema to actual IDs and withholds numeric price from model', async () => {
  let request;
  const result = await prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(), requireRecordedSelection: true }, {
    now: () => now, readCurrentConversation: async () => conversation(), generate: async value => { request = value; return proposal(); },
  });
  assert.deepEqual(request.schema.properties.action.enum, ['recommend', 'handoff']);
  assert.equal(request.schema.properties.productIds.minItems, 0); assert.equal(request.schema.properties.productIds.maxItems, 3);
  assert.deepEqual(request.schema.properties.productIds.items.enum, ['vega-101']);
  assert.equal(request.context.recordedProducts[0].salePrice, undefined);
  assert.equal(request.context.recordedProducts[0].priceAvailable, true); assert.equal(result.productIds[0], 'vega-101');
});
test('recorded product prompt limits descriptions to source name/code and carries no fabricated attributes', async () => {
  let request;
  const catalog = { ...snapshot(), products: [recordedProduct(row({ material: 'UNVERIFIED_FABRIC',
    quality: 'UNVERIFIED_QUALITY', ageRange: 'UNVERIFIED_AGE', color: 'UNVERIFIED_COLOR' }))] };
  await prepareSalesDraft({ conversation: conversation(), recordedCatalog: catalog, requireRecordedSelection: true }, {
    now: () => now, readCurrentConversation: async () => conversation(),
    generate: async value => { request = value; return proposal(); },
  });
  const product = request.context.recordedProducts[0];
  assert.equal(product.stockCode, '41140'); assert.equal(product.productName, row().productName);
  assert.equal(product.priceAvailable, true); assert.equal(product.currency, 'TRY');
  const context = JSON.stringify(request.context);
  for (const unknown of ['UNVERIFIED_FABRIC', 'UNVERIFIED_QUALITY', 'UNVERIFIED_AGE', 'UNVERIFIED_COLOR']) {
    assert.equal(context.includes(unknown), false);
  }
  assert.match(request.instructions, /only the supplied stockCode and literal productName/);
  assert.match(request.instructions, /Do not invent fabric, material, composition, quality, baby suitability, age range, sizes or colors/);
  assert.match(request.instructions, /not independent verification of material, quality or suitability/);
  assert.match(request.instructions, /both reply and summaryTr/);
});
test('genuine manual-search handoff can have a reason and no forced product card', async () => {
  let models = 0;
  const result = await prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(), requireRecordedSelection: true }, {
    now: () => now, readCurrentConversation: async () => conversation(),
    generate: async () => { models++; return proposal({ action: 'handoff', productIds: [], handoffReason: 'Customer asked for a person.' }); },
  });
  assert.equal(result.action, 'handoff'); assert.deepEqual(result.productIds, []); assert.equal(models, 1);
});
test('observed reply/no-card plus numeric price bug receives one guarded semantic correction', async () => {
  const events = []; let models = 0;
  const result = await prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(), requireRecordedSelection: true }, {
    now: () => now,
    readCurrentConversation: async () => { events.push('read'); return conversation(); },
    generate: async request => {
      events.push('model'); models++;
      if (models === 1) return proposal({ action: 'reply', reply: 'The price is 196 TRY.', summaryTr: 'Fiyatı 196 TRY.', productIds: [] });
      assert.match(request.instructions, /Corrective attempt/); assert.ok(!request.instructions.includes('The price is 196 TRY.'));
      return proposal();
    },
  });
  assert.equal(models, 2); assert.deepEqual(events, ['model', 'read', 'model', 'read']);
  assert.equal(result.action, 'recommend'); assert.deepEqual(result.productIds, ['vega-101']);
});
test('schema-valid recommend with empty IDs receives one guarded selection correction', async () => {
  const events = []; let models = 0;
  const result = await prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(), requireRecordedSelection: true }, {
    now: () => now,
    readCurrentConversation: async () => { events.push('read'); return conversation(); },
    generate: async () => { models++; events.push('model'); return models === 1 ? proposal({ productIds: [] }) : proposal(); },
  });
  assert.equal(models, 2); assert.deepEqual(events, ['model', 'read', 'model', 'read']);
  assert.deepEqual(result.productIds, ['vega-101']);
});
test('malformed empty recommendation is not mistaken for a retriable semantic error', async () => {
  let models = 0, reads = 0;
  await assert.rejects(prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(), requireRecordedSelection: true }, {
    now: () => now, readCurrentConversation: async () => { reads++; return conversation(); },
    generate: async () => { models++; return proposal({ productIds: [], inventedPrice: 1 }); },
  }), code('AI_PROPOSAL_INVALID'));
  assert.equal(models, 1); assert.equal(reads, 0);
});
test('second invalid price claim fails with no third generation or synthetic card', async () => {
  let models = 0;
  await assert.rejects(prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(), requireRecordedSelection: true }, {
    now: () => now, readCurrentConversation: async () => conversation(),
    generate: async () => { models++; return proposal({ reply: '196 TRY per piece' }); },
  }), code('AI_PRICE_PROSE_FORBIDDEN'));
  assert.equal(models, 2);
});
test('conversation changed before corrective retry stops after one model call', async () => {
  let models = 0;
  await assert.rejects(prepareSalesDraft({ conversation: conversation(), recordedCatalog: snapshot(), requireRecordedSelection: true }, {
    now: () => now, readCurrentConversation: async () => ({ ...conversation(), chatwootAgentId: 4 }),
    generate: async () => { models++; return proposal({ action: 'reply', productIds: [] }); },
  }), code('AI_CONVERSATION_CHANGED'));
  assert.equal(models, 1);
});
test('numeric price prose detector covers currencies and allows ordinary product code/quantity', () => {
  for (const text of ['196 TRY', 'TRY 196', '196 TL', '₺196', '196 €', '$196.00', '١٩٦ ليرة', '196 dollars']) {
    assert.equal(containsNumericPriceProse(text), true, text);
  }
  for (const text of ['Product 41140', '2 pieces', 'Please review the recorded price card.']) assert.equal(containsNumericPriceProse(text), false);
});
test('conversation change while catalog search waits stops before proposal model', async () => {
  let changed = false, modelCalls = 0;
  const preview = createSalesPreview({ getMode: () => 'copilot', loadPolicy: async () => ({}),
    readConversation: async () => changed ? { ...conversation(), chatwootAgentId: 4 } : conversation(),
    generate: async () => { modelCalls++; return proposal(); },
    catalogAdapter: { assertCurrent: () => {}, search: async () => { changed = true; return snapshot(); },
      readSelected: async () => assert.fail('Must not read selected') },
  });
  await assert.rejects(preview({ conversationId: '55', user: {}, catalogSearch: '41140' }), code('AI_CONVERSATION_CHANGED'));
  assert.equal(modelCalls, 0);
});
test('human locator bypasses planner and recorded cards must be ID-readback before return', async () => {
  let models = 0, readbacks = 0, searchTerms;
  const preview = createSalesPreview({ getMode: () => 'copilot', loadPolicy: async () => ({}),
    readConversation: async () => conversation(),
    generate: async request => { models++; assert.deepEqual(request.context.catalogSelectors, ['41140']); return proposal(); },
    catalogAdapter: { assertCurrent: () => {}, search: async queries => { searchTerms = queries; return { products: [], facts: null }; },
      readSelected: async ids => { readbacks++; assert.deepEqual(ids, []); return []; } },
  });
  const result = await preview({ conversationId: '55', user: {}, catalogSearch: '41140' }).catch(error => error);
  // The adapter above supplies no trusted products: the model's invented selection cannot reach readback.
  assert.equal(result.code, 'AI_PRODUCT_UNKNOWN'); assert.equal(models, 1); assert.equal(readbacks, 0);
  assert.deepEqual(searchTerms, ['41140']);
});
