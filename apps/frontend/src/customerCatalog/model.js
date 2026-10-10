const TOKEN_KEY = 'melisa-customer-catalog-capability-v1';
export const isCatalogPath = path => /^\/katalog\/?$/.test(path);
export const validCatalogToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export const validProductId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
const invalid = () => Object.assign(new Error('Katalog bilgileri doğrulanamadı. Lütfen bağlantınızı yeniden açın.'), {code:'CUSTOMER_CATALOG_CONTRACT_INVALID'});
const integer = (value, min=0) => Number.isSafeInteger(value) && value >= min;
const exact = value => typeof value === 'string' && /^\d+\.\d{8}$/.test(value);

// A capability never belongs in query parameters, request paths or analytics.
export function readCatalogToken({location=globalThis.location, history=globalThis.history, storage}={}) {
  if(storage===undefined)try{storage=globalThis.sessionStorage;}catch{}
  const fragment = location.hash.slice(1);
  if (fragment) {
    history.replaceState(null, '', location.pathname);
    try { storage.removeItem(TOKEN_KEY); } catch {}
    if (!validCatalogToken(fragment)) return '';
    try { storage.setItem(TOKEN_KEY, fragment); } catch {}
    return fragment;
  }
  try { const token=storage.getItem(TOKEN_KEY); return validCatalogToken(token) ? token : ''; } catch { return ''; }
}
export function clearCatalogToken(storage) { try { (storage??globalThis.sessionStorage).removeItem(TOKEN_KEY); } catch {} }

export function normalizeProduct(row) {
  if (!validProductId(row?.id) || typeof row.stockCode !== 'string' || !row.stockCode || typeof row.productName !== 'string' || !row.productName
    || row.testOnly !== true || typeof row.selectable !== 'boolean' || typeof row.recommended !== 'boolean'
    || ![null,'TRY','USD','EUR'].includes(row.currency) || ![null,undefined].includes(row.photoPath) && row.photoPath !== `/api/customer-catalog/products/${row.id}/photo`) throw invalid();
  const series=row.series;
  if (series?.verified === true) {
    if (!integer(series.totalPieces,1) || !Array.isArray(series.composition) || !series.composition.length
      || series.composition.some(line=>typeof line?.label!=='string'||!line.label||!integer(line.quantity,1))
      || series.composition.reduce((sum,line)=>sum+line.quantity,0)!==series.totalPieces) throw invalid();
  }
  if (row.selectable && (series?.verified !== true || !integer(row.maxSeries,1) || !exact(row.unitPriceExact)
    || !(Number(row.unitPriceExact)>0) || !['TRY','USD','EUR'].includes(row.currency) || !exact(row.seriesTotalExact)
    || multiplyPrice(row.unitPriceExact,series.totalPieces)!==row.seriesTotalExact || row.availability !== 'available')) throw invalid();
  return row;
}

export function multiplyPrice(price, pieces) {
  if (!exact(price) || !integer(pieces)) throw invalid();
  const scaled = BigInt(price.replace('.','')) * BigInt(pieces);
  const digits=scaled.toString().padStart(9,'0');
  return `${digits.slice(0,-8)}.${digits.slice(-8)}`;
}

export function normalizeCart(cart) {
  if (!integer(cart?.revision) || !Array.isArray(cart.items) || !integer(cart.modelCount) || !integer(cart.seriesCount) || !integer(cart.pieceCount)
    || !exact(cart.productTotalExact) || ![null,'TRY','USD','EUR'].includes(cart.currency)) throw invalid();
  if(cart.valid!==undefined&&typeof cart.valid!=='boolean'||cart.validationErrors!==undefined&&!Array.isArray(cart.validationErrors))throw invalid();
  const errors=cart.validationErrors||[],invalidStock=cart.valid===false,stockErrors=new Map();
  for(const error of errors){
    if(!invalidStock||!['STOCK_LIMIT','STOCK_UNVERIFIED'].includes(error?.code)||!validProductId(error.productId)||stockErrors.has(error.productId)
      ||!integer(error.requestedSeries,1)||error.code==='STOCK_LIMIT'&&(!integer(error.maxSeries)||error.requestedSeries<=error.maxSeries)
      ||error.code==='STOCK_UNVERIFIED'&&error.maxSeries!==null)throw invalid();
    stockErrors.set(error.productId,error);
  }
  if(invalidStock&&!stockErrors.size)throw invalid();
  const ids=new Set();let pieces=0,series=0,amount=0n;
  for (const row of cart.items) {
    normalizeProduct(row);
    const stockError=stockErrors.get(row.id);
    if(stockError&&(stockError.requestedSeries!==row.seriesCount||stockError.maxSeries!==row.maxSeries
      ||stockError.code==='STOCK_LIMIT'&&!integer(row.maxSeries)
      ||stockError.code==='STOCK_UNVERIFIED'&&(row.maxSeries!==null||row.selectable!==false||row.availability!=='unknown')
      ||row.series?.verified!==true||!exact(row.unitPriceExact)||Number(row.unitPriceExact)<=0||!exact(row.seriesTotalExact)
      ||multiplyPrice(row.unitPriceExact,row.series.totalPieces)!==row.seriesTotalExact
      ||row.maxSeries===0&&(row.selectable!==false||row.availability!=='unavailable')
      ||row.maxSeries>0&&(row.selectable!==true||row.availability!=='available')))throw invalid();
    if (ids.has(row.id) || !stockError&&(!row.selectable||row.seriesCount>row.maxSeries) || !integer(row.seriesCount,1) || row.pieceCount!==row.seriesCount*row.series.totalPieces
      || multiplyPrice(row.unitPriceExact,row.pieceCount)!==row.lineTotalExact || row.currency!==cart.currency) throw invalid();
    ids.add(row.id);pieces+=row.pieceCount;series+=row.seriesCount;amount+=BigInt(row.lineTotalExact.replace('.',''));
  }
  if([...stockErrors.keys()].some(id=>!ids.has(id)))throw invalid();
  if (cart.modelCount!==ids.size || cart.pieceCount!==pieces || cart.seriesCount!==series || amount!==BigInt(cart.productTotalExact.replace('.',''))) throw invalid();
  return cart;
}

export function normalizeSession(result) {
  const data=result?.data;
  if (result?.success!==true || data?.testOnly!==true || typeof data.sessionId!=='string' || !Number.isFinite(Date.parse(data.expiresAt))
    || typeof data.customerLabel!=='string' || !Array.isArray(data.products)) throw invalid();
  data.products.forEach(normalizeProduct);normalizeCart(data.cart);
  if (data.order) normalizeOrder(data.order);
  return data;
}
export function normalizeOrder(order) {
  if (order?.status!=='test-draft' || order.verifiedReadback!==true || typeof order.requestId!=='string' || !order.requestId || order.id===undefined) throw invalid();
  normalizeCart(order.summary);if(order.summary.valid===false)throw invalid();return order;
}
export function cartRequest(cart, product, count) {
  const previous=cart.items.find(row=>row.id===product.id),stockError=cart.validationErrors?.find(error=>error.productId===product.id&&['STOCK_LIMIT','STOCK_UNVERIFIED'].includes(error.code));
  if(cart.valid===false&&(!previous||count>=previous.seriesCount))throw Object.assign(new Error('Önce mevcut sepetin seri miktarını azaltın veya ilgili modeli çıkarın.'),{code:'CUSTOMER_CATALOG_STOCK_LIMIT'});
  const correcting=cart.valid===false&&previous&&stockError&&count<previous.seriesCount;
  const removing=previous&&count===0;
  if (!integer(count) || !correcting&&!removing&&(!product.selectable||count>product.maxSeries)) throw Object.assign(new Error('Yalnız mevcut tam seri sınırında seçim yapabilirsiniz.'), {code:'CUSTOMER_CATALOG_STOCK_LIMIT'});
  const items=cart.items.filter(row=>row.id!==product.id).map(row=>({productId:row.id,seriesCount:row.seriesCount}));
  if (count) items.push({productId:product.id,seriesCount:count});
  return {revision:cart.revision,items};
}
export function formatMoney(value, currency) {
  if (!['TRY','USD','EUR'].includes(currency)||value===null||value===undefined||!Number.isFinite(Number(value))) return 'Fiyat doğrulanmadı';
  return new Intl.NumberFormat('tr-TR',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
}
export function compositionText(product) {
  return product.series?.verified ? product.series.composition.map(line=>`${line.label}: ${line.quantity} adet`).join(' · ') : 'Seri içeriği henüz doğrulanmadı';
}
// Reapply the server's filters to a fresh session snapshot after a price/conflict read.
export function filterCatalogProducts(products, filters={}) {
  const search=(filters.search||'').trim().toLocaleLowerCase('tr-TR');
  return products.filter(product=>(filters.scope!=='recommended'||product.recommended)
    &&(!search||`${product.stockCode} ${product.productName}`.toLocaleLowerCase('tr-TR').includes(search))
    &&(!filters.age||product.age===filters.age)&&(!filters.type||product.type===filters.type)&&(!filters.color||product.color===filters.color)
    &&(!filters.maxPrice||product.unitPrice!==null&&product.unitPrice<=Number(filters.maxPrice)));
}
export function hasSyntheticProducts(products) {return products.some(product=>(product.sourceLabel||'').toLocaleLowerCase('tr-TR').includes('sentetik'));}
export function blockedLabel(reason) {
  return ({SERIES_UNVERIFIED:'Seri içeriği doğrulanınca seçilebilir',SERIES_STOCK_UNVERIFIED:'Tam seri uygunluğu doğrulanıyor',STOCK_UNVERIFIED:'Tam seri uygunluğu doğrulanıyor',STOCK_UNAVAILABLE:'Şu an tam seri seçilemiyor',PRICE_UNVERIFIED:'Fiyat doğrulanınca seçilebilir',PRICE_UNAVAILABLE:'Fiyat doğrulanınca seçilebilir',SERIES_INCOMPLETE:'Tam seri uygunluğu doğrulanıyor'})[reason] || 'Seçim için ürün bilgisi doğrulanmalı';
}
