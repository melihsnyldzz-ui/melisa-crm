import { createHash } from 'node:crypto';
import { salesError } from './policy.mjs';
import { validateRecordedSnapshot } from './recordedCatalog.mjs';

export const PERSONAL_CATALOG_ORIGIN = 'http://100.87.188.3:62600';
export const personalSessionId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = () => { throw salesError('AI_PERSONAL_CATALOG_INVALID', 502); };

export function validatePersonalRecordedSnapshot(input, now) {
  if (!input || !Array.isArray(input.products) || input.products.length > 30) invalid();
  const products = [];
  for (let i = 0; i < input.products.length; i += 8) products.push(...validateRecordedSnapshot({ ...input, products: input.products.slice(i, i + 8) }, now).products);
  if (new Set(products.map(p => p.id)).size !== products.length) invalid();
  return { products, facts: input.facts };
}

/** Only an authenticated staff GET can supply this snapshot; there is no global search fallback. */
export function createPersonalCatalogAdapter({ readSnapshot, sessionId, conversationId, actorId, assertAccess, signal, now = Date.now }) {
  let initial;
  const assertCurrent = () => {
    if (signal?.aborted) throw salesError('AI_SALES_CANCELLED', 499);
    assertAccess();
    if (initial && (Date.parse(initial.expiresAt) <= now() || now() - Date.parse(initial.fetchedAt) >= 300000)) throw salesError('AI_PERSONAL_CATALOG_EXPIRED', 409);
  };
  async function read() {
    assertCurrent();
    let response;
    try { response = await readSnapshot(new Request(`${PERSONAL_CATALOG_ORIGIN}/api/live/crm/customer-catalog/sessions/${sessionId}/sales-context`, { method: 'GET', ...(signal ? { signal } : {}) })); }
    catch { assertCurrent(); throw salesError('AI_PERSONAL_CATALOG_UNAVAILABLE', 502); }
    assertCurrent();
    if (!response.ok) {
      const codes = { 401: 'AI_PERSONAL_CATALOG_SESSION_INVALID', 403: 'AI_PERSONAL_CATALOG_FORBIDDEN', 404: 'AI_PERSONAL_CATALOG_SESSION_INVALID', 409: 'AI_PERSONAL_CATALOG_CHANGED' };
      throw salesError(codes[response.status] || 'AI_PERSONAL_CATALOG_UNAVAILABLE', codes[response.status] ? response.status : 502);
    }
    const payload = await response.json().catch(() => null), s = payload?.data;
    if (payload?.success !== true || !s || s.sessionId !== sessionId || s.conversationId !== String(conversationId)
      || s.actorId !== String(actorId) || !Number.isSafeInteger(s.customerId) || s.customerId < 1
      || s.source !== 'melisa-personal-test-catalog' || s.sourceEnvironment !== 'CANONICAL_TEST' || s.sourceDatabaseVerified !== true
      || s.testOnly !== true || s.readOnly !== true || s.orderPending !== false
      || !Number.isSafeInteger(s.revision) || s.revision < 0 || !Array.isArray(s.products) || s.products.length < 1 || s.products.length > 30
      || !s.cart || s.cart.valid !== true || s.cart.revision !== s.revision || !Array.isArray(s.cart.items)
      || !/^[a-f0-9]{64}$/.test(s.sourceFingerprint || '') || !/^[a-f0-9]{64}$/.test(s.configRevision || '')) invalid();
    const { fingerprint, fetchedAt, ...signed } = s;
    if (fingerprint !== hash(signed)) invalid();
    if (!Number.isFinite(Date.parse(fetchedAt)) || Date.parse(fetchedAt) > now() || now() - Date.parse(fetchedAt) >= 300000
      || !Number.isFinite(Date.parse(s.expiresAt)) || Date.parse(s.expiresAt) <= now()) throw salesError('AI_PERSONAL_CATALOG_EXPIRED', 409);
    for (const p of s.products) {
      if (!/^erp-[1-9]\d*$/.test(p?.id || '') || typeof p.stockCode !== 'string' || typeof p.productName !== 'string'
        || !['TRY', 'USD', 'EUR'].includes(p.currency) || !(p.unitPriceExact === null || /^(?:0|[1-9]\d*)\.\d{8}$/.test(p.unitPriceExact))
        || !p.series || !Array.isArray(p.series.composition)) invalid();
    }
    if (new Set(s.products.map(p => p.id)).size !== s.products.length || s.cart.items.some(i => !s.products.some(p => p.id === i.productId) || !Number.isSafeInteger(i.seriesCount) || i.seriesCount < 1)) invalid();
    assertCurrent();
    return s;
  }
  const recheck = async () => {
    const current = await read();
    if (!initial || current.fingerprint !== initial.fingerprint) throw salesError('AI_PERSONAL_CATALOG_CHANGED', 409);
    return current;
  };
  return {
    personal: true, assertCurrent, recheck,
    async search() {
      if (!personalSessionId(sessionId)) throw salesError('AI_PERSONAL_CATALOG_SESSION_REQUIRED', 400);
      initial = await read();
      const products = initial.products.map(p => ({ id: p.id, erpProductId: Number(p.id.slice(4)), priceExact: p.unitPriceExact,
        revision: initial.sourceFingerprint, unitLabel: 'ADET', stockCode: p.stockCode, productName: p.productName,
        salePrice: p.unitPriceExact === null ? null : Number(p.unitPriceExact), currency: p.currency, priceBasis: 'per-item', photoEligible: Boolean(p.photoPath) }));
      const facts = { source: 'melisa-erp-catalog', catalogVersion: 'melisa-catalog.v1', environment: 'CANONICAL_TEST',
        fetchedAt: initial.fetchedAt, expiresAt: new Date(Date.parse(initial.fetchedAt) + 300000).toISOString(), sourceAsOf: null,
        freshLive: false, sourceDatabaseVerified: true, stockFreshness: 'native-test', seriesVerified: false };
      return validatePersonalRecordedSnapshot({ products, facts }, now());
    },
    modelContext() {
      assertCurrent();
      return { testOnly: true, selectionSource: 'current-personal-session-cart',
        products: initial.products.map(p => ({ id: p.id, series: { verified: p.series.verified, isTestExample: p.series.isTestExample,
          totalPieces: p.series.totalPieces, composition: p.series.composition.map(c => ({ label: c.label, quantity: c.quantity })) } })),
        cart: initial.cart.items.map(i => ({ productId: i.productId, seriesCount: i.seriesCount, pieceCount: i.pieceCount })) };
    },
    metadata() { return { sessionId: initial.sessionId, revision: initial.revision, fingerprint: initial.fingerprint,
      sourceFingerprint: initial.sourceFingerprint, expiresAt: initial.expiresAt, conversationId: initial.conversationId, customerId: initial.customerId }; },
    async readSelected(ids) {
      await recheck();
      if (!Array.isArray(ids) || ids.length > 3 || ids.some(id => !initial.products.some(p => p.id === id))) throw salesError('AI_PRODUCT_UNKNOWN', 502);
      return ids.map(id => { const p = initial.products.find(p => p.id === id); return { ...p, salePrice: p.unitPrice,
        priceExact: p.unitPriceExact, priceBasis: 'per-item', photoEligible: Boolean(p.photoPath) }; });
    },
  };
}
