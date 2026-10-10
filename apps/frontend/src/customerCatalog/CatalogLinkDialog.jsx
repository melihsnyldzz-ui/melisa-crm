import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle,Link} from '@phosphor-icons/react';
import {createCustomerCatalogLink,customerCatalogLinkUrl} from './api.js';

export default function CatalogLinkDialog({token,conversation,isCurrent,onTakeDraft,onClose}) {
  const [link,setLink]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(true),request=useRef(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();};},[]);
  const create=async()=>{
    if(busy||!isCurrent())return;setBusy(true);setError('');const controller=new AbortController();request.current=controller;
    try{const result=await createCustomerCatalogLink(token,conversation.id,{signal:controller.signal});if(mounted.current&&isCurrent())setLink({...result,absoluteUrl:customerCatalogLinkUrl(result,window.location.origin)});}
    catch(error){if(mounted.current&&isCurrent())setError(error.message);}finally{if(mounted.current)setBusy(false);}
  };
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Kişiye özel mobil katalog"><header className="modal-header"><h2>Kişiye özel mobil katalog</h2><button className="secondary-button" onClick={onClose}>Kapat</button></header><div className="modal-body">
    <p className="modal-intro">{conversation.name} görüşmesi için tam seri seçimi, kalıcı sepet ve test sipariş özeti içeren bir bağlantı hazırlayın.</p>
    <div className="safety-banner"><CheckCircle size={21}/><div><strong>Yalnız kişisel TEST denemesi</strong><span>Bu bağlantı ilgili görüşmeye özeldir. Mesaj taslağına aldıktan sonra mevcut Gönder düğmesiyle paylaşabilirsiniz.</span></div></div>
    {error?<p role="alert" className="live-error">{error}</p>:null}
    {link?<><p><strong>Bağlantınız hazır.</strong></p><p style={{overflowWrap:'anywhere',fontSize:13}}>{link.absoluteUrl}</p><div className="modal-actions"><button className="secondary-button" onClick={()=>window.open(link.absoluteUrl,'_blank','noopener,noreferrer')}><Link size={17}/>Kataloğu aç</button><button className="primary-button" onClick={()=>{if(isCurrent()){const taken=onTakeDraft(`Size özel ürünleri tam seri olarak seçebilirsiniz:\n${link.absoluteUrl}\n\nBu bağlantı kişisel test denemesi içindir.`);if(taken!==false)onClose();}}}>Mesaj taslağına al<ArrowRight size={17}/></button></div></>:<div className="modal-actions"><button className="primary-button" disabled={busy} onClick={create}>{busy?'Hazırlanıyor…':'Bağlantıyı oluştur'}<ArrowRight size={17}/></button></div>}
  </div></section></div>;
}
