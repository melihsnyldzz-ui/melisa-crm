import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogProductsForCurrency,selectedSaleLines,priceLabelText} from '../src/catalog/productActions.js';
import {nativeOrderPayload,validateNativeReceipt} from '../src/lib/nativeOrder.js';
const products=Array.from({length:50},(_,i)=>({id:'erp-'+(i+1),erpProductId:i+1,code:'SYN-'+i,name:'Synthetic product',status:'active',hold:{blocked:false},unit:{verified:true,label:'ADET'},currency:'TRY',priceExact:'1.00000000',prices:{TRY:1,USD:1.12345678,EUR:2.23456789},salePrices:['TRY','USD','EUR'].map((currency,j)=>({id:String(i*3+j+1),unitSourceId:String(i+1),tier:1,isMainUnit:true,currency,priceExact:['1.00000000','1.12345678','2.23456789'][j],sourceKey:'synthetic:'+i+':'+currency}))}));
test('all 50 products use selected exact TRY USD EUR prices through order readback without currency fallback',()=>{
 for(const currency of ['TRY','USD','EUR']){
  const chosen=catalogProductsForCurrency(products,currency),lines=selectedSaleLines(chosen),rate=currency==='TRY'?'1.00000000':'32.12345678';
  const payload=nativeOrderPayload('00000000-0000-4000-8000-000000000001',{id:88,phone:'905550000001'},{id:19,revision:'b'.repeat(64)},{basis:'operator-confirmed',reason:'Synthetic fixture scope'},lines,lines.map(()=>3),rate);
  assert.equal(payload.documentCurrency,currency);assert.ok(payload.items.every(line=>line.currency===currency&&line.priceSourceKey.endsWith(currency)));
  let total=0n;const items=payload.items.map(line=>{const price=(BigInt(line.priceExact8.replace('.',''))+5000n)/10000n;const amount=price*3n;total+=amount;const text=n=>String(n/10000n)+'.'+String(n%10000n).padStart(4,'0');return {...line,unitPriceExact4:text(price),lineTotalExact4:text(amount)};});
  const text=n=>String(n/10000n)+'.'+String(n%10000n).padStart(4,'0');const receipt={request:payload,status:'draft',erpPersisted:true,testOnly:true,stockEffect:false,ledgerEffect:false,collectionEffect:false,reservationEffect:false,items,grandTotalExact4:text(total),amountTryExact4:text((total*BigInt(rate.replace('.',''))+50000000n)/100000000n)};
  assert.equal(validateNativeReceipt(receipt,payload),receipt);assert.match(priceLabelText(lines[0].priceExact),/^\d+,\d{2}$/);
 }
});
test('unavailable ambiguous blocked and unverifiable unit tuples never silently select another currency',()=>{
 for(const product of [{...products[0],salePrices:products[0].salePrices.filter(p=>p.currency!=='EUR')},{...products[0],salePrices:[...products[0].salePrices,products[0].salePrices[2]]},{...products[0],hold:{blocked:true}},{...products[0],unit:{verified:false}}])assert.throws(()=>catalogProductsForCurrency([product],'EUR'));
});

test('unpriced product sharing retains accepted baseline while price and order actions fail closed',()=>{
 const noPrice={...products[0],salePrices:[]};assert.equal(catalogProductsForCurrency([noPrice],'EUR',{requirePrice:false})[0],noPrice);assert.throws(()=>catalogProductsForCurrency([noPrice],'EUR'));
});
