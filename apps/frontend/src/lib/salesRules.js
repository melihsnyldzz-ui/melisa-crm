const modes = ['unconfigured', 'none', 'amount'];
const currencies = ['TRY', 'USD', 'EUR'];
const fail = () => { throw Object.assign(new Error('Satış kuralları doğrulanamadı.'), {code:'AI_POLICY_INVALID'}); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function text(value, limit) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail();
  return value.trim();
}
function minimum(value) {
  if (!modes.includes(value?.minimumOrderMode)) fail();
  const amount = value.minimumOrder;
  if (value.minimumOrderMode === 'amount') {
    if (!plain(amount) || Object.keys(amount).sort().join(',') !== 'amountMinor,currency' || !Number.isSafeInteger(amount.amountMinor) || amount.amountMinor < 1 || amount.amountMinor > 1_000_000_000 || !currencies.includes(amount.currency)) fail();
    return {minimumOrderMode:'amount',minimumOrder:{amountMinor:amount.amountMinor,currency:amount.currency}};
  }
  if (amount !== null) fail();
  return {minimumOrderMode:value.minimumOrderMode,minimumOrder:null};
}
export function normalizeSalesPolicy(value) {
  if (!plain(value) || typeof value.version !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(value.version)) fail();
  if (value.telegramUrl !== null && (typeof value.telegramUrl !== 'string' || !/^https:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(value.telegramUrl))) fail();
  if (!Array.isArray(value.countryRules) || value.countryRules.length > 12) fail();
  const seen = new Set();
  const countryRules = value.countryRules.map(rule => {
    if (!plain(rule)) fail();
    const country = text(rule.country,80), identity = country.toLocaleLowerCase('tr-TR');
    if (!country || seen.has(identity)) fail();
    seen.add(identity);
    return {country,...minimum(rule),notes:text(rule.notes,1000)};
  });
  return {version:value.version,...minimum(value),telegramUrl:value.telegramUrl,countryRules,shippingTerms:text(value.shippingTerms,2000),salesNotes:text(value.salesNotes,2000)};
}
export function normalizeSalesRules(value) {
  if (!plain(value) || !/^[a-f0-9]{64}$/.test(value.revision||'') || typeof value.configured !== 'boolean' || typeof value.writable !== 'boolean') fail();
  return {policy:normalizeSalesPolicy(value.policy),revision:value.revision,configured:value.configured,writable:value.writable};
}
export function normalizeSalesPolicyFacts(value) {
  if (!plain(value) || !/^[a-f0-9]{64}$/.test(value.revision||'') || typeof value.requiresStaffConfirmation !== 'boolean') fail();
  if(value.countrySelection!=='unverified'||value.shippingConfirmation!=='staff'||['discountAllowed','breakSeries','autoSend','writeErp'].some(key=>value[key]!==false))fail();
  return {...normalizeSalesPolicy(value),revision:value.revision,requiresStaffConfirmation:value.requiresStaffConfirmation};
}
export function minimumLabel(rule) {
  if (rule.minimumOrderMode === 'none') return 'Minimum sipariş tutarı yok';
  if (rule.minimumOrderMode !== 'amount') return 'Minimum sipariş henüz belirlenmedi';
  return `${(rule.minimumOrder.amountMinor/100).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} ${rule.minimumOrder.currency}`;
}
export function amountToMinor(value) {
  if (typeof value !== 'string' || !/^\d{1,8}([.,]\d{1,2})?$/.test(value.trim())) fail();
  const [whole,decimal=''] = value.trim().replace(',','.').split('.');
  const amount = Number(whole)*100 + Number(decimal.padEnd(2,'0'));
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000) fail();
  return amount;
}
export function policyToForm(policy) {
  const rule = value => ({...value,amount:value.minimumOrder ? (value.minimumOrder.amountMinor/100).toFixed(2) : '',currency:value.minimumOrder?.currency || ''});
  return {...rule(policy),countryRules:policy.countryRules.map(rule),telegramUrl:policy.telegramUrl || ''};
}
export function formToPolicy(form) {
  const rule = value => ({minimumOrderMode:value.minimumOrderMode,minimumOrder:value.minimumOrderMode === 'amount' ? {amountMinor:amountToMinor(value.amount),currency:value.currency} : null});
  return normalizeSalesPolicy({...form,...rule(form),telegramUrl:form.telegramUrl.trim() || null,countryRules:form.countryRules.map(value=>({country:value.country,...rule(value),notes:value.notes}))});
}
export function salesRulesFailureMessage(error) {
  if (error?.status === 401) return 'Oturum sona erdi. Yeniden giriş yapın; formdaki değişiklikleriniz korunuyor.';
  if (error?.status === 403) return 'Satış kurallarını değiştirme yetkiniz yok. Formdaki değişiklikleriniz korunuyor.';
  if (error?.status === 409) return 'Satış kuralları başka bir işlemde değişti. Formunuz korundu; güncel kuralları yükleyip düzenleyin.';
  if (error?.code === 'AI_POLICY_INVALID') return 'Minimum tutarı, para birimini ve ülke satırlarını kontrol edin. Tutar en fazla iki ondalık basamak içerebilir.';
  return 'Satış kuralları şu anda okunamadı veya kaydedilemedi. Formdaki değişiklikleriniz korunuyor.';
}
export function salesRulesContextKey(context) {
  return context?.token && context.identity && context.role ? JSON.stringify([context.token,context.identity,context.epoch,context.role]) : '';
}
/** Account-bound editor. No composer, send, ERP or model capability is accepted. */
export function createSalesRulesEditor({getContext,read,write,onChange}) {
  let record=null,form=null,dirty=false,active=null;
  const emit = (error='',success='') => onChange({record,form,dirty,busy:Boolean(active),error,success});
  const current = key => key && key === salesRulesContextKey(getContext());
  return {
    close(){active?.controller.abort();active=null;},
    edit(next){if(active||!record?.writable||getContext()?.role!=='patron')return false;form=next;dirty=true;emit();return true;},
    async load({replace=false}={}) {
      if(active)return false;
      const context=getContext(),key=salesRulesContextKey(context);if(!key)return false;
      const run={key,controller:new AbortController()};active=run;emit();
      try {
        const next=normalizeSalesRules(await read(context.token,{signal:run.controller.signal}));
        if(active!==run||run.controller.signal.aborted||!current(key))return false;
        // Reload is an explicit user action; incidental reads cannot overwrite edits.
        if(dirty&&!replace){record={...record,writable:next.writable};return false;}
        record=next;form=policyToForm(next.policy);dirty=false;return true;
      } catch(error){if(active===run&&!run.controller.signal.aborted&&current(key)){active=null;emit(salesRulesFailureMessage(error));}return false;}
      finally{if(active===run){active=null;if(current(key))emit();}}
    },
    async save() {
      if(active||!record?.writable||getContext()?.role!=='patron')return false;
      const context=getContext(),key=salesRulesContextKey(context);if(!key)return false;
      let policy;try{policy=formToPolicy(form);}catch(error){emit(salesRulesFailureMessage(error));return false;}
      const run={key,controller:new AbortController()};active=run;emit();
      try {
        const next=normalizeSalesRules(await write(context.token,{policy,revision:record.revision},{signal:run.controller.signal}));
        if(active!==run||run.controller.signal.aborted||!current(key))return false;
        record=next;form=policyToForm(next.policy);dirty=false;active=null;emit('','Satış kuralları kaydedildi.');return true;
      } catch(error){if(active===run&&!run.controller.signal.aborted&&current(key)){active=null;emit(salesRulesFailureMessage(error));}return false;}
      finally{if(active===run){active=null;if(current(key))emit();}}
    },
  };
}
