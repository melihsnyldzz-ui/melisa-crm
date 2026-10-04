const TEST_PHONE = '905387217733';

export function salesDraftContextKey(context) {
  const conversation = context?.conversation;
  if (!context?.token || !context.identity || !context.canSend || !conversation?.id || context.blocked) return '';
  if (context.testOnly && (String(conversation.id) !== '55' || String(conversation.phone || '').replace(/\D/g, '') !== TEST_PHONE)) return '';
  return JSON.stringify([context.token, context.identity, context.epoch, context.uiEpoch, String(conversation.id),
    conversation.phone, conversation.owner, conversation.ownerId, conversation.assigneeId, conversation.assignedUserId,
    conversation.assignedPersonnelId, conversation.assignedUserName, conversation.chatwootAgentId,
    conversation.status, conversation.lastMessageAt, conversation.preview,
    (conversation.messages || []).map(message => [message.id, message.direction, message.text, message.createdAt,
      Boolean(message.private || message.isPrivate), (message.attachments || []).map(file => [file.id, file.type, file.url, file.fileName])])]);
}

export function validateSalesDraft(result, conversationId) {
  if (!result || result.mode !== 'copilot' || result.autoSend !== false || result.erpWrite !== false || result.requiresHumanReview !== true
      || String(result.conversationId) !== String(conversationId) || !/^[a-f0-9]{64}$/.test(result.conversationRevision || '')
      || !['reply', 'recommend', 'quote', 'handoff'].includes(result.action)
      || typeof result.reply !== 'string' || !result.reply.trim() || result.reply.length > 4000
      || typeof result.summaryTr !== 'string' || !result.summaryTr.trim() || result.summaryTr.length > 1500
      || !Number.isFinite(Date.parse(result.generatedAt))) throw Object.assign(new Error('Öneri yanıtı doğrulanamadı.'), {code: 'AI_RESPONSE_INVALID'});
  // Only text meant for staff review enters UI state. No arbitrary server metadata.
  return { reply: result.reply, summaryTr: result.summaryTr, action: result.action };
}

export function salesDraftFailureMessage(error) {
  if (error?.code === 'AI_SALES_DISABLED') return 'Satış önerisi şu anda etkin değil. Mesajınızı kendiniz hazırlayabilirsiniz.';
  if (error?.code === 'AI_INCOMING_REQUIRED') return 'Öneri için müşteriden gelen bir metin mesajı gerekiyor.';
  if (error?.status === 401) return 'CRM oturumu sona erdi. Yeniden giriş yapın.';
  if (error?.status === 403) return 'Bu konuşma için satış önerisi yetkiniz yok.';
  if (error?.status === 409) return 'Konuşma değişti. Güncel mesajlar için yeni bir öneri alın.';
  if (error?.status === 429) return 'Çok sık öneri istendi. Biraz bekleyip yeniden deneyin.';
  if (error?.code === 'CRM_REQUEST_TIMEOUT') return 'Öneri zamanında hazırlanamadı. Yeniden deneyebilirsiniz.';
  if (error?.code === 'AI_RESPONSE_INVALID') return 'Öneri yanıtı doğrulanamadı. Mesaj taslağınız korunuyor.';
  return 'Satış önerisi şu anda hazırlanamadı. Mesaj taslağınız korunuyor.';
}

/** Review-only lifecycle. No message-send or ERP capability is accepted here. */
export function createSalesDraftFlow({ getContext, generate, onChange }) {
  let active = null, preview = null;
  const emit = state => onChange(state);
  const current = key => Boolean(key && key === salesDraftContextKey(getContext()));
  function clear(error = '') {
    active?.controller.abort(); active = null; preview = null;
    emit({ busy: false, preview: null, error });
  }
  return {
    close: () => clear(),
    synchronize() {
      if ((active && !current(active.key)) || (preview && !current(preview.key))) clear('Konuşma veya yetki değişti. Güncel bir öneri alın.');
    },
    async start() {
      if (active) return false;
      const context = getContext(), key = salesDraftContextKey(context);
      if (!key) { clear('Öneri için yetkili bir konuşma seçin.'); return false; }
      const run = { key, controller: new AbortController() };
      active = run; preview = null; emit({ busy: true, preview: null, error: '' });
      try {
        const result = await generate(context.token, String(context.conversation.id), { signal: run.controller.signal });
        if (active !== run || run.controller.signal.aborted || !current(key)) return false;
        preview = { key, ...validateSalesDraft(result, context.conversation.id) };
        emit({ busy: false, preview: { reply: preview.reply, summaryTr: preview.summaryTr, action: preview.action }, error: '' });
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
      if (!preview || !current(preview.key)) { clear('Öneri artık güncel değil. Yeni bir öneri alın.'); return null; }
      const draft = existingText.trim() ? `${existingText}\n\n${preview.reply}` : preview.reply;
      if (draft.length > 2000) { emit({ busy: false, preview: { reply: preview.reply, summaryTr: preview.summaryTr, action: preview.action }, error: 'Mevcut mesaj ve öneri 2000 karakteri aşıyor. Önce mesajı kısaltın.' }); return null; }
      clear();
      return draft;
    },
  };
}
