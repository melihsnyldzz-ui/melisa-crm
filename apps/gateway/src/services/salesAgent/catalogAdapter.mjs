import { CATALOG_RESPONSE_GUARD } from '../catalogBridge.mjs';
import { salesError } from './policy.mjs';
import { MAX_CATALOG_CANDIDATES, MAX_RECOMMENDATIONS, recordedCatalogFacts, recordedProduct,
  recordedProductRevision, validateCatalogSearch, validateRecordedCatalog } from './recordedCatalog.mjs';

/** In-process adapter over the existing reader. The only downstream operation is its guarded GET. */
export function createSalesCatalogAdapter({ readCatalog, authorization, signal, assertAccess, now = Date.now }) {
  const guards = [];
  const assertCurrent = () => {
    if (signal?.aborted) throw salesError('AI_SALES_CANCELLED', 499);
    assertAccess();
    for (const guard of guards) guard();
  };
  async function read(path) {
    assertCurrent();
    const response = await readCatalog(new Request(`http://127.0.0.1${path}`, {
      method: 'GET', headers: { authorization }, ...(signal ? { signal } : {}),
    }));
    assertCurrent();
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const allowed = new Set(['AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_INVALID', 'WHATSAPP_CRM_AUTH_TOKEN_REQUIRED', 'WHATSAPP_CRM_RATE_LIMITED', 'CRM_CATALOG_SCOPE_REQUIRED', 'CATALOG_SESSION_REVOKED', 'CRM_VERIFICATION_UNAVAILABLE', 'ERP_SOURCE_IDENTITY_REQUIRED', 'ERP_CATALOG_SQL_UNAVAILABLE', 'ERP_CATALOG_REQUEST_CANCELLED', 'ERP_CATALOG_PRODUCT_CONTRACT', 'ERP_CATALOG_LIST_CONTRACT', 'ERP_CATALOG_UNAVAILABLE', 'PRODUCT_NOT_FOUND', 'INVALID_QUERY', 'INVALID_PRODUCT_ID']);
      const upstream = payload?.error?.code;
      throw salesError(allowed.has(upstream) ? `AI_${upstream}` : 'AI_CATALOG_UNAVAILABLE', [401, 403, 429].includes(response.status) ? response.status : 502);
    }
    const guard = response[CATALOG_RESPONSE_GUARD];
    if (typeof guard !== 'function') throw salesError('AI_CATALOG_LEASE_REQUIRED', 502);
    guard();
    const payload = await response.json();
    guard();
    guards.push(guard);
    assertCurrent();
    return payload;
  }
  return {
    assertCurrent,
    async search(queries) {
      if (!Array.isArray(queries) || queries.length > 2) throw salesError('AI_CATALOG_SEARCH_INVALID');
      const products = new Map(); let facts = null;
      for (const query of queries) {
        const parameters = new URLSearchParams({ search: validateCatalogSearch(query), page: '1', limit: '8', hasImage: 'false' });
        const result = validateRecordedCatalog(await read(`/crm/catalog/products?${parameters}`), now());
        for (const product of result.products) {
          const previous = products.get(product.id);
          if (previous && recordedProductRevision(previous) !== recordedProductRevision(product)) throw salesError('AI_CATALOG_CHANGED', 409);
          if (previous || products.size < MAX_CATALOG_CANDIDATES) products.set(product.id, product);
        }
        if (!facts || Date.parse(result.facts.fetchedAt) < Date.parse(facts.fetchedAt)) facts = result.facts;
      }
      assertCurrent();
      return { products: [...products.values()], facts };
    },
    async readSelected(ids, candidates, initialFacts) {
      if (!Array.isArray(ids) || ids.length > MAX_RECOMMENDATIONS || new Set(ids).size !== ids.length) throw salesError('AI_RECOMMENDATION_LIMIT', 502);
      const selected = [];
      for (const id of ids) {
        const candidate = candidates.find(product => product.id === id);
        if (!candidate) throw salesError('AI_PRODUCT_UNKNOWN', 502);
        const payload = await read(`/crm/catalog/products/${encodeURIComponent(id)}`);
        const facts = recordedCatalogFacts(payload.meta, now());
        const product = recordedProduct(payload.data);
        if (payload.success !== true || product.id !== id || recordedProductRevision(product) !== recordedProductRevision(candidate)) {
          throw salesError('AI_CATALOG_CHANGED', 409);
        }
        if (initialFacts && Date.parse(initialFacts.expiresAt) <= now()) throw salesError('AI_CATALOG_EXPIRED', 409);
        if (Date.parse(facts.expiresAt) <= now()) throw salesError('AI_CATALOG_EXPIRED', 409);
        selected.push(product);
      }
      assertCurrent();
      return selected;
    },
  };
}
