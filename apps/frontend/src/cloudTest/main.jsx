import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import CatalogBuilder from '../catalog/CatalogBuilder.jsx';
import ERPOrderDialog,{NativeOrderReceiptDisplay} from '../ERPOrderDialog.jsx';
import {selectedSaleLines,selectionMessage} from '../catalog/productActions.js';
import {validateNativeReceipt} from '../lib/nativeOrder.js';
import {liveApi} from './api.js';
import '../styles.css';
import './cloudTest.css';

const actors=[{id:15,label:'ERP personeli · Sentetik 15'},{id:16,label:'İlker müdür · Sentetik 16'},{id:17,label:'Angela CRM · Sentetik 17'},{id:18,label:'Diğer personel · Sentetik 18'}];

function CloudTestApp() {
  const [session,setSession]=useState(null),[actorId,setActorId]=useState('17'),[customers,setCustomers]=useState([]),[products,setProducts]=useState([]),[drafts,setDrafts]=useState([]);
  const [customerId,setCustomerId]=useState(''),[modal,setModal]=useState(null),[orderItems,setOrderItems]=useState([]),[receipt,setReceipt]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const epoch=useRef(0),sessionRef=useRef(session),customerRef=useRef(customerId);
  sessionRef.current=session;customerRef.current=customerId;
  const token=session?.accessToken;
  const customer=customers.find(row=>String(row.id)===customerId);
  const conversation=customer?{id:String(customer.id) === '501'?'55':'56',name:customer.name,phone:`9000000000${customer.id}`}:null;

  async function load(current,own) {
    if (!current?.user) return;
    const [nextCustomers,nextProducts,nextDrafts]=await Promise.all([liveApi.customers(current.accessToken),liveApi.products(current.accessToken),liveApi.drafts(current.accessToken)]);
    if (epoch.current !== own) return;
    if (!Array.isArray(nextCustomers) || !Array.isArray(nextDrafts) || nextCustomers.some(row=>![501,502].includes(Number(row.id)))) throw Error('Sentetik müşteri listesi doğrulanamadı.');
    setCustomers(nextCustomers);setProducts(nextProducts);setDrafts(nextDrafts);
    setCustomerId(previous=>nextCustomers.some(row=>String(row.id)===previous)?previous:String(nextCustomers[0]?.id || ''));
  }
  useEffect(()=>{
    const own=++epoch.current;let active=true;
    liveApi.session().then(async current=>{if(!active||epoch.current!==own)return;setSession(current);if(current.user)setActorId(String(current.user.id));await load(current,own);}).catch(failure=>{if(active&&epoch.current===own)setError(failure.message);});
    return()=>{active=false;epoch.current++;};
  },[]);
  async function chooseActor(event) {
    event.preventDefault();if(busy)return;
    const own=++epoch.current;setBusy(true);setError('');setModal(null);setReceipt(null);setMessage('');setCustomers([]);setProducts([]);setDrafts([]);setSession(null);
    try {const next=await liveApi.selectActor(Number(actorId));if(epoch.current!==own)return;setSession(next);await load(next,own);}
    catch(failure){if(epoch.current===own)setError(failure.message);}
    finally{if(epoch.current===own)setBusy(false);}
  }
  async function refresh() {
    const own=epoch.current;setBusy(true);setError('');
    try{await load(session,own);}catch(failure){if(epoch.current===own)setError(failure.message);}
    finally{if(epoch.current===own)setBusy(false);}
  }
  const currentContext=()=>{
    const own=epoch.current,ownToken=token,ownCustomer=customerId;
    return ()=>epoch.current===own&&sessionRef.current?.accessToken===ownToken&&customerRef.current===ownCustomer;
  };
  const [context,setContext]=useState(()=>()=>false);
  function openCatalog(){setContext(()=>currentContext());setModal('catalog');setReceipt(null);setMessage('');}
  const verifyCatalog=useCallback(async()=>{
    await liveApi.verify(token);
  },[token]);
  async function openReceipt(record) {
    const current=currentContext();setBusy(true);setError('');
    try{
      const id=record.request?.requestId || record.requestId;
      const saved=await liveApi.erpV2DraftDetail(token,token,id);
      validateNativeReceipt(saved,saved.request);
      if(current()){setReceipt(saved);setModal('receipt');}
    }catch(failure){if(current())setError(failure.message);}
    finally{if(current())setBusy(false);}
  }
  function productAction(selected,action) {
    if(!context())return;
    if(action==='order'){setOrderItems(selectedSaleLines(selected));setModal('order');}
    else{setMessage(selectionMessage(selected,action==='price'));setModal(null);}
  }

  return <main className="cloud-test-app">
    <aside className="cloud-test-banner" role="note"><strong>YALNIZ SENTETİK CLOUD TEST</strong><span>Geçici ortak sunucu verisi. Gerçek müşteri, Vega/SQL, mesaj veya ödeme bağlantısı yok. Windows, fiziksel cihaz ve insan kabulü ayrıca bekler.</span></aside>
    <header className="cloud-test-header"><div><span className="eyebrow">MELİSA CRM</span><h1>Müşteri ve sipariş taslağı</h1><p>Mevcut CRM katalog ve ERP taslak ekranları · sentetik ortak API</p></div><nav><a href="/erp/">ERP</a><a href="/terminal/">El terminali</a></nav></header>
    <section className="cloud-test-session"><form onSubmit={chooseActor}><label>Sentetik TEST hesabı<select aria-label="Sentetik TEST hesabı" value={actorId} disabled={busy} onChange={event=>setActorId(event.target.value)}>{actors.map(actor=><option key={actor.id} value={actor.id}>{actor.label}</option>)}</select></label><button className="primary-button" disabled={busy}>Sentetik oturumu aç</button></form>{session?.user?<p role="status">Etkin hesap: <strong>{session.user.name}</strong> · {session.user.role} · sentetik kimlik {session.user.id}</p>:<p>Sentetik hesabı seçerek TEST oturumunu açın.</p>}</section>
    {error?<p className="cloud-test-error" role="alert">{error}</p>:null}
    {session?.user?<>
      <section className="cloud-test-workspace"><label>Müşteri<select aria-label="Sentetik müşteri" disabled={busy} value={customerId} onChange={event=>{setModal(null);setReceipt(null);setCustomerId(event.target.value);setMessage('');}}>{customers.map(row=><option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select></label><button className="primary-button" disabled={busy||!customer||!products.length} onClick={openCatalog}>Kataloğu aç</button><button className="secondary-button" disabled={busy} onClick={()=>void refresh()}>Sunucudan yenile</button></section>
      {customer?<p>Seçili müşteri: <strong>{customer.name}</strong> · {customer.code} · {customer.currency} · konuşma {conversation.id}</p>:<p>Bu sentetik hesaba atanmış müşteri bulunmuyor.</p>}
      {message?<pre className="cloud-test-message" role="status">{message}</pre>:null}
      <section className="cloud-test-drafts"><h2>Sunucuda kayıtlı taslaklar</h2><p>Bu liste ortak sentetik veritabanından okunur. Tarayıcı depolaması kalıcı kayıt kaynağı değildir.</p>{!drafts.length?<p>Henüz kayıtlı taslak yok.</p>:drafts.map(record=><article key={record.request?.requestId||record.requestId}><div><strong>{record.documentNo}</strong><span>{record.customerName}</span><small>{record.request?.requestId||record.requestId}</small></div><button className="secondary-button" disabled={busy} onClick={()=>void openReceipt(record)}>Taslağı sunucudan aç</button></article>)}</section>
    </>:null}
    {modal==='catalog'&&customer&&context()?<CatalogBuilder key={`${token}:${customerId}`} customer={{...customer,id:conversation.id}} identity={`cloud-test:${session.user.id}`} role={session.user.role} products={products} sourceStatus={{state:'ready',message:'SENTETİK TEST · Ortak sunucudan okunan örnek ürün, fiyat ve stok.'}} canAttach={false} onClose={()=>setModal(null)} onProductAction={productAction} isContextCurrent={context} beforeOutput={verifyCatalog} beforeProducts={verifyCatalog}/>:null}
    {modal==='order'&&conversation&&context()?<><aside className="cloud-test-order-note" role="note">Sentetik ERP doğrulaması: kullanıcı adı ve parola alanlarına yalnız <strong>synthetic</strong> yazın. Bu alanlar sunucuya iletilmez; seçili sentetik oturum doğrulanır.</aside><ERPOrderDialog key={`${token}:${customerId}`} token={token} actorKey={`cloud-test:${session.user.id}`} conversation={conversation} items={orderItems} isCurrent={context} onClose={()=>{setModal(null);void refresh();}} onSaved={()=>void refresh()}/></>:null}
    {modal==='receipt'&&receipt?<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Sunucudan okunan sentetik ERP taslağı"><header className="modal-header"><h2>Sentetik ERP taslağı</h2><button onClick={()=>setModal(null)}>Kapat</button></header><div className="modal-body"><NativeOrderReceiptDisplay receipt={receipt}/></div></section></div>:null}
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><CloudTestApp/></React.StrictMode>);
