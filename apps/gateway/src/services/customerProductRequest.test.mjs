import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import test from 'node:test';
import { createCustomerProductRequestService } from './customerProductRequest.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const PRODUCT = { id: 'vega-8023', stockCode: '8023 CONCEPT', productName: 'TAKIM', active: true, category: 'TAKIM',
  photoStatus: 'guarded-path', photoPath: '/crm/catalog/products/vega-8023/photo', salePrice: 15.78, currency: 'USD', stockQuantity: 0 };
const second = { ...PRODUCT, id: 'vega-41140', stockCode: '41140', productName: 'SÜPERMİNİ', photoPath: '/crm/catalog/products/vega-41140/photo' };
function fakeBinding(id = '55') {
  return { backend: 'chatwoot', provider: 'chatwoot', accountId: '1', inboxId: '2', chatwootConversationId: id,
    chatwootContactId: id === '55' ? '101' : '102', assigneeId: '2', customerFingerprint: hash(`fixture-customer-${id}`) };
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crm-customer-request-fixture-'));
  const file = path.join(directory, 'requests.json'), current = { time: 1800000000000, binding: fakeBinding(), valid: true };
  const config = { enabled: true, isolatedPreparation: true, database: 'MELISA_ERP_CRM_SHARED_TEST_20261009_02', catalogScope: 'existing-photo-catalog-v1' };
  const actor = { id: 'normal-manager-fixture', role: 'patron', active: true, permissions: ['crm.view', 'crm.manage'],
    normalSessionId: randomUUID(), fingerprint: hash('fixture-normal-authority'), expiresAt: current.time + 7200000 };
  const products = [PRODUCT, second];
  const dependencies = { config, storeFile: file, now: () => current.time,
    resolveBinding: async (who, id) => {
      if (!who.active || !who.permissions.includes('crm.view') || who.role === 'personel' && who.chatwootAgentId !== Number(current.binding.assigneeId)) throw Object.assign(Error('denied'), { code: 'CUSTOMER_REQUEST_FORBIDDEN', statusCode: 403 });
      return id === '55' ? { ...current.binding } : fakeBinding(String(id));
    },
    validateBinding: async (binding, issuer) => current.valid && issuer.normalSessionId === actor.normalSessionId && issuer.fingerprint === actor.fingerprint
      && (binding.chatwootConversationId === '55' ? Object.keys(current.binding).every(key => binding[key] === current.binding[key]) : true),
    readProduct: async id => ({ success: true, data: products.find(product => product.id === id), meta: { sourceDatabaseVerified: true, cached: false } }),
    readCatalogPage: async query => {
      const matching = products.filter(product => !query.search || `${product.stockCode} ${product.productName}`.toLocaleLowerCase('tr-TR').includes(query.search.toLocaleLowerCase('tr-TR')))
        .filter(product => !query.category || product.category === query.category);
      return { success: true, data: matching.slice((query.page - 1) * query.limit, query.page * query.limit), meta: { sourceDatabaseVerified: true, cached: false,
        page: query.page, limit: query.limit, total: matching.length, totalPages: Math.max(1, Math.ceil(matching.length / query.limit)), hasNextPage: query.page < Math.max(1, Math.ceil(matching.length / query.limit)), facets: { categories: [{ value: 'TAKIM', count: matching.length || 1 }] } } };
    },
    readPhoto: async () => ({ mime: 'image/jpeg', bytes: Uint8Array.from([255, 216, 255, ...Array(21).fill(0)]) }),
  };
  const service = createCustomerProductRequestService(dependencies);
  return { directory, file, current, config, actor, products, dependencies, service, dispose: () => rm(directory, { recursive: true, force: true }) };
}
const code = expected => error => error.code === expected;
async function selected(f, items = [{ productId: PRODUCT.id, quantity: 2 }]) {
  const grant = await f.service.issue(f.actor, { conversationId: '55' });
  const draft = await f.service.saveDraft(grant.capability, { revision: 0, items });
  return { grant, draft };
}

test('customer interest flow uses genuine external namespace, safe real facts and no price/stock promise', async () => {
  const f = await fixture();
  try {
    const grant = await f.service.issue(f.actor, { conversationId: '55' });
    const list = await f.service.products(grant.capability, { search: '8023', limit: '24' });
    assert.equal(list.data.length, 1); assert.equal(list.data[0].stockCode, PRODUCT.stockCode);
    for (const forbidden of ['salePrice', 'currency', 'stockQuantity', 'binding', 'issuer', 'phone']) assert.equal(list.data[0][forbidden], undefined);
    const one = await f.service.saveDraft(grant.capability, { revision: 0, items: [{ productId: PRODUCT.id, quantity: 2 }, { productId: second.id, quantity: 1 }] });
    assert.equal(one.draft.revision, 1);
    const corrected = await f.service.saveDraft(grant.capability, { revision: 1, items: [{ productId: PRODUCT.id, quantity: 5 }] });
    assert.equal(corrected.draft.revision, 2); assert.equal(corrected.draft.items[0].quantity, 5);
    const result = await f.service.submit(grant.capability, { revision: 2, operationId: randomUUID() });
    assert.equal(result.request.status, 'interest'); assert.equal(result.request.quantityTotal, 5); assert.equal(result.request.items.length, 1);
    const normalStaff = { id: 'assigned-fixture-personel', active: true, role: 'personel', permissions: ['crm.view'], chatwootAgentId: 2 };
    const staffList = await f.service.staffList(normalStaff, '55');
    assert.equal(staffList.length, 1); assert.equal(staffList[0].id, result.request.id); assert.equal(staffList[0].conversationId, '55');
    assert.deepEqual(await f.service.staffGet(normalStaff, result.request.id), staffList[0]);
    const onDisk = JSON.parse(await readFile(f.file, 'utf8'));
    assert.equal(onDisk.requests[0].binding.backend, 'chatwoot');
    assert.equal(onDisk.requests[0].binding.localConversationId, undefined);
    assert.equal(onDisk.sessions[0].tokenHash.length, 64); assert.equal((await readFile(f.file, 'utf8')).includes(grant.capability), false);
  } finally { await f.dispose(); }
});

test('reload and any repeated click on submitted session return one persistent request', async () => {
  const f = await fixture();
  try {
    const { grant, draft } = await selected(f), operationId = randomUUID();
    const first = await f.service.submit(grant.capability, { revision: draft.draft.revision, operationId });
    const restarted = createCustomerProductRequestService(f.dependencies);
    const second = await restarted.submit(grant.capability, { revision: draft.draft.revision, operationId });
    const doubleClick = await restarted.submit(grant.capability, { revision: draft.draft.revision, operationId: randomUUID() });
    assert.equal(first.request.id, second.request.id); assert.equal(first.request.id, doubleClick.request.id);
    assert.deepEqual((await restarted.session(grant.capability)).request, first.request);
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).requests.length, 1);
    await assert.rejects(restarted.submit(grant.capability, { revision: 0, operationId }), code('CUSTOMER_REQUEST_REVISION_CONFLICT'));
    await assert.rejects(restarted.saveDraft(grant.capability, { revision: 1, items: [] }), code('CUSTOMER_REQUEST_ALREADY_SUBMITTED'));
  } finally { await f.dispose(); }
});

test('simultaneous independent service instances preserve one durable submission', async () => {
  const f = await fixture();
  try {
    const { grant, draft } = await selected(f), operationId = randomUUID(), restarted = createCustomerProductRequestService(f.dependencies);
    const attempts = await Promise.allSettled([f.service.submit(grant.capability, { revision: draft.draft.revision, operationId }), restarted.submit(grant.capability, { revision: draft.draft.revision, operationId })]);
    assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
    assert.equal(attempts.find(value => value.status === 'rejected').reason.code, 'CUSTOMER_REQUEST_STORAGE_UNAVAILABLE');
    const retry = await restarted.submit(grant.capability, { revision: draft.draft.revision, operationId });
    assert.equal(retry.request.id, attempts.find(value => value.status === 'fulfilled').value.request.id);
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).requests.length, 1);
  } finally { await f.dispose(); }
});

test('customer body cannot choose identity, prices, role, arbitrary tuples or operation payload', async () => {
  const f = await fixture();
  try {
    const { grant } = await selected(f);
    for (const extra of ['phone', 'conversationId', 'contactId', 'price', 'role']) {
      await assert.rejects(f.service.saveDraft(grant.capability, { revision: 1, items: [], [extra]: 'tampered' }), code('CUSTOMER_REQUEST_DRAFT_INVALID'));
      await assert.rejects(f.service.submit(grant.capability, { revision: 1, operationId: randomUUID(), [extra]: 'tampered' }), code('CUSTOMER_REQUEST_SUBMIT_INVALID'));
    }
    for (const quantity of [0, -1, 1.5, '2', 10000]) await assert.rejects(f.service.saveDraft(grant.capability, { revision: 1, items: [{ productId: PRODUCT.id, quantity }] }), code('CUSTOMER_REQUEST_DRAFT_INVALID'));
    await assert.rejects(f.service.saveDraft(grant.capability, { revision: 1, items: [{ productId: PRODUCT.id, quantity: 1 }, { productId: PRODUCT.id, quantity: 1 }] }), code('CUSTOMER_REQUEST_DRAFT_INVALID'));
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).requests.length, 0);
  } finally { await f.dispose(); }
});

test('wrong token, expired issuer, revoked normal session and changed tuple all fail closed', async () => {
  const f = await fixture();
  try {
    const { grant } = await selected(f);
    await assert.rejects(f.service.session('A'.repeat(43)), code('CUSTOMER_REQUEST_SESSION_INVALID'));
    f.current.valid = false;
    await assert.rejects(f.service.submit(grant.capability, { revision: 1, operationId: randomUUID() }), code('CUSTOMER_REQUEST_SESSION_INVALID'));
    f.current.valid = true;
    for (const key of ['accountId', 'inboxId', 'chatwootConversationId', 'chatwootContactId', 'assigneeId', 'customerFingerprint']) {
      const previous = f.current.binding[key]; f.current.binding[key] = key === 'customerFingerprint' ? hash('wrong-customer') : '999';
      await assert.rejects(f.service.session(grant.capability), code('CUSTOMER_REQUEST_SESSION_INVALID')); f.current.binding[key] = previous;
    }
    f.current.time += 3600001;
    await assert.rejects(f.service.session(grant.capability), code('CUSTOMER_REQUEST_SESSION_INVALID'));
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).requests.length, 0);
  } finally { await f.dispose(); }
});

test('normal staff permissions and fresh assignment prevent other person or role reading and grant issuance', async () => {
  const f = await fixture();
  try {
    const { grant } = await selected(f), request = (await f.service.submit(grant.capability, { revision: 1, operationId: randomUUID() })).request;
    for (const actor of [
      { ...f.actor, permissions: [] }, { ...f.actor, role: 'customer' }, { ...f.actor, testAdmin: true }, { ...f.actor, testPersonnel: true },
      { id: 'other-fixture-personel', role: 'personel', active: true, permissions: ['crm.view'], chatwootAgentId: 3 },
    ]) {
      await assert.rejects(f.service.staffGet(actor, request.id), code('CUSTOMER_REQUEST_FORBIDDEN'));
      await assert.rejects(f.service.issue(actor, { conversationId: '55' }), code('CUSTOMER_REQUEST_FORBIDDEN'));
    }
    const foreign = await f.service.staffList(f.actor, '56'); assert.deepEqual(foreign, []);
    const noSid = { ...f.actor }; delete noSid.normalSessionId;
    await assert.rejects(f.service.issue(noSid, { conversationId: '55' }), code('CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED'));
    f.current.binding.assigneeId = '3';
    await assert.rejects(f.service.staffGet(f.actor, request.id), code('CUSTOMER_REQUEST_FORBIDDEN'));
  } finally { await f.dispose(); }
});

test('scope revoke is persistent, also during an in-flight read', async () => {
  const f = await fixture();
  try {
    const { grant } = await selected(f);
    const initial = f.dependencies.readCatalogPage;
    const reader = createCustomerProductRequestService({ ...f.dependencies, readCatalogPage: async query => {
      await f.service.revoke(f.actor, grant.sessionId); return initial(query);
    } });
    await assert.rejects(reader.products(grant.capability), code('CUSTOMER_REQUEST_SESSION_INVALID'));
    await assert.rejects(createCustomerProductRequestService(f.dependencies).session(grant.capability), code('CUSTOMER_REQUEST_SESSION_INVALID'));
  } finally { await f.dispose(); }
});

test('source identity, active photo product, original signature and bounded page are enforced', async () => {
  const f = await fixture();
  try {
    const grant = await f.service.issue(f.actor, { conversationId: '55' });
    const photo = await f.service.photo(grant.capability, PRODUCT.id); assert.equal(photo.mime, 'image/jpeg');
    for (const query of [{ hasImage: 'false' }, { limit: '51' }, { page: '0' }, { page: ['1', '2'] }, { search: 'x'.repeat(121) }]) await assert.rejects(f.service.products(grant.capability, query), code('CUSTOMER_REQUEST_QUERY_INVALID'));
    const badPhoto = createCustomerProductRequestService({ ...f.dependencies, readPhoto: async () => ({ mime: 'image/jpeg', bytes: new Uint8Array(20) }) });
    await assert.rejects(badPhoto.photo(grant.capability, PRODUCT.id), code('CUSTOMER_REQUEST_PHOTO_UNAVAILABLE'));
    for (const changed of [{ active: false }, { photoStatus: 'unavailable' }, { photoPath: 'https://foreign.invalid/photo' }]) {
      f.products[0] = { ...PRODUCT, ...changed };
      await assert.rejects(f.service.saveDraft(grant.capability, { revision: 0, items: [{ productId: PRODUCT.id, quantity: 1 }] }), code('CUSTOMER_REQUEST_PRODUCT_UNAVAILABLE'));
    }
    f.products[0] = PRODUCT;
    const unverified = createCustomerProductRequestService({ ...f.dependencies, readProduct: async () => ({ success: true, data: PRODUCT, meta: { sourceDatabaseVerified: false, cached: false } }) });
    await assert.rejects(unverified.photo(grant.capability, PRODUCT.id), code('CUSTOMER_REQUEST_SOURCE_UNAVAILABLE'));
  } finally { await f.dispose(); }
});

test('source facets preserve an unknown count as null without inventing product totals', async () => {
  const f = await fixture();
  try {
    const grant = await f.service.issue(f.actor, { conversationId: '55' }), original = f.dependencies.readCatalogPage;
    const service = createCustomerProductRequestService({ ...f.dependencies, readCatalogPage: async (...args) => {
      const payload = await original(...args); payload.meta.facets.categories[0].count = null; return payload;
    } });
    const page = await service.products(grant.capability);
    assert.equal(page.meta.categories[0].count, null); assert.equal(page.meta.total, 2); assert.equal(page.data.length, 2);
  } finally { await f.dispose(); }
});

test('last authority recheck rejects writes after assignment changes during source read', async () => {
  const f = await fixture();
  try {
    const { grant } = await selected(f), original = f.dependencies.readProduct;
    const mutating = createCustomerProductRequestService({ ...f.dependencies, readProduct: async id => { const row = await original(id); f.current.binding.assigneeId = '3'; return row; } });
    await assert.rejects(mutating.submit(grant.capability, { revision: 1, operationId: randomUUID() }), code('CUSTOMER_REQUEST_SESSION_INVALID'));
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).requests.length, 0);
  } finally { await f.dispose(); }
});

test('durable unique operation prevents reuse across different customer sessions', async () => {
  const f = await fixture();
  try {
    const first = await selected(f), second = await selected(f), operationId = randomUUID();
    await f.service.submit(first.grant.capability, { revision: 1, operationId });
    await assert.rejects(f.service.submit(second.grant.capability, { revision: 1, operationId: operationId.toUpperCase() }), code('CUSTOMER_REQUEST_OPERATION_CONFLICT'));
    assert.equal(JSON.parse(await readFile(f.file, 'utf8')).requests.length, 1);
  } finally { await f.dispose(); }
});

test('legacy numeric local mapping and partial conversation binding are rejected', async () => {
  const f = await fixture();
  try {
    for (const binding of [{ ...fakeBinding(), localConversationId: '55' }, { ...fakeBinding(), backend: 'postgres' }, { provider: 'chatwoot', chatwootConversationId: '55' }]) {
      const service = createCustomerProductRequestService({ ...f.dependencies, resolveBinding: async () => binding });
      await assert.rejects(service.issue(f.actor, { conversationId: '55' }), code('CUSTOMER_REQUEST_BINDING_UNAVAILABLE'));
    }
  } finally { await f.dispose(); }
});

test('persistent request corruption never leaks arbitrary payload or changes submitted quantity', async () => {
  const f = await fixture();
  try {
    const { grant } = await selected(f);
    await f.service.submit(grant.capability, { revision: 1, operationId: randomUUID() });
    const state = JSON.parse(await readFile(f.file, 'utf8'));
    state.requests[0].items[0].quantity = 9999;
    await writeFile(f.file, JSON.stringify(state));
    await assert.rejects(createCustomerProductRequestService(f.dependencies).session(grant.capability), code('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE'));
  } finally { await f.dispose(); }
});

test('default/LIVE, mutated config, corrupt store and lock fail closed without losing existing selection', async () => {
  const f = await fixture();
  try {
    assert.equal(createCustomerProductRequestService().isEnabled(), false);
    assert.throws(() => createCustomerProductRequestService({ ...f.dependencies, config: { ...f.config, live: true } }), code('CUSTOMER_REQUEST_CONFIG_INVALID'));
    assert.throws(() => createCustomerProductRequestService({ ...f.dependencies, config: { ...f.config, database: 'LIVE' } }), code('CUSTOMER_REQUEST_CONFIG_INVALID'));
    const { grant } = await selected(f), original = await readFile(f.file, 'utf8');
    await writeFile(`${f.file}.lock`, 'other-process');
    await assert.rejects(f.service.saveDraft(grant.capability, { revision: 1, items: [] }), code('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE'));
    assert.equal(await readFile(f.file, 'utf8'), original); await rm(`${f.file}.lock`);
    f.config.enabled = false;
    await assert.rejects(f.service.session(grant.capability), code('CUSTOMER_REQUEST_DISABLED')); f.config.enabled = true;
    await writeFile(f.file, '{broken');
    await assert.rejects(f.service.session(grant.capability), code('CUSTOMER_REQUEST_STORAGE_UNAVAILABLE'));
  } finally { await f.dispose(); }
});
