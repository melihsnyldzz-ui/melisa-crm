// URLs are owned by one CRM session/catalog read and never persisted or sent.
export function createCatalogPhotoCache({fetchPhoto,urlApi=globalThis.URL,isCurrent=()=>true}){
 const urls=new Map(),pending=new Map(),controllers=new Set();let revision=0;
 return {
  clear(){revision+=1;for(const controller of controllers)controller.abort();controllers.clear();for(const url of urls.values())urlApi.revokeObjectURL(url);urls.clear();pending.clear();},
  async load(product){
   if(!product?.hasSourceImage||product.photoStatus!=='guarded-path')return '';
   const id=String(product.id);if(!isCurrent())throw new Error('Katalog oturumu değişti.');
   if(urls.has(id))return urls.get(id);if(pending.has(id))return pending.get(id);
   const own=revision,controller=new AbortController();controllers.add(controller);
   const promise=(async()=>{const blob=await fetchPhoto(id,{signal:controller.signal});if(own!==revision||!isCurrent())throw new Error('Katalog oturumu değişti.');const url=urlApi.createObjectURL(blob);urls.set(id,url);return url;})();
   pending.set(id,promise);try{return await promise;}finally{controllers.delete(controller);if(pending.get(id)===promise)pending.delete(id);}
  },
 };
}
