import {priceLabelText} from './catalog/productActions.js';
import {useEffect,useRef,useState} from 'react';
import {liveApi} from './liveApi.js';
import {createSalesPhotoSession} from './lib/salesPhotos.js';

export default function SalesProductCards({products,token,isCurrent,onInvalidate,onTakeProduct,disabled}) {
  const [photos,setPhotos]=useState({}),current=useRef({isCurrent,onInvalidate});
  current.current={isCurrent,onInvalidate};
  useEffect(()=>{
    const session=createSalesPhotoSession({products,fetchPhoto:(id,options)=>liveApi.canonicalCatalogPhoto(token,id,options),isCurrent:()=>current.current.isCurrent(),onPhoto:(id,photo)=>setPhotos(value=>({...value,[id]:photo})),onInvalidate:error=>current.current.onInvalidate(error)});
    setPhotos({});
    void session.read();
    return()=>session.close();
  },[products,token]);
  if(!products.length)return null;
  return <div className="sales-product-cards" aria-label="ERP ürün önerileri">{products.map(product=>{
    const photo=photos[product.id],priced=product.salePrice!==null && product.salePrice>0 && product.currency;
    return <article className="sales-product-card" key={product.id}>
      <div className="sales-product-photo">{photo?.url ? <img src={photo.url} alt={product.productName} onError={()=>setPhotos(value=>({...value,[product.id]:{failed:true}}))}/> : <span>{!product.photoEligible?'Fotoğraf yok':photo?.failed?'Fotoğraf alınamadı':'Fotoğraf yükleniyor…'}</span>}</div>
      <div className="sales-product-info"><small>{product.stockCode}</small><strong>{product.productName}</strong><span>{priced?`${product.currency} ${String(product.id).startsWith('erp-')?priceLabelText(product.priceExact):product.salePrice.toFixed(4).replace(/0+$/,'').replace(/\.$/,'')} / ${String(product.id).startsWith('erp-')?(product.unitLabel||'birim bilinmiyor'):'adet'}`:'Fiyat doğrulanamadı'}</span><small>Kayıtlı satış fiyatıdır. Stok, seri ve teslim koşulları teyit edilmeli.</small></div>
      <div className="sales-product-actions"><button type="button" disabled={disabled} onClick={()=>onTakeProduct(product.id,'product')}>Ürün bilgisini taslağa al</button><button type="button" disabled={disabled||!priced} onClick={()=>onTakeProduct(product.id,'price')}>Fiyatı taslağa al</button></div>
    </article>;
  })}</div>;
}
