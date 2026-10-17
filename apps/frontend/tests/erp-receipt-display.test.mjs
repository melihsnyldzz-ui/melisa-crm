import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,rmSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('actual native receipt labels use two decimals while exact totals retain native precision',async()=>{
 mkdirSync('.sites-runtime',{recursive:true});const file='.sites-runtime/erp-receipt-display-test.mjs';
 try{
  await build({entryPoints:['src/ERPOrderDialog.jsx'],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react']});
  const {NativeOrderReceiptDisplay}=await import(pathToFileURL(`${process.cwd()}/${file}`).href);
  const receipt={documentNo:'SYNTHETIC',customerName:'Synthetic customer',request:{documentCurrency:'TRY'},grandTotalExact4:'457.2468',items:[{productId:7,stockCode:'TEST7',quantity:2,currency:'TRY',unitPriceExact4:'228.6234',lineTotalExact4:'457.2468'}]};
  const before=JSON.stringify(receipt),html=renderToStaticMarkup(React.createElement(NativeOrderReceiptDisplay,{receipt}));
  assert.match(html,/TRY 457,25/);assert.match(html,/2 birim × TRY 228,62 = 457,25/);assert.doesNotMatch(html,/228\.6234|457\.2468/);
  assert.equal(JSON.stringify(receipt),before);assert.equal(Number(receipt.items[0].unitPriceExact4)*receipt.items[0].quantity,Number(receipt.grandTotalExact4));
  receipt.grandTotalExact4='228.5000';receipt.items[0]={...receipt.items[0],quantity:1,unitPriceExact4:'228.5000',lineTotalExact4:'228.5000'};
  assert.match(renderToStaticMarkup(React.createElement(NativeOrderReceiptDisplay,{receipt})),/TRY 228,50/);
 }finally{rmSync(file,{force:true});}
});
