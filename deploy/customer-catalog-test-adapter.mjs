import { createHash } from 'node:crypto';
import { resolveTestEndpoints, sharedTestHealthSafe } from './test-endpoints.mjs';
import { nativeOrderPayload, validateNativeReceipt, validateNativeSource } from '../apps/frontend/src/lib/nativeOrder.js';

const fail = (code, statusCode = 503) => { throw Object.assign(new Error(code), { code, statusCode }); };
const same = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left).sort(), other = Object.keys(right).sort();
  return keys.length === other.length && keys.every((key, index) => key === other[index] && same(left[key], right[key]));
};
const exact4 = value => value + '0000';

/** Reuses the existing authenticated catalog and isolated native draft contracts.
 * All credentials are supplied in memory by the current operator, never stored
 * with a customer capability. No SQL, provider send or automatic AI is opened.
 */
export function createCustomerCatalogTestAdapter({ profile, endpoints = resolveTestEndpoints(),
  getCrmAuthorization, getErpAuthorization, verifyActor, readConversation, transport = fetch } = {}) {
  if (!endpoints.isolated || endpoints.ui !== 62600 || endpoints.database !== 'MELISA_ERP_CRM_SHARED_TEST_20261009_01'
      || !profile || !/^[a-f0-9]{40}$/.test(profile.nativeSourceCommit || '')
      || typeof profile.nativePackageId !== 'string' || !profile.nativePackageId
      || typeof profile.erpActorId !== 'string' || !/^[1-9]\d*$/.test(profile.erpActorId)
      || !/^[1-9]\d{7,14}$/.test(profile.peer || '') || !profile.customerMatch || !Array.isArray(profile.prices)
      || [getCrmAuthorization, getErpAuthorization, verifyActor, readConversation, transport].some(fn => typeof fn !== 'function')) {
    fail('CUSTOMER_CATALOG_TEST_PROFILE_REQUIRED');
  }
  validateNativeSource(profile.expectedSource);
  const prices = new Map(profile.prices.map(price => [price.productId, price]));
  if (prices.size !== profile.prices.length) fail('CUSTOMER_CATALOG_TEST_PROFILE_REQUIRED');
  const request = async (origin, pathname, options = {}) => {
    let response;
    try { response = await transport(new URL(pathname, origin), { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(45000), ...options }); }
    catch { fail('CUSTOMER_CATALOG_UPSTREAM_UNAVAILABLE'); }
    if (response.status === 404) fail('CUSTOMER_CATALOG_NOT_FOUND', 404);
    let payload;
    try { payload = await response.json(); } catch { fail('CUSTOMER_CATALOG_UPSTREAM_INVALID'); }
    if (!response.ok || payload?.success === false) fail(response.status === 404 ? 'CUSTOMER_CATALOG_NOT_FOUND' : 'CUSTOMER_CATALOG_UPSTREAM_REJECTED', response.status === 404 ? 404 : 503);
    return payload?.data ?? payload;
  };
  async function identity() {
    const health = await request(endpoints.nativeOrigin, '/test-health');
    if (!health.ok || !sharedTestHealthSafe(health) || health.database !== endpoints.database || health.port !== endpoints.native
        || health.purpose !== 'crm-order-draft-only' || health.sourceCommit !== profile.nativeSourceCommit
        || health.packageId !== profile.nativePackageId || ['stockEffect', 'ledgerEffect', 'reservationEffect'].some(key => health[key] !== false)) {
      fail('CUSTOMER_CATALOG_TEST_IDENTITY_MISMATCH');
    }
  }
  async function verifyScope(scope) {
    const user = await verifyActor(scope);
    if (!user || String(user.id) !== String(scope.actorId) || !['patron', 'mudur'].includes(user.role)
        || !user.permissions?.includes('crm.manage') || !user.permissions.includes('crm.send')) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED', 403);
    const conversation = await readConversation(scope, user);
    if (String(conversation?.id) !== String(scope.conversationId)
        || String(conversation?.phone || '').replace(/\D/g, '') !== profile.peer) fail('CUSTOMER_CATALOG_PEER_MISMATCH', 403);
    await identity();
    return true;
  }
  async function headers(scope, erp = false) {
    await verifyScope(scope);
    const authorization = await getCrmAuthorization(scope);
    if (!/^Bearer [^\s]+$/.test(authorization || '')) fail('CUSTOMER_CATALOG_OPERATOR_REQUIRED', 401);
    if (!erp) return { authorization, 'x-crm-conversation-id': String(scope.conversationId) };
    const erpAuthorization = await getErpAuthorization(scope);
    if (!/^Bearer [^\s]+$/.test(erpAuthorization || '')) fail('CUSTOMER_CATALOG_ERP_LOGIN_REQUIRED', 401);
    const actor = await request(endpoints.erpOrigin, '/api/auth/me', { headers: { authorization: erpAuthorization } });
    const user = actor.user ?? actor;
    if (String(user.id) !== profile.erpActorId || !user.permissions?.includes('sales.create')) fail('CUSTOMER_CATALOG_ERP_OPERATOR_MISMATCH', 403);
    return { authorization, 'x-erp-token': erpAuthorization.slice(7) };
  }
  async function readProduct(productId, scope) {
    const selected = prices.get(productId);
    if (!selected) fail('CUSTOMER_CATALOG_PRODUCT_FORBIDDEN', 403);
    const response = await transport(new URL('/crm/catalog/products/' + productId, endpoints.gatewayOrigin), {
      headers: await headers(scope), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    let payload;
    try { payload = await response.json(); } catch { fail('CUSTOMER_CATALOG_PRODUCT_INVALID'); }
    const row = payload?.data;
    const candidates = row?.salePrices?.filter(price => String(price.id) === String(selected.priceId) && price.tier === 1
      && price.isMainUnit === true && price.currency === selected.currency && String(price.unitSourceId) === String(selected.unitSourceId)
      && price.sourceKey === selected.priceSourceKey);
    if (!response.ok || payload?.success !== true || row?.id !== productId || row?.status !== 'active'
        || row.hold?.blocked !== false || candidates?.length !== 1 || !/^(?:0|[1-9]\d*)\.\d{8}$/.test(candidates[0].priceExact || '')
        || Number(candidates[0].priceExact) <= 0) fail('CUSTOMER_CATALOG_PRICE_UNVERIFIED');
    const price = candidates[0];
    return { ...payload, data: { ...row, salePrice: Number(price.priceExact), priceExact: price.priceExact,
      currency: price.currency, priceStatus: 'recorded', priceBasis: 'per-item', priceBasisStatus: 'user-confirmed',
      priceSourceKey: price.sourceKey, revision: createHash('sha256').update(JSON.stringify([row.revision, selected])).digest('hex') } };
  }
  async function readPhoto(productId, scope) {
    await readProduct(productId, scope);
    return transport(new URL('/crm/catalog/products/' + productId + '/photo', endpoints.gatewayOrigin), {
      headers: await headers(scope), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
  }
  async function normalizedReceipt(receipt, scope) {
    const body = receipt?.request;
    if (!body || String(body.customerId) !== String(scope.customerId) || body.conversationId !== String(scope.conversationId)
        || body.peer !== profile.peer || body.documentCurrency !== 'TRY' || body.exchangeRateExact8 !== '1.00000000'
        || !same(body.customerMatch, profile.customerMatch) || !Array.isArray(body.items) || body.items.some(item => {
          const selected = prices.get('erp-' + item.productId);
          return !selected || Number(item.priceId) !== Number(selected.priceId)
            || Number(item.unitSourceId) !== Number(selected.unitSourceId) || item.priceSourceKey !== selected.priceSourceKey
            || item.currency !== selected.currency;
        })) {
      fail('CUSTOMER_CATALOG_RECEIPT_SCOPE_MISMATCH');
    }
    validateNativeReceipt(receipt, body, profile.expectedSource);
    return { requestId: body.requestId, id: receipt.id, customerId: String(body.customerId), conversationId: body.conversationId,
      status: 'draft', items: receipt.items.map(row => ({ productId: 'erp-' + row.productId, quantity: row.quantity,
        unitPriceExact: exact4(row.unitPriceExact4), currency: row.currency })),
      productTotalExact: exact4(receipt.grandTotalExact4), currency: body.documentCurrency,
      stockEffect: false, ledgerEffect: false, collectionEffect: false, reservationEffect: false };
  }
  async function readDraft(requestId, scope) {
    try {
      const receipt = await request(endpoints.ordersOrigin || `http://127.0.0.1:${endpoints.orders}`,
        '/crm/erp/v2/drafts/' + requestId, { headers: await headers(scope, true) });
      return normalizedReceipt(receipt, scope);
    } catch (error) {
      if (error?.code === 'CUSTOMER_CATALOG_NOT_FOUND' && error.statusCode === 404) return null;
      throw error;
    }
  }
  async function prepareDraft({ scope, requestId, items }) {
    const auth = await headers(scope, true);
    const query = new URLSearchParams({ conversationId: String(scope.conversationId), phone: profile.peer, search: profile.customerCode || '' });
    const customerResult = await request(`http://127.0.0.1:${endpoints.orders}`, '/crm/erp/v2/customers?' + query, { headers: auth });
    validateNativeSource(customerResult.currentSource);
    const customer = customerResult.entries?.find(row => String(row.id) === String(scope.customerId));
    if (!customer || customer.blocked || customer.currency !== 'TRY' || customer.revision !== profile.customerMatch.revision
        || !same(customerResult.currentSource, profile.expectedSource)
        || profile.customerMatch.basis === 'exact-phone' && (customerResult.status !== 'matched' || customer.exactPhoneMatch !== true)) {
      fail('CUSTOMER_CATALOG_CUSTOMER_MAPPING_CHANGED');
    }
    const rows = [];
    for (const item of items) {
      const product = (await readProduct(item.productId, scope)).data, selected = prices.get(item.productId);
      if (product.revision !== item.expectedRevision || product.priceExact !== item.expectedPriceExact || product.currency !== item.expectedCurrency) {
        fail('CUSTOMER_CATALOG_PRICE_CHANGED', 409);
      }
      rows.push({ productId: product.erpProductId, stockCode: product.stockCode, priceId: Number(selected.priceId),
        unitSourceId: Number(selected.unitSourceId), currency: product.currency, priceExact: product.priceExact,
        priceSourceKey: selected.priceSourceKey });
    }
    const payload = nativeOrderPayload(requestId, { id: scope.conversationId, phone: profile.peer }, customer,
      profile.customerMatch, rows, items.map(item => item.quantity), '1.00000000');
    return { auth, payload };
  }
  async function createDraft(input) {
    let prepared;
    try { prepared = await prepareDraft(input); }
    catch (error) {
      // All calls above are reads/authentication. No native draft POST has begun.
      error.beforeTransport = true;
      throw error;
    }
    const { auth, payload } = prepared;
    await request(`http://127.0.0.1:${endpoints.orders}`, '/crm/erp/v2/drafts', {
      method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    // POST acceptance is insufficient: only the independently fetched receipt is returned.
    return readDraft(input.requestId, input.scope);
  }
  return { readProduct, readPhoto, createDraft, readDraft, verifyScope };
}
