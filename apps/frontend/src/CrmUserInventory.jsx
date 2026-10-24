import React, {useEffect,useRef,useState} from 'react';
import {liveApi} from './liveApi.js';

const roleName = {patron:'Patron',mudur:'Müdür',personel:'Personel'};
const mappingName = {linked:'Bağlı',unlinked:'Temsilci bağlantısı yok',inactive:'Hesap kapalı',conflict:'Eşleme kontrolü gerekli',unmapped:'Hesap bağlantısı yok'};
const scopeOf = context => JSON.stringify([context?.token,context?.identity,context?.epoch,context?.role]);

export default function CrmUserInventory({getContext,onChanged}) {
  const contextRef=useRef(getContext);contextRef.current=getContext;
  const pending=useRef(null),generation=useRef(0);
  const context=getContext(),scope=scopeOf(context);
  const [state,setState]=useState({scope:'',data:null,busy:false,error:''});
  const [editor,setEditor]=useState(null);
  const form=editor?.scope===scope?editor:null;
  const visible=state.scope===scope?state:{data:null,busy:false,error:''};
  useEffect(()=>{
    generation.current++;pending.current?.abort();
    setEditor(null);
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
  function edit(row=null) {
    const current=contextRef.current();
    if(scopeOf(current)!==scope||!visible.data?.management?.enabled||!['patron','mudur'].includes(current?.role))return;
    if(row&&!visible.data.management.editableAccountIds.includes(row.userId))return;
    setEditor({scope,accountId:row?.userId||null,busy:false,error:'',values:{username:row?.username||'',displayName:row?.displayName||'',role:row?.role||'personel',active:row?.active??true,chatwootAgentId:String(row?.chatwootAgentId||''),password:''}});
  }
  async function save(event) {
    event.preventDefault();
    const context=contextRef.current(),key=scopeOf(context),management=visible.data?.management;
    if(!form||form.busy||key!==scope||!context?.token||!['patron','mudur'].includes(context.role)||!management?.enabled
      ||form.accountId&&!management.editableAccountIds.includes(form.accountId))return;
    const serial=++generation.current,controller=new AbortController();pending.current?.abort();pending.current=controller;
    const current=()=>!controller.signal.aborted&&serial===generation.current&&scopeOf(contextRef.current())===key;
    const body={...form.values,chatwootAgentId:Number(form.values.chatwootAgentId),revision:management.revision};
    if(form.accountId&&!body.password)delete body.password;
    setEditor({...form,busy:true,error:'',values:{...form.values,password:''}});
    try {
      if(form.accountId)await liveApi.updateCrmUser(context.token,form.accountId,body,{signal:controller.signal});
      else await liveApi.createCrmUser(context.token,body,{signal:controller.signal});
      if(!current())return;
      try{void Promise.resolve(onChanged?.()).catch(()=>{});}catch{}
      setEditor(null);await load();
    }catch(error){
      if(!current())return;
      if([401,403].includes(error.status)){
        setEditor(null);setState({scope:key,data:null,busy:false,error:'Hesap yönetimi için güncel yönetici yetkisi gerekli.'});return;
      }
      setEditor(value=>value?.scope===key?{...value,busy:false,error:error.status===409?'Hesap listesi değişmiş veya kullanıcı adı/temsilci kullanımda. Listeyi yeniden okuyun.':error.status===400?'Hesap alanlarını ve en az 16 karakterli parolayı kontrol edin.':'Hesap kaydı doğrulanamadı. Listeyi yeniden okuyun; kaydı kontrol etmeden tekrar oluşturmayın.'}:value);
    }
  }
  function field(name,value){setEditor(current=>current?.scope===scope&&!current.busy?{...current,values:{...current.values,[name]:value}}:current);}
  const data=visible.data;
  const managed=Boolean(data?.management?.enabled);
  return <section className="data-card settings-card" aria-label="CRM hesap envanteri" aria-busy={visible.busy}>
    <div className="data-card-heading"><div><strong>CRM hesap envanteri</strong><span>Temsilciye bağlı olmayan ve kapalı hesaplar dahil{managed?' · TEST hesap yönetimi':' · salt okunur'}</span></div></div>
    <p>{managed?'Bu temiz TEST alanında yeni kişisel hesapları yönetin. Mevcut yapılandırılmış hesaplar korunur; ERP kişisi ve gerçek müşteri ataması kendiliğinden eşleştirilmez.':'Bu liste CRM hesaplarını gösterir. ERP hesaplarıyla veya gerçek personelle kendiliğinden eşleştirme yapmaz; hesap, yetki ve müşteri ataması değiştirmez.'}</p>
    <button className="secondary-button" disabled={visible.busy||form?.busy} onClick={()=>{setEditor(null);void load();}}>{visible.busy?'Hesaplar okunuyor…':data?'Hesap envanterini yenile':'Hesap envanterini göster'}</button>
    {managed?<button className="secondary-button" disabled={visible.busy||Boolean(form)} onClick={()=>edit()}>Yeni TEST hesabı</button>:null}
    {form?<div className="sales-rules-settings"><form onSubmit={save} aria-label={form.accountId?'TEST hesabını düzenle':'Yeni TEST hesabı'}>
      <label>Kullanıcı adı<input name="username" autoComplete="off" value={form.values.username} required minLength={3} maxLength={64} disabled={form.busy} onChange={event=>field('username',event.target.value)}/></label>
      <label>Ad soyad<input name="displayName" autoComplete="off" value={form.values.displayName} required maxLength={120} disabled={form.busy} onChange={event=>field('displayName',event.target.value)}/></label>
      <label>Rol<select name="role" value={form.values.role} disabled={form.busy} onChange={event=>field('role',event.target.value)}><option value="personel">Personel · yalnız atanmış konuşmalar</option><option value="mudur">Müdür · bütün konuşmalar ve atama</option></select></label>
      <label>TEST temsilci numarası<input name="chatwootAgentId" type="number" min={1001} max={9999} step={1} required value={form.values.chatwootAgentId} disabled={form.busy} onChange={event=>field('chatwootAgentId',event.target.value)}/></label>
      <p>1001–9999 arasında açık ve benzersiz TEST bağı seçin. Bu alan gerçek Chatwoot temsilcisi oluşturmaz.</p>
      <label>Hesap durumu<select name="active" value={String(form.values.active)} disabled={form.busy} onChange={event=>field('active',event.target.value==='true')}><option value="true">Etkin</option><option value="false">Kapalı</option></select></label>
      <label>{form.accountId?'Yeni parola (değişmeyecekse boş bırakın)':'Parola'}<input name="password" type="password" autoComplete="new-password" minLength={16} maxLength={256} required={!form.accountId} value={form.values.password} disabled={form.busy} onChange={event=>field('password',event.target.value)}/></label>
      <p>Rol, temsilci, etkinlik veya parola değişince önceki oturum kapanır; kullanıcı yeniden giriş yapar.</p>
      <p>Temsilci numarası değişirse bu hesaba bağlı yapay TEST görüşmeleri Atanmamışlar'a döner.</p>
      {form.error?<p role="alert">{form.error}</p>:null}
      <button className="primary-button" type="submit" disabled={form.busy}>{form.busy?'Kaydediliyor…':'Hesabı kaydet'}</button>
      <button className="secondary-button" type="button" disabled={form.busy} onClick={()=>setEditor(null)}>Vazgeç</button>
    </form></div>:null}
    {visible.error?<p role="alert">{visible.error}</p>:null}
    {data?<>
      <p role="status">{data.accounts.length} CRM hesap kaydı · {data.accounts.filter(row=>row.active).length} etkin · {data.accounts.filter(row=>!row.active).length} kapalı</p>
      {!data.coverage.accountsComplete?<p role="alert">Yapılandırmadaki {data.coverage.omittedInvalidAccountCount} hesap okunamadı; hesap kapsamı eksik. Listede olmaması hesabın bulunmadığını kanıtlamaz.</p>:null}
      <div className="user-grid">{data.accounts.map((row,index)=><article className="user-card inventory-account" key={`${index}:${row.userId}`}>
        <div><span><strong>{row.displayName}</strong><small>{row.username} · {roleName[row.role]||row.role}</small></span><b className={row.active?'online':''}>{row.active?'Etkin':'Kapalı'}</b></div>
        <dl><span>CRM hesap kimliği<strong>{row.userId}</strong></span><span>Temsilci<strong>{row.chatwootAgentId??'Bağlı değil'}</strong></span><span>Eşleme<strong>{mappingName[row.mappingState]||'Doğrulanmadı'}</strong></span></dl>
        {managed&&data.management.editableAccountIds.includes(row.userId)?<button className="secondary-button" disabled={Boolean(form)||visible.busy} onClick={()=>edit(row)}>Hesabı düzenle</button>:null}
      </article>)}</div>
      <p><strong>Mevcut TEST konuşma atamaları</strong></p>
      {data.assignments.length?<ul>{data.assignments.map(row=><li key={row.conversationId}>Görüşme {row.conversationId} · Temsilci {row.assigneeAgentId} · {row.accountIds.join(', ')||'Hesap bağlantısı yok'} · {mappingName[row.state]||'Doğrulanmadı'}</li>)}</ul>:<p>Bu TEST konuşma kaynağında atama kaydı yok.</p>}
    </>:null}
  </section>;
}
