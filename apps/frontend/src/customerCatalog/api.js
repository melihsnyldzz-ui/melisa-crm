import {validCatalogToken,validProductId,normalizeSession,normalizeProduct,normalizeCart,normalizeOrder} from './model.js';
const ROOT='/api/customer-catalog';
export const MAX_CUSTOMER_PHOTO_BYTES=3*1024*1024;
const failure=(message,properties={})=>Object.assign(new Error(message),properties);
function approvedLinkOrigin(value) {
  if(typeof value!=='string')return false;
  let parsed;try{parsed=new URL(value);}catch{return false;}
  if(parsed.protocol!=='http:'||parsed.port!=='62600'||parsed.origin!==value||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)return false;
  const octets=parsed.hostname.split('.').map(Number);
  return octets.length===4&&octets.every(part=>Number.isInteger(part)&&part>=0&&part<=255)
    &&(parsed.hostname==='192.168.1.46'||octets[0]===100&&octets[1]>=64&&octets[1]<=127);
}

export function customerCatalogLinkUrl(result,operatorOrigin) {
  if(!/^\/katalog#[A-Za-z0-9_-]{43}$/.test(result?.url||'')||result.linkOrigin!==undefined&&!approvedLinkOrigin(result.linkOrigin))throw failure('Mobil katalog bağlantısının ağ adresi doğrulanamadı.');
  return new URL(result.url,result.linkOrigin??operatorOrigin).href;
}

async function transport(path,token,{signal,timeoutMs=25000,...options}={}) {
  if (!validCatalogToken(token)) throw failure('Katalog bağlantınız geçerli değil. WhatsApp’taki bağlantıyı yeniden açın.',{status:401});
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  const timer=setTimeout(abort,timeoutMs);
  try {
    const response=await fetch(ROOT+path,{...options,signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),Authorization:`Bearer ${token}`}});
    if (!response.ok) {
      const body=await response.json().catch(()=>null);
      throw failure(body?.error?.message || 'Katalog işlemi tamamlanamadı. Lütfen tekrar kontrol edin.',{status:response.status,code:body?.error?.code});
    }
    const result=await response.json();
    if (result?.success!==true) throw failure('Katalog yanıtı doğrulanamadı.');
    return result;
  } catch(error) {
    if(controller.signal.aborted&&!signal?.aborted)throw failure('Bağlantı zaman aşımına uğradı. İşlem durumunu yeniden kontrol edin.',{code:'CUSTOMER_CATALOG_TIMEOUT'});
    throw error;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export const customerCatalogApi={
  async session(token,options) {return normalizeSession(await transport('/session',token,options));},
  async products(token,filters={},options) {
    const params=new URLSearchParams();
    for(const key of ['scope','search','age','type','maxPrice','color'])if(filters[key]!==undefined&&filters[key]!=='')params.set(key,String(filters[key]));
    const result=await transport('/products?'+params,token,options);
    if(!Array.isArray(result.data?.products))throw failure('Ürün listesi doğrulanamadı.');
    result.data.products.forEach(normalizeProduct);return result.data;
  },
  async saveCart(token,body,options) {return normalizeCart((await transport('/cart',token,{...options,method:'PUT',body:JSON.stringify(body)})).data);},
  async submitOrder(token,revision) {return normalizeOrder((await transport('/order',token,{method:'POST',body:JSON.stringify({revision}),timeoutMs:60000})).data);},
  async order(token,options) {const row=(await transport('/order',token,options)).data;return row===null?null:normalizeOrder(row);},
  async photo(token,id,{signal}={}) {
    if(!validCatalogToken(token)||!validProductId(id))throw failure('Fotoğraf bağlantısı doğrulanamadı.');
    const response=await fetch(`${ROOT}/products/${id}/photo`,{signal,cache:'no-store',credentials:'omit',redirect:'error',headers:{Accept:'image/jpeg,image/png,image/webp',Authorization:`Bearer ${token}`}});
    if(!response.ok)throw failure('Ürün fotoğrafı açılamadı.',{status:response.status});
    const mime=(response.headers.get('content-type')||'').split(';')[0].trim();
    if(!['image/jpeg','image/png','image/webp'].includes(mime))throw failure('Ürün fotoğrafı türü doğrulanamadı.');
    if(Number(response.headers.get('content-length'))>MAX_CUSTOMER_PHOTO_BYTES)throw failure('Ürün fotoğrafı boyutu sınırı aşıyor.');
    const reader=response.body?.getReader();let size=0;const parts=[];
    if(!reader)throw failure('Ürün fotoğrafı boş.');
    try {
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_CUSTOMER_PHOTO_BYTES)throw failure('Ürün fotoğrafı boyutu sınırı aşıyor.');parts.push(value);}
    } catch(error){void reader.cancel().catch(()=>{});throw error;} finally {reader.releaseLock();}
    const blob=new Blob(parts,{type:mime}),bytes=new Uint8Array(await blob.slice(0,12).arrayBuffer());
    const matches=mime==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:
      mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
      String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    if(!size||!matches)throw failure('Ürün fotoğrafı içeriği doğrulanamadı.');return blob;
  },
};

export async function createCustomerCatalogLink(crmToken,conversationId,{signal}={}) {
  if(!crmToken||!/^\d+$/.test(String(conversationId)))throw failure('Önce doğrulanmış bir CRM görüşmesi seçin.');
  const response=await fetch('/api/live/crm/customer-catalog/sessions',{method:'POST',signal,cache:'no-store',redirect:'error',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${crmToken}`},body:JSON.stringify({conversationId:String(conversationId)})});
  const result=await response.json();
  if(!response.ok)throw failure(result.error?.message||'Mobil katalog bağlantısı hazırlanamadı.',{status:response.status,code:result.error?.code});
  const row=result.data;
  if(result.success!==true||row?.testOnly!==true||!/^\/katalog#[A-Za-z0-9_-]{43}$/.test(row.url||'')||row.linkOrigin!==undefined&&!approvedLinkOrigin(row.linkOrigin))throw failure('Mobil katalog bağlantısı doğrulanamadı.');
  return row;
}

export const validCustomerCatalogSessionId = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
async function staffCatalogRead(token,path,{signal}={}) {
  if(!token)throw failure('CRM oturumunu yeniden açın.');
  const response=await fetch('/api/live/crm/customer-catalog/'+path,{signal,cache:'no-store',redirect:'error',credentials:'omit',headers:{Accept:'application/json',Authorization:`Bearer ${token}`}});
  const result=await response.json();
  if(!response.ok||result.success!==true)throw failure('Kişisel katalog oturumu doğrulanamadı.',{status:response.status,code:result.error?.code});
  return result.data;
}
export async function listCustomerCatalogSessions(token,conversationId,options) {
  if(!/^\d+$/.test(String(conversationId)))throw failure('Doğrulanmış bir görüşme seçin.');
  const data=await staffCatalogRead(token,'sessions?conversationId='+encodeURIComponent(conversationId),options);
  if(data?.testOnly!==true||String(data.conversationId)!==String(conversationId)||!Array.isArray(data.sessions))throw failure('Katalog oturumları doğrulanamadı.');
  const seen=new Set();
  return data.sessions.map(row=>{
    if(!validCustomerCatalogSessionId(row?.sessionId)||seen.has(row.sessionId)||!Number.isFinite(Date.parse(row.expiresAt))||!Number.isSafeInteger(row.revision)||row.revision<0||!Number.isSafeInteger(row.itemCount)||row.itemCount<0||typeof row.orderPending!=='boolean')throw failure('Katalog oturumları doğrulanamadı.');
    seen.add(row.sessionId);return {sessionId:row.sessionId,expiresAt:row.expiresAt,revision:row.revision,itemCount:row.itemCount,orderPending:row.orderPending};
  });
}
export async function readCustomerCatalogSalesContext(token,sessionId,options) {
  if(!validCustomerCatalogSessionId(sessionId))throw failure('Kişisel katalog oturumu seçin.');
  return staffCatalogRead(token,'sessions/'+sessionId+'/sales-context',options);
}
