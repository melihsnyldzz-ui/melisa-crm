import {useEffect,useRef,useState} from 'react';
import {ArrowRight,CheckCircle,Link} from '@phosphor-icons/react';
import {createCustomerCatalogLink,customerCatalogLinkUrl,listCustomerCatalogSessions} from './api.js';

export default function CatalogLinkDialog({token,conversation,isCurrent,onTakeDraft,onUseSession,onClose}) {
  const [link,setLink]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [sessions,setSessions]=useState([]),[loading,setLoading]=useState(true);
  const mounted=useRef(true),request=useRef(null);
  useEffect(()=>{mounted.current=true;const controller=new AbortController();request.current=controller;
    listCustomerCatalogSessions(token,conversation.id,{signal:controller.signal}).then(rows=>{if(mounted.current&&isCurrent())setSessions(rows);}).catch(()=>{if(mounted.current&&isCurrent())setError('Mevcut katalog oturumları alınamadı.');}).finally(()=>{if(mounted.current)setLoading(false);});
    return()=>{mounted.current=false;request.current?.abort();};},[token,conversation.id]);
  const create=async()=>{
    if(busy||!isCurrent())return;setBusy(true);setError('');const controller=new AbortController();request.current=controller;
    try{const result=await createCustomerCatalogLink(token,conversation.id,{signal:controller.signal});if(mounted.current&&isCurrent()){setLink({...result,absoluteUrl:customerCatalogLinkUrl(result,window.location.origin)});setSessions(rows=>[...rows,{sessionId:result.sessionId,expiresAt:result.expiresAt,revision:0,itemCount:0,orderPending:false}]);}}
    catch(error){if(mounted.current&&isCurrent())setError(error.message);}finally{if(mounted.current)setBusy(false);}
  };
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="Kişiye özel mobil katalog"><header className="modal-header"><h2>Kişiye özel mobil katalog</h2><button className="secondary-button" onClick={onClose}>Kapat</button></header><div className="modal-body">
    <p className="modal-intro">{conversation.name} görüşmesi için tam seri seçimi, kalıcı sepet ve test sipariş özeti içeren bir bağlantı hazırlayın.</p>
    <div className="safety-banner"><CheckCircle size={21}/><div><strong>Yalnız kişisel TEST denemesi</strong><span>Bu bağlantı ilgili görüşmeye özeldir. Mesaj taslağına aldıktan sonra mevcut Gönder düğmesiyle paylaşabilirsiniz.</span></div></div>
    {error?<p role="alert" className="live-error">{error}</p>:null}
    <section aria-label="Mevcut kişisel katalog oturumları"><h3>Satış önerisinde kullanılacak katalog</h3><p>Telefon için paylaşılan oturumu seçin. Boş sepet, müşterinin ürün seçtiği anlamına gelmez.</p>
      {loading?<p role="status">Oturumlar yükleniyor…</p>:!sessions.length?<p>Geçerli katalog oturumu yok.</p>:sessions.map((row,index)=><div key={row.sessionId}><p><strong>Katalog {index+1}</strong> · {row.itemCount?`${row.itemCount} model sepette`:'Sepet boş'} · Son geçerlilik: {new Date(row.expiresAt).toLocaleString('tr-TR')}{row.orderPending?' · Sipariş sonucu bekliyor':''}</p><button className="secondary-button" disabled={busy||row.orderPending||Date.parse(row.expiresAt)<=Date.now()} onClick={()=>{if(isCurrent()){onUseSession(row);onClose();}}}>Satış önerisinde kullan</button></div>)}
    </section>
    {link?<><p><strong>Bağlantınız hazır.</strong></p><p style={{overflowWrap:'anywhere',fontSize:13}}>{link.absoluteUrl}</p><div className="modal-actions"><button className="secondary-button" onClick={()=>window.open(link.absoluteUrl,'_blank','noopener,noreferrer')}><Link size={17}/>Kataloğu aç</button><button className="primary-button" onClick={()=>{if(isCurrent()){const taken=onTakeDraft(`Size özel ürünleri tam seri olarak seçebilirsiniz:\n${link.absoluteUrl}\n\nBu bağlantı kişisel test denemesi içindir.`);if(taken!==false)onClose();}}}>Mesaj taslağına al<ArrowRight size={17}/></button></div></>:<div className="modal-actions"><button className="primary-button" disabled={busy} onClick={create}>{busy?'Hazırlanıyor…':'Bağlantıyı oluştur'}<ArrowRight size={17}/></button></div>}
  </div></section></div>;
}
