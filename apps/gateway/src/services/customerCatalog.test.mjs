import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCustomerCatalogService } from './customerCatalog.mjs';
import { createCustomerCatalogHandler } from './customerCatalogHandler.mjs';

const CLOCK = 1_800_000_000_000;
const actor = { id: 'synthetic-staff', permissions: ['crm.send'] };
const code = expected => error => error.code === expected;
function configuration() {
  const series = totalPieces => ({ verified: true, evidence: 'Synthetic reviewed fixture, not business data', totalPieces,
    composition: totalPieces === 6 ? [{ label: '3 ay', quantity: 2 }, { label: '9 ay', quantity: 2 }, { label: '12 ay', quantity: 2 }]
      : [{ label: '3 ay', quantity: 1 }, { label: '9 ay', quantity: 1 }, { label: '12 ay', quantity: 2 }],
    stockCompositionVerified: true, stockEvidence: 'Synthetic complete-series fixture', availableSeries: 10 });
  return { enabled: true, approved: true, environment: 'ISOLATED_TEST_COPY', database: 'SYNTHETIC_TEST',
    conversationId: '55', customerId: 593, actorId: actor.id, customerLabel: 'Synthetic owner test', currency: 'TRY',
    products: [{ id: 'erp-101', recommended: true, age: '3–12 ay', type: 'Takım', color: 'Yeşil', maxSeries: 10, series: series(6) },
      { id: 'erp-102', recommended: false, age: '3–12 ay', type: 'Tulum', color: 'Krem', maxSeries: 10, series: series(4) }] };
}
function row(id) {
  return { id, erpProductId: Number(id.slice(4)), stockCode: id === 'erp-101' ? 'FIXTURE-A' : 'FIXTURE-B',
    productName: id === 'erp-101' ? 'Sentetik takım' : 'Sentetik tulum', status: 'active', hold: { blocked: false },
    revision: 'a'.repeat(64), unit: { verified: true, factorExact8: '1.00000000' }, stockQuantity: id === 'erp-101' ? 60 : 40,
    photoStatus: 'guarded-path', photo: { validationStatus: 'CONFIRMED' }, photoPath: `/crm/catalog/products/${id}/photo`,
    salePrices: [{ id: Number(id.slice(4)), unitSourceId: 1, tier: 1, isMainUnit: true, currency: 'TRY',
      priceExact: id === 'erp-101' ? '100.00000000' : '120.00000000', sourceKey: 'synthetic-price' }],
    cost: 20, supplierName: 'never expose', privateNote: 'private', rawPhotoPath: 'C:/private/image.jpg' };
}
async function fixture(t, changes = {}) {
  const parent = os.tmpdir(), directory = await mkdtemp(path.join(parent, 'melisa-customer-catalog-fixture-'));
  t.after(async () => {
    if (!path.resolve(directory).startsWith(path.resolve(parent) + path.sep)) throw Error('Invalid fixture cleanup path');
    await rm(directory, { recursive: true, force: true });
  });
  const storeFile = path.join(directory, 'customer-catalog.json'), config = configuration(), receipts = new Map(), creates = [];
  let clock = CLOCK, scopeAllowed = true;
  const rows = { 'erp-101': row('erp-101'), 'erp-102': row('erp-102') };
  const options = { config, storeFile, now: () => clock, verifyScope: async () => scopeAllowed,
    readProduct: async id => ({ success: true, data: structuredClone(rows[id]), meta: { source: 'melisa-erp-catalog',
      catalogVersion: 'melisa-catalog.v1', environment: 'CANONICAL_TEST', sourceDatabaseVerified: true,
      stockFreshness: 'native-test', freshLive: false, cached: false, fetchedAt: new Date(clock).toISOString() } }),
    readPhoto: async () => new Response(new Uint8Array([255,216,255,0]), { headers: { 'content-type': 'image/jpeg' } }),
    createDraft: async input => {
      creates.push(structuredClone(input));
      const rounded = value => {
        const units = (BigInt(value.replace('.', '')) + 5000n) / 10000n;
        return `${units / 10000n}.${String(units % 10000n).padStart(4, '0')}0000`;
      };
      receipts.set(input.requestId, { requestId: input.requestId, id: 1, status: 'draft', customerId: input.scope.customerId,
        conversationId: input.scope.conversationId, currency: input.summary.currency, productTotalExact: input.summary.productTotalExact,
        items: input.items.map(item => ({ productId: item.productId, quantity: item.quantity,
          unitPriceExact: rounded(item.expectedPriceExact), currency: item.expectedCurrency })),
        stockEffect: false, ledgerEffect: false, reservationEffect: false, collectionEffect: false });
    }, readDraft: async id => receipts.has(id) ? structuredClone(receipts.get(id)) : null, ...changes };
  const service = createCustomerCatalogService(options), issue = () => service.issue(actor, { conversationId: '55' });
  const minted = await issue(), token = minted.url.split('#')[1];
  return { service, options, storeFile, rows, config, minted, token, creates, receipts, issue,
    advance: delta => { clock += delta; }, denyScope: () => { scopeAllowed = false; } };
}

test('pilot is disabled by default and rejects LIVE or malformed series configuration', async () => {
  const service = createCustomerCatalogService();
  await assert.rejects(service.session('A'.repeat(43)), code('CUSTOMER_CATALOG_PILOT_DISABLED'));
  for (const override of [{ environment: 'LIVE' }, { approved: false }, { customerId: 0 }]) {
    assert.throws(() => createCustomerCatalogService({ config: { ...configuration(), ...override } }), code('CUSTOMER_CATALOG_CONFIG_INVALID'));
  }
  const config = configuration(); config.products[0].series.totalPieces = 5;
  assert.throws(() => createCustomerCatalogService({ config }), code('CUSTOMER_CATALOG_CONFIG_INVALID'));
});

test('six/four piece full series use per-piece price and persist only capability hashes', async t => {
  const f = await fixture(t);
  const cart = await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }, { productId: 'erp-102', seriesCount: 1 }] });
  assert.equal(cart.modelCount, 2); assert.equal(cart.seriesCount, 3); assert.equal(cart.pieceCount, 16);
  assert.equal(cart.productTotal, 1680); assert.equal(cart.productTotalExact, '1680.00000000');
  assert.equal(cart.items[0].lineTotal, 1200); assert.equal(cart.items[1].lineTotal, 480);
  const stored = await readFile(f.storeFile, 'utf8');
  assert(!stored.includes(f.token)); assert(!stored.includes('Bearer')); assert(!stored.includes('supplierName'));
  assert.equal(JSON.parse(stored).sessions[0].items[0].seriesCount, 2);
  const session = await f.service.session(f.token);
  for (const product of session.products) for (const forbidden of ['stockQuantity', 'cost', 'supplierName', 'privateNote', 'rawPhotoPath', 'evidence']) assert(!Object.hasOwn(product, forbidden));
});

test('server rejects quantity tampering, incomplete series, limits and optimistic write conflicts', async t => {
  const f = await fixture(t);
  for (const seriesCount of [-1, 0, 1.5, 101, '2']) await assert.rejects(f.service.updateCart(f.token,
    { revision: 0, items: [{ productId: 'erp-101', seriesCount }] }), code('CUSTOMER_CATALOG_CART_INVALID'));
  await assert.rejects(f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 1, unitPrice: 1 }] }), code('CUSTOMER_CATALOG_CART_INVALID'));
  await assert.rejects(f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-999', seriesCount: 1 }] }), code('CUSTOMER_CATALOG_CART_INVALID'));
  await assert.rejects(f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 11 }] }), code('CUSTOMER_CATALOG_STOCK_LIMIT'));
  f.rows['erp-101'].stockQuantity = 11;
  await assert.rejects(f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] }), code('CUSTOMER_CATALOG_STOCK_LIMIT'));
  await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 1 }] });
  await assert.rejects(f.service.updateCart(f.token, { revision: 0, items: [] }), code('CUSTOMER_CATALOG_REVISION_CONFLICT'));
  assert.equal((await f.service.session(f.token)).cart.pieceCount, 6);
});

test('unknown actual series and stock composition are viewable but never selectable', async t => {
  const config = configuration(); config.products[0].series = null; config.products[1].series.stockCompositionVerified = false;
  const f = await fixture(t, { config });
  const result = await f.service.session(f.token);
  assert.equal(result.products[0].series.verified, false); assert.equal(result.products[0].selectable, false);
  assert.equal(result.products[1].selectable, false); assert.equal(result.products[1].blockReason, 'SERIES_STOCK_UNVERIFIED');
  await assert.rejects(f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 1 }] }), code('CUSTOMER_CATALOG_SERIES_UNVERIFIED'));
});

test('owner authorized synthetic series overlay is explicit TEST truth and has independent fixture capacity', async t => {
  const config = configuration(); config.testSeriesOverlay = true;
  for (const product of config.products) Object.assign(product.series, { isTestExample: true, stockCompositionVerified: false, testAvailableSeries: 3 });
  const f = await fixture(t, { config }), result = await f.service.session(f.token);
  assert(result.products.every(product => product.selectable && product.series.isTestExample && product.testStockOnly && product.maxSeries === 3));
  await assert.rejects(f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 4 }] }), code('CUSTOMER_CATALOG_STOCK_LIMIT'));
  config.testSeriesOverlay = false;
  assert.throws(() => createCustomerCatalogService({ config }), code('CUSTOMER_CATALOG_CONFIG_INVALID'));
});

test('recommended, text, type, age, color and unit-price filters operate on allowed pilot products', async t => {
  const f = await fixture(t);
  assert.deepEqual((await f.service.products(f.token, { scope: 'recommended' })).products.map(product => product.id), ['erp-101']);
  for (const query of [{ search: 'tulum' }, { type: 'Tulum' }, { color: 'Krem' }]) assert.deepEqual((await f.service.products(f.token, query)).products.map(product => product.id), ['erp-102']);
  assert.equal((await f.service.products(f.token, { age: '3–12 ay' })).products.length, 2);
  assert.deepEqual((await f.service.products(f.token, { maxPrice: '110' })).products.map(product => product.id), ['erp-101']);
  assert.deepEqual((await f.service.products(f.token, { maxPrice: '90' })).products, []);
  for (const query of [{ maxPrice: '-1' }, { scope: 'private' }, { customerId: '1' }]) await assert.rejects(f.service.products(f.token, query), code('CUSTOMER_CATALOG_FILTER_INVALID'));
});

test('each bearer capability isolates its cart, staff identity and revoked/expired session', async t => {
  const f = await fixture(t), second = await f.issue(), secondToken = second.url.split('#')[1];
  await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
  assert.equal((await f.service.session(secondToken)).cart.items.length, 0);
  await assert.rejects(f.service.issue({ id: 'other', permissions: ['crm.send'] }, { conversationId: '55' }), code('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED'));
  await assert.rejects(f.service.issue(actor, { conversationId: '56' }), code('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED'));
  await assert.rejects(f.service.staffRead({ id: 'other', permissions: ['crm.send'] }, f.minted.sessionId), code('CUSTOMER_CATALOG_STAFF_SCOPE_REQUIRED'));
  await f.service.revoke(actor, f.minted.sessionId);
  await assert.rejects(f.service.session(f.token), code('CUSTOMER_CATALOG_SESSION_INVALID'));
  await assert.rejects(f.service.session('x'.repeat(43)), code('CUSTOMER_CATALOG_SESSION_INVALID'));
  f.advance(86400001); await assert.rejects(f.service.session(secondToken), code('CUSTOMER_CATALOG_SESSION_INVALID'));
});

test('restart preserves cart and request id; separate ERP readback proves one test draft', async t => {
  const f = await fixture(t);
  await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }, { productId: 'erp-102', seriesCount: 1 }] });
  const restarted = createCustomerCatalogService(f.options);
  assert.equal((await restarted.session(f.token)).cart.productTotal, 1680);
  const order = await restarted.submitOrder(f.token, { revision: 1 });
  assert.equal(order.verifiedReadback, true); assert.equal(order.status, 'test-draft'); assert.equal(order.summary.productTotal, 1680);
  assert.equal(f.creates.length, 1); assert.deepEqual(f.creates[0].items.map(item => item.quantity), [12, 4]);
  assert.equal((await restarted.submitOrder(f.token, { revision: 1 })).requestId, order.requestId);
  assert.equal(f.creates.length, 1);
  assert.equal((await createCustomerCatalogService(f.options).order(f.token)).requestId, order.requestId);
  await assert.rejects(restarted.updateCart(f.token, { revision: 1, items: [] }), code('CUSTOMER_CATALOG_ORDER_LOCKED'));
});

test('unknown transport result locks immutable intent and recovers readback without another create', async t => {
  const f = await fixture(t), create = f.options.createDraft;
  f.options.createDraft = async input => { await create(input); throw Error('synthetic lost response'); };
  const service = createCustomerCatalogService(f.options);
  await service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 1 }] });
  await assert.rejects(service.submitOrder(f.token, { revision: 1 }));
  await assert.rejects(service.updateCart(f.token, { revision: 1, items: [] }), code('CUSTOMER_CATALOG_ORDER_LOCKED'));
  const order = await createCustomerCatalogService(f.options).submitOrder(f.token, { revision: 1 });
  assert.equal(order.verifiedReadback, true); assert.equal(f.creates.length, 1);
});

test('first intent rejected by changed source before transport unlocks a fresh cart and confirmation', async t => {
  for (const change of ['stock', 'price']) {
    const f = await fixture(t), originalRead = f.options.readDraft;
    let changeBeforeFirstTransport = true;
    f.options.readDraft = async (...args) => {
      if (changeBeforeFirstTransport) {
        changeBeforeFirstTransport = false;
        if (change === 'stock') f.rows['erp-101'].stockQuantity = 6;
        else f.rows['erp-101'].salePrices[0].priceExact = '105.00000000';
      }
      return originalRead(...args);
    };
    const service = createCustomerCatalogService(f.options);
    await service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
    await assert.rejects(service.submitOrder(f.token, { revision: 1 }),
      code(change === 'stock' ? 'CUSTOMER_CATALOG_STOCK_LIMIT' : 'CUSTOMER_CATALOG_PRICE_CHANGED'));
    assert.equal(f.creates.length, 0);
    assert.equal(JSON.parse(await readFile(f.storeFile, 'utf8')).sessions[0].pending, null);
    await assert.rejects(service.submitOrder(f.token, { revision: 1 }),
      code(change === 'stock' ? 'CUSTOMER_CATALOG_STOCK_LIMIT' : 'CUSTOMER_CATALOG_PRICE_CHANGED'));
    const restarted = createCustomerCatalogService(f.options), fresh = await restarted.session(f.token);
    assert.equal(fresh.orderPending, false); assert.equal(fresh.cart.revision, 2);
    assert.equal(fresh.cart.items[0].seriesCount, 2);
    let revision = fresh.cart.revision;
    if (change === 'stock') {
      assert.equal(fresh.cart.valid, false);
      const reduced = await restarted.updateCart(f.token, { revision, items: [{ productId: 'erp-101', seriesCount: 1 }] });
      assert.equal(reduced.valid, true); revision = reduced.revision;
    } else assert.equal(fresh.cart.productTotalExact, '1260.00000000');
    await assert.rejects(restarted.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_REVISION_CONFLICT'));
    assert.equal((await restarted.submitOrder(f.token, { revision })).verifiedReadback, true);
    assert.equal(f.creates.length, 1);
  }
});

test('explicit first adapter pretransport rejection releases intent but requires a fresh priced revision', async t => {
  const f = await fixture(t), create = f.options.createDraft;
  let firstRequestId, attempts = 0;
  f.options.createDraft = async input => {
    attempts++;
    if (attempts === 1) {
      firstRequestId = input.requestId;
      assert.equal(Object.hasOwn(input, 'transportStarted'), false);
      throw Object.assign(Error('synthetic preparation rejected'), { code: 'CUSTOMER_CATALOG_PRICE_CHANGED', statusCode: 409, beforeTransport: true });
    }
    return create(input);
  };
  const service = createCustomerCatalogService(f.options);
  await service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
  await assert.rejects(service.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_PRICE_CHANGED'));
  assert.equal(f.creates.length, 0);
  const restarted = createCustomerCatalogService(f.options), fresh = await restarted.session(f.token);
  assert.equal(fresh.orderPending, false); assert.equal(fresh.cart.revision, 2);
  assert.equal(fresh.cart.productTotalExact, '1200.00000000');
  await assert.rejects(restarted.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_REVISION_CONFLICT'));
  const order = await restarted.submitOrder(f.token, { revision: 2 });
  assert.notEqual(order.requestId, firstRequestId); assert.equal(f.creates.length, 1);
});

test('safe rejection on retry cannot release a prior unknown transport or an older journal lock', async t => {
  for (const legacy of [false, true]) {
    const f = await fixture(t); let attempts = 0;
    f.options.createDraft = async () => {
      attempts++;
      throw attempts === 1 ? Error('synthetic ambiguous transport')
        : Object.assign(Error('synthetic safe preparation rejection'), { code: 'CUSTOMER_CATALOG_PRICE_CHANGED', beforeTransport: true });
    };
    const service = createCustomerCatalogService(f.options);
    await service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
    await assert.rejects(service.submitOrder(f.token, { revision: 1 }));
    const stored = JSON.parse(await readFile(f.storeFile, 'utf8')), requestId = stored.sessions[0].pending.requestId;
    assert.equal(stored.sessions[0].pending.transportStarted, true);
    if (legacy) {
      delete stored.sessions[0].pending.transportStarted;
      await writeFile(f.storeFile, JSON.stringify(stored), 'utf8');
    }
    const restarted = createCustomerCatalogService(f.options);
    await assert.rejects(restarted.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_PRICE_CHANGED'));
    assert.equal(JSON.parse(await readFile(f.storeFile, 'utf8')).sessions[0].pending.requestId, requestId);
    assert.equal((await restarted.session(f.token)).orderPending, true);
    await assert.rejects(restarted.updateCart(f.token, { revision: 1, items: [] }), code('CUSTOMER_CATALOG_ORDER_LOCKED'));
    assert.equal(attempts, 2); assert.equal(f.creates.length, 0);
  }
});

test('pending retry with missing receipt rechecks stock and exact source without another POST or new intent', async t => {
  const f = await fixture(t), create = f.options.createDraft; let attempts = 0, firstIntent;
  f.options.createDraft = async input => {
    attempts++;
    if (attempts === 1) { firstIntent = structuredClone(input); throw Error('synthetic transport failed before acceptance'); }
    assert.equal(input.requestId, firstIntent.requestId); assert.deepEqual(input.items, firstIntent.items);
    return create(input);
  };
  const service = createCustomerCatalogService(f.options);
  await service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
  await assert.rejects(service.submitOrder(f.token, { revision: 1 }));
  f.rows['erp-101'].stockQuantity = 6;
  await assert.rejects(service.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_STOCK_LIMIT'));
  assert.equal(attempts, 1); assert.equal(f.creates.length, 0);
  f.rows['erp-101'].stockQuantity = 60; f.rows['erp-101'].salePrices[0].priceExact = '100.00000001';
  await assert.rejects(service.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_PRICE_CHANGED'));
  assert.equal(attempts, 1); assert.equal(f.creates.length, 0);
  f.rows['erp-101'].salePrices[0].priceExact = '100.00000000';
  const order = await service.submitOrder(f.token, { revision: 1 });
  assert.equal(order.requestId, firstIntent.requestId); assert.equal(attempts, 2); assert.equal(f.creates.length, 1);
  f.rows['erp-101'].stockQuantity = 0; f.rows['erp-101'].salePrices[0].priceExact = '105.00000000';
  assert.equal((await service.submitOrder(f.token, { revision: 1 })).requestId, order.requestId);
  assert.equal((await service.order(f.token)).requestId, order.requestId); assert.equal(attempts, 2);
});

test('readback with effects, different customer, amount or line never counts as verified', async t => {
  for (const mutation of [receipt => { receipt.stockEffect = true; }, receipt => { receipt.collectionEffect = true; },
    receipt => { receipt.customerId = 594; }, receipt => { receipt.productTotalExact = '1.00000000'; },
    receipt => { receipt.items[0].quantity++; }]) {
    const f = await fixture(t), originalRead = f.options.readDraft;
    f.options.readDraft = async id => { const receipt = await originalRead(id); if (receipt) mutation(receipt); return receipt; };
    const service = createCustomerCatalogService(f.options);
    await service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 1 }] });
    await assert.rejects(service.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_DRAFT_READBACK_MISMATCH'));
  }
});

test('native four-place unit rounding stays exact through series multiplication and source8 draft contract', async t => {
  const f = await fixture(t); f.rows['erp-101'].salePrices[0].priceExact = '100.12345678';
  const cart = await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
  assert.equal(cart.items[0].unitPriceExact, '100.12350000'); assert.equal(cart.productTotalExact, '1201.48200000');
  const order = await f.service.submitOrder(f.token, { revision: 1 }); assert.equal(order.verifiedReadback, true);
  assert.equal(f.creates[0].items[0].expectedPriceExact, '100.12345678');
});

test('ambiguous prices require explicit approved id/unit/source selection', async t => {
  const f = await fixture(t); f.rows['erp-101'].salePrices.push({ ...f.rows['erp-101'].salePrices[0], id: 500, priceExact: '90.00000000' });
  assert.equal((await f.service.session(f.token)).products[0].unitPrice, null);
  const config = configuration(); config.products[0].priceSelection = { priceId: 500, unitSourceId: 1, sourceKey: 'synthetic-price' };
  const service = createCustomerCatalogService({ ...f.options, config }), minted = await service.issue(actor, { conversationId: '55' });
  assert.equal((await service.session(minted.url.split('#')[1])).products[0].unitPrice, 90);
  await assert.rejects(service.session(f.token), code('CUSTOMER_CATALOG_SESSION_INVALID'));
});

test('price/source changes require a refreshed cart and another customer confirmation', async t => {
  const f = await fixture(t);
  await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }] });
  f.rows['erp-101'].salePrices[0].priceExact = '105.00000000';
  f.rows['erp-101'].revision = 'b'.repeat(64);
  await assert.rejects(f.service.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_PRICE_CHANGED'));
  assert.equal(f.creates.length, 0);
  const session = await f.service.session(f.token);
  assert.equal(session.cart.revision, 2); assert.equal(session.cart.productTotal, 1260);
  await assert.rejects(f.service.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_REVISION_CONFLICT'));
  const order = await f.service.submitOrder(f.token, { revision: 2 });
  assert.equal(order.summary.productTotal, 1260); assert.equal(f.creates.length, 1);
});

test('stock drop reopens the unchanged selection for gradual correction, never an invalid order', async t => {
  const f = await fixture(t);
  await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 5 }, { productId: 'erp-102', seriesCount: 1 }] });
  f.rows['erp-101'].stockQuantity = 12; f.rows['erp-101'].salePrices[0].priceExact = '105.00000000';
  await assert.rejects(f.service.submitOrder(f.token, { revision: 1 }), code('CUSTOMER_CATALOG_STOCK_LIMIT'));
  assert.equal(f.creates.length, 0);
  const opened = await createCustomerCatalogService(f.options).session(f.token);
  assert.equal(opened.cart.valid, false); assert.equal(opened.cart.items[0].seriesCount, 5);
  assert.equal(opened.cart.revision, 2); assert.equal(opened.cart.productTotalExact, '3630.00000000');
  assert.deepEqual(opened.cart.validationErrors, [{ productId: 'erp-101', code: 'STOCK_LIMIT', requestedSeries: 5, maxSeries: 2 }]);
  const service = createCustomerCatalogService(f.options);
  await assert.rejects(service.updateCart(f.token, { revision: 2, items: [{ productId: 'erp-101', seriesCount: 6 }] }), code('CUSTOMER_CATALOG_STOCK_LIMIT'));
  const partial = await service.updateCart(f.token, { revision: 2, items: [{ productId: 'erp-101', seriesCount: 4 }, { productId: 'erp-102', seriesCount: 1 }] });
  assert.equal(partial.valid, false); assert.equal(partial.revision, 3);
  await assert.rejects(service.submitOrder(f.token, { revision: 3 }), code('CUSTOMER_CATALOG_STOCK_LIMIT'));
  assert.equal(f.creates.length, 0);
  const corrected = await service.updateCart(f.token, { revision: 3, items: [{ productId: 'erp-101', seriesCount: 2 }, { productId: 'erp-102', seriesCount: 1 }] });
  assert.equal(corrected.valid, true); assert.deepEqual(corrected.validationErrors, []);
  assert.equal(corrected.productTotalExact, '1740.00000000');
  await assert.rejects(service.submitOrder(f.token, { revision: 3 }), code('CUSTOMER_CATALOG_REVISION_CONFLICT'));
  assert.equal((await service.submitOrder(f.token, { revision: 4 })).summary.productTotalExact, '1740.00000000');
  assert.equal(f.creates.length, 1);
});

test('zero or unverified stock still permits removal without losing other model selections', async t => {
  for (const stockQuantity of [0, null]) {
    const f = await fixture(t);
    await f.service.updateCart(f.token, { revision: 0, items: [{ productId: 'erp-101', seriesCount: 2 }, { productId: 'erp-102', seriesCount: 1 }] });
    f.rows['erp-101'].stockQuantity = stockQuantity;
    const opened = await f.service.session(f.token);
    assert.equal(opened.cart.valid, false); assert.equal(opened.cart.items[0].seriesCount, 2);
    assert.equal(opened.products[0].selectable, false);
    const cart = await f.service.updateCart(f.token, { revision: opened.cart.revision, items: [{ productId: 'erp-102', seriesCount: 1 }] });
    assert.equal(cart.valid, true); assert.equal(cart.items.length, 1); assert.equal(cart.items[0].productId, 'erp-102');
    assert.equal(cart.productTotalExact, '480.00000000');
  }
});

test('scope and freshness changes fail closed before customer receives source data', async t => {
  const f = await fixture(t), read = f.options.readProduct;
  const service = createCustomerCatalogService({ ...f.options, readProduct: async (...args) => { const result = await read(...args); f.denyScope(); return result; } });
  await assert.rejects(service.session(f.token), code('CUSTOMER_CATALOG_SCOPE_UNAVAILABLE'));
  const bad = await fixture(t), stale = bad.options.readProduct;
  const staleService = createCustomerCatalogService({ ...bad.options, readProduct: async (...args) => {
    const result = await stale(...args); result.meta.fetchedAt = new Date(CLOCK - 300001).toISOString(); return result;
  } });
  await assert.rejects(staleService.session(bad.token), code('CUSTOMER_CATALOG_SOURCE_UNAVAILABLE'));
});

test('photo route reuses authorized source only and validates bytes without private URLs', async t => {
  const f = await fixture(t), photo = await f.service.photo(f.token, 'erp-101');
  assert.equal(photo.headers.get('content-type'), 'image/jpeg'); assert.equal((await photo.arrayBuffer()).byteLength, 4);
  await assert.rejects(f.service.photo(f.token, 'erp-999'), code('CUSTOMER_CATALOG_NOT_FOUND'));
  const invalid = createCustomerCatalogService({ ...f.options, readPhoto: async () => new Response('private HTML', { headers: { 'content-type': 'image/jpeg' } }) });
  await assert.rejects(invalid.photo(f.token, 'erp-101'), code('CUSTOMER_CATALOG_PHOTO_UNAVAILABLE'));
});

test('HTTP boundary refuses token query/path, cross-origin writes, duplicates and oversize input', async t => {
  const f = await fixture(t), handler = createCustomerCatalogHandler({ service: f.service, authorizeStaff: async () => actor });
  const invoke = (url, method = 'GET', input, headers = {}) => handler(new Request(`http://127.0.0.1${url}`, { method,
    headers: { authorization: `Bearer ${f.token}`, ...headers }, ...(input !== undefined ? { body: typeof input === 'string' ? input : JSON.stringify(input) } : {}) }));
  assert.equal((await invoke('/customer-catalog/session')).status, 200);
  assert.equal((await invoke('/customer-catalog/session?token=secret')).status, 400);
  assert.equal((await invoke('/customer-catalog/products?scope=all&scope=recommended')).status, 400);
  assert.equal((await invoke('/customer-catalog/cart', 'PUT', { revision: 0, items: [] }, { origin: 'https://untrusted.invalid' })).status, 403);
  assert.equal((await invoke('/customer-catalog/cart', 'PUT', 'x'.repeat(65537))).status, 413);
  assert.equal((await invoke('/customer-catalog/session', 'GET', undefined, { authorization: '' })).status, 401);
  assert.equal((await invoke('/customer-catalog/' + f.token)).status, 404);
  const minted = await invoke('/crm/customer-catalog/sessions', 'POST', { conversationId: '55' });
  assert.equal(minted.status, 201); assert.equal((await minted.json()).data.testOnly, true);
});

test('malformed persistent journal is rejected instead of silently resetting customer selections', async t => {
  const f = await fixture(t); await writeFile(f.storeFile, '{malformed', 'utf8');
  await assert.rejects(createCustomerCatalogService(f.options).session(f.token), code('CUSTOMER_CATALOG_STORE_UNAVAILABLE'));
  assert.equal(await readFile(f.storeFile, 'utf8'), '{malformed');
});
