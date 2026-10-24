import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalProduct} from '../../../packages/erp-adapter/services/canonicalCatalog.mjs';
import {recordedProduct,recordedCatalogFacts} from '../../gateway/src/services/salesAgent/recordedCatalog.mjs';
import {normalizeSalesProducts,assertSalesProductCurrent} from '../src/lib/salesProducts.js';

const now=Date.now(),meta={source:'melisa-erp-catalog',catalogVersion:'melisa-catalog.v1',environment:'CANONICAL_TEST',sourceDatabaseVerified:true,cached:false,stockFreshness:'native-test',freshLive:false,fetchedAt:new Date(now).toISOString()};
const source=changes=>({id:'12',stockCode:'0012 ORIGINAL',displayCode:'0012',productName:'Original product',isActive:true,hold:{blocked:false},provenance:{verified:true,kind:'accepted-opening',sourceKey:'fixture/12'},classification:null,unit:{sourceId:'8',label:'ADET',verified:true},barcodes:[],stockQuantityExact:null,salePrices:[{id:'9',type:'sale',unitSourceId:'8',isMainUnit:true,tier:1,currency:'TRY',priceExact:'196.00000000',sourceKey:'fixture/price/9'}],photo:{status:'missing',verified:false},...changes});
function recommendation(row){return normalizeSalesProducts({catalogFacts:recordedCatalogFacts(meta,now),recommendedProducts:[recordedProduct(row)]},now).recommendedProducts[0];}

for(const [label,fields,name] of [
 ['source name',{productName:' \tOriginal product  '},'Original product'],
 ['null name with safeCode fallback',{productName:null,displayCode:'  0012  '},'0012'],
 ['null name with stockCode fallback',{productName:null,displayCode:null,stockCode:' 0012 ORIGINAL '},'0012 ORIGINAL'],
])test(`A04 canonical name: real adapter/recorded/frontend chain accepts unchanged ${label} with boundary whitespace`,()=>{
 const fresh=canonicalProduct(source(fields)),before=JSON.stringify(fresh),expected=recommendation(fresh);
 assert.equal(expected.productName,name);assert.equal(assertSalesProductCurrent({success:true,data:fresh,meta},expected,now),expected);assert.equal(JSON.stringify(fresh),before);
});

test('A04 canonical name: normalization still rejects real name, revision, price, currency and identity changes',()=>{
 const fresh=canonicalProduct(source()),expected=recommendation(fresh);
 for(const changes of [
  {productName:'Different product'}, {productName:'Original  product'}, {productName:null,safeCode:'OTHER'},
  {revision:'b'.repeat(64)}, {salePrice:197}, {priceExact:'197.00000000'}, {currency:'USD'},
  {id:'erp-13'}, {erpProductId:13}, {stockCode:' 0012 ORIGINAL '}, {unit:{verified:true,label:'BOX'}},
  {productName:42}, {productName:'   '}, {hold:{blocked:true}}, {status:'quarantined'},
 ])assert.throws(()=>assertSalesProductCurrent({success:true,data:{...fresh,...changes},meta},expected,now),{code:'AI_PRODUCT_CHANGED'});
});
