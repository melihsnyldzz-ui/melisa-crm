import { existingQuery, normalizeExistingEnvelope, EXISTING_STOCK_VERSION, decodeExistingPhoto } from './existingStock.js';
import { catalogAccessError, MAX_CATALOG_VIEW_MS } from './session.js';
import { clearCatalogStorage, safeCatalogStorage } from './model.js';

// One mounted account/recipient scope, one page per user action. Never persists rows, URLs or tokens.
export function createExistingSession({api,token,isCurrent,onState,onCrmExpired,urlApi=globalThis.URL,decode=decodeExistingPhoto,storage=safeCatalogStorage(),now=Date.now,schedule=setTimeout,unschedule=clearTimeout}) {
  let closed=false,generation=0,pending=null,expiry=0,timer,retryAt=0,versionSeen=false;
  let state={state:'idle',products:[],message:'Fotoğraflı ürünler okunuyor…'};
  const records=new Map(),urls=new Map(),controllers=new Set();
  const valid=()=>!closed&&Boolean(token)&&isCurrent();
  const current=own=>valid()&&own===generation;
  const publish=next=>{state=next;if(valid())onState(next);};
  function clear(){generation++;for(const c of controllers)c.abort();controllers.clear();for(const url of urls.values())urlApi.revokeObjectURL(url);urls.clear();records.clear();unschedule(timer);expiry=0;pending=null;}
  function expire(){clear();publish({state:'idle',products:[],message:'Katalog görüntüleme süresi doldu. Ürünleri yeniden okuyun.'});}
  function failure(error,own){if(!current(own))return;const fatal=[401,403].includes(error?.status)||error?.code==='CATALOG_CONTRACT_INVALID';if(error?.status===429&&Number.isFinite(error.retryAfterMs)&&error.retryAfterMs>0)retryAt=now()+error.retryAfterMs;if(fatal){clear();clearCatalogStorage(storage);publish(catalogAccessError(error,{authMode:'crm'}));if(error?.status===401)onCrmExpired?.();}else publish(state.meta?{...state,state:'ready',pageLoading:false,pageError:catalogAccessError(error,{authMode:'crm'}).message,retryAt}:{...catalogAccessError(error,{authMode:'crm'}),retryAt});}
  function read(input={}) {
    if(!valid())return Promise.resolve(null);
    if(pending)return pending;
    if(now()<retryAt)return Promise.resolve(null);
    if(expiry&&now()>=expiry)expire();
    let query;try{query=existingQuery(input);}catch(error){failure(error,generation);return Promise.resolve(null);}
    const own=++generation,controller=new AbortController();controllers.add(controller);
    const loading=state.meta?{...state,state:'ready',pageLoading:true,pageError:null}:{state:'loading',products:[],message:'Fotoğraflı ürün sayfası okunuyor…'};
    publish(loading);
    const task=(async()=>{
      try {
        const result=normalizeExistingEnvelope(await api.existingCatalogProducts(token,query,{signal:controller.signal}),query);
        if(!current(own))return null;
        if(!versionSeen){if((()=>{try{return storage?.getItem('melisa-catalog-source-version');}catch{return null;}})()!==EXISTING_STOCK_VERSION){clearCatalogStorage(storage);try{storage?.setItem('melisa-catalog-source-version',EXISTING_STOCK_VERSION);}catch{}}versionSeen=true;}
        if(!expiry){expiry=now()+MAX_CATALOG_VIEW_MS;timer=schedule(expire,MAX_CATALOG_VIEW_MS);}
        const stats={eligible:result.products.length,ready:0,missing:0,failed:0,unattempted:0};
        let cursor=0,halt=false,photoError=null;const visible=[];
        const work=async()=>{while(current(own)&&!halt&&cursor<result.products.length){const product=result.products[cursor++];let url=urls.get(product.id),newUrl=false;try{if(!url){const blob=await api.existingCatalogPhoto(token,product.id,{signal:controller.signal});if(!current(own))return;url=urlApi.createObjectURL(blob);newUrl=true;await decode(url);if(!current(own)){urlApi.revokeObjectURL(url);return;}urls.set(product.id,url);}const ready={...product,image:url};records.set(product.id,ready);visible.push(ready);stats.ready++;}catch(error){if(newUrl&&url&&!urls.has(product.id))urlApi.revokeObjectURL(url);if(!current(own))return;if([401,403].includes(error?.status))throw error;if(error?.status===404)stats.missing++;else{stats.failed++;halt=true;photoError=error;if(error?.status===429&&Number.isFinite(error.retryAfterMs)&&error.retryAfterMs>0)retryAt=now()+error.retryAfterMs;}}}};
        await Promise.all([work(),work()]);if(!current(own))return null;
        stats.unattempted=stats.eligible-stats.ready-stats.missing-stats.failed;
        const order=new Map(result.products.map((p,i)=>[p.id,i]));visible.sort((a,b)=>order.get(a.id)-order.get(b.id));
        const next={state:'ready',products:[...records.values()],viewProducts:visible,paged:true,query,meta:result.meta,photoStats:stats,retryAt,pageLoading:false,pageError:photoError?'Bazı fotoğraflar alınamadı; bu sayfanın yüklenmesi tamamlanmadı.':null,accessExpiresAt:expiry,sourceDatabaseVerified:true,fetchedAt:result.meta.fetchedAt,priceExportAllowed:false,message:`Sorguda ${result.meta.total} fotoğraf referanslı ürün · Sayfa ${query.page}/${result.meta.totalPages}: ${stats.ready}/${stats.eligible} fotoğraf açıldı. ${stats.missing?`${stats.missing} fotoğraf bulunamadı. `:''}${stats.failed||stats.unattempted?'Fotoğraf yükleme tamamlanmadı. ':''}Okuma: ${new Date(result.meta.fetchedAt).toLocaleString('tr-TR')}. Güncel fiyat ve stok doğrulanamadı; fiyatlı PDF kapalı.`};publish(next);return next;
      }catch(error){failure(error,own);return null;}finally{controllers.delete(controller);if(pending===task)pending=null;}
    })();pending=task;return task;
  }
  const usable=()=>valid()&&state.state==='ready'&&!state.pageLoading&&now()<expiry;
  return {read,isUsable:usable,close(){clear();closed=true;state={state:'closed',products:[]};},
    photo(product){if(!usable()||!records.has(product?.id)||!urls.has(product.id))return Promise.reject(new Error('Fotoğraf bu oturumda doğrulanamadı.'));return Promise.resolve(urls.get(product.id));},
    async verifyOutput(){if(!usable())throw new Error('Katalog erişimi sona erdi.');const own=generation,c=new AbortController();controllers.add(c);try{const q={...state.query,page:1,limit:1};normalizeExistingEnvelope(await api.existingCatalogProducts(token,q,{signal:c.signal}),q);if(!current(own)||!usable())throw new Error('Katalog bağlamı değişti.');}catch(error){failure(error,own);throw new Error('Katalog erişimi doğrulanamadı. Çıktı hazırlanmadı.');}finally{controllers.delete(c);}}
  };
}
