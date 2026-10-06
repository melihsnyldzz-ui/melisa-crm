import { selectionMessage } from '../catalog/productActions.js';
import { existingId } from '../catalog/existingStock.js';
import {canonicalId,assertCanonicalMeta} from '../catalog/canonicalStock.js';

export const SALES_CATALOG_MAX_AGE_MS = 5 * 60 * 1000;
const invalid = () => Object.assign(new Error('Ürün önerisi kaynağı doğrulanamadı.'), {code:'AI_RESPONSE_INVALID'});
const changed = () => Object.assign(new Error('Ürün bilgileri değişti.'), {code:'AI_PRODUCT_CHANGED'});
const keysOnly = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const validPrice = value => value === null || typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER / 10000;

export function normalizeSalesProducts(result, now = Date.now()) {
  if (result.recommendedProducts === undefined && result.catalogFacts === undefined) return {recommendedProducts:[],catalogFacts:null};
  if (Array.isArray(result.recommendedProducts) && !result.recommendedProducts.length && result.catalogFacts === null) return {recommendedProducts:[],catalogFacts:null};
  const facts = result.catalogFacts, rows = result.recommendedProducts;
  const fetched = Date.parse(facts?.fetchedAt), expires = Date.parse(facts?.expiresAt);
  if (!keysOnly(facts,['source','catalogVersion','fetchedAt','expiresAt','sourceDatabaseVerified','stockFreshness','seriesVerified','sourceAsOf','freshLive','environment'])
      || !((facts.source === 'melisa-erp-catalog' && facts.catalogVersion === 'melisa-catalog.v1')||(facts.source === 'melisa-existing-erp-stock-read' && facts.catalogVersion === 'existing-stock-v1'))
      || facts.sourceDatabaseVerified !== true || !['native-test','unverified'].includes(facts.stockFreshness) || facts.seriesVerified !== false
      || !Number.isFinite(fetched) || !Number.isFinite(expires) || fetched > now + 5000 || expires <= now || expires <= fetched || expires - fetched > SALES_CATALOG_MAX_AGE_MS
      || !Array.isArray(rows) || rows.length > 3) throw invalid();
  const seen = new Set();
  const products = rows.map(row => {
    if (!keysOnly(row,['id','stockCode','productName','salePrice','currency','priceBasis','photoEligible','erpProductId','priceExact','revision','unitLabel']) || !(canonicalId(row.id)||existingId(row.id)) || seen.has(row.id)
        || typeof row.stockCode !== 'string' || !row.stockCode.trim() || row.stockCode.length > (canonicalId(row.id)?120:100)
        || typeof row.productName !== 'string' || !row.productName.trim() || row.productName.length > (canonicalId(row.id)?250:200)
        || !validPrice(row.salePrice)||existingId(row.id)&&row.salePrice!==null&&Number(row.salePrice.toFixed(4))!==row.salePrice || !(row.currency === null || ['TRY','USD','EUR'].includes(row.currency))
        || row.salePrice !== null && row.currency === null
        || row.priceBasis !== 'per-item' || typeof row.photoEligible !== 'boolean') throw invalid();
    if(canonicalId(row.id)&&(facts.environment!=='CANONICAL_TEST'||facts.source!=='melisa-erp-catalog'||facts.catalogVersion!=='melisa-catalog.v1'||facts.stockFreshness!=='native-test'||facts.freshLive!==false||!(row.unitLabel===null||typeof row.unitLabel==='string')||row.erpProductId!==Number(row.id.slice(4))||!/^([a-f0-9]{64})$/.test(row.revision||'')||!(row.priceExact===null||typeof row.priceExact==='string'&&/^\d+\.\d{8}$/.test(row.priceExact))))throw invalid();
    seen.add(row.id);
    return {...(canonicalId(row.id)?{erpProductId:row.erpProductId,priceExact:row.priceExact,revision:row.revision,unitLabel:row.unitLabel??null}:{}),id:row.id,stockCode:row.stockCode,productName:row.productName,salePrice:row.salePrice,currency:row.currency,priceBasis:'per-item',photoEligible:row.photoEligible};
  });
  return {recommendedProducts:products,catalogFacts:{source:facts.source,catalogVersion:facts.catalogVersion,fetchedAt:facts.fetchedAt,expiresAt:facts.expiresAt,sourceDatabaseVerified:true,stockFreshness:facts.stockFreshness,seriesVerified:false}};
}

export function assertSalesProductCurrent(envelope, expected, now=Date.now()) {
  const row=envelope?.data, meta=envelope?.meta, fetched=Date.parse(meta?.fetchedAt);
  if(canonicalId(expected.id)){
    try{assertCanonicalMeta(meta);}catch{throw changed();}
    const name=row?.productName??row?.safeCode??row?.stockCode;
    const photoEligible=row?.photoStatus==='guarded-path'&&row.photo?.validationStatus==='CONFIRMED'&&row.photoPath===`/crm/catalog/products/${expected.id}/photo`;
    if(envelope.success!==true||row?.id!==expected.id||row.erpProductId!==expected.erpProductId||row.stockCode!==expected.stockCode||name!==expected.productName||row.revision!==expected.revision||row.salePrice!==expected.salePrice||row.currency!==expected.currency||row.priceExact!==expected.priceExact||(row.unit?.verified?row.unit.label:null)!==expected.unitLabel||photoEligible!==expected.photoEligible||row.hold?.blocked||row.status!=='active'||fetched>now+5000||now-fetched>SALES_CATALOG_MAX_AGE_MS)throw changed();
    return expected;
  }
  if (envelope?.success !== true || !row || Array.isArray(row) || meta?.source !== 'melisa-existing-erp-stock-read' || meta.catalogVersion !== 'existing-stock-v1'
      || meta.sourceDatabaseVerified !== true || meta.sourceDatabases?.products !== 'VEGA2026' || meta.sourceDatabases?.images !== 'MELISA_ERP_V2'
      || meta.cached !== false || meta.sourceUpdatedAt !== null || meta.stockFreshness !== 'unverified' || meta.capabilities?.read !== true
      || !Number.isFinite(fetched) || fetched > now + 5000 || now - fetched > SALES_CATALOG_MAX_AGE_MS) throw changed();
  const currency=['TRY','USD','EUR'].includes(row.currency)?row.currency:null;
  const salePrice=currency && row.priceStatus==='recorded' && row.salePrice!==null && validPrice(row.salePrice)&&Number(row.salePrice.toFixed(4))===row.salePrice ? row.salePrice : null;
  const photoEligible=row.photoStatus==='guarded-path' && row.photoPath===`/crm/catalog/products/${expected.id}/photo`;
  if (row.id !== expected.id || row.stockCode?.trim() !== expected.stockCode || row.productName?.trim() !== expected.productName || salePrice !== expected.salePrice || currency !== expected.currency
      || row.priceBasis !== 'per-item' || row.priceBasisStatus !== 'user-confirmed' || row.sourceUpdatedAt !== null || row.pricedDocumentEligible !== false
      || row.pricedDocumentBlockReason !== 'SOURCE_FRESHNESS_UNVERIFIED'
      || !['unknown','invalid','zero-unverified','recorded'].includes(row.priceStatus)
      || !['guarded-path','unavailable'].includes(row.photoStatus) || photoEligible !== expected.photoEligible) throw changed();
  return expected;
}

export function salesProductDraft(product, action, existingText='') {
  if (!['product','price'].includes(action)) throw changed();
  const adapted={id:product.id,code:product.stockCode,name:product.productName,currency:product.currency,unitLabel:product.unitLabel,priceExact:product.priceExact,prices:product.currency && product.salePrice !== null ? {[product.currency]:product.salePrice} : {}};
  const text=selectionMessage([adapted],action==='price');
  const draft=existingText.trim() ? `${existingText}\n\n${text}` : text;
  if (draft.length>2000) throw Object.assign(new Error('Ürün bilgisi mevcut mesajla 2000 karakteri aşıyor. Önce mesajı kısaltın.'),{code:'AI_DRAFT_TOO_LONG'});
  return draft;
}
