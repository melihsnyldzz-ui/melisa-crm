import React, {useEffect,useRef,useState} from 'react';
import {liveApi} from './liveApi.js';

const roleName = {patron:'Patron',mudur:'Müdür',personel:'Personel'};
const mappingName = {linked:'Bağlı',unlinked:'Temsilci bağlantısı yok',inactive:'Hesap kapalı',conflict:'Eşleme kontrolü gerekli',unmapped:'Hesap bağlantısı yok'};
const scopeOf = context => JSON.stringify([context?.token,context?.identity,context?.epoch,context?.role]);

export default function CrmUserInventory({getContext}) {
  const contextRef=useRef(getContext);contextRef.current=getContext;
  const pending=useRef(null),generation=useRef(0);
  const context=getContext(),scope=scopeOf(context);
  const [state,setState]=useState({scope:'',data:null,busy:false,error:''});
  const visible=state.scope===scope?state:{data:null,busy:false,error:''};
  useEffect(()=>{
    generation.current++;pending.current?.abort();
    setState({scope,data:null,busy:false,error:''});
    return()=>{generation.current++;pending.current?.abort();};
  },[scope]);
  async function load() {
    const currentContext=contextRef.current(),key=scopeOf(currentContext);
    if(!currentContext?.token||!['patron','mudur'].includes(currentContext.role))return;
    const serial=++generation.current,controller=new AbortController();
    pending.current?.abort();pending.current=controller;
    const current=()=>!controller.signal.aborted&&serial===generation.current&&scopeOf(contextRef.current())===key;
    setState({scope:key,data:null,busy:true,error:''});
    try {
      const data=await liveApi.userInventory(currentContext.token,{signal:controller.signal});
      if(!current())return;
      if(!Array.isArray(data?.accounts)||!Array.isArray(data?.assignments)||data.coverage?.accountsScope!=='configured-crm-users')throw Error('Hesap envanterinin kapsamı doğrulanamadı.');
      setState({scope:key,data,busy:false,error:''});
    }catch(error){
      if(!current())return;
      setState({scope:key,data:null,busy:false,error:[401,403].includes(error.status)?'Hesap envanteri için güncel yönetici yetkisi gerekli.':error.status===404?'Bu ortamda TEST hesap envanteri kullanılamıyor.':'Hesap envanteri alınamadı. Yeniden deneyin.'});
    }
  }
  const data=visible.data;
  return <section className="data-card settings-card" aria-label="CRM hesap envanteri" aria-busy={visible.busy}>
    <div className="data-card-heading"><div><strong>CRM hesap envanteri</strong><span>Temsilciye bağlı olmayan ve kapalı hesaplar dahil · salt okunur</span></div></div>
    <p>Bu liste CRM hesaplarını gösterir. ERP hesaplarıyla veya gerçek personelle kendiliğinden eşleştirme yapmaz; hesap, yetki ve müşteri ataması değiştirmez.</p>
    <button className="secondary-button" disabled={visible.busy} onClick={()=>void load()}>{visible.busy?'Hesaplar okunuyor…':data?'Hesap envanterini yenile':'Hesap envanterini göster'}</button>
    {visible.error?<p role="alert">{visible.error}</p>:null}
    {data?<>
      <p role="status">{data.accounts.length} CRM hesap kaydı · {data.accounts.filter(row=>row.active).length} etkin · {data.accounts.filter(row=>!row.active).length} kapalı</p>
      {!data.coverage.accountsComplete?<p role="alert">Yapılandırmadaki {data.coverage.omittedInvalidAccountCount} hesap okunamadı; hesap kapsamı eksik. Listede olmaması hesabın bulunmadığını kanıtlamaz.</p>:null}
      <div className="user-grid">{data.accounts.map((row,index)=><article className="user-card" key={`${index}:${row.userId}`}>
        <div><span><strong>{row.displayName}</strong><small>{row.username} · {roleName[row.role]||row.role}</small></span><b className={row.active?'online':''}>{row.active?'Etkin':'Kapalı'}</b></div>
        <dl><span>CRM hesap kimliği<strong>{row.userId}</strong></span><span>Temsilci<strong>{row.chatwootAgentId??'Bağlı değil'}</strong></span><span>Eşleme<strong>{mappingName[row.mappingState]||'Doğrulanmadı'}</strong></span></dl>
      </article>)}</div>
      <p><strong>Mevcut TEST konuşma atamaları</strong></p>
      {data.assignments.length?<ul>{data.assignments.map(row=><li key={row.conversationId}>Görüşme {row.conversationId} · Temsilci {row.assigneeAgentId} · {row.accountIds.join(', ')||'Hesap bağlantısı yok'} · {mappingName[row.state]||'Doğrulanmadı'}</li>)}</ul>:<p>Bu TEST konuşma kaynağında atama kaydı yok.</p>}
    </>:null}
  </section>;
}
