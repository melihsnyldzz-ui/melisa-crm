import { useEffect, useRef, useState } from 'react';
import { Sparkle, X } from '@phosphor-icons/react';
import SalesProductCards from './SalesProductCards.jsx';
import {SalesPolicySummary} from './SalesRulesSettings.jsx';
import './salesSuggestion.css';

export default function SalesSuggestion({ state, allowed, token, isCurrent, onInvalidate, onRequest, onTakeDraft, onTakeProduct, onClose }) {
  const heading = useRef(null);
  const [catalogSearch,setCatalogSearch]=useState('');
  useEffect(() => { if (state.preview) heading.current?.focus(); }, [state.preview]);
  return <div className="sales-suggestion">
    <div className="sales-suggestion-request"><label>Ürün veya kod (isteğe bağlı)<input value={catalogSearch} maxLength={120} disabled={!allowed||state.busy} onChange={event=>setCatalogSearch(event.target.value)} placeholder="Örn. 41140" /></label><button className="sales-suggestion-trigger" type="button" disabled={!allowed || state.busy} onClick={()=>onRequest(catalogSearch)}>
      <Sparkle size={18} aria-hidden="true" />{state.busy ? 'Öneri hazırlanıyor…' : 'Satış önerisi'}
    </button></div>
    {state.busy || state.preview || state.error ? <section className="sales-suggestion-panel" aria-label="Satış önerisi incelemesi" aria-busy={state.busy}>
      <header><strong tabIndex={-1} ref={heading}>Satış önerisi</strong><button type="button" aria-label="Satış önerisini kapat" onClick={onClose}><X size={21} /></button></header>
      {state.busy ? <p role="status">{state.policyChecking?'Satış kuralları yeniden kontrol ediliyor.':state.productChecking?'Ürün kaydı ve satış kuralları yeniden kontrol ediliyor.':'Konuşmaya göre öneri hazırlanıyor.'} Mesaj taslağınız korunuyor.</p> : null}
      {state.error ? <p className="sales-suggestion-error" role="alert">{state.error}</p> : null}
      {state.preview ? <>
        <p className="sales-suggestion-note">AI önerisidir. Özeti, dili ve bilgileri inceleyin. Taslağa almak mesajı göndermez.</p>
        <div className="sales-suggestion-copy"><h4>Türkçe özet</h4><p>{state.preview.summaryTr}</p><h4>Müşteriye önerilen yanıt</h4><p>{state.preview.reply}</p><SalesProductCards products={state.preview.recommendedProducts||[]} token={token} isCurrent={isCurrent} onInvalidate={onInvalidate} onTakeProduct={onTakeProduct} disabled={!allowed||state.busy}/></div>
        {state.preview.catalogFacts?<small>ERP kayıtları okundu: {new Date(state.preview.catalogFacts.fetchedAt).toLocaleTimeString('tr-TR')}. Güncel stok ve seri bilgisi doğrulanmış değildir.</small>:null}
        {state.preview.policyFacts?<section aria-label="Öneride kullanılan satış kuralları"><h4>Satış kuralları</h4><SalesPolicySummary policy={state.preview.policyFacts}/>{state.preview.policyFacts.requiresStaffConfirmation?<p>Teslimat ülkesini ve uygulanacak koşulları müşteriyle doğrulayın.</p>:null}</section>:null}
        <button className="sales-suggestion-take" type="button" disabled={!allowed||state.busy} onClick={onTakeDraft}>Mesaj taslağına al</button>
        <small>Mevcut mesajınızın sonuna eklenir. Göndermek için ayrıca Gönder'e basın.</small>
      </> : null}
    </section> : null}
  </div>;
}
