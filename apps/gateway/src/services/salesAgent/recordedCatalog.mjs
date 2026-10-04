import { salesError } from './policy.mjs';
import { ERP_DATABASE, ERP_PRODUCT_DATABASE } from '../erpSourceContract.mjs';

export const MAX_RECORDED_AGE_MS = 300_000;
export const MAX_CATALOG_CANDIDATES = 8;
export const MAX_RECOMMENDATIONS = 3;
const productId = value => typeof value === 'string' && /^vega-[1-9]\d*$/.test(value)
  && Number.isSafeInteger(Number(value.slice(5)));

export function validateCatalogSearch(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw salesError('AI_CATALOG_SEARCH_INVALID');
  }
  return value.trim();
}

export const searchSchema = {
  type: 'object', additionalProperties: false,
  properties: { queries: { type: 'array', items: { type: 'string' } } }, required: ['queries'],
};
export function validateSearchPlan(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).join(',') !== 'queries'
      || !Array.isArray(value.queries) || value.queries.length > 2) throw salesError('AI_CATALOG_SEARCH_INVALID', 502);
  return [...new Set(value.queries.map(validateCatalogSearch))];
}

export function recordedCatalogFacts(meta, now = Date.now()) {
  const fetchedAt = Date.parse(meta?.fetchedAt);
  if (meta?.source !== 'melisa-existing-erp-stock-read' || meta.catalogVersion !== 'existing-stock-v1'
      || meta.sourceDatabaseVerified !== true || meta.stockFreshness !== 'unverified'
      || meta.sourceDatabases?.products !== ERP_PRODUCT_DATABASE || meta.sourceDatabases?.images !== ERP_DATABASE
      || !Number.isFinite(fetchedAt) || fetchedAt > now || now - fetchedAt > MAX_RECORDED_AGE_MS) {
    throw salesError('AI_RECORDED_CATALOG_INVALID', 502);
  }
  return { source: meta.source, catalogVersion: meta.catalogVersion,
    fetchedAt: new Date(fetchedAt).toISOString(), expiresAt: new Date(fetchedAt + MAX_RECORDED_AGE_MS).toISOString(),
    sourceDatabaseVerified: true, stockFreshness: 'unverified', seriesVerified: false };
}

/** Recorded catalog facts are NOT the live stock/series snapshots accepted by buildQuote. */
export function recordedProduct(row) {
  if (!row || !productId(row.id) || typeof row.stockCode !== 'string' || !row.stockCode.trim() || row.stockCode.length > 100
      || typeof row.productName !== 'string' || !row.productName.trim() || row.productName.length > 200
      || row.priceBasis !== 'per-item' || row.priceBasisStatus !== 'user-confirmed') {
    throw salesError('AI_RECORDED_PRODUCT_INVALID', 502);
  }
  const currency = ['TRY', 'USD', 'EUR'].includes(row.currency) ? row.currency : null;
  const salePrice = currency && row.priceStatus === 'recorded' && typeof row.salePrice === 'number'
    && Number.isFinite(row.salePrice) && row.salePrice > 0 && row.salePrice <= Number.MAX_SAFE_INTEGER / 10_000
    && Number(row.salePrice.toFixed(4)) === row.salePrice ? row.salePrice : null;
  const photoEligible = row.photoStatus === 'guarded-path'
    && row.photoPath === `/crm/catalog/products/${row.id}/photo`;
  return { id: row.id, stockCode: row.stockCode.trim(), productName: row.productName.trim(),
    salePrice, currency, priceBasis: 'per-item', photoEligible };
}

export function validateRecordedCatalog(payload, now = Date.now()) {
  if (payload?.success !== true || !Array.isArray(payload.data) || payload.data.length > MAX_CATALOG_CANDIDATES) {
    throw salesError('AI_RECORDED_CATALOG_INVALID', 502);
  }
  const facts = recordedCatalogFacts(payload.meta, now);
  const products = payload.data.map(recordedProduct);
  if (new Set(products.map(product => product.id)).size !== products.length) throw salesError('AI_RECORDED_CATALOG_INVALID', 502);
  return { products, facts };
}

export function recordedProductRevision(product) {
  return JSON.stringify(recordedProduct({ ...product, priceBasisStatus: 'user-confirmed',
    priceStatus: product.salePrice === null ? 'unknown' : 'recorded',
    photoStatus: product.photoEligible ? 'guarded-path' : 'unavailable',
    photoPath: product.photoEligible ? `/crm/catalog/products/${product.id}/photo` : null }));
}

export function validateRecordedSnapshot(input, now = Date.now()) {
  if (!input) return { products: [], facts: null };
  if (!Array.isArray(input.products) || input.products.length > MAX_CATALOG_CANDIDATES) throw salesError('AI_RECORDED_CATALOG_INVALID', 502);
  const products = input.products.map(product => {
    const normalized = JSON.parse(recordedProductRevision(product));
    if (Object.keys(product).length !== Object.keys(normalized).length
        || Object.keys(normalized).some(key => normalized[key] !== product[key])) throw salesError('AI_RECORDED_PRODUCT_INVALID', 502);
    return normalized;
  });
  if (new Set(products.map(product => product.id)).size !== products.length) throw salesError('AI_RECORDED_CATALOG_INVALID', 502);
  const facts = input.facts;
  if (facts !== null && (!facts || facts.source !== 'melisa-existing-erp-stock-read' || facts.catalogVersion !== 'existing-stock-v1'
      || facts.sourceDatabaseVerified !== true || facts.stockFreshness !== 'unverified' || facts.seriesVerified !== false
      || !Number.isFinite(Date.parse(facts.fetchedAt)) || Date.parse(facts.fetchedAt) > now
      || Date.parse(facts.expiresAt) !== Date.parse(facts.fetchedAt) + MAX_RECORDED_AGE_MS)) {
    throw salesError('AI_RECORDED_CATALOG_INVALID', 502);
  }
  if (products.length && !facts) throw salesError('AI_RECORDED_CATALOG_INVALID', 502);
  if (facts && Date.parse(facts.expiresAt) <= now) throw salesError('AI_CATALOG_EXPIRED', 409);
  return { products, facts: facts ? { ...facts } : null };
}
