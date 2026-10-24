import {priceLabelText} from './catalog/productActions.js';
import {useEffect,useRef,useState} from 'react';
import {liveApi} from './liveApi.js';
import {createSalesPhotoSession} from './lib/salesPhotos.js';

export default function SalesProductCards({products,token,isCurrent,onInvalidate,onTakeProduct,disabled}) {
  const [photos,setPhotos]=useState(()=>({products,token,byId:{}})),current=useRef({products,token,isCurrent,onInvalidate});
  current.current={products,token,isCurrent,onInvalidate};
  useEffect(()=>{
    const session=createSalesPhotoSession({products,fetchPhoto:(id,options)=>liveApi.canonicalCatalogPhoto(token,id,options),isCurrent:()=>current.current.products===products&&current.current.token===token&&current.current.isCurrent(),onPhoto:(id,photo)=>setPhotos(value=>({products,token,byId:{...(value.products===products&&value.token===token?value.byId:{}),[id]:photo}})),onInvalidate:error=>current.current.onInvalidate(error)});
    setPhotos({products,token,byId:{}});
    void session.read();
    return()=>session.close();
  },[products,token]);
  if(!products.length)return null;
  return <div className="sales-product-cards" aria-label="ERP ürün önerileri">{products.map(product=>{
    const photo=photos.products===products&&photos.token===token?photos.byId[product.id]:undefined,priced=product.salePrice!==null && product.salePrice>0 && product.currency;
    return <article className="sales-product-card" key={product.id}>
      <div className="sales-product-photo">{photo?.url ? <img src={photo.url} alt={product.productName} onError={()=>setPhotos(value=>value.products===products&&value.token===token?{...value,byId:{...value.byId,[product.id]:{failed:true}}}:value)}/> : <span>{!product.photoEligible?'Fotoğraf yok':photo?.failed?'Fotoğraf alınamadı':'Fotoğraf yükleniyor…'}</span>}</div>
      <div className="sales-product-info"><small>{product.stockCode}</small><strong>{product.productName}</strong><span>{priced?`${product.currency} ${String(product.id).startsWith('erp-')?priceLabelText(product.priceExact):product.salePrice.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')} / ${String(product.id).startsWith('erp-')?(product.unitLabel||'birim bilinmiyor'):'adet'}`:'Fiyat doğrulanamadı'}</span><small>Kayıtlı satış fiyatıdır. Stok, seri ve teslim koşulları teyit edilmeli.</small></div>
      <div className="sales-product-actions"><button type="button" disabled={disabled} onClick={()=>onTakeProduct(product.id,'product')}>Ürün bilgisini taslağa al</button><button type="button" disabled={disabled||!priced} onClick={()=>onTakeProduct(product.id,'price')}>Fiyatı taslağa al</button></div>
    </article>;
  })}</div>;
}
