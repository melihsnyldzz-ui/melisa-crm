import {createCatalogPhotoCache} from '../catalog/photoCache.js';
import {decodeExistingPhoto} from '../catalog/existingStock.js';

export function createSalesPhotoSession({products,fetchPhoto,isCurrent,onPhoto,onInvalidate,decode=decodeExistingPhoto,urlApi=globalThis.URL}) {
  let closed=false;
  const valid=()=>!closed && isCurrent();
  const cache=createCatalogPhotoCache({fetchPhoto,isCurrent:valid,urlApi});
  const close=()=>{closed=true;cache.clear();};
  return {
    close,
    async read() {
      await Promise.all(products.filter(product=>product.photoEligible).map(async product=>{
        try {
          const url=await cache.load({id:product.id,hasSourceImage:true,photoStatus:'guarded-path'});
          if(!valid()){close();return;}
          await decode(url);
          if(valid())onPhoto(product.id,{url});else close();
        } catch(error) {
          if(!valid()){close();return;}
          if([401,403].includes(error?.status)){close();onInvalidate(error);return;}
          onPhoto(product.id,{failed:true});
        }
      }));
    },
  };
}
