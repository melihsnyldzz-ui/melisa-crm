import {verifiedBusinessCurrencies} from './model.js';
import {normalizeLiveProductRows} from './liveFields.js';
import {contractError} from './existingStock.js';
export const canonicalId=id=>typeof id==='string'&&/^erp-[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id.slice(4)));
export const pricingSourceExact=value=>value===null||typeof value==='string'&&/^-?(?:0|[1-9]\d{0,19})\.\d{8}$/.test(value);
export const pricingVersionId=value=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n;
export function canonicalPricing(pricing,priceExact){
 if(!pricing||typeof pricing!=='object'||Array.isArray(pricing)||Object.keys(pricing).length!==3||!['origin','versionId','sourcePriceExact'].every(k=>Object.hasOwn(pricing,k))||!pricingSourceExact(pricing.sourcePriceExact)||!(pricing.origin==='MANUAL'?pricingVersionId(pricing.versionId):pricing.origin==='SOURCE'&&pricing.versionId===null&&pricing.sourcePriceExact===priceExact))throw contractError();
 return {...pricing};
}
export function canonicalQuery(input={},businessScope) {
 const {page=1,limit=50,hasImage=true}=input;
 if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>50||(hasImage!==true&&(hasImage!==false||!verifiedBusinessCurrencies(businessScope)))||Object.keys(input).some(k=>!['page','limit','hasImage','search','brand','category','barcode'].includes(k)))throw contractError();
 const q={page,limit,hasImage};for(const key of ['search','brand','category','barcode']){if(typeof(input[key]??'')!=='string'||(input[key]??'').trim().length>120)throw contractError();q[key]=(input[key]??'').trim();}return q;
}
export function assertCanonicalMeta(m){if(m?.source!=='melisa-erp-catalog'||m.catalogVersion!=='melisa-catalog.v1'||m.environment!=='CANONICAL_TEST'||m.cached!==false||m.sourceDatabaseVerified!==true||m.stockFreshness!=='native-test'||m.freshLive!==false||!Number.isFinite(Date.parse(m.fetchedAt)))throw contractError();verifiedBusinessCurrencies(m.businessScope);return m;}
export function canonicalProduct(row,meta){
 assertCanonicalMeta(meta);
 if(!canonicalId(row?.id)||row.erpProductId!==Number(row.id.slice(4))||!Array.isArray(row.salePrices)||!['active','quarantined'].includes(row.status)||typeof row.hold?.blocked!=='boolean'||!/^([a-f0-9]{64})$/.test(row.revision||''))throw contractError();
 for(const price of row.salePrices){if(!Number.isSafeInteger(Number(price.id))||Number(price.id)<1||!Number.isSafeInteger(Number(price.unitSourceId))||Number(price.unitSourceId)<1||!['TRY','USD','EUR'].includes(price.currency)||!Number.isInteger(price.tier)||price.tier<1||price.tier>6||typeof price.isMainUnit!=='boolean'||typeof price.sourceKey!=='string'||!(price.priceExact===null||typeof price.priceExact==='string'&&/^-?\d+\.\d{8}$/.test(price.priceExact)))throw contractError();}
 const safePhoto=row.photoStatus==='guarded-path'&&row.photo?.validationStatus==='CONFIRMED'&&row.photoPath===`/crm/catalog/products/${row.id}/photo`;
 const salePrices=row.salePrices.map(price=>({...price,...(Object.hasOwn(price,'pricing')?{pricing:canonicalPricing(price.pricing,price.priceExact)}:{})}));
 if(row.photoStatus!=='unavailable'&&!safePhoto)throw contractError();
 const product=normalizeLiveProductRows([{...row,productName:row.productName??row.safeCode??row.stockCode}])[0];
 const prices={};for(const currency of ['TRY','USD','EUR']){const choices=row.salePrices.filter(p=>p.tier===1&&p.isMainUnit&&p.currency===currency&&p.priceExact!==null&&Number(p.priceExact)>0);if(choices.length===1&&row.status==='active'&&!row.hold.blocked)prices[currency]=Number(choices[0].priceExact);}
 return {...product,code:row.stockCode,prices,sourceProductName:row.productName,erpProductId:row.erpProductId,safeCode:row.safeCode,barcode:row.barcode,barcodes:row.barcodes,unit:row.unit,salePrices,priceExact:row.priceExact,priceSourceKey:row.priceSourceKey,revision:row.revision,status:row.status,hold:row.hold,hasSourceImage:safePhoto,photoStatus:row.photoStatus,photoPath:row.photoPath,thumbnailPath:row.thumbnailPath,catalogVersion:meta.catalogVersion,fetchedAt:meta.fetchedAt,sourceAsOf:meta.sourceAsOf,priceVerified:false,stockVerified:false};
}
export function normalizeCanonicalEnvelope(payload,input={}){
 const m=assertCanonicalMeta(payload?.meta),q=canonicalQuery(input,m.businessScope);if(payload.success!==true||!Array.isArray(payload.data)||m.page!==q.page||m.limit!==q.limit||!Number.isSafeInteger(m.total)||m.total<0||m.filters?.search!==q.search||m.filters?.brand!==(q.brand||null)||m.filters?.category!==(q.category||null)||m.filters?.hasImage!==q.hasImage||(m.filters?.barcode??'')!==q.barcode)throw contractError();
 const facets={};for(const key of ['brands','categories']){if(!Array.isArray(m.facets?.[key]))throw contractError();facets[key]=m.facets[key].map(f=>{if(typeof f.value!=='string'||!f.value||f.count!==null)throw contractError();return f;});}
 const products=payload.data.map(row=>canonicalProduct(row,m));if(q.hasImage&&products.some(product=>!product.hasSourceImage))throw contractError();
 return {products,query:q,meta:{...m,facets}};
}
