import '../../../tests/offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('actual staff component exposes request review to personnel without grant/send controls, manager grant remains manual',async()=>{
  const testRoot=fileURLToPath(new URL('../.sites-runtime/',import.meta.url));await mkdir(testRoot,{recursive:true});
  const directory=await mkdtemp(path.join(testRoot,'crm-product-request-ui-')),file=path.join(directory,'staff.mjs');
  try {
    await build({absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),tsconfigRaw:{},entryPoints:[fileURLToPath(new URL('../src/customerProductRequest/StaffProductRequests.jsx',import.meta.url))],outfile:file,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','@phosphor-icons/react'],loader:{'.css':'empty'}});
    const Staff=(await import(pathToFileURL(file).href)).default;
    const render=canIssue=>renderToStaticMarkup(React.createElement(Staff,{accessToken:'synthetic-normal-user',conversationId:'7733',canIssue}));
    const personnel=render(false);assert.match(personnel,/Müşteri ürün talepleri/);assert.match(personnel,/Yenile/);assert.doesNotMatch(personnel,/bağlantısı hazırla|Talebi gönder|WhatsApp|synthetic-normal-user/);
    const manager=render(true);assert.match(manager,/Müşteri kataloğu bağlantısı hazırla/);assert.doesNotMatch(manager,/synthetic-normal-user|whatsapp\.com|wa\.me|sendMessage/);
  } finally {await unlink(file).catch(()=>{});await rmdir(directory);}
});
test('customer entry remains a lazy independent route and core controls use authoritative page controller',async()=>{
  const base=new URL('../src/',import.meta.url),[main,page,css]=await Promise.all([readFile(new URL('main.jsx',base),'utf8'),readFile(new URL('customerProductRequest/CustomerProductRequestPage.jsx',base),'utf8'),readFile(new URL('customerProductRequest/customerProductRequest.css',base),'utf8')]);
  assert.match(main,/React\.lazy\(\(\) => import\("\.\/customerProductRequest\/CustomerProductRequestPage\.jsx"\)\)/);assert.match(main,/return <App \/>/);
  for(const label of ['Ürün adı veya kodu','Listeye ekle','Seçtiklerimi incele','Talebi gönder','Kataloğa dön','Talebiniz alındı'])assert(page.includes(label));
  assert.match(page,/IntersectionObserver/);assert.match(page,/controller\?\.toggle\(product\)/);assert.match(page,/controller\?\.submit\(\)/);assert.match(page,/controller\?\.edit\(items\.filter/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/body\.customer-product-request-body/);assert.doesNotMatch(page,/M-101|M-102|0–2|1000|FedEx|wa\.me|sendMessage|submitOrder|localStorage|liveApi/);
});
