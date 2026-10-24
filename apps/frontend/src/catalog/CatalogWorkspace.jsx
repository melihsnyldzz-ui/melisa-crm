import { createCanonicalSession } from './canonicalSession.js';
import { createExistingSession } from './existingSession.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, X } from '@phosphor-icons/react';
import CatalogBuilder from './CatalogBuilder.jsx';
import { createCatalogSession } from './session.js';
import { catalogSource } from './source.js';
import { clearCatalogStorage, safeCatalogStorage } from './model.js';
import { liveApi } from '../liveApi.js';
import './catalog.css';

export function CatalogConnectionPanel({customer,source,onClose,onRead,onSignIn,onDisconnect,authMode='erp',existingStock=false}) {
  const dialog = useRef(null), form = useRef(null);
  const [clock,setClock]=useState(Date.now);
  useEffect(()=>{setClock(Date.now());if(!source.retryAt||source.retryAt<=Date.now())return;const timer=setInterval(()=>{setClock(Date.now());if(Date.now()>=source.retryAt)clearInterval(timer);},1000);return()=>clearInterval(timer);},[source.retryAt]);
  const cooling=Boolean(source.retryAt>clock);
  const busy = ['loading','signing-in','disconnecting'].includes(source.state);
  const showForm = authMode==='erp' && ['credentials','disconnected'].includes(source.state);
  useEffect(() => {
    const controls = () => [...(dialog.current?.querySelectorAll('button:not(:disabled),input:not(:disabled)') || [])].filter(el=>el.getClientRects().length);
    (form.current?.elements.username || controls()[0])?.focus();
    const keyboard = event => {
      if (event.key === 'Escape') {event.preventDefault();onClose();}
      if (event.key === 'Tab') {
        const items=controls(),first=items[0],last=items.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',keyboard);
    return () => {if(form.current)form.current.reset();document.removeEventListener('keydown',keyboard);};
  },[source.state,onClose]);
  const submit = event => {
    event.preventDefault();
    if(busy)return;
    const values = new FormData(event.currentTarget);
    const username=String(values.get('username')||''),password=String(values.get('password')||'');
    event.currentTarget.reset();
    onSignIn({username,password});
  };
  return <div className="catalog-backdrop" onMouseDown={onClose}><section className="catalog-builder catalog-connect" ref={dialog} role="dialog" aria-modal="true" aria-label="ERP katalog bağlantısı" aria-busy={busy} onMouseDown={event=>event.stopPropagation()}>
    <header className="catalog-header"><span className="catalog-heading-icon"><BookOpen size={26}/></span><div><h2>ERP kataloğuna bağlan</h2><p>{customer.name}</p></div><button type="button" className="catalog-icon" aria-label="Kataloğu kapat" onClick={onClose}><X size={24}/></button></header>
    <div className="catalog-connect-body"><p className="catalog-connect-status" role={['blocked','error','uncertain'].includes(source.state)?'alert':'status'}>{source.message}</p>
      {false&&source.diagnostic?<p className="catalog-microcopy" aria-label="Katalog hata bilgisi">Hata bilgisi: {source.diagnostic.status?`HTTP ${source.diagnostic.status} · `:''}{source.diagnostic.code}</p>:null}
      {authMode==='crm'?<p className="catalog-microcopy">Katalog erişimi CRM hesabınızın yetkileriyle kontrol edilir. Ek ERP girişi gerekmez.</p>:null}
      {showForm ? <form ref={form} onSubmit={submit} autoComplete="off"><label className="catalog-field">ERP kullanıcı adı<input name="username" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} required disabled={busy}/></label><label className="catalog-field">ERP şifresi<input name="password" type="password" autoComplete="off" required disabled={busy}/></label><p className="catalog-microcopy">Normal ERP hesabınızla giriş yapın. CRM, ERP şifrenizi kaydetmez. Bağlantı geçicidir; ERP kayıtları değiştirilmez.</p><button className="catalog-primary" type="submit" disabled={busy}>ERP’ye bağlan</button></form> : null}
      {!busy ? <div className="catalog-connect-actions"><button type="button" className="catalog-secondary" disabled={cooling} onClick={onRead}>{cooling?`${Math.ceil((source.retryAt-clock)/1000)} saniye sonra yeniden deneyin`:'Bağlantıyı kontrol et'}</button>{authMode==='erp'&&source.state==='uncertain'?<button type="button" className="catalog-secondary" onClick={onDisconnect}>ERP bağlantısını kapat</button>:null}</div> : null}
      <p className="catalog-connect-limits">{existingStock ? "Fotoğraflı katalog ve kayıtlı satış fiyatlarıyla PDF hazırlanabilir. Satış fiyatları adet içindir; stok ve sipariş koşullarını sipariş öncesi teyit edin." : "Fotoğraflı ve fiyatsız katalog hazırlanabilir. Güncel satış fiyatı veya stok doğrulanamadığında açıkça belirtilir; fiyatlı PDF şu anda kapalıdır. Satış fiyatlarının birimi adettir."}</p>
    </div><footer className="catalog-actions"><button type="button" className="catalog-secondary" onClick={onClose}>Konuşmaya dön</button></footer>
  </section></div>;
}

export default function CatalogWorkspace({token,conversationId,isCurrent,onClose,onSource,onSession,onCrmExpired,authMode='erp',existingStock=false, ...builderProps}) {
  const [source,setSource] = useState({...catalogSource,state:'loading',message:'ERP katalog erişimi kontrol ediliyor…'});
  const controller = useRef(null), props = useRef({isCurrent,onClose,onSource,onSession,onCrmExpired});
  props.current = {isCurrent,onClose,onSource,onSession,onCrmExpired};
  useEffect(() => {
    const previous = document.activeElement;
    const session = (existingStock?createCanonicalSession:createCatalogSession)({api:liveApi,token,conversationId,authMode,isCurrent:()=>props.current.isCurrent(),onCrmExpired:()=>props.current.onCrmExpired?.(),onState:next=>{setSource(next);props.current.onSource?.(next);}});
    controller.current = session;props.current.onSession?.(session);
    const close = () => {session.close();props.current.onClose();};
    window.addEventListener('popstate',close);window.addEventListener('pagehide',close);
    window.addEventListener('melisa-crm-session-cleared',close);
    void session.read();
    return () => {session.close();if(controller.current===session)controller.current=null;window.removeEventListener('popstate',close);window.removeEventListener('pagehide',close);window.removeEventListener('melisa-crm-session-cleared',close);if(previous?.isConnected)previous.focus?.();};
  },[token,conversationId,authMode,existingStock]);
  const readPage=useCallback(query=>controller.current?.read(query),[]);
  const close = useCallback(() => {controller.current?.close();props.current.onClose();},[]);
  const photo = useCallback((product,options)=>controller.current?.photo(product,options) || Promise.reject(new Error('Katalog kapandı.')),[]);
  const verifyProducts=useCallback(products=>controller.current?.verifyProducts?.(products)||Promise.resolve(products),[]);
  const verifyOutput = useCallback(()=>controller.current?.verifyOutput() || Promise.reject(new Error('Katalog kapandı.')),[]);
  const usable = useCallback(()=>Boolean(controller.current?.isUsable()),[]);
  const signIn = credentials => {clearCatalogStorage(safeCatalogStorage());void controller.current?.signIn(credentials);};
  const disconnect = () => {clearCatalogStorage(safeCatalogStorage());void controller.current?.disconnect();};
  if(source.state==='ready') return <CatalogBuilder {...builderProps} onPage={existingStock?readPage:undefined} products={source.products} sourceStatus={source} onClose={close} loadPhoto={photo} isContextCurrent={usable} beforeOutput={verifyOutput} beforeProducts={verifyProducts} onDisconnect={authMode==='erp'?disconnect:undefined}/>;
  return <CatalogConnectionPanel existingStock={existingStock} customer={builderProps.customer} source={source} authMode={authMode} onClose={close} onRead={()=>void controller.current?.read()} onSignIn={signIn} onDisconnect={disconnect}/>;
}
