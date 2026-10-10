import test from 'node:test';
import assert from 'node:assert/strict';
import {readCatalogToken,clearCatalogToken,isCatalogPath,normalizeProduct,normalizeCart,multiplyPrice,cartRequest,compositionText,filterCatalogProducts,hasSyntheticProducts} from '../src/customerCatalog/model.js';

const product=(id,price,totalPieces,composition)=>({id,stockCode:id,productName:`TEST ${id}`,testOnly:true,sourceLabel:'Sentetik TEST',recommended:true,selectable:true,currency:'TRY',unitPriceExact:price,seriesTotalExact:multiplyPrice(price,totalPieces),photoPath:null,availability:'available',maxSeries:5,series:{verified:true,isTestExample:true,totalPieces,composition}});
const a=product('erp-1','100.00000000',6,[{label:'3 ay',quantity:2},{label:'9 ay',quantity:2},{label:'12 ay',quantity:2}]);
const b=product('erp-2','120.00000000',4,[{label:'3 ay',quantity:1},{label:'9 ay',quantity:1},{label:'12 ay',quantity:2}]);
const row=(p,count)=>({...p,productId:p.id,seriesCount:count,pieceCount:count*p.series.totalPieces,lineTotalExact:multiplyPrice(p.unitPriceExact,count*p.series.totalPieces)});
const cart={revision:3,items:[row(a,2),row(b,1)],modelCount:2,seriesCount:3,pieceCount:16,productTotalExact:'1680.00000000',currency:'TRY'};

test('different full series sizes preserve 2 models, 3 series, 16 pieces and exact 1680 TRY',()=>{
  assert.equal(normalizeCart(cart),cart);assert.equal(compositionText(a),'3 ay: 2 adet · 9 ay: 2 adet · 12 ay: 2 adet');
  assert.equal(multiplyPrice('0.10000000',3),'0.30000000');assert.equal(multiplyPrice('12.34560000',12),'148.14720000');
});
test('invalid composition, false total, duplicate or excessive selections fail closed',()=>{
  assert.throws(()=>normalizeProduct({...a,series:{...a.series,totalPieces:5}}));
  assert.throws(()=>normalizeCart({...cart,productTotalExact:'16.80000000'}));
  assert.throws(()=>normalizeCart({...cart,items:[row(a,2),row(a,1)]}));
  assert.throws(()=>cartRequest(cart,a,-1));assert.throws(()=>cartRequest(cart,a,1.5));assert.throws(()=>cartRequest(cart,a,6));
  assert.throws(()=>normalizeProduct({...a,series:{verified:false}}));
  assert.throws(()=>normalizeProduct({...a,photoPath:'https://outside.test/photo.png'}));
});
test('removal keeps the other model and revision; no inferred series for missing metadata',()=>{
  assert.deepEqual(cartRequest(cart,a,0),{revision:3,items:[{productId:'erp-2',seriesCount:1}]});
  const unknown={...a,selectable:false,maxSeries:null,series:{verified:false,totalPieces:null,composition:[]},seriesTotalExact:null};
  assert.equal(normalizeProduct(unknown),unknown);assert.throws(()=>cartRequest(cart,unknown,1));
});
test('fragment is removed before capability persists, reload continues and another link replaces it',()=>{
  const values=new Map(),events=[];const storage={getItem:key=>values.get(key),setItem:(key,value)=>{events.push('store');values.set(key,value);},removeItem:key=>values.delete(key)};
  const history={replaceState:(_state,_title,path)=>{events.push('erase');assert.equal(path,'/katalog');}};
  const token='x'.repeat(43);assert.equal(readCatalogToken({location:{hash:'#'+token,pathname:'/katalog'},history,storage}),token);
  assert.deepEqual(events,['erase','store']);assert.equal(readCatalogToken({location:{hash:'',pathname:'/katalog'},history,storage}),token);
  assert.equal(readCatalogToken({location:{hash:'#bad',pathname:'/katalog'},history,storage}), '');
  assert.equal(readCatalogToken({location:{hash:'',pathname:'/katalog'},history,storage}), '');clearCatalogToken(storage);
  assert(isCatalogPath('/katalog'));assert(isCatalogPath('/katalog/'));assert(!isCatalogPath('/katalog/other'));
});
test('blocked browser storage still permits the original personal link in memory',()=>{
  const storage={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');},removeItem:()=>{throw Error('denied');}};
  assert.equal(readCatalogToken({location:{hash:'#'+'a'.repeat(43),pathname:'/katalog'},history:{replaceState(){}},storage}),'a'.repeat(43));
});
test('fresh prices reapply active filters to every model, including unselected cards',()=>{
  const original=[{...a,unitPrice:100,age:'0–2 yaş',type:'Takımlar',color:'Krem'},{...b,recommended:false,unitPrice:120,age:'0–2 yaş',type:'Takımlar',color:'Pudra'}];
  const filters={scope:'all',search:'',age:'0–2 yaş',type:'Takımlar',maxPrice:'125',color:''};
  assert.deepEqual(filterCatalogProducts(original,filters).map(row=>row.id),['erp-1','erp-2']);
  const fresh=[original[0],{...original[1],unitPrice:140,unitPriceExact:'140.00000000'}];
  assert.deepEqual(filterCatalogProducts(fresh,filters).map(row=>row.id),['erp-1']);
  assert.equal(filterCatalogProducts(fresh,{scope:'all',search:'ERP-2'})[0].unitPriceExact,'140.00000000');
  assert.deepEqual(filterCatalogProducts(fresh,{scope:'recommended'}).map(row=>row.id),['erp-1']);
  assert.deepEqual(filterCatalogProducts(fresh,{scope:'all',color:'Pudra'}).map(row=>row.id),['erp-2']);
});
test('synthetic source remains distinguishable from isolated real ERP test data',()=>{
  assert(hasSyntheticProducts([{sourceLabel:'SENTETİK ÖNİZLEME · gerçek şirket ürünü değil'}]));
  assert(!hasSyntheticProducts([{sourceLabel:'İzole ERP TEST kataloğu'}]));
});
test('stock decrease preserves priced quantities but only permits decreasing or removing the invalid line',()=>{
  const selected={...row(a,4),maxSeries:1};
  const limited={revision:4,items:[selected],modelCount:1,seriesCount:4,pieceCount:24,productTotalExact:'2400.00000000',currency:'TRY',valid:false,validationErrors:[{productId:a.id,code:'STOCK_LIMIT',requestedSeries:4,maxSeries:1}]};
  assert.equal(normalizeCart(limited),limited);assert.equal(limited.items[0].seriesCount,4);
  assert.deepEqual(cartRequest(limited,selected,3),{revision:4,items:[{productId:a.id,seriesCount:3}]});
  assert.deepEqual(cartRequest(limited,selected,0),{revision:4,items:[]});
  assert.throws(()=>cartRequest(limited,selected,4));assert.throws(()=>cartRequest(limited,selected,5));
  assert.throws(()=>cartRequest(limited,b,1));
  assert.throws(()=>normalizeCart({...limited,valid:true}));assert.throws(()=>normalizeCart({...limited,validationErrors:[]}));
  assert.throws(()=>normalizeCart({...limited,validationErrors:[{productId:a.id,code:'STOCK_LIMIT',requestedSeries:3,maxSeries:1}]}));
  const unavailable={...selected,maxSeries:0,selectable:false,availability:'unavailable'};
  const zero={...limited,items:[unavailable],validationErrors:[{productId:a.id,code:'STOCK_LIMIT',requestedSeries:4,maxSeries:0}]};
  assert.equal(normalizeCart(zero),zero);assert.deepEqual(cartRequest(zero,unavailable,3),{revision:4,items:[{productId:a.id,seriesCount:3}]});
});
test('unknown series availability remains visibly invalid and can be removed without inventing stock',()=>{
  const unknown={...row(a,2),maxSeries:null,selectable:false,availability:'unknown'};
  const uncertain={revision:5,items:[unknown],modelCount:1,seriesCount:2,pieceCount:12,productTotalExact:'1200.00000000',currency:'TRY',valid:false,validationErrors:[{productId:a.id,code:'STOCK_UNVERIFIED',requestedSeries:2,maxSeries:null}]};
  assert.equal(normalizeCart(uncertain),uncertain);assert.equal(uncertain.items[0].maxSeries,null);
  assert.deepEqual(cartRequest(uncertain,unknown,1),{revision:5,items:[{productId:a.id,seriesCount:1}]});
  assert.deepEqual(cartRequest(uncertain,unknown,0),{revision:5,items:[]});assert.throws(()=>cartRequest(uncertain,unknown,3));
  assert.throws(()=>normalizeCart({...uncertain,validationErrors:[{productId:a.id,code:'STOCK_LIMIT',requestedSeries:2,maxSeries:null}]}));
});
