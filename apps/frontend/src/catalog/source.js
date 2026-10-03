import { liveApi, normalizeCatalogFilters } from '../liveApi.js';
import { normalizeLiveProductRows } from './liveFields.js';
// The current bridge contract permits unpriced catalogs but explicitly does not
// verify price/stock currentness. Database verification never establishes it.
export const catalogSource = Object.freeze({state:'idle',message:'ERP ürün kaydı açıldığında yetkili bağlantı üzerinden okunur. Fiyatlı çıktı için kaynak doğrulaması henüz yok.',products:Object.freeze([])});
function contractError(message='ERP katalog sözleşmesi doğrulanamadı.'){return Object.assign(new Error(message),{code:'CATALOG_CONTRACT_INVALID'});}
function validMeta(meta,list){
 if(!meta||meta.source!=='melisa-erp-authorized-read'||typeof meta.fetchedAt!=='string'||!Number.isFinite(Date.parse(meta.fetchedAt))||meta.cached!==false||(meta.sourceDatabaseVerified!==undefined&&typeof meta.sourceDatabaseVerified!=='boolean')||meta.sourceUpdatedAt!==null||meta.capabilities?.read!==true||meta.capabilities?.unpricedCatalog!==true||meta.capabilities?.pricedPdf!==false)throw contractError();
 if(list&&(!Number.isInteger(meta.page)||meta.page<1||!Number.isInteger(meta.limit)||meta.limit<1||meta.limit>100||!Number.isInteger(meta.total)||meta.total<0||!Number.isInteger(meta.totalPages)||meta.totalPages<0||typeof meta.hasNextPage!=='boolean'||typeof meta.hasPreviousPage!=='boolean'||meta.hasPreviousPage!==(meta.page>1)||meta.hasNextPage!==(meta.page<meta.totalPages)))throw contractError('ERP katalog sayfalaması doğrulanamadı.');
 return meta;
}
export function normalizeLiveCatalogEnvelope(envelope,{detail=false}={}){
 if(envelope?.success!==true||(detail?(!envelope.data||Array.isArray(envelope.data)):!Array.isArray(envelope.data)))throw contractError();
 const meta=validMeta(envelope.meta,!detail),rows=detail?[envelope.data]:envelope.data;
 const sourceDatabaseVerified=meta.sourceDatabaseVerified===true;
 const expectedBlockReason=sourceDatabaseVerified?'SOURCE_FRESHNESS_UNVERIFIED':'SOURCE_IDENTITY_AND_FRESHNESS_UNVERIFIED';
 if(!detail&&rows.length>meta.limit)throw contractError();
 const products=normalizeLiveProductRows(rows).map((product,index)=>{
  const row=rows[index];
  if(row.priceBasis!=='per-item'||row.priceBasisStatus!=='user-confirmed'||row.sourceUpdatedAt!==null||row.pricedDocumentEligible!==false||row.pricedDocumentBlockReason!==expectedBlockReason)throw contractError('ERP kaynak/fiyat doğrulama durumu değişti; kontrol gerekli.');
  const expected=`/crm/catalog/products/${product.id}/photo`;
  const photoReady=/^[A-Za-z0-9_-]+$/.test(product.id)&&row.photoStatus==='guarded-path'&&row.photoPath===expected;
  return {...product,hasSourceImage:photoReady,photoPath:photoReady?expected:null,photoStatus:photoReady?'guarded-path':'unverified',priceVerified:false,stockVerified:false};
 });
 return {products,meta:{page:meta.page,limit:meta.limit,total:meta.total,totalPages:meta.totalPages,hasNextPage:meta.hasNextPage,hasPreviousPage:meta.hasPreviousPage,source:meta.source,fetchedAt:meta.fetchedAt,cached:false,sourceUpdatedAt:null,sourceDatabaseVerified,capabilities:{read:true,unpricedCatalog:true,pricedPdf:false}}};
}
export async function loadCatalog({token,api=liveApi,isCurrent=()=>true,search='',brand='',category='',authMode='erp',signal}={}){
 if(!token)throw Object.assign(new Error('CRM oturumu gerekli.'),{status:401});
 const filters=normalizeCatalogFilters({search,brand,category},authMode);
 const serverFiltered=Object.values(filters).some(value=>Boolean(value));
 const products=[],ids=new Set();let page=1,firstMeta=null,lastMeta=null;
 while(true){
  if(!isCurrent())throw Object.assign(new Error('Katalog okuması iptal edildi.'),{code:'CATALOG_CANCELLED'});
  const result=normalizeLiveCatalogEnvelope(await api.catalogProducts(token,{...filters,page,limit:100,...(authMode==='crm'?{authMode}:{}),...(signal?{signal}:{})}));
  if(!isCurrent())throw Object.assign(new Error('Katalog okuması iptal edildi.'),{code:'CATALOG_CANCELLED'});
  if(result.meta.page!==page)throw contractError();
  if(!firstMeta)firstMeta=result.meta;
  if(result.meta.sourceDatabaseVerified!==firstMeta.sourceDatabaseVerified)throw contractError('ERP kaynak doğrulama durumu okuma sırasında değişti. Kataloğu yeniden açın.');
  if(result.meta.total!==firstMeta.total||result.meta.totalPages!==firstMeta.totalPages)throw contractError('ERP katalog sayısı okuma sırasında değişti. Kataloğu yeniden açın.');
  for(const product of result.products){if(ids.has(product.id))throw contractError('ERP katalog sayfaları tekrar etti.');ids.add(product.id);products.push(product);}
  lastMeta=result.meta;
  if(!result.meta.hasNextPage)break;
  if(!result.products.length)throw contractError('ERP katalog sayfalaması ilerlemedi.');
  page+=1;
 }
 if(products.length!==lastMeta.total)throw contractError('ERP katalog listesi eksik döndü.');
 return {state:'ready',products,revision:`${lastMeta.fetchedAt}:${products.length}`,fetchedAt:lastMeta.fetchedAt,sourceUpdatedAt:null,sourceVerified:false,sourceDatabaseVerified:lastMeta.sourceDatabaseVerified,priceExportAllowed:false,scope:{type:serverFiltered?'server-filtered':'all-products',filters},message:`${products.length} ERP ürün kaydı${serverFiltered?' · Sunucuda filtrelenmiş liste; tüm katalog değildir.':''} · Okuma zamanı ${new Date(lastMeta.fetchedAt).toLocaleString('tr-TR')}. ${lastMeta.sourceDatabaseVerified?'ERP veritabanı bağlantısı doğrulandı. Güncel fiyat ve stok doğrulanamadı':'Kaynak kimliği ve güncel fiyat/stok doğrulanamadı'}; fiyatlı PDF kapalı.`,meta:lastMeta};
}
