import { normalizeLiveProductRows } from './liveFields.js';

export const EXISTING_STOCK_VERSION = 'existing-stock-v1';
export const EXISTING_PAGE_SIZE = 12;
export const existingId = id => typeof id === 'string' && /^vega-[1-9]\d*$/.test(id);
export const contractError = () => Object.assign(new Error('Ürün kaynağı sözleşmesi doğrulanamadı.'), {code:'CATALOG_CONTRACT_INVALID'});
const integer = (n, min=0) => Number.isSafeInteger(n) && n >= min;
export function existingQuery(input={}) {
  const {page=1,limit=EXISTING_PAGE_SIZE,hasImage=true}=input;
  if(!integer(page,1)||!integer(limit,1)||limit>100||hasImage!==true) throw contractError();
  const out={page,limit,hasImage:true};
  for(const key of ['search','brand','category']) {
    const value=input[key]??'';
    if(typeof value!=='string'||value.trim().length>120) throw contractError();
    out[key]=value.trim();
  }
  if(Object.keys(input).some(k=>!['search','brand','category','hasImage','page','limit'].includes(k))) throw contractError();
  return out;
}
export function normalizeExistingEnvelope(payload, query={}) {
  const q=existingQuery(query),m=payload?.meta,rows=payload?.data;
  if(payload?.success!==true||!Array.isArray(rows)||!m||m.source!=='melisa-existing-erp-stock-read'||m.catalogVersion!==EXISTING_STOCK_VERSION||m.sourceDatabases?.products!=='VEGA2026'||m.sourceDatabases?.images!=='MELISA_ERP_V2'||m.sourceDatabaseVerified!==true||m.photoEligibility!=='guarded-existing-ui-reference'||m.cached!==false||m.sourceUpdatedAt!==null||m.stockFreshness!=='unverified'||m.capabilities?.read!==true||m.capabilities?.unpricedCatalog!==true||m.capabilities?.pricedPdf!==false||typeof m.fetchedAt!=='string'||!Number.isFinite(Date.parse(m.fetchedAt))) throw contractError();
  if(m.page!==q.page||m.limit!==q.limit||!integer(m.total)||m.totalPhotoEligible!==m.total||m.totalPages!==Math.max(1,Math.ceil(m.total/q.limit))||m.hasNextPage!==(m.page<m.totalPages)||m.hasPreviousPage!==(m.page>1)||rows.length!==Math.min(q.limit,Math.max(0,m.total-(q.page-1)*q.limit))) throw contractError();
  if(m.filters?.search!==q.search||m.filters?.brand!==(q.brand||null)||m.filters?.category!==(q.category||null)||m.filters?.hasImage!==true||m.facets?.scope!=='current-query-excluding-own-facet') throw contractError();
  const facets={scope:m.facets.scope};
  for(const key of ['brands','categories']) {
    const list=m.facets[key];if(!Array.isArray(list))throw contractError();
    const seen=new Set();facets[key]=list.map(v=>{if(typeof v?.value!=='string'||!v.value.trim()||v.value.length>120||!integer(v.count)||seen.has(v.value))throw contractError();seen.add(v.value);return {value:v.value,count:v.count};});
  }
  for(const r of rows) if(!existingId(r.id)||r.photoStatus!=='guarded-path'||r.photoPath!==`/crm/catalog/products/${r.id}/photo`||r.sourceUpdatedAt!==null||r.priceBasis!=='per-item'||r.priceBasisStatus!=='user-confirmed'||r.pricedDocumentEligible!==false||r.pricedDocumentBlockReason!=='SOURCE_FRESHNESS_UNVERIFIED') throw contractError();
  let products;try {products=normalizeLiveProductRows(rows).map(p=>({...p,hasSourceImage:true,photoStatus:'guarded-path',photoPath:`/crm/catalog/products/${p.id}/photo`,catalogVersion:EXISTING_STOCK_VERSION,fetchedAt:m.fetchedAt,priceVerified:false,stockVerified:false}));} catch {throw contractError();}
  return {products,query:q,meta:{page:m.page,limit:m.limit,total:m.total,totalPages:m.totalPages,totalPhotoEligible:m.totalPhotoEligible,hasNextPage:m.hasNextPage,hasPreviousPage:m.hasPreviousPage,fetchedAt:m.fetchedAt,catalogVersion:EXISTING_STOCK_VERSION,source:m.source,sourceDatabases:{products:'VEGA2026',images:'MELISA_ERP_V2'},sourceDatabaseVerified:true,facets,filters:{...q},capabilities:{read:true,unpricedCatalog:true,pricedPdf:false}}};
}
export function decodeExistingPhoto(url,{ImageType=globalThis.Image,schedule=setTimeout,unschedule=clearTimeout}={}) {
  if(typeof url!=='string'||!url.startsWith('blob:')) return Promise.reject(new Error('Fotoğraf kaynağı doğrulanamadı.'));
  return new Promise((resolve,reject)=>{const image=new ImageType();let done=false,timer;const finish=error=>{if(done)return;done=true;unschedule(timer);image.onload=null;image.onerror=null;if(error)reject(error);else resolve(url);};image.onload=()=>finish(image.naturalWidth>0&&image.naturalHeight>0?null:new Error('Fotoğraf çözümlenemedi.'));image.onerror=()=>finish(new Error('Fotoğraf çözümlenemedi.'));timer=schedule(()=>finish(new Error('Fotoğraf zamanında çözümlenemedi.')),10000);image.src=url;});
}
