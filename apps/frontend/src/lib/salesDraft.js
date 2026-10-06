import {normalizeSalesProducts, assertSalesProductCurrent, salesProductDraft} from './salesProducts.js';
import {normalizeSalesPolicyFacts,normalizeSalesRules} from './salesRules.js';
const TEST_PHONE = '905387217733';

export function salesDraftContextKey(context) {
  const conversation = context?.conversation;
  if (!context?.token || !context.identity || !context.canSend || !conversation?.id || context.blocked) return '';
  if (context.testOnly && (String(conversation.phone || '').replace(/\D/g, '') !== TEST_PHONE)) return '';
  return JSON.stringify([context.token, context.identity, context.epoch, context.uiEpoch, String(conversation.id),
    conversation.language, conversation.languageCode, context.currentComposer, context.draftContext, conversation.phone, conversation.owner, conversation.ownerId, conversation.assigneeId, conversation.assignedUserId,
    conversation.assignedPersonnelId, conversation.assignedUserName, conversation.chatwootAgentId,
    conversation.status, conversation.lastMessageAt, conversation.preview,
    (conversation.messages || []).map(message => [message.id, message.direction, message.text, message.createdAt,
      Boolean(message.private || message.isPrivate), (message.attachments || []).map(file => [file.id, file.type, file.url, file.fileName])])]);
}

export function validateSalesDraft(result, conversationId, now=Date.now()) {
  if (!result || result.mode !== 'copilot' || result.autoSend !== false || result.erpWrite !== false || result.requiresHumanReview !== true
      || String(result.conversationId) !== String(conversationId) || !/^[a-f0-9]{64}$/.test(result.conversationRevision || '')
      || !['reply', 'recommend', 'quote', 'handoff'].includes(result.action)
      || typeof result.reply !== 'string' || !result.reply.trim() || result.reply.length > 4000
      || typeof result.summaryTr !== 'string' || !result.summaryTr.trim() || result.summaryTr.length > 1500
      || !Number.isFinite(Date.parse(result.generatedAt))) throw Object.assign(new Error('Öneri yanıtı doğrulanamadı.'), {code: 'AI_RESPONSE_INVALID'});
  // Only text meant for staff review enters UI state. No arbitrary server metadata.
  return { reply: result.reply, summaryTr: result.summaryTr, action: result.action, ...normalizeSalesProducts(result,now), ...(result.policyFacts===undefined?{}:{policyFacts:normalizeSalesPolicyFacts(result.policyFacts)}) };
}

export function salesDraftFailureMessage(error) {
  if (error?.code === 'AI_CATALOG_ACCESS_REVOKED') return 'Ürün önerileri için katalog erişimi şu anda kapalı. Mesaj taslağınız korunuyor.';
  if (error?.code === 'AI_SALES_DISABLED') return 'Satış önerisi şu anda etkin değil. Mesajınızı kendiniz hazırlayabilirsiniz.';
  if (error?.code === 'AI_INCOMING_REQUIRED') return 'Öneri için müşteriden gelen bir metin mesajı gerekiyor.';
  if (error?.status === 401) return 'CRM oturumu sona erdi. Yeniden giriş yapın.';
  if (error?.status === 403) return 'Bu konuşma için satış önerisi yetkiniz yok.';
  if (error?.status === 409) return 'Konuşma değişti. Güncel mesajlar için yeni bir öneri alın.';
  if (error?.status === 429) return 'Çok sık öneri istendi. Biraz bekleyip yeniden deneyin.';
  if (error?.code === 'CRM_REQUEST_TIMEOUT') return 'Öneri zamanında hazırlanamadı. Yeniden deneyebilirsiniz.';
  if (error?.code === 'AI_RESPONSE_INVALID') return 'Öneri yanıtı doğrulanamadı. Mesaj taslağınız korunuyor.';
  if (error?.code === 'AI_PRODUCT_CHANGED') return 'Ürün bilgileri veya fiyatı değişti. Güncel bir öneri alın; mesaj taslağınız korunuyor.';
  if (error?.code === 'AI_DRAFT_CHANGED') return 'Mesaj taslağınız kontrol sırasında değişti. Yeni metniniz korundu; öneriyi yeniden inceleyin.';
  if (error?.code === 'AI_POLICY_CHANGED') return 'Satış kuralları değişti. Güncel bir öneri alın; mesaj taslağınız korunuyor.';
  if (error?.code === 'AI_DRAFT_TOO_LONG') return 'Ürün bilgisi mevcut mesajla 2000 karakteri aşıyor. Önce mesajı kısaltın.';
  return 'Satış önerisi şu anda hazırlanamadı. Mesaj taslağınız korunuyor.';
}

/** Review-only lifecycle. No message-send or ERP capability is accepted here. */
export function createSalesDraftFlow({ getContext, generate, onChange, readProduct, readPolicy, getDraft=()=>'', now=Date.now, schedule=setTimeout, unschedule=clearTimeout }) {
  let active = null, preview = null, expiryTimer=null;
  const emit = state => onChange(state);
  const current = key => Boolean(key && key === salesDraftContextKey(getContext()));
  const publicPreview = () => preview ? {reply:preview.reply,summaryTr:preview.summaryTr,action:preview.action,recommendedProducts:preview.recommendedProducts,catalogFacts:preview.catalogFacts,policyFacts:preview.policyFacts} : null;
  const fresh = () => !preview?.catalogFacts || Date.parse(preview.catalogFacts.expiresAt)>now();
  function clear(error = '') {
    unschedule(expiryTimer);expiryTimer=null;
    active?.controller.abort(); active = null; preview = null;
    emit({ busy: false, preview: null, error });
  }
  async function verifyPolicy(run,ownPreview,existingText) {
    if(typeof readPolicy!=='function')throw Object.assign(new Error(),{code:'AI_RESPONSE_INVALID'});
    const record=normalizeSalesRules(await readPolicy(getContext().token,{signal:run.controller.signal}));
    if(active!==run||run.controller.signal.aborted||preview!==ownPreview||!current(run.key)||!fresh())return false;
    if(getDraft()!==existingText)throw Object.assign(new Error(),{code:'AI_DRAFT_CHANGED'});
    if(record.revision!==ownPreview.policyFacts.revision)throw Object.assign(new Error(),{code:'AI_POLICY_CHANGED'});
    return true;
  }
  async function takeReviewedText(existingText) {
    const ownPreview=preview,run={key:preview.key,controller:new AbortController()};active=run;
    emit({busy:true,preview:publicPreview(),error:'',policyChecking:true});
    try {
      if(!await verifyPolicy(run,ownPreview,existingText))return null;
      const draft=existingText.trim()?`${existingText}\n\n${preview.reply}`:preview.reply;
      if(draft.length>2000){active=null;emit({busy:false,preview:publicPreview(),error:'Mevcut mesaj ve öneri 2000 karakteri aşıyor. Önce mesajı kısaltın.'});return null;}
      clear();return draft;
    } catch(error){if(active===run&&!run.controller.signal.aborted&&current(run.key))clear(salesDraftFailureMessage(error));return null;}
    finally{if(active===run){active=null;if(!current(run.key)||!fresh())clear('Öneri artık güncel değil. Yeni bir öneri alın.');}}
  }
  return {
    close: () => clear(),
    invalidate: error => clear(salesDraftFailureMessage(error)),
    isPreviewCurrent: () => Boolean(preview && current(preview.key) && fresh()),
    synchronize() {
      if ((active && !current(active.key)) || (preview && (!current(preview.key) || !fresh()))) clear('Konuşma, yetki veya ürün okuma süresi değişti. Güncel bir öneri alın.');
    },
    async start({catalogSearch=''}={}) {
      if (active) return false;
      if(typeof catalogSearch!=='string'||catalogSearch.trim().length>120) {clear('Ürün araması en fazla 120 karakter olabilir.');return false;}
      const context = getContext(), key = salesDraftContextKey(context);
      if (!key) { clear('Öneri için yetkili bir konuşma seçin.'); return false; }
      const run = { key, controller: new AbortController() };
      unschedule(expiryTimer);expiryTimer=null;active = run; preview = null; emit({ busy: true, preview: null, error: '' });
      try {
        const result = await generate(context.token, String(context.conversation.id), { signal: run.controller.signal,customerLanguage:context.conversation.languageCode||({Türkçe:"tr",İngilizce:"en",Arapça:"ar",İtalyanca:"it",Fransızca:"fr",Rusça:"ru"}[context.conversation.language]||"auto"),currentComposer:context.currentComposer||getDraft(),draftContext:context.draftContext||null,...(catalogSearch.trim()?{catalogSearch:catalogSearch.trim()}:{}) });
        if (active !== run || run.controller.signal.aborted || !current(key)) return false;
        // Production supplies readPolicy and must receive server-owned rules. Legacy
        // text-only offline fixtures without that dependency retain their old path.
        if(typeof readPolicy==='function'&&result.policyFacts===undefined)throw Object.assign(new Error(),{code:'AI_RESPONSE_INVALID'});
        preview = { key, ...validateSalesDraft(result, context.conversation.id,now()) };
        if(preview.catalogFacts) expiryTimer=schedule(()=>clear('Ürün okuma süresi doldu. Güncel bir öneri alın.'),Date.parse(preview.catalogFacts.expiresAt)-now());
        emit({ busy: false, preview: publicPreview(), error: '' });
        return true;
      } catch (error) {
        if (active === run && !run.controller.signal.aborted && current(key)) emit({ busy: false, preview: null, error: salesDraftFailureMessage(error) });
        return false;
      } finally {
        if (active === run) {
          active = null;
          if (!current(key)) clear('Konuşma veya yetki değişti. Güncel bir öneri alın.');
        }
      }
    },
    takeDraft(existingText = '') {
      if(active)return null;
      if (!preview || !current(preview.key) || !fresh()) { clear('Öneri artık güncel değil. Yeni bir öneri alın.'); return null; }
      if(preview.policyFacts)return takeReviewedText(existingText);
      const draft = existingText.trim() ? `${existingText}\n\n${preview.reply}` : preview.reply;
      if (draft.length > 2000) { emit({ busy: false, preview: publicPreview(), error: 'Mevcut mesaj ve öneri 2000 karakteri aşıyor. Önce mesajı kısaltın.' }); return null; }
      clear();
      return draft;
    },
    async takeProductDraft(id,action) {
      if(active)return null;
      const product=preview?.recommendedProducts.find(row=>row.id===id), context=getContext();
      if(!product||!current(preview.key)||!fresh()||typeof readProduct!=='function'){clear('Öneri artık güncel değil. Yeni bir öneri alın.');return null;}
      const existingText=getDraft(), ownPreview=preview;
      const run={key:preview.key,controller:new AbortController()};active=run;
      emit({busy:true,preview:publicPreview(),error:'',productChecking:true});
      try {
        const envelope=await readProduct(context.token,id,{signal:run.controller.signal});
        if(active!==run||run.controller.signal.aborted||preview!==ownPreview||!current(run.key)||!fresh())return null;
        if(getDraft()!==existingText)throw Object.assign(new Error(),{code:'AI_DRAFT_CHANGED'});
        assertSalesProductCurrent(envelope,product,now());
        if(ownPreview.policyFacts&&!await verifyPolicy(run,ownPreview,existingText))return null;
        const draft=salesProductDraft(product,action,existingText);
        clear();return draft;
      } catch(error) {
        if(active===run&&!run.controller.signal.aborted&&current(run.key)){
          if(error.code==='AI_DRAFT_TOO_LONG')emit({busy:false,preview:publicPreview(),error:salesDraftFailureMessage(error)});
          else clear(salesDraftFailureMessage(error));
        }
        return null;
      } finally {
        if(active===run){active=null;if(!current(run.key)||!fresh())clear('Öneri artık güncel değil. Yeni bir öneri alın.');}
      }
    },
  };
}
