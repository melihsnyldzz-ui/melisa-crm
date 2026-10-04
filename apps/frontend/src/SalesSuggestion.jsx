import { useEffect, useRef } from 'react';
import { Sparkle, X } from '@phosphor-icons/react';
import './salesSuggestion.css';

export default function SalesSuggestion({ state, allowed, onRequest, onTakeDraft, onClose }) {
  const heading = useRef(null);
  useEffect(() => { if (state.preview) heading.current?.focus(); }, [state.preview]);
  return <div className="sales-suggestion">
    <button className="sales-suggestion-trigger" type="button" disabled={!allowed || state.busy} onClick={onRequest}>
      <Sparkle size={18} aria-hidden="true" />{state.busy ? 'Öneri hazırlanıyor…' : 'Satış önerisi'}
    </button>
    {state.busy || state.preview || state.error ? <section className="sales-suggestion-panel" aria-label="Satış önerisi incelemesi" aria-busy={state.busy}>
      <header><strong tabIndex={-1} ref={heading}>Satış önerisi</strong><button type="button" aria-label="Satış önerisini kapat" onClick={onClose}><X size={21} /></button></header>
      {state.busy ? <p role="status">Konuşmaya göre öneri hazırlanıyor. Mesaj taslağınız korunuyor.</p> : null}
      {state.error ? <p className="sales-suggestion-error" role="alert">{state.error}</p> : null}
      {state.preview ? <>
        <p className="sales-suggestion-note">AI önerisidir. Özeti, dili ve bilgileri inceleyin. Taslağa almak mesajı göndermez.</p>
        <div className="sales-suggestion-copy"><h4>Türkçe özet</h4><p>{state.preview.summaryTr}</p><h4>Müşteriye önerilen yanıt</h4><p>{state.preview.reply}</p></div>
        <button className="sales-suggestion-take" type="button" disabled={!allowed} onClick={onTakeDraft}>Mesaj taslağına al</button>
        <small>Mevcut mesajınızın sonuna eklenir. Göndermek için ayrıca Gönder'e basın.</small>
      </> : null}
    </section> : null}
  </div>;
}
