import {draftItems, productId} from './model.js';

const customerRoot = '/api/live/customer-product-requests';
const staffRoot = '/api/live/crm/customer-product-requests';
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
function contractError() { return Object.assign(new Error('Katalog yanıtı doğrulanamadı.'), {code:'PRODUCT_REQUEST_INVALID_RESPONSE'}); }
function normalizedDate(value) { const time=typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:typeof value==='string'?Date.parse(value):NaN;if(!Number.isFinite(time))throw contractError();return new Date(time).toISOString(); }
function normalizedProduct(value, selected = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError();
  const id = productId(value.id || value.productId);
  if (typeof value.stockCode !== 'string' || !value.stockCode.trim() || typeof value.productName !== 'string' || !value.productName.trim()) throw contractError();
  const photoPath = `${customerRoot}/products/${encodeURIComponent(id)}/photo`;
  if (value.photoPath !== photoPath) throw contractError();
  const product = {id, stockCode:value.stockCode, productName:value.productName, category:typeof value.category === 'string' ? value.category : null, age:typeof value.age === 'string' ? value.age : null, photoPath};
  if (selected) { const [item] = draftItems([{productId:id, quantity:value.quantity}]); return {...product,...item}; }
  return product;
}
export function normalizedRequest(value) {
  if (!value || typeof value.id !== 'string' || !value.id || value.status !== 'interest' || !Array.isArray(value.items) || !value.items.length || value.items.length > 50) throw contractError();
  const items = value.items.map(item => normalizedProduct(item, true));
  draftItems(items);
  const quantityTotal = items.reduce((total,item) => total + item.quantity, 0);
  if (value.modelCount !== items.length || value.quantityTotal !== quantityTotal) throw contractError();
  return {id:value.id,status:'interest',submittedAt:normalizedDate(value.submittedAt),items,modelCount:items.length,quantityTotal};
}
export function normalizedSession(value) {
  if (!value || typeof value.sessionId !== 'string' || !value.sessionId || !Number.isSafeInteger(value.draft?.revision) || value.draft.revision < 0 || !Array.isArray(value.draft.items) || value.draft.items.length > 50) throw contractError();
  const items = value.draft.items.map(item => normalizedProduct(item, true));
  draftItems(items);
  if (value.request !== null && !value.request) throw contractError();
  return {sessionId:value.sessionId,expiresAt:normalizedDate(value.expiresAt),draft:{revision:value.draft.revision,items},request:value.request === null ? null : normalizedRequest(value.request)};
}
function normalizedFacets(values) {
  if (!Array.isArray(values)) throw contractError();
  return values.map(item => {
    if (typeof item?.value !== 'string' || !item.value || !(item.count === null || Number.isSafeInteger(item.count) && item.count >= 0)) throw contractError();
    return {value:item.value,count:item.count};
  });
}
function deadline(callerSignal) {
  const controller=new AbortController(),cancel=()=>controller.abort();
  callerSignal?.addEventListener('abort',cancel,{once:true});if(callerSignal?.aborted)controller.abort();
  const timer=setTimeout(cancel,20000);timer.unref?.();
  return {signal:controller.signal,close(){clearTimeout(timer);callerSignal?.removeEventListener('abort',cancel);}};
}
async function request(fetcher, root, token, path, {method='GET',body,signal}={}) {
  if (!token || typeof token !== 'string') throw Object.assign(new Error('Katalog bağlantısı gerekli.'),{status:401});
  const headers = {Accept:'application/json',Authorization:`Bearer ${token}`};
  if (body !== undefined) headers['Content-Type']='application/json';
  const bounded=deadline(signal);
  try {
    const response = await fetcher(`${root}${path}`, {method,headers,cache:'no-store',redirect:'error',credentials:'omit',signal:bounded.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});
    let payload;
    try { payload=await response.json(); } catch { if(bounded.signal.aborted)throw new DOMException('Cancelled','AbortError');throw contractError(); }
    if (!response.ok) throw Object.assign(new Error('İşlem tamamlanamadı.'),{status:response.status,code:typeof payload?.error?.code==='string'?payload.error.code:''});
    if (payload?.success !== true || !Object.hasOwn(payload,'data')) throw contractError();
    if (bounded.signal.aborted) throw new DOMException('Cancelled','AbortError');
    return payload;
  } finally {bounded.close();}
}
function filterQuery({search='',category='',age='',page=1,limit=24}={}) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw Error('Katalog sayfası doğrulanamadı.');
  const query=new URLSearchParams();
  for (const [key,value] of Object.entries({search,category,age})) {
    if (typeof value !== 'string' || value.trim().length > 120) throw Error('Arama metni doğrulanamadı.');
    if (value.trim()) query.set(key,value.trim());
  }
  query.set('page',String(page));query.set('limit',String(limit));
  return query;
}
function signature(bytes,type) {
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
  const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if (!(type==='image/jpeg'&&jpeg||type==='image/png'&&png||type==='image/webp'&&webp)) throw Object.assign(Error('Ürün fotoğrafı doğrulanamadı.'),{status:415});
}
export async function guardedPhoto(fetcher, token, id, {signal}={}) {
  productId(id);
  if (!token) throw Object.assign(Error('Katalog bağlantısı gerekli.'),{status:401});
  const bounded=deadline(signal);
  try {
  const response=await fetcher(`${customerRoot}/products/${encodeURIComponent(id)}/photo`,{cache:'no-store',redirect:'error',credentials:'omit',signal:bounded.signal,headers:{Accept:'image/jpeg,image/png,image/webp',Authorization:`Bearer ${token}`}});
  if (!response.ok) throw Object.assign(Error('Fotoğraf açılamadı.'),{status:response.status});
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg','image/png','image/webp'].includes(type)) { void response.body?.cancel().catch(()=>{}); throw Object.assign(Error('Fotoğraf türü doğrulanamadı.'),{status:415}); }
  if (Number(response.headers.get('content-length'))>MAX_PHOTO_BYTES) { void response.body?.cancel().catch(()=>{}); throw Object.assign(Error('Fotoğraf güvenli boyutu aşıyor.'),{status:413}); }
  const reader=response.body?.getReader();if(!reader)throw contractError();
  const chunks=[];let size=0;
  try { while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_PHOTO_BYTES)throw Object.assign(Error('Fotoğraf güvenli boyutu aşıyor.'),{status:413});chunks.push(chunk.value);} }
  catch(error){void reader.cancel().catch(()=>{});throw error;}
  if(bounded.signal.aborted)throw new DOMException('Cancelled','AbortError');
  if(!size)throw contractError();
  const blob=new Blob(chunks,{type});signature(new Uint8Array(await blob.slice(0,16).arrayBuffer()),type);return blob;
  } finally {bounded.close();}
}
export function createCustomerRequestApi(capability,{fetcher=globalThis.fetch}={}) {
  return {
    async session(options){return normalizedSession((await request(fetcher,customerRoot,capability,'/session',options)).data);},
    async products(filters,options){const payload=await request(fetcher,customerRoot,capability,`/products?${filterQuery(filters)}`,options),meta=payload.meta;if(!Array.isArray(payload.data)||payload.data.length>50||!meta||!Number.isSafeInteger(meta.page)||meta.page<1||!Number.isSafeInteger(meta.total)||meta.total<0||!Number.isSafeInteger(meta.totalPages)||meta.totalPages<0||typeof meta.hasNextPage!=='boolean')throw contractError();return {products:payload.data.map(item=>normalizedProduct(item)),meta:{page:meta.page,total:meta.total,totalPages:meta.totalPages,hasNextPage:meta.hasNextPage,categories:normalizedFacets(meta.categories),ages:normalizedFacets(meta.ages)}};},
    async updateDraft(revision,items,options){if(!Number.isSafeInteger(revision)||revision<0)throw Error('Seçimler doğrulanamadı.');return normalizedSession((await request(fetcher,customerRoot,capability,'/draft',{...options,method:'PUT',body:{revision,items:draftItems(items)}})).data);},
    async submit(revision,operationId,options){if(!Number.isSafeInteger(revision)||revision<0||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId||''))throw Error('Talep doğrulanamadı.');return normalizedSession((await request(fetcher,customerRoot,capability,'/submit',{...options,method:'POST',body:{revision,operationId}})).data);},
    photo:(id,options)=>guardedPhoto(fetcher,capability,id,options),
  };
}
export function createStaffRequestApi(accessToken,{fetcher=globalThis.fetch}={}) {
  function conversationId(value){const id=String(value??'');if(!/^\d+$/.test(id)||id==='0')throw Error('Konuşma doğrulanamadı.');return id;}
  return {
    async list(value,options){const data=(await request(fetcher,staffRoot,accessToken,`?conversationId=${encodeURIComponent(conversationId(value))}`,options)).data;if(!Array.isArray(data))throw contractError();return data.map(normalizedRequest);},
    async issue(value,options){const data=(await request(fetcher,staffRoot,accessToken,'/sessions',{...options,method:'POST',body:{conversationId:conversationId(value)}})).data;if(typeof data?.sessionId!=='string'||typeof data.capability!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.capability))throw contractError();return {sessionId:data.sessionId,capability:data.capability,expiresAt:normalizedDate(data.expiresAt)};},
    async detail(id,options){if(typeof id!=='string'||!/^[A-Za-z0-9_-]+$/.test(id))throw Error('Talep doğrulanamadı.');return normalizedRequest((await request(fetcher,staffRoot,accessToken,`/${encodeURIComponent(id)}`,options)).data);},
  };
}
