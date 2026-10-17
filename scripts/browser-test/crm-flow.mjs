#!/usr/bin/env node
/**
 * Real Chromium + real React App against the explicit synthetic Cloud harness.
 * No auth state/token injection, external network, provider, SQL, or real data.
 * See README.md in this directory for prerequisites and repeatable startup.
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}
const origin = new URL(option('--origin', 'http://127.0.0.1:0')).origin;
const output = resolve(option('--output', 'work/browser-evidence'));
const browserPath = option('--chromium', process.env.CHROMIUM_PATH || '/usr/bin/chromium');
const playwrightPath = resolve(option('--playwright', 'work/browser/node_modules/playwright-core/index.mjs'));
function loopback(url) {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname);
}
assert.ok(loopback(origin) && /^http:/.test(origin) && new URL(origin).port !== '0', '--origin must be an explicit HTTP loopback synthetic harness URL');
await mkdir(output, {recursive:true});
const {chromium} = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({headless:true, executablePath:browserPath, args:['--no-sandbox', '--disable-dev-shm-usage']});
const startedAt = new Date().toISOString();
const evidence = {
  mode:'synthetic-loopback-browser', origin, startedAt, status:'RUNNING',
  scenarios:[], screenshots:[], errors:[], console:[], failedRequests:[], blockedRequests:[], httpErrors:[],
  nativePosts:[], nativeReadbacks:[], customerSubmits:[], customerRequests:[],
};
let stage = 'startup', page, lastPage;
const tasks = new Set();
const pushTask = task => {
  // Failed/stalled response bodies must not prevent failure evidence or browser
  // cleanup. Successful contract readbacks are required separately below.
  let timer;
  const bounded=Promise.race([task,new Promise(done=>{timer=setTimeout(done,5000);})]).finally(()=>clearTimeout(timer));
  tasks.add(bounded);void bounded.finally(()=>tasks.delete(bounded));
};
const contexts = [];
const nativePath = '/api/live/crm/erp/v2/drafts';
async function newContext() {
  const context = await browser.newContext({viewport:{width:1440,height:1080}, locale:'tr-TR', timezoneId:'Europe/Istanbul', serviceWorkers:'block'});
  contexts.push(context);
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin!==origin) {
      evidence.blockedRequests.push({url, method:route.request().method()});
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  if(typeof context.routeWebSocket==='function')await context.routeWebSocket('**/*', socket=>{
    evidence.blockedRequests.push({url:socket.url(),method:'WEBSOCKET'});
    socket.close({code:1008,reason:'Synthetic harness disables all WebSockets'});
  });
  context.on('page', watchPage);
  return context;
}
function watchPage(current) {
  lastPage = current;
  current.setDefaultTimeout(15000);
  current.on('console', message => {
    if (['error','warning'].includes(message.type())) evidence.console.push({type:message.type(), text:message.text()});
  });
  current.on('pageerror', error => evidence.errors.push({stage,message:error.message}));
  current.on('requestfailed', request => {
    evidence.failedRequests.push({stage,url:request.url(),method:request.method(),error:request.failure()?.errorText||''});
  });
  current.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === nativePath && request.method() === 'POST') evidence.nativePosts.push(request.postDataJSON());
    if (url.pathname === '/api/live/customer-product-requests/submit' && request.method() === 'POST') evidence.customerSubmits.push(request.postDataJSON());
  });
  current.on('response', response => {
    const url = new URL(response.url());
    if(response.status()>=400)pushTask(response.json().then(payload=>evidence.httpErrors.push({stage,path:url.pathname,status:response.status(),code:payload?.error?.code||''})).catch(()=>{}));
    if (response.status() === 200 && url.pathname.startsWith(`${nativePath}/`)) {
      pushTask(response.json().then(payload=>evidence.nativeReadbacks.push(payload.data)).catch(()=>{}));
    }
    if (response.status() === 200 && url.pathname === '/api/live/customer-product-requests/session') {
      pushTask(response.json().then(payload=>{if(payload.data?.request)evidence.customerRequests.push(payload.data.request);}).catch(()=>{}));
    }
  });
}
async function screenshot(current, name) {
  const file = `${String(evidence.screenshots.length+1).padStart(2,'0')}-${name}.png`;
  await current.screenshot({path:resolve(output,file), fullPage:true, animations:'disabled'});
  evidence.screenshots.push(file);
}
async function until(check, message, milliseconds=15000) {
  const deadline = Date.now()+milliseconds;
  while (Date.now()<deadline) {
    const value = await check();
    if(value)return value;
    await new Promise(done=>setTimeout(done,100));
  }
  throw Error(message);
}
function pass(name, detail={}) { evidence.scenarios.push({name,status:'PASS',...detail}); }
async function crmLogin(current, username='manager') {
  await current.getByLabel('Kullanıcı adı', {exact:true}).fill(username);
  await current.getByLabel('Parola', {exact:true}).fill('synthetic-only');
  await current.getByRole('button',{name:'CRM’e Giriş Yap',exact:true}).click();
  await current.locator('.app-shell').waitFor();
}
async function selectCustomer(current, customer='Sentetik Müşteri A') {
  const messages = current.getByRole('button',{name:'Mesajlar',exact:true});
  if(await messages.isVisible())await messages.click();
  await current.getByRole('button',{name:`${customer} konuşmasını aç`,exact:true}).click();
  await current.getByRole('button',{name:'Katalog',exact:true}).waitFor();
}
async function erpLogin(current) {
  const dialog = current.getByRole('dialog',{name:'ERP sipariş taslağı',exact:true});
  await dialog.getByLabel('ERP kullanıcı adı',{exact:true}).fill('erp-test');
  await dialog.getByLabel('ERP parolası',{exact:true}).fill('synthetic-only');
  await dialog.getByRole('button',{name:"ERP'ye bağlan",exact:true}).click();
  return dialog;
}
async function checkReceipt(dialog, requestId) {
  await dialog.getByRole('heading',{name:/ERP’de kayıtlı sipariş taslağı:/}).waitFor();
  assert.ok((await dialog.innerText()).includes(requestId), 'receipt shows same saved UUID');
  const receipt = evidence.nativeReadbacks.find(record=>record?.request?.requestId===requestId);
  assert.ok(receipt,'independent HTTP readback captured');
  assert.equal(receipt.customerName,'Sentetik Müşteri A');
  assert.equal(receipt.grandTotalExact4,'759.0000');
  assert.deepEqual(receipt.items.map(item=>({stockCode:item.stockCode,quantity:item.quantity})),[
    {stockCode:'SYN-8023',quantity:3},{stockCode:'SYN-9044',quantity:2},
  ]);
  return receipt;
}

try {
  const context = await newContext();
  // A public static marker must identify the deliberately started fixture.
  // This check runs before any synthetic credentials are entered.
  const marker = await context.request.get(`${origin}/`,{maxRedirects:0});
  assert.equal(marker.headers()['x-melisa-synthetic'],'1','refusing UI login: server is not explicitly marked synthetic');
  page = await context.newPage();
  stage = 'CRM login and customer selection';
  await page.goto(origin);
  await crmLogin(page);
  await selectCustomer(page);
  await screenshot(page,'customer-selected');
  pass('Normal CRM login and explicit synthetic customer selection');

  stage = 'Catalog selection, remove and quantities';
  await page.getByRole('button',{name:'Katalog',exact:true}).click();
  const catalog = page.getByRole('dialog',{name:'Katalog oluştur',exact:true});
  await catalog.getByRole('button',{name:/SYN-8023 .* seç$/}).click();
  await catalog.getByRole('button',{name:/SYN-9044 .* seç$/}).click();
  await catalog.getByRole('button',{name:'erp-9044 kaldır',exact:true}).click();
  assert.equal(await catalog.locator('.catalog-selected-row').count(),1);
  await catalog.getByRole('button',{name:/SYN-9044 .* seç$/}).click();
  assert.equal(await catalog.locator('.catalog-selected-row').count(),2);
  // Photos are served by the guarded synthetic API, never a provider URL.
  await until(async()=>await catalog.locator('.catalog-product-image img').count()>=2,'Synthetic product photos were not displayed');
  await screenshot(page,'catalog-two-products');
  pass('Catalog photo display; select two products; remove and re-add a product');
  await catalog.getByRole('button',{name:'ERP sipariş taslağı',exact:true}).click();
  const order = await erpLogin(page);
  await order.getByRole('combobox',{name:'ERP müşterisi',exact:true}).waitFor();
  await order.getByRole('combobox',{name:'ERP müşterisi',exact:true}).selectOption('701:TRY');
  const quantities = order.getByRole('spinbutton');
  await quantities.nth(0).fill('0');
  assert.equal(await order.getByRole('button',{name:'ERP taslağını oluştur',exact:true}).isDisabled(),true,'zero quantity cannot be saved');
  await quantities.nth(0).fill('1.5');
  assert.equal(await order.getByRole('button',{name:'ERP taslağını oluştur',exact:true}).isDisabled(),true,'fraction quantity cannot be saved');
  assert.equal(evidence.nativePosts.length,0,'invalid quantities did not POST');
  await quantities.nth(0).fill('3');
  await quantities.nth(1).fill('2');
  assert.equal(await order.getByRole('button',{name:'ERP taslağını oluştur',exact:true}).isEnabled(),true);
  await screenshot(page,'order-customer-quantities');
  pass('ERP customer match and invalid zero/fraction quantity guards; valid quantities 3 + 2');

  stage = 'Native order POST and independent readback';
  await order.getByRole('button',{name:'ERP taslağını oluştur',exact:true}).click();
  await order.getByRole('heading',{name:/ERP’de kayıtlı sipariş taslağı:/}).waitFor();
  await until(()=>evidence.nativeReadbacks.length,'Missing independent saved-order readback');
  assert.equal(evidence.nativePosts.length,1);
  const requestId = evidence.nativePosts[0].requestId;
  assert.match(requestId,/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i);
  const receipt = await checkReceipt(order,requestId);
  evidence.order = {requestId,documentNo:receipt.documentNo,grandTotalExact4:receipt.grandTotalExact4};
  await screenshot(page,'order-saved-readback');
  pass('One ERP draft saved through real UI and independently read back',{requestId,documentNo:receipt.documentNo,total:receipt.grandTotalExact4});

  stage = 'Close, list and reopen same saved draft';
  await order.getByRole('button',{name:'Kapat',exact:true}).click();
  await selectCustomer(page,'Sentetik Müşteri B');
  await page.getByRole('button',{name:'Taslak Siparişler',exact:true}).click();
  const card = page.locator(`[data-crm-request-id="${requestId}"]`);
  await card.waitFor();
  await screenshot(page,'saved-orders-list');
  await card.getByRole('button',{name:'Taslağı aç',exact:true}).click();
  await erpLogin(page);
  await checkReceipt(page.getByRole('dialog',{name:'ERP sipariş taslağı',exact:true}),requestId);
  assert.equal(evidence.nativePosts.length,1,'reopen performed read only');
  pass('Close → choose customer B → Taslak Siparişler → reopen original customer A with normal ERP login; same UUID and no duplicate POST');

  stage = 'Browser refresh and persisted draft recovery';
  await page.reload();
  // Normal CRM resume is allowed; if fixture deliberately requires a fresh
  // login the same form is used, without reading or injecting a token.
  await until(async()=>await page.getByRole('navigation',{name:'Ana menü'}).count()||await page.getByLabel('Kullanıcı adı',{exact:true}).count(),'CRM did not finish reloading');
  if(await page.getByLabel('Kullanıcı adı',{exact:true}).count())await crmLogin(page);
  await page.getByRole('button',{name:'Taslak Siparişler',exact:true}).click();
  const reloadedCard = page.locator(`[data-crm-request-id="${requestId}"]`);
  await reloadedCard.getByRole('button',{name:'Taslağı aç',exact:true}).click();
  await erpLogin(page);
  await until(()=>evidence.nativeReadbacks.filter(record=>record?.request?.requestId===requestId).length>=3,'Refresh did not read back same persisted draft');
  await checkReceipt(page.getByRole('dialog',{name:'ERP sipariş taslağı',exact:true}),requestId);
  assert.equal(evidence.nativePosts.length,1,'refresh and reopen did not create another draft');
  await screenshot(page,'order-reopened-after-refresh');
  pass('Browser refresh → persisted draft list → same UUID, customer, two lines and total; one POST');
  await page.setViewportSize({width:390,height:844});
  await screenshot(page,'order-mobile-viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile viewport has no document horizontal overflow');
  const mobileBounds = await page.getByRole('dialog',{name:'ERP sipariş taslağı',exact:true}).boundingBox();
  assert.ok(mobileBounds.x>=10 && mobileBounds.x+mobileBounds.width<=380,'mobile dialog fits inside viewport with 10px margins');
  const closeBounds = await page.getByRole('dialog',{name:'ERP sipariş taslağı',exact:true}).getByRole('button',{name:'Kapat',exact:true}).boundingBox();
  assert.ok(closeBounds.x>=0 && closeBounds.x+closeBounds.width<=390,'mobile close control remains inside viewport');
  await page.setViewportSize({width:1440,height:1080});
  pass('390px browser viewport receipt remains visible without page horizontal overflow (physical device not tested)');
  await page.getByRole('dialog',{name:'ERP sipariş taslağı',exact:true}).getByRole('button',{name:'Kapat',exact:true}).click();

  stage = 'Customer product request normal issued link';
  await selectCustomer(page);
  const staffRequests = page.getByRole('region',{name:'Müşteri ürün talepleri',exact:true});
  await staffRequests.getByRole('button',{name:'Müşteri kataloğu bağlantısı hazırla',exact:true}).click();
  const popup = page.waitForEvent('popup');
  await staffRequests.getByRole('link',{name:'Kataloğu aç',exact:true}).click();
  const customer = await popup;
  await customer.getByRole('button',{name:'SYN-8023 listeye ekle',exact:true}).click();
  await customer.getByRole('button',{name:'SYN-9044 listeye ekle',exact:true}).click();
  await customer.getByRole('button',{name:/Seçtiklerimi incele/}).click();
  await customer.getByLabel('SYN-8023 adet',{exact:true}).fill('0');
  await customer.getByLabel('SYN-8023 adet',{exact:true}).press('Tab');
  await customer.getByRole('alert').filter({hasText:'1–9999 arası adet girin.'}).waitFor();
  assert.equal(await customer.getByLabel('SYN-8023 adet',{exact:true}).inputValue(),'1');
  await customer.getByRole('button',{name:'SYN-9044 listeden çıkar',exact:true}).click();
  await until(async()=>await customer.locator('.request-review-item').count()===1,'Removed product was not persisted to customer draft');
  await customer.getByRole('button',{name:'Kataloğa dön',exact:true}).click();
  await customer.getByRole('button',{name:'SYN-9044 listeye ekle',exact:true}).click();
  await customer.getByRole('button',{name:/Seçtiklerimi incele/}).click();
  await customer.getByLabel('SYN-8023 adet',{exact:true}).fill('3');
  await customer.getByLabel('SYN-8023 adet',{exact:true}).press('Tab');
  await until(async()=>!(await customer.getByLabel('SYN-9044 adet',{exact:true}).isDisabled()),'Quantity write did not finish');
  await customer.getByLabel('SYN-9044 adet',{exact:true}).fill('2');
  await customer.getByLabel('SYN-9044 adet',{exact:true}).press('Tab');
  await until(async()=>!(await customer.getByRole('button',{name:/Talebi gönder/}).isDisabled()),'Customer draft did not save');
  await screenshot(customer,'customer-request-review');
  await customer.reload();
  await customer.getByRole('button',{name:/Seçtiklerimi incele/}).click();
  assert.equal(await customer.getByLabel('SYN-8023 adet',{exact:true}).inputValue(),'3');
  assert.equal(await customer.getByLabel('SYN-9044 adet',{exact:true}).inputValue(),'2');
  pass('Customer issued-link catalog: remove/re-add, invalid quantity rejected, saved 3 + 2 draft survives refresh');
  await customer.getByRole('button',{name:/Talebi gönder/}).click();
  await customer.getByRole('heading',{name:'Talebiniz alındı',exact:true}).waitFor();
  await screenshot(customer,'customer-request-submitted');
  assert.equal(evidence.customerSubmits.length,1);
  await customer.reload();
  await customer.getByRole('heading',{name:'Talebiniz alındı',exact:true}).waitFor();
  assert.equal(evidence.customerSubmits.length,1,'customer refresh did not resubmit');
  await until(()=>evidence.customerRequests.length,'Confirmed request was not independently reopened');
  evidence.customerRequest = {id:evidence.customerRequests.at(-1).id,quantityTotal:5,modelCount:2};
  await staffRequests.getByRole('button',{name:'Yenile',exact:true}).click();
  const managerRequest=staffRequests.locator(`[data-customer-request-id="${evidence.customerRequest.id}"]`);
  await managerRequest.waitFor();
  assert.ok((await managerRequest.innerText()).includes('2 ürün · 5 adet'));
  await managerRequest.scrollIntoViewIfNeeded();
  await screenshot(page,'staff-request-visible');
  pass('Customer submit → refresh → same request; manager sees 2 products / 5 units in assigned conversation');

  stage = 'Assigned and unrelated staff visibility';
  const assignedContext = await newContext();
  const assignedPage = await assignedContext.newPage();
  await assignedPage.goto(origin);
  await crmLogin(assignedPage,'assigned');
  await selectCustomer(assignedPage);
  const assignedRequest=assignedPage.getByRole('region',{name:'Müşteri ürün talepleri',exact:true}).locator(`[data-customer-request-id="${evidence.customerRequest.id}"]`);
  await assignedRequest.waitFor();
  assert.ok((await assignedRequest.innerText()).includes('2 ürün · 5 adet'));
  await assignedRequest.scrollIntoViewIfNeeded();
  assert.equal(await assignedPage.getByRole('button',{name:'Müşteri kataloğu bağlantısı hazırla',exact:true}).count(),0,'assigned staff cannot issue privileged customer links');
  await screenshot(assignedPage,'assigned-staff-request');
  const strangerContext = await newContext();
  const strangerPage = await strangerContext.newPage();
  await strangerPage.goto(origin);
  await crmLogin(strangerPage,'stranger');
  await strangerPage.getByText('Konuşma yok',{exact:true}).waitFor();
  assert.equal(await strangerPage.getByRole('button',{name:'Sentetik Müşteri A konuşmasını aç',exact:true}).count(),0);
  assert.equal(await strangerPage.locator('.staff-request-record').count(),0);
  await screenshot(strangerPage,'unrelated-staff-no-customer');
  pass('Normal assigned staff login sees the request; unrelated staff login sees neither customer nor request');

  stage = 'Authorization negative';
  const anonymous = await newContext();
  const denied = await anonymous.request.get(`${origin}${nativePath}/${requestId}`,{maxRedirects:0});
  assert.equal(denied.status(),401,'unauthenticated ERP draft read denied');
  pass('Unauthenticated ERP draft detail denied with HTTP 401');
  await Promise.all([...tasks]);
  assert.equal(evidence.nativePosts.length,1);
  assert.equal(evidence.customerSubmits.length,1);
  assert.equal(evidence.errors.length,0,'no browser page exceptions');
  assert.equal(evidence.blockedRequests.length,0,'application did not attempt network outside the selected synthetic origin');
  const seriousConsole = evidence.console.filter(entry=>entry.type==='error');
  assert.deepEqual(seriousConsole,[],'no console errors in normal browser flow');
  assert.deepEqual(evidence.httpErrors,[],'normal browser flow has no HTTP errors');
  // React StrictMode and view disposal deliberately cancel obsolete reads.
  const failedUnexpected = evidence.failedRequests.filter(entry=>!['net::ERR_ABORTED','NS_BINDING_ABORTED'].includes(entry.error));
  assert.deepEqual(failedUnexpected,[],'no unexpected failed browser requests');
  pass('No page exceptions, unexpected request failures, external requests, or normal-flow console errors');
  evidence.status = 'PASS';
} catch (error) {
  evidence.status = 'FAIL';
  evidence.failure = {stage,message:error.message,stack:error.stack};
  const failedPage=lastPage&&!lastPage.isClosed()?lastPage:page;
  if(failedPage&&!failedPage.isClosed())await screenshot(failedPage,'failure').catch(()=>{});
  process.exitCode = 1;
} finally {
  await Promise.all([...tasks]);
  evidence.finishedAt = new Date().toISOString();
  await writeFile(resolve(output,'result.json'),JSON.stringify(evidence,null,2)+'\n');
  await browser.close();
  console.log(JSON.stringify({status:evidence.status,scenarios:evidence.scenarios.length,output,order:evidence.order,failure:evidence.failure},null,2));
}
