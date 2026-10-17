import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCustomerProductRequestService } from '../services/customerProductRequest.mjs';
import { createCustomerProductRequestRouter } from './customerProductRequestRoutes.mjs';

const ORIGIN = 'http://127.0.0.1:64200';
const hash = text => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'crm-customer-request-http-'));
  const actor = { id: 'fixture-manager', normalSessionId: randomUUID(), fingerprint: hash('fixture-manager'), expiresAt: Date.now() + 3600000,
    active: true, role: 'patron', permissions: ['crm.view', 'crm.manage'] };
  const binding = { backend: 'chatwoot', provider: 'chatwoot', accountId: '1', inboxId: '2', chatwootConversationId: '55',
    chatwootContactId: '101', assigneeId: '2', customerFingerprint: hash('fixture-contact') };
  const product = { id: 'vega-8023', stockCode: '8023 CONCEPT', productName: 'TAKIM', active: true,
    photoStatus: 'guarded-path', photoPath: '/crm/catalog/products/vega-8023/photo' };
  let verified = 0;
  const service = createCustomerProductRequestService({ config: { enabled: true, isolatedPreparation: true,
    database: 'MELISA_ERP_CRM_SHARED_TEST_20261009_02', catalogScope: 'fixture-photo-catalog' }, storeFile: path.join(folder, 'journal.json'),
    resolveBinding: async (who, id) => {
      if (id !== '55' || who.id !== actor.id) throw Object.assign(Error('denied'), { code: 'CUSTOMER_REQUEST_FORBIDDEN', statusCode: 403 });
      return binding;
    }, validateBinding: async () => true,
    readProduct: async id => ({ success: true, data: id === product.id ? product : null, meta: { sourceDatabaseVerified: true, cached: false } }),
    readCatalogPage: async query => ({ success: true, data: query.page === 1 ? [product] : [], meta: { sourceDatabaseVerified: true, cached: false,
      page: query.page, limit: query.limit, total: 1, totalPages: 1, hasNextPage: false, facets: { categories: [] } } }),
    readPhoto: async () => ({ bytes: Uint8Array.from([255, 216, 255, ...Array(20).fill(0)]), mime: 'image/jpeg' }),
  });
  const app = express(); app.use(express.json({ limit: '16kb' }));
  app.use('/api/live', createCustomerProductRequestRouter({ Router: express.Router, service, allowedOrigins: [ORIGIN], verifyStaff: async req => {
    verified++;
    if (req.get('authorization') !== 'Bearer normal-staff-fixture') throw Object.assign(Error('auth'), { code: 'AUTH_TOKEN_INVALID', statusCode: 401 });
    return actor;
  } }));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false, error: { code: error.code } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/live`;
  const call = (route, token, method = 'GET', body, origin = ORIGIN) => fetch(`${url}${route}`, { method, headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json', origin } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const issue = async () => {
    const response = await call('/crm/customer-product-requests/sessions', 'normal-staff-fixture', 'POST', { conversationId: '55' });
    assert.equal(response.status, 200); return (await response.json()).data;
  };
  return { call, issue, verified: () => verified, close: async () => { await new Promise(resolve => server.close(resolve)); await rm(folder, { recursive: true, force: true }); } };
}

test('actual HTTP customer selection/submit and scoped staff read are separate auth paths', async () => {
  const f = await fixture();
  try {
    const grant = await f.issue(), before = f.verified();
    const products = await f.call('/customer-product-requests/products?search=8023&limit=24', grant.capability);
    assert.equal(products.status, 200); assert.equal((await products.json()).data[0].stockCode, '8023 CONCEPT');
    const image = await f.call('/customer-product-requests/products/vega-8023/photo', grant.capability);
    assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/jpeg'); assert.equal(image.headers.get('cache-control'), 'no-store');
    const draft = await f.call('/customer-product-requests/draft', grant.capability, 'PUT', { revision: 0, items: [{ productId: 'vega-8023', quantity: 3 }] });
    assert.equal(draft.status, 200);
    const submitBody = { revision: (await draft.json()).data.draft.revision, operationId: randomUUID() };
    const submitted = await f.call('/customer-product-requests/submit', grant.capability, 'POST', submitBody);
    assert.equal(submitted.status, 200); const request = (await submitted.json()).data.request;
    assert.equal(request.quantityTotal, 3); assert.equal(f.verified(), before);
    const duplicate = await f.call('/customer-product-requests/submit', grant.capability, 'POST', submitBody);
    assert.equal((await duplicate.json()).data.request.id, request.id);
    const staff = await f.call(`/crm/customer-product-requests/${request.id}`, 'normal-staff-fixture');
    assert.equal(staff.status, 200); assert.equal((await staff.json()).data.id, request.id); assert.equal(f.verified(), before + 1);
    const noStaff = await f.call(`/crm/customer-product-requests/${request.id}`, grant.capability);
    assert.equal(noStaff.status, 401);
  } finally { await f.close(); }
});

test('HTTP boundary rejects origin changes, staff bearer at customer route, identity body and duplicate query', async () => {
  const f = await fixture();
  try {
    const grant = await f.issue();
    for (const origin of ['http://127.0.0.1:64201', 'http://foreign.invalid', 'null']) {
      const rejected = await f.call('/customer-product-requests/draft', grant.capability, 'PUT', { revision: 0, items: [] }, origin);
      assert.equal(rejected.status, 403); assert.equal((await rejected.json()).error.code, 'CUSTOMER_REQUEST_ORIGIN_REQUIRED');
    }
    const wrongAuth = await f.call('/customer-product-requests/session', 'normal-staff-fixture'); assert.equal(wrongAuth.status, 401);
    const wrongBody = await f.call('/customer-product-requests/draft', grant.capability, 'PUT', { revision: 0, items: [], conversationId: '99' });
    assert.equal(wrongBody.status, 400);
    const duplicate = await f.call('/customer-product-requests/products?page=1&page=2', grant.capability); assert.equal(duplicate.status, 400);
    const photoQuery = await f.call('/customer-product-requests/products/vega-8023/photo?url=https://foreign.invalid', grant.capability); assert.equal(photoQuery.status, 400);
    const scoped = await f.call('/crm/customer-product-requests?conversationId=99', 'normal-staff-fixture'); assert.equal(scoped.status, 403);
    const noCap = await f.call('/customer-product-requests/session'); assert.equal(noCap.status, 401);
  } finally { await f.close(); }
});
