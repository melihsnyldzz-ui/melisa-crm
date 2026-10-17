import {useEffect,useRef,useState} from 'react';
import {liveApi} from './liveApi.js';
import {createSalesRulesEditor,minimumLabel,normalizeSalesBusinessRules,salesRulesContextKey} from './lib/salesRules.js';
import './salesRulesSettings.css';

function MinimumFields({rule,onChange,disabled,label}) {
  return <div className="sales-rules-minimum"><label>{label}<select value={rule.minimumOrderMode} disabled={disabled} onChange={event=>onChange({...rule,minimumOrderMode:event.target.value,amount:'',currency:''})}><option value="unconfigured">Henüz belirlenmedi</option><option value="none">Minimum tutar yok</option><option value="amount">Minimum tutar var</option></select></label>
    {rule.minimumOrderMode==='amount'?<><label>Tutar<input inputMode="decimal" value={rule.amount} maxLength={12} disabled={disabled} onChange={event=>onChange({...rule,amount:event.target.value})}/></label><label>Para birimi<select value={rule.currency} disabled={disabled} onChange={event=>onChange({...rule,currency:event.target.value})}><option value="">Seçin</option><option value="TRY">Türk lirası (TRY)</option><option value="USD">ABD doları (USD)</option><option value="EUR">Euro (EUR)</option></select></label></>:null}
  </div>;
}

export function SalesBusinessRules({rules}) {
  const verified=normalizeSalesBusinessRules(rules);
  if(!verified)return <p>Onaylı sabit işletme kuralları bu yanıtta doğrulanmadı.</p>;
  return <section aria-label="Onaylı sabit işletme kuralları">
    <p><strong>Yalnız toptan · Seri bölünmez · Kargo alıcıya ait</strong></p>
    <p>Bu kurallar notlarla değiştirilemez. Kargo ücreti ve teslimat koşulları ayrıca doğrulanır.</p>
    <details><summary>Karar kaynakları</summary><ul>{verified.sources.map((source,index)=><li key={source}><a href={source} target="_blank" rel="noopener noreferrer">{index===0?'Onaylı hedef · P10.1':'Onaylı ortak rapor'}</a></li>)}</ul></details>
  </section>;
}

export function SalesPolicySummary({policy}) {
  return <div className="sales-rules-summary"><SalesBusinessRules rules={policy.businessRules}/><p><strong>Genel minimum:</strong> {minimumLabel(policy)}</p>
    {policy.countryRules.length?<><strong>Ülkeye özel kurallar</strong><ul>{policy.countryRules.map(rule=><li key={rule.country}><strong>{rule.country}:</strong> {minimumLabel(rule)}{rule.notes?<p>{rule.notes}</p>:null}</li>)}</ul><p>Teslimat ülkesini müşteriyle doğrulayın. Telefon numarası veya mesaj dili teslimat ülkesini belirlemez.</p></>:null}
    <p><strong>Ek kargo notları:</strong> {policy.shippingTerms||'Henüz belirlenmedi'}</p><p><strong>Satış notları:</strong> {policy.salesNotes||'Henüz belirlenmedi'}</p>
    {policy.telegramUrl?<p><strong>Telegram:</strong> {policy.telegramUrl}</p>:null}
  </div>;
}

export default function SalesRulesSettings({getContext}) {
  const [state,setState]=useState({record:null,form:null,busy:false,error:'',success:'',dirty:false});
  const contextRef=useRef(getContext);contextRef.current=getContext;
  const editorRef=useRef(null);
  if(!editorRef.current)editorRef.current=createSalesRulesEditor({getContext:()=>contextRef.current(),read:(...args)=>liveApi.salesRules(...args),write:(...args)=>liveApi.saveSalesRules(...args),onChange:setState});
  const context=getContext(),contextKey=salesRulesContextKey(context);
  useEffect(()=>{void editorRef.current.load();return()=>editorRef.current.close();},[contextKey]);
  const editable=context.role==='patron'&&state.record?.writable===true;
  const disabled=state.busy||!editable;
  const form=state.form,edit=next=>editorRef.current.edit(next);
  return <section className="data-card sales-rules-settings" aria-label="Satış kuralları" aria-busy={state.busy}>
    <div className="data-card-heading"><div><strong>Satış kuralları</strong><span>Minimum sipariş, ülke koşulları ve kargo notları</span></div></div>
    <p>Bu bilgiler satış önerisinde gösterilir. Mesaj göndermek veya ERP siparişi oluşturmak için ayrıca işlem yapmanız gerekir.</p>
    {state.error?<p role="alert" className="sales-rules-error">{state.error}</p>:null}{state.success?<p role="status" className="sales-rules-success">{state.success}</p>:null}
    {state.busy?<p role="status">Satış kuralları kontrol ediliyor…</p>:null}
    {state.record&&!editable?<><p>{context.role==='patron'?'Satış kuralları şu anda düzenlemeye açık değil.':'Satış kurallarını yalnız patron değiştirebilir.'}</p><SalesPolicySummary policy={{...state.record.policy,businessRules:state.record.businessRules}}/></>:null}
    {state.record&&editable?<SalesBusinessRules rules={state.record.businessRules}/>:null}
    {form&&editable?<form onSubmit={event=>{event.preventDefault();void editorRef.current.save();}}>
      <MinimumFields label="Genel minimum sipariş" rule={form} disabled={disabled} onChange={edit}/>
      <fieldset disabled={disabled}><legend>Ülkeye özel kurallar</legend><p>Teslimat ülkesini müşteriyle doğrulayın. Numara veya dil üzerinden otomatik ülke seçilmez.</p>
        {form.countryRules.map((rule,index)=><div className="sales-rules-country" key={index}>
          <label>Ülke<input value={rule.country} maxLength={80} placeholder="Örn. Türkiye" onChange={event=>edit({...form,countryRules:form.countryRules.map((item,i)=>i===index?{...item,country:event.target.value}:item)})}/></label>
          <MinimumFields label="Bu ülke için minimum" rule={rule} disabled={disabled} onChange={next=>edit({...form,countryRules:form.countryRules.map((item,i)=>i===index?next:item)})}/>
          <label>Ülke notu<textarea value={rule.notes} maxLength={1000} rows={2} onChange={event=>edit({...form,countryRules:form.countryRules.map((item,i)=>i===index?{...item,notes:event.target.value}:item)})}/></label>
          <button type="button" onClick={()=>edit({...form,countryRules:form.countryRules.filter((_,i)=>i!==index)})}>Ülke kuralını kaldır</button>
        </div>)}
        <button type="button" disabled={disabled||form.countryRules.length>=12} onClick={()=>edit({...form,countryRules:[...form.countryRules,{country:'',minimumOrderMode:'unconfigured',minimumOrder:null,amount:'',currency:'',notes:''}]})}>Ülke kuralı ekle</button>
      </fieldset>
      <label>Ek kargo notları (sabit kuralları değiştirmez)<textarea value={form.shippingTerms} maxLength={2000} rows={3} disabled={disabled} onChange={event=>edit({...form,shippingTerms:event.target.value})} placeholder="Personelin doğrulayacağı ek bilgileri yazın"/></label>
      <label>Satış notları<textarea value={form.salesNotes} maxLength={2000} rows={3} disabled={disabled} onChange={event=>edit({...form,salesNotes:event.target.value})}/></label>
      <label>Telegram adresi (isteğe bağlı)<input type="url" value={form.telegramUrl} maxLength={45} disabled={disabled} placeholder="https://t.me/…" onChange={event=>edit({...form,telegramUrl:event.target.value})}/></label>
      <p>İndirim, seri bölme ve doğrulanmamış kargo ücreti veya teslim tarihi satış önerisinde otomatik uygulanmaz.</p>
      <div className="sales-rules-actions"><button type="submit" disabled={disabled||!state.dirty}>Kaydet</button><button type="button" disabled={state.busy} onClick={()=>void editorRef.current.load({replace:true})}>{state.dirty?'Değişiklikleri bırak ve güncel kuralları yükle':'Güncel kuralları yükle'}</button></div>
    </form>:!state.record&&!state.busy?<button type="button" onClick={()=>void editorRef.current.load()}>Yeniden dene</button>:null}
    {state.record&&!editable?<button type="button" disabled={state.busy} onClick={()=>void editorRef.current.load({replace:true})}>Güncel kuralları yükle</button>:null}
  </section>;
}
