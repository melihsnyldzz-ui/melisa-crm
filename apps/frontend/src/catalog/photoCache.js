// URLs are owned by one CRM session/catalog read and never persisted or sent.
export function createCatalogPhotoCache({fetchPhoto,urlApi=globalThis.URL,isCurrent=()=>true}){
 const urls=new Map(),pending=new Map(),controllers=new Set();let revision=0;
 return {
  clear(){revision+=1;for(const controller of controllers)controller.abort();controllers.clear();for(const url of urls.values())urlApi.revokeObjectURL(url);urls.clear();pending.clear();},
  async load(product,{variant='preview'}={}){
   if(!product?.hasSourceImage||product.photoStatus!=='guarded-path')return '';
   const id=String(product.id),key=`${id}:${variant}`;if(!isCurrent())throw new Error('Katalog oturumu değişti.');
   if(urls.has(key))return urls.get(key);if(pending.has(key))return pending.get(key);
   const own=revision,controller=new AbortController();controllers.add(controller);
   const promise=(async()=>{const blob=await fetchPhoto(id,{signal:controller.signal,variant});if(own!==revision||!isCurrent())throw new Error('Katalog oturumu değişti.');const url=urlApi.createObjectURL(blob);urls.set(key,url);return url;})();
   pending.set(key,promise);try{return await promise;}finally{controllers.delete(controller);if(pending.get(key)===promise)pending.delete(key);}
  },
 };
}
