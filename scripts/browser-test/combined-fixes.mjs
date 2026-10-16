#!/usr/bin/env node
// Browser-only integration probes for the existing PR13/14/15 fixes.
// Synthetic network response shaping and clipboard delays are explicit test
// dependencies. Product modules, authentication and the PR17 smoke stay intact.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {productPhoto} from '../cloud-test/fixtures.mjs';

const args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const origin=new URL(option('--origin','http://127.0.0.1:0')).origin;
assert.ok(/^http:/.test(origin)&&['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname)&&new URL(origin).port!=='0','Explicit synthetic loopback origin required');
const output=resolve(option('--output','work/combined-browser-fixes'));
await mkdir(output,{recursive:true});
const {chromium}=await import(pathToFileURL(resolve(option('--playwright','work/browser/node_modules/playwright-core/index.mjs'))).href);
const browser=await chromium.launch({headless:true,executablePath:option('--chromium','/usr/bin/chromium'),args:['--no-sandbox','--disable-dev-shm-usage']});
const result={mode:'synthetic-combined-fixes-browser',origin,startedAt:new Date().toISOString(),status:'RUNNING',scenarios:[],screenshots:[],pageErrors:[],consoleErrors:[],httpErrors:[],failedRequests:[],blockedRequests:[],photoRequests:[],mutations:[],shaping:[]};
let currentPage,stage='startup';
const pass=(name,details={})=>result.scenarios.push({name,status:'PASS',...details});
async function until(check,message){for(let i=0;i<150;i++){if(await check())return;await new Promise(done=>setTimeout(done,100));}throw Error(message);}
async function shot(name){const file=String(result.screenshots.length+1).padStart(2,'0')+'-'+name+'.png';await currentPage.screenshot({path:resolve(output,file),fullPage:true,animations:'disabled'});result.screenshots.push(file);}
async function context({fixture='',clipboard=false}={}){
 const ctx=await browser.newContext({viewport:{width:1440,height:1080},locale:'tr-TR',timezoneId:'Europe/Istanbul',serviceWorkers:'block'});
 if(clipboard)await ctx.addInitScript(()=>{
  const calls=[];
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(value){return new Promise((resolve,reject)=>calls.push({value,resolve,reject}));}}});
  window.__syntheticClipboard={calls,settle(index,success){const call=calls[index];if(!call)throw Error('Missing synthetic clipboard call');success?call.resolve():call.reject(Error('Synthetic clipboard rejection'));}};
 });
 await ctx.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(/^https?:/.test(url.protocol)&&url.origin!==origin){result.blockedRequests.push({url:url.href,method:request.method()});return route.abort('blockedbyclient');}
  if(fixture==='photos'&&url.pathname.match(/^\/api\/live\/crm\/catalog\/products\/(erp-\d+)\/photo$/)){
   const id=url.pathname.split('/').at(-2),variant=url.searchParams.get('variant')||'preview';
   // Distinct, locally generated colors expose accidental preview reuse in the
   // actual JPEG. Both are 240px fixtures; this makes no quality claim.
   const source=variant==='original'?id:id==='erp-8023'?'erp-9044':'erp-8023';
   return route.fulfill({status:200,headers:{'content-type':'image/png','x-melisa-synthetic':'1','cache-control':'no-store'},body:productPhoto(source)});
  }
  const catalog=fixture==='usd'&&/^\/api\/live\/crm\/catalog\/products(?:\/erp-\d+)?$/.test(url.pathname);
  const customers=fixture==='usd'&&url.pathname==='/api/live/crm/erp/v2/customers';
  if(catalog||customers){
   const response=await route.fetch({maxRedirects:0});assert.equal(response.status(),200);
   const body=await response.json();
   if(catalog){const usd=p=>({...p,currency:'USD',salePrices:p.salePrices.map(price=>({...price,currency:'USD'}))});body.data=Array.isArray(body.data)?body.data.map(usd):usd(body.data);}
   if(customers)body.data.entries=body.data.entries.map(customer=>({...customer,currency:'USD'}));
   result.shaping.push({fixture:'USD synthetic response only',path:url.pathname});
   return route.fulfill({response,json:body});
  }
  return route.continue();
 });
 if(typeof ctx.routeWebSocket==='function')await ctx.routeWebSocket('**/*',socket=>{result.blockedRequests.push({url:socket.url(),method:'WEBSOCKET'});socket.close({code:1008,reason:'Synthetic no-network test'});});
 const marker=await ctx.request.get(origin+'/',{maxRedirects:0});assert.equal(marker.headers()['x-melisa-synthetic'],'1','Refusing non-synthetic origin');
 const page=await ctx.newPage();currentPage=page;page.setDefaultTimeout(15000);
 page.on('pageerror',error=>result.pageErrors.push({stage,message:error.message}));
 page.on('console',message=>{if(message.type()==='error')result.consoleErrors.push({stage,message:message.text()});});
 page.on('response',response=>{if(response.status()>=400)result.httpErrors.push({stage,status:response.status(),path:new URL(response.url()).pathname});});
 page.on('requestfailed',request=>result.failedRequests.push({stage,path:new URL(request.url()).pathname,error:request.failure()?.errorText||''}));
 page.on('request',request=>{const url=new URL(request.url());if(/\/photo$/.test(url.pathname))result.photoRequests.push({stage,path:url.pathname,variant:url.searchParams.get('variant')||'preview'});if(['POST','PUT','DELETE','PATCH'].includes(request.method())&&!['/api/live/auth/login','/api/live/crm/erp/login'].includes(url.pathname))result.mutations.push({stage,path:url.pathname,method:request.method()});});
 await page.goto(origin);
 await page.getByLabel('Kullanıcı adı',{exact:true}).fill('manager');await page.getByLabel('Parola',{exact:true}).fill('synthetic-only');await page.getByRole('button',{name:'CRM’e Giriş Yap',exact:true}).click();await page.locator('.app-shell').waitFor();
 return {page,ctx};
}
async function select(page,letter){const scrim=page.getByRole('button',{name:'Bilgi panelini kapat',exact:true}),reopen=await scrim.isVisible();if(reopen)await scrim.click();await page.getByRole('button',{name:`Sentetik Müşteri ${letter} konuşmasını aç`,exact:true}).click();await page.locator('.chat-title').filter({hasText:`Sentetik Müşteri ${letter}`}).waitFor();if(reopen)await page.locator('.chat-title').click();}
async function settleClipboard(page,index,success){await page.evaluate(async({index,success})=>{window.__syntheticClipboard.settle(index,success);await Promise.resolve();await new Promise(done=>requestAnimationFrame(()=>done()));},{index,success});}

try{
 stage='PR14 delayed clipboard feedback across customer switch';
 {
  const {page,ctx}=await context({clipboard:true});await select(page,'A');await page.locator('.chat-title').click();
  const phone=page.getByRole('region',{name:'Telefon ve ülke bilgisi',exact:true});await phone.waitFor();
  await phone.getByRole('button',{name:'Telefon numarasını kopyala',exact:true}).click();
  await select(page,'B');await settleClipboard(page,0,true);assert.equal(await phone.locator('.copy-feedback').innerText(),'','obsolete A success cannot mark B');
  await shot('phone-old-success-discarded-on-b');
  await select(page,'A');await phone.getByRole('button',{name:'Telefon numarasını kopyala',exact:true}).click();
  await select(page,'B');await phone.getByRole('button',{name:'Telefon numarasını kopyala',exact:true}).click();
  await settleClipboard(page,2,true);await phone.locator('.copy-feedback').filter({hasText:'Numara kopyalandı'}).waitFor();
  await settleClipboard(page,1,false);assert.equal(await phone.locator('.copy-feedback').innerText(),'Numara kopyalandı','obsolete A rejection cannot replace current B success');
  const copiedPhones=await page.evaluate(()=>window.__syntheticClipboard.calls.map(call=>call.value));assert.deepEqual(copiedPhones,['+905550000001','+905550000001','+905550000002']);
  await shot('phone-current-b-success-preserved');pass('PR14 real UI rejects delayed success/failure from customer A after switching to B',{copiedPhones});await ctx.close();
 }

 stage='PR15 chosen canonical JPEG uses original with cached preview';
 {
  const {page,ctx}=await context({fixture:'photos'});await select(page,'A');await page.getByRole('button',{name:'Katalog',exact:true}).click();
  const catalog=page.getByRole('dialog',{name:'Katalog oluştur',exact:true});
  await catalog.getByRole('button',{name:/SYN-8023 .* seç$/}).click();await catalog.getByRole('button',{name:/SYN-9044 .* seç$/}).click();
  await catalog.getByRole('button',{name:/^Önizle/}).click();await catalog.getByRole('button',{name:'Ürün fotoğrafı',exact:true}).click();await catalog.getByRole('combobox',{name:'Fotoğrafı hazırlanacak ürün',exact:true}).selectOption('erp-8023');
  await until(()=>result.photoRequests.some(p=>p.stage===stage&&p.path.includes('erp-8023')&&p.variant==='original')&&result.photoRequests.some(p=>p.stage===stage&&p.path.includes('erp-8023')&&p.variant==='preview'),'Original and preview fixtures not both loaded');
  await until(async()=>await catalog.locator('.photo-document img').count()===1,'Selected photo preview unavailable');
  const start=result.photoRequests.length,downloadPromise=page.waitForEvent('download');await catalog.getByRole('button',{name:'İndir',exact:true}).click();const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/^melisa-katalog-erp-8023-.*\.jpg$/);
  const downloaded='selected-canonical-original.jpg';await download.saveAs(resolve(output,downloaded));const bytes=await readFile(resolve(output,downloaded));assert.deepEqual([...bytes.subarray(0,3)],[255,216,255]);
  const decoded=await page.evaluate(async base64=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),char=>char.charCodeAt(0))],{type:'image/jpeg'}));const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {width:image.width,height:image.height,pixel:[...ctx.getImageData(420,502,1,1).data]};},bytes.toString('base64'));
  assert.equal(decoded.width,960);assert.equal(decoded.height,1220);assert.ok(decoded.pixel[0]>decoded.pixel[1]+40&&decoded.pixel[0]>decoded.pixel[2]+35,'download must contain original pink fixture, not cached blue preview');
  const exportFetches=result.photoRequests.slice(start);assert.ok(exportFetches.every(photo=>photo.path.includes('erp-8023')&&photo.variant==='original'),'export cannot fetch a preview or other selected product');
  await shot('selected-jpg-original-download');pass('PR15 real JPG download contains original fixture pixels while preview fixture is cached',{file:downloaded,...decoded,exportPhotoRequests:exportFetches,note:'240px synthetic source variants; no real image quality claim'});await ctx.close();
 }

 stage='PR13 exact8 exchange-rate field blur';
 {
  const {page,ctx}=await context({fixture:'usd'});await select(page,'A');await page.getByRole('button',{name:'Katalog',exact:true}).click();const catalog=page.getByRole('dialog',{name:'Katalog oluştur',exact:true});await catalog.getByRole('combobox',{name:'Katalog para birimi',exact:true}).selectOption('USD');await catalog.getByRole('button',{name:/SYN-8023 .* seç$/}).click();await catalog.getByRole('button',{name:'ERP sipariş taslağı',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'ERP sipariş taslağı',exact:true});await dialog.getByLabel('ERP kullanıcı adı',{exact:true}).fill('erp-test');await dialog.getByLabel('ERP parolası',{exact:true}).fill('synthetic-only');await dialog.getByRole('button',{name:"ERP'ye bağlan",exact:true}).click();const rate=dialog.getByLabel('Döviz kuru',{exact:true});await until(async()=>await rate.isEnabled(),'USD rate input is not editable');
  const cases=[['999999999999.12345678','999999999999.12345678'],['123456789012.87654321','123456789012.87654321'],['1.12345678','1.12345678'],['0.00000001','0.00000001'],['0002.50','2.50000000'],['1.123456789','1.123456789'],['1e2','1e2']];
  for(const [value,expected]of cases){await rate.fill(value);await rate.press('Tab');assert.equal(await rate.inputValue(),expected,`blur ${value}`);}
  await rate.fill('999999999999.12345678');await rate.press('Tab');await shot('exchange-rate-exact8-preserved');pass('PR13 actual USD rate field preserves exact8 strings, pads valid input and leaves invalid text for validation',{cases,note:'USD synthetic responses only; no order submitted'});await ctx.close();
 }

 assert.deepEqual(result.mutations,[],'extra fixes probes must not create drafts, requests, messages or commerce');assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.consoleErrors,[]);assert.deepEqual(result.httpErrors,[]);assert.deepEqual(result.blockedRequests,[]);assert.deepEqual(result.failedRequests.filter(request=>request.error!=='net::ERR_ABORTED'),[]);
 pass('Extra probes produce no draft/request/message writes, unexpected browser errors or requests outside selected synthetic origin');result.status='PASS';
}catch(error){result.status='FAIL';result.failure={stage,message:error.message,stack:error.stack};if(currentPage&&!currentPage.isClosed())await shot('failure').catch(()=>{});process.exitCode=1;}
finally{result.finishedAt=new Date().toISOString();await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:result.status,scenarios:result.scenarios.length,output,failure:result.failure},null,2));}
