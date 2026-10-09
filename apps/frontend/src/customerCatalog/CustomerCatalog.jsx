import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle,ImageSquare,MagnifyingGlass,Minus,Plus,ShoppingCart,SlidersHorizontal,WarningCircle} from '@phosphor-icons/react';
import {customerCatalogApi} from './api.js';
import {blockedLabel,cartRequest,clearCatalogToken,compositionText,filterCatalogProducts,formatMoney,hasSyntheticProducts} from './model.js';
import {createCatalogPhotoCache} from '../catalog/photoCache.js';
import './customerCatalog.css';

const defaults={scope:'recommended',search:'',age:'',type:'',maxPrice:'',color:''};

function ProductPhoto({product,cache,onExpired}) {
  const [photo,setPhoto]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;setPhoto('');setFailed(false);
    if(product.photoPath)cache.load({id:product.id,hasSourceImage:true,photoStatus:'guarded-path'}).then(url=>{if(active)setPhoto(url);}).catch(error=>{if(active){setFailed(true);if([401,403].includes(error.status))onExpired(error);}});
    return ()=>{active=false;};
  },[product.id,product.photoPath,cache,onExpired]);
  return <div className="cc-photo">{photo?<img src={photo} alt={product.productName} onError={()=>{setPhoto('');setFailed(true);}} loading="lazy"/>:<div className="cc-photo-unavailable"><ImageSquare size={28} weight="light"/><span>{failed?'Ürün fotoğrafı açılamadı':product.photoPath?'Fotoğraf yükleniyor…':'Ürün fotoğrafı mevcut değil'}</span></div>}</div>;
}

function ProductCard({product,count,busy,locked,invalidCart,onChange,cache,onExpired}) {
  return <article className={`cc-product ${count?'cc-selected':''}`}>
    <ProductPhoto product={product} cache={cache} onExpired={onExpired}/>
    <div className="cc-product-detail">
      <span className="cc-code">{product.stockCode}{count?<CheckCircle size={15} weight="fill" aria-label="Sepette"/>:null}</span>
      <h2>{product.productName}</h2>
      <div className="cc-price"><span>Adet fiyatı</span><strong>{formatMoney(product.unitPriceExact,product.currency)}</strong></div>
      {product.series?.verified?<><div className="cc-series-price"><span>{product.series.totalPieces} ürün / seri</span><strong>{formatMoney(product.seriesTotalExact,product.currency)}</strong></div>{product.series.isTestExample?<span className="cc-example-label">TEST · Örnek seri</span>:null}<p className="cc-composition">{compositionText(product)}</p></>:<p className="cc-composition cc-unverified">{compositionText(product)}</p>}
      {count>product.maxSeries&&Number.isSafeInteger(product.maxSeries)?<p className="cc-blocked">Seçiminiz için tam seri uygunluğu azaldı. Seri sayısını azaltın.</p>:null}
      {product.selectable||count>0?<div className="cc-stepper" aria-label={`${product.stockCode} tam seri seçimi`}>
        <button type="button" aria-label={`${product.stockCode} bir seri azalt`} disabled={!count||busy||locked} onClick={()=>onChange(product,count-1)}><Minus size={17}/></button>
        <output aria-live="polite">{count} seri</output>
        <button type="button" aria-label={`${product.stockCode} bir seri ekle`} disabled={busy||locked||invalidCart||!product.selectable||count>=product.maxSeries} onClick={()=>onChange(product,count+1)}><Plus size={17}/></button>
      </div>:<p className="cc-blocked">{blockedLabel(product.blockReason)}</p>}
    </div>
  </article>;
}

function Summary({cart,cache,onExpired}) {
  return <><div className="cc-summary-lines">{cart.items.map(product=><article className="cc-summary-line" key={product.id}>
    <ProductPhoto product={product} cache={cache} onExpired={onExpired}/>
    <div><span className="cc-code">{product.stockCode}</span><h2>{product.productName}</h2><p>{product.seriesCount} seri = {product.pieceCount} ürün</p>{product.series.isTestExample?<span className="cc-example-label">TEST · Örnek seri</span>:null}<small>{compositionText(product)}</small></div>
    <strong>{formatMoney(product.lineTotalExact,product.currency)}</strong>
  </article>)}</div><div className="cc-summary-total"><p>{cart.modelCount} model · {cart.seriesCount} seri</p><h2>Toplam: {cart.pieceCount} ürün</h2><p className="cc-product-total">Ürün tutarı: <strong>{formatMoney(cart.productTotalExact,cart.currency)}</strong></p></div><p className="cc-shipping-note">Bu tutar yalnız ürünleri kapsar. Gönderim ücreti ve varsa diğer koşullar görüşmede ayrıca netleşir.</p></>;
}

export default function CustomerCatalog({token}) {
  const [session,setSession]=useState(null),[products,setProducts]=useState([]),[filters,setFilters]=useState(defaults);
  const [view,setView]=useState('catalog'),[loading,setLoading]=useState(true),[filterBusy,setFilterBusy]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[expired,setExpired]=useState(false),[uncertain,setUncertain]=useState(false),[retry,setRetry]=useState(0);
  const alive=useRef(true),saving=useRef(false),productReadEpoch=useRef(0),filtersRef=useRef(filters);filtersRef.current=filters;
  const acceptFreshSession=data=>{productReadEpoch.current++;setSession(data);setProducts(filterCatalogProducts(data.products,filtersRef.current));};
  const cache=useMemo(()=>createCatalogPhotoCache({fetchPhoto:(id,options)=>customerCatalogApi.photo(token,id,options),isCurrent:()=>alive.current}),[token]);
  const onExpired=useMemo(()=>error=>{if([401,403].includes(error?.status)){alive.current=false;clearCatalogToken();cache.clear();setSession(null);setProducts([]);setExpired(true);}},[cache]);

  useEffect(()=>{const previousTitle=document.title;document.title='Melisa Bebe · Size özel katalog';document.body.classList.add('customer-catalog-body');return ()=>{document.title=previousTitle;document.body.classList.remove('customer-catalog-body');};},[]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[view]);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;cache.clear();};},[cache]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;setLoading(true);setError('');
    if(!token){setLoading(false);return ()=>{active=false;};}
    customerCatalogApi.session(token,{signal:controller.signal}).then(data=>{
      if(!active)return;acceptFreshSession(data);setUncertain(data.orderPending===true);if(data.order)setView('success');else if(data.orderPending)setView('summary');
    }).catch(error=>{if(!active)return;onExpired(error);setError(error.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;controller.abort();};
  },[token,retry,onExpired]);
  useEffect(()=>{
    if(!session||expired)return;
    const remaining=Date.parse(session.expiresAt)-Date.now();
    const timer=setTimeout(()=>onExpired({status:401}),Math.max(0,remaining));return ()=>clearTimeout(timer);
  },[session?.expiresAt,expired,onExpired]);
  useEffect(()=>{
    if(!session||expired)return;
    const controller=new AbortController();let active=true;
    const timer=setTimeout(()=>{
      setFilterBusy(true);const epoch=++productReadEpoch.current;
      customerCatalogApi.products(token,filters,{signal:controller.signal}).then(data=>{if(active&&epoch===productReadEpoch.current){setProducts(data.products);setError('');}}).catch(error=>{if(active&&epoch===productReadEpoch.current){onExpired(error);setError(error.message);}}).finally(()=>{if(active)setFilterBusy(false);});
    },220);
    return ()=>{active=false;clearTimeout(timer);controller.abort();};
  },[token,filters,Boolean(session),expired,onExpired]);

  const updateCart=async(product,count)=>{
    if(saving.current||session?.order||uncertain)return;
    saving.current=true;setBusy(true);setError('');setNotice('');
    try{const cart=await customerCatalogApi.saveCart(token,cartRequest(session.cart,product,count));if(alive.current){setSession(value=>({...value,cart}));setNotice('Sepetiniz kaydedildi.');}}
    catch(error){if(!alive.current)return;onExpired(error);setError(error.message);if(error.code==='CUSTOMER_CATALOG_REVISION_CONFLICT'){try{const fresh=await customerCatalogApi.session(token);if(alive.current){acceptFreshSession(fresh);setNotice('Sepetiniz başka bir ekranda güncellenmiş. Son seçimler yüklendi.');}}catch(readError){onExpired(readError);}}}
    finally{saving.current=false;if(alive.current)setBusy(false);}
  };
  const completeOrder=async()=>{
    if(saving.current||!session.cart.items.length||session.cart.valid===false)return;saving.current=true;setBusy(true);setError('');
    try{
      const submitted=await customerCatalogApi.submitOrder(token,session.cart.revision);
      const order=await customerCatalogApi.order(token);
      if(!order||order.requestId!==submitted.requestId)throw Error('Siparişiniz henüz yeniden doğrulanamadı. Durumunu kontrol edin.');
      if(alive.current){setSession(value=>({...value,order}));setUncertain(false);setView('success');}
    }catch(error){if(alive.current){onExpired(error);setError(error.message);setUncertain(true);if(['CUSTOMER_CATALOG_PRICE_CHANGED','CUSTOMER_CATALOG_REVISION_CONFLICT'].includes(error.code)){
      try{const fresh=await customerCatalogApi.session(token);if(alive.current){acceptFreshSession(fresh);setUncertain(fresh.orderPending===true);setError('Ürün bilgisi veya fiyat güncellendi. Güncel sepeti kontrol edip tekrar onaylayın.');if(fresh.order)setView('success');}}catch(readError){onExpired(readError);}
    }}}
    finally{saving.current=false;if(alive.current)setBusy(false);}
  };
  const checkOrder=async()=>{
    if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try{const fresh=await customerCatalogApi.session(token);if(alive.current){acceptFreshSession(fresh);if(fresh.order){setView('success');setUncertain(false);}else if(fresh.orderPending){setUncertain(true);setError('Taslağınızın sonucu henüz doğrulanmadı. Seçiminiz korunuyor; biraz sonra durumunu tekrar kontrol edin.');}else{setUncertain(false);setNotice('Henüz sipariş taslağı kaydedilmemiş. Seçiminiz sepetinizde korunuyor.');}}}
    catch(error){if(alive.current){onExpired(error);setError(error.message);}}
    finally{saving.current=false;if(alive.current)setBusy(false);}
  };
  const cart=session?.cart,order=session?.order,facets=session?.facets||{};
  const synthetic=hasSyntheticProducts(session?.products||[]);
  const counts=new Map((cart?.items||[]).map(row=>[row.id,row.seriesCount]));
  const cartProducts=new Map((cart?.items||[]).map(row=>[row.id,row]));
  const title=view==='success'?'Seçiminiz kaydedildi':view==='summary'?'Sipariş özeti':'Size uygun ürünler';
  const setFilter=(key,value)=>setFilters(current=>({...current,[key]:value}));

  return <div className="cc-shell"><header className="cc-header"><strong>Melisa Bebe</strong><span className="cc-test-badge">TEST DENEMESİ</span></header>
    <main className="cc-main">
      <div className="cc-page-heading">{view!=='catalog'&&session?<button className="cc-back" onClick={()=>{setView('catalog');setError('');}}><ArrowLeft size={18}/>Kataloğa dön</button>:<p className="cc-eyebrow">Kişiye özel mobil katalog</p>}<h1>{title}</h1>{session&&view==='catalog'?<p className="cc-intro">{session.customerLabel} · Modelleri tam seri olarak seçebilirsiniz.</p>:null}</div>
      {!token||expired?<section className="cc-state" role="alert"><WarningCircle size={32}/><h2>Bağlantınızı yeniden açın</h2><p>Bu katalog size özel bağlantıyla açılır. WhatsApp görüşmesindeki güncel katalog bağlantısını kullanın.</p></section>:loading?<section className="cc-state" role="status"><ShoppingCart size={30}/><h2>Kataloğunuz açılıyor</h2><p>Ürünler ve kayıtlı sepetiniz hazırlanıyor.</p></section>:!session?<section className="cc-state" role="alert"><WarningCircle size={32}/><h2>Katalog şu an açılamadı</h2><p>{error}</p><button className="cc-primary" onClick={()=>setRetry(value=>value+1)}>Yeniden kontrol et</button></section>:<>
        {synthetic?<div className="cc-example-notice"><strong>SENTETİK ÖNİZLEME</strong><span>Ürünler ve fiyatlar bu önizleme için örnektir. Bu akış gerçek şirket kataloğu veya ERP sipariş kaydı değildir.</span></div>:null}
        {session.products.some(product=>product.series?.isTestExample)?<div className="cc-example-notice"><strong>TEST · Örnek seri içerikleri</strong><span>Beden dağılımları bu deneme için örnektir; gerçek ürün seri bilgisi değildir.</span></div>:null}
        {cart.valid===false?<div className="cc-alert" role="alert"><WarningCircle size={20}/><span>{cart.validationErrors.some(error=>error.code==='STOCK_UNVERIFIED')?'Tam seri uygunluğu şu an doğrulanamıyor.':'Uygun tam seri sayısı azaldı.'} Seçiminiz korunuyor; sepet miktarını azaltın veya ilgili modeli çıkarın. Miktar düzeltilmeden sipariş tamamlanamaz.</span></div>:null}
        {error?<div className="cc-alert" role="alert"><WarningCircle size={20}/><span>{error}</span></div>:null}
        {view==='catalog'?<>
          <div className="cc-tabs" role="tablist" aria-label="Ürün seçkisi"><button role="tab" aria-selected={filters.scope==='recommended'} onClick={()=>setFilter('scope','recommended')}>Önerilenler</button><button role="tab" aria-selected={filters.scope==='all'} onClick={()=>setFilter('scope','all')}>Tüm ürünler</button></div>
          <label className="cc-search"><MagnifyingGlass size={19}/><input aria-label="Ürün adı veya kodu ara" type="search" value={filters.search} maxLength={120} onChange={event=>setFilter('search',event.target.value)} placeholder="Ürün adı veya kodu ara"/></label>
          <div className="cc-filters" aria-label="Ürün filtreleri">
            <label><span>Yaş</span><select aria-label="Yaş filtresi" value={filters.age} onChange={event=>setFilter('age',event.target.value)}><option value="">Tüm yaşlar</option>{(facets.ages||[]).map(value=><option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>Ürün türü</span><select aria-label="Ürün türü filtresi" value={filters.type} onChange={event=>setFilter('type',event.target.value)}><option value="">Tüm türler</option>{(facets.types||[]).map(value=><option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>En yüksek adet fiyatı{cart.currency?` (${cart.currency})`:''}</span><input aria-label="En yüksek adet fiyatı" inputMode="decimal" type="number" min="0" step="0.01" value={filters.maxPrice} onChange={event=>setFilter('maxPrice',event.target.value)} placeholder="Fiyat"/></label>
            {(facets.colors||[]).length?<label><span>Renk</span><select aria-label="Renk filtresi" value={filters.color} onChange={event=>setFilter('color',event.target.value)}><option value="">Tüm renkler</option>{facets.colors.map(value=><option key={value} value={value}>{value}</option>)}</select></label>:null}
          </div>
          <div className="cc-results-caption" aria-live="polite"><span>{filterBusy?'Ürünler filtreleniyor…':`${products.length} model`}</span>{Object.entries(filters).some(([key,value])=>key!=='scope'&&value)?<button onClick={()=>setFilters({...defaults,scope:filters.scope})}><SlidersHorizontal size={14}/>Filtreleri temizle</button>:null}</div>
          {order?<div className="cc-saved-note"><CheckCircle size={20} weight="fill"/><span>Bu seçimin test taslağı kaydedildi.</span><button onClick={()=>setView('success')}>Özeti aç</button></div>:null}
          {products.length?<div className="cc-products" aria-busy={filterBusy}>{products.map(product=><ProductCard key={product.id} product={cartProducts.get(product.id)||product} count={counts.get(product.id)||0} busy={busy} locked={Boolean(order)||uncertain} invalidCart={cart.valid===false} onChange={updateCart} cache={cache} onExpired={onExpired}/>)}</div>:<div className="cc-state"><MagnifyingGlass size={30}/><h2>Bu seçimde ürün bulunamadı</h2><p>Filtreleri değiştirebilir veya tüm ürünlere bakabilirsiniz.</p><button className="cc-primary" onClick={()=>setFilters({...defaults,scope:'all'})}>Tüm ürünleri göster</button></div>}
          <p className="cc-source-note">{[...new Set(session.products.map(product=>product.sourceLabel).filter(Boolean))].join(' · ')}. Bu kişisel deneme yalnız onaylı test ürünlerini gösterir. Seri içeriği veya uygunluğu doğrulanmayan modeller sepete eklenemez.</p>
        </>:view==='summary'?<>
          <Summary cart={cart} cache={cache} onExpired={onExpired}/>
          <p className="cc-test-explanation">{synthetic?'Seçiminiz yalnız sentetik önizlemede kaydedilir; gerçek ERP siparişi oluşturulmaz.':'Seçiminiz test sipariş taslağı olarak CRM’ye iletilir.'} Bu deneme stok düşürmez, ödeme veya sevkiyat başlatmaz.</p>
          {notice?<p className="cc-shipping-note" role="status">{notice}</p>:null}
          {uncertain?<button className="cc-primary cc-complete" disabled={busy} onClick={checkOrder}> {busy?'Kontrol ediliyor…':'Sipariş durumunu kontrol et'}<ArrowRight size={22}/></button>:<button className="cc-primary cc-complete" disabled={busy||!cart.items.length||cart.valid===false} onClick={completeOrder}>{busy?'Seçiminiz kaydediliyor…':'Asistanla tamamla'}<ArrowRight size={22}/></button>}
        </>:<>
          <div className="cc-success"><CheckCircle size={40} weight="fill"/><h2>{synthetic?'Sentetik test taslağınız hazır':'Test sipariş taslağınız hazır'}</h2><p>{synthetic?'Seçiminiz önizlemede kaydedildi ve yeniden kontrol edildi. Bu, gerçek ERP sipariş kaydı değildir.':'Seçiminiz kaydedildi ve yeniden kontrol edildi. WhatsApp görüşmenize dönüp “Seçimimi tamamladım” yazarak devam edebilirsiniz.'}</p><span>Taslak no: {String(order?.id??'')}</span></div>
          {order?<Summary cart={order.summary} cache={cache} onExpired={onExpired}/>:null}
          <p className="cc-test-explanation">Bu bir test taslağıdır. Ödeme, stok veya sevkiyat işlemi yapılmadı.</p>
        </>}
      </>}
    </main>
    {session&&view==='catalog'&&!expired?<footer className="cc-cart-bar"><div><ShoppingCart size={25} weight="regular"/><span><strong>{cart.modelCount} model · {cart.seriesCount} seri</strong><small>{cart.pieceCount} ürün{cart.items.length?` · ${formatMoney(cart.productTotalExact,cart.currency)}`:''}</small></span></div><button className="cc-primary" disabled={!cart.items.length||busy} onClick={()=>{setView(order?'success':'summary');setError('');window.scrollTo({top:0,behavior:'instant'});}}>Sepeti gör<ArrowRight size={19}/></button><span className="cc-save-status" role="status">{busy?'Kaydediliyor…':notice}</span></footer>:null}
  </div>;
}
