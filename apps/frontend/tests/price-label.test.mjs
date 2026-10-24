import test from 'node:test';
import assert from 'node:assert/strict';
import {priceLabelText,exactPriceText,selectedSaleLines,selectionMessage} from '../src/catalog/productActions.js';

test('price labels show two decimals while source prices and order lines retain precision',()=>{
 assert.equal(priceLabelText('196.00000000'),'196,00');
 assert.equal(priceLabelText('1.23456789'),'1,23');
 assert.equal(priceLabelText('1.23500000','en'),'1.24');
 assert.equal(priceLabelText('0.00000000'),'0,00');
 assert.equal(priceLabelText('9007199254740993.12500000','en'),'9,007,199,254,740,993.13');
 for(const invalid of [null,196,'196','NaN','1.23'])assert.equal(priceLabelText(invalid),null);
 const product={id:'erp-7',code:'7',name:'Synthetic product',currency:'TRY',prices:{TRY:1.23456789},priceExact:'1.23456789'};
 const before=JSON.stringify(product);priceLabelText(product.priceExact);
 assert.equal(JSON.stringify(product),before);
 assert.equal(selectedSaleLines([product])[0].priceExact,'1.23456789');
 assert.equal(selectedSaleLines([product])[0].unitPrice,1.23456789);
 assert.equal(exactPriceText(product.priceExact),'1.23456789');
 assert.match(selectionMessage([product],true),/TRY 1,23/);
});
