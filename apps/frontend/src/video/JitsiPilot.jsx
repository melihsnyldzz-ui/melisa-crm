import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Copy, VideoCamera } from '@phosphor-icons/react';
import { bindPilotNavigation, createPilotSession, invitationPreview, quoteDraftProducts, roomURL } from './pilot.js';
import './video.css';

export default function JitsiPilot({ customer, products = [], isCurrent, onClose }) {
  const currentRef = useRef(isCurrent); currentRef.current = isCurrent;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const sessionRef = useRef(null);
  if (!sessionRef.current) sessionRef.current = createPilotSession({ isCurrent: () => currentRef.current() });
  const [room, setRoom] = useState('');
  const [feedback, setFeedback] = useState('');
  const [query, setQuery] = useState('');
  const [productIds, setProductIds] = useState([]);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);
  const copyRunning = useRef(false);
  useEffect(() => {
    // A fresh effect-owned controller handles React StrictMode's setup/cleanup replay.
    const session = createPilotSession({ isCurrent: () => currentRef.current() });
    sessionRef.current = session;
    const cleanup = bindPilotNavigation(window, () => { session.close(); closeRef.current(); });
    return () => { cleanup(); session.close(); };
  }, []);
  const close = () => { sessionRef.current.close(); closeRef.current(); };
  const prepare = () => {
    try { setRoom(sessionRef.current.prepare()); setFeedback('Bağlantı hazır. Henüz kimseye gönderilmedi ve görüşmeye katılmadınız.'); }
    catch (error) { setFeedback(error.message); }
  };
  const copy = async () => {
    if (copyRunning.current || !room || sessionRef.current.current() !== room) return;
    if (!navigator.clipboard?.writeText) { setFeedback('Kopyalama kullanılamıyor. Önizleme metnini seçip kopyalayabilirsiniz.'); return; }
    const session = sessionRef.current; copyRunning.current = true;
    try { await navigator.clipboard.writeText(invitationPreview(room)); if (session.isActive()) setFeedback('Davet panoya kopyalandı. Müşteriye gönderilmedi.'); }
    catch { if (session.isActive()) setFeedback('Kopyalanamadı. Önizleme metnini seçip kopyalayabilirsiniz.'); }
    finally { copyRunning.current = false; }
  };
  const selections = quoteDraftProducts(products, productIds);
  const term = query.trim().toLocaleLowerCase('tr-TR');
  const filteredProducts = products.filter(product => `${product.code} ${product.name}`.toLocaleLowerCase('tr-TR').includes(term));
  return <div className="modal-body jitsi-pilot">
    <div className="pilot-recipient"><span className="pilot-label">Bu konuşma için davet önizlemesi</span><strong>{customer.name}</strong><span>{customer.phoneDisplay || customer.phone || 'Telefon bilgisi yok'}</span><small>Bu bilgiler CRM’de kalır; görüşme bağlantısına eklenmez.</small></div>
    <div className="pilot-heading"><VideoCamera size={26} weight="duotone"/><div><h3>Jitsi görüntülü görüşme</h3><p>Pilot · Katılım yeni sekmede açılır</p></div></div>
    <p className="pilot-disclosure">meet.jit.si harici ve herkese açık bir hizmettir. Bağlantıya sahip kişiler katılmayı deneyebilir. Oda süresi, yönetici rolü ve erişim kısıtları CRM tarafından garanti edilmez. Görüşmeyi başlatan kişiden Jitsi hesabıyla giriş istenebilir.</p>
    <p className="pilot-disclosure">CRM otomatik kayıt başlatmaz veya kamera/mikrofon izni istemez. Jitsi ve katılımcıların kayıt davranışı CRM tarafından kontrol edilmez. Katılım ekranında cihaz izinlerini ve kayıt durumunu kontrol edin. Bu paneli kapatmak, açık Jitsi sekmesindeki görüşmeyi sonlandırmaz.</p>
    {!room ? <button type="button" className="primary-button pilot-prepare" onClick={prepare}><VideoCamera size={19}/>Davet bağlantısını hazırla</button> : <>
      <label className="pilot-preview">Gönderilmeyen davet önizlemesi<textarea readOnly rows={6} value={invitationPreview(room)} aria-label="Gönderilmeyen davet önizlemesi" /></label>
      <button type="button" className="secondary-button" onClick={copy}><Copy size={18}/>Daveti kopyala</button>
      <label className="pilot-consent"><input type="checkbox" checked={disclosureAccepted} onChange={event => setDisclosureAccepted(event.target.checked)} /><span>Jitsi’nin ayrı bir hizmet olduğunu ve cihaz izinlerini orada kontrol edeceğimi anladım</span></label>
      {disclosureAccepted ? <a className="primary-button pilot-join" href={roomURL(room, { join: true })} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={event => { if (sessionRef.current.current() !== room) { event.preventDefault(); close(); } }}><VideoCamera size={19}/>Jitsi’ye katıl<ArrowRight size={17}/></a> : <button className="primary-button pilot-join" type="button" disabled>Jitsi’ye katıl</button>}
      <small className="pilot-muted-note">Ses ve görüntü kapalı başlangıç tercihi iletilir; harici hizmette geçerli olduğunu kontrol edin.</small>
    </>}
    <div className="pilot-feedback" role="status" aria-live="polite">{feedback}</div>
    <details className="pilot-quote"><summary>Görüşme için teklif taslağı · {selections.length} ürün</summary><p>Seçimler yalnız bu panelde tutulur; panel kapanınca silinir. Fiyat, stok rezervasyonu, cari veya ERP siparişi oluşturulmaz. Davet metnine ürün bilgisi eklenmez.</p>
      {products.length ? <><label>Ürün ara<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ürün adı veya kodu" /></label><div className="pilot-products">{filteredProducts.map(product => <label key={product.id}><input type="checkbox" checked={productIds.includes(String(product.id))} onChange={event => setProductIds(ids => event.target.checked ? [...new Set([...ids, String(product.id)])] : ids.filter(id => id !== String(product.id)))} /><span><strong>{product.name}</strong><small>{product.code}</small></span></label>)}{!filteredProducts.length ? <p>Ürün bulunamadı</p> : null}</div>{selections.length ? <p className="pilot-draft-label">TEKLİF TASLAĞI · {selections.map(product => product.code || product.name).join(', ')}</p> : null}</> : <p>Bu oturumda ERP ürün listesi henüz yüklenmedi. Katalogdan ürünler okunduktan sonra burada seçim yapabilirsiniz.</p>}
    </details>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={close}>Konuşmaya dön</button></div>
  </div>;
}
