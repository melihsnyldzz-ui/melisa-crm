import { chatwootApiRequest } from './chatwootApiService.js';

const allowedStages = new Set(['Yeni', 'Gorusuluyor', 'Teklif', 'Teslimat', 'Kazanildi']);
const allowedStatuses = new Set(['open', 'pending', 'resolved']);

function workflowError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function conversationId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw workflowError('WHATSAPP_CRM_CHATWOOT_CONVERSATION_INVALID', 'Chatwoot konusma kimligi gecersiz.');
  }
  return id;
}

function actorSnapshot(actor = {}) {
  return {
    id: actor.id || null,
    username: actor.username || '',
    displayName: actor.displayName || actor.username || 'Kullanici',
  };
}

async function createPrivateWorkflowEntry({ id, type, data, actor, content }) {
  const payload = {
    type,
    data,
    actor: actorSnapshot(actor),
    createdAt: new Date().toISOString(),
  };
  const response = await chatwootApiRequest(`/conversations/${conversationId(id)}/messages`, {
    method: 'POST',
    body: {
      content,
      message_type: 'outgoing',
      private: true,
      content_type: 'text',
      content_attributes: { melisa_crm: payload },
    },
  });
  return { id: response?.id || null, ...data, ...payload };
}

export async function updateChatwootConversationStage({ conversationId: id, stage, actor }) {
  const normalized = String(stage || '').trim();
  if (!allowedStages.has(normalized)) {
    throw workflowError('WHATSAPP_CRM_STAGE_INVALID', 'CRM asamasi gecersiz.');
  }
  await chatwootApiRequest(`/conversations/${conversationId(id)}/custom_attributes`, {
    method: 'POST',
    body: { custom_attributes: { melisa_stage: normalized } },
  });
  return { conversationId: Number(id), stage: normalized, actor: actorSnapshot(actor), source: 'chatwoot' };
}

export async function updateChatwootConversationStatus({ conversationId: id, status }) {
  const normalized = String(status || '').trim();
  if (!allowedStatuses.has(normalized)) {
    throw workflowError('WHATSAPP_CRM_STATUS_INVALID', 'Konusma durumu gecersiz.');
  }
  await chatwootApiRequest(`/conversations/${conversationId(id)}/toggle_status`, {
    method: 'POST',
    body: { status: normalized },
  });
  return { conversationId: Number(id), status: normalized, source: 'chatwoot' };
}

export async function markChatwootConversationRead({ conversationId: id }) {
  await chatwootApiRequest(`/conversations/${conversationId(id)}/update_last_seen`, { method: 'POST' });
  return { conversationId: Number(id), unread: 0, source: 'chatwoot' };
}

export async function addChatwootConversationNote({ conversationId: id, note, actor }) {
  const value = String(note || '').trim();
  if (!value) throw workflowError('WHATSAPP_CRM_NOTE_REQUIRED', 'Not metni zorunludur.');
  return createPrivateWorkflowEntry({ id, type: 'note', data: { note: value }, actor, content: `CRM notu: ${value}` });
}

export async function addChatwootConversationTask({ conversationId: id, title, dueAt, actor }) {
  const value = String(title || '').trim();
  const date = new Date(dueAt);
  if (!value) throw workflowError('WHATSAPP_CRM_TASK_TITLE_REQUIRED', 'Gorev basligi zorunludur.');
  if (Number.isNaN(date.getTime())) throw workflowError('WHATSAPP_CRM_TASK_DUE_AT_INVALID', 'Gorev tarihi gecersizdir.');
  const data = { title: value, dueAt: date.toISOString(), status: 'open', owner: actorSnapshot(actor).displayName };
  return createPrivateWorkflowEntry({ id, type: 'task', data, actor, content: `CRM görevi: ${value} · ${date.toLocaleString('tr-TR')}` });
}

export async function addChatwootProductInterest({ conversationId: id, product, actor }) {
  const snapshot = {
    id: Number(product?.id),
    stockCode: String(product?.stockCode || '').trim(),
    productName: String(product?.productName || '').trim(),
    barcode: String(product?.barcodeMasked || product?.barcode || '').trim(),
    brand: String(product?.brand || '').trim(),
    currency: String(product?.currency || 'TRY').trim().toUpperCase(),
    salePrice: Number(product?.salePrice || 0),
    stockQuantity: Number(product?.stockQuantity || 0),
  };
  if (!snapshot.id || !snapshot.stockCode || !snapshot.productName) {
    throw workflowError('WHATSAPP_CRM_PRODUCT_INVALID', 'ERP urun bilgisi gecersizdir.');
  }
  const entry = await createPrivateWorkflowEntry({ id, type: 'product', data: { product: snapshot }, actor, content: `CRM ürün ilgisi: ${snapshot.stockCode} · ${snapshot.productName}` });
  return { ...snapshot, eventId: entry.id, createdAt: entry.createdAt, source: 'chatwoot' };
}

export async function createChatwootConversationQuote({ conversationId: id, contact, lines, actor }) {
  const safeLines = Array.isArray(lines) ? lines.map((line) => ({
    productId: Number(line?.id || line?.productId),
    stockCode: String(line?.stockCode || '').trim(),
    productName: String(line?.productName || '').trim(),
    quantity: Math.max(1, Number(line?.quantity || 1)),
    unitPrice: Number(line?.salePrice ?? line?.unitPrice ?? 0),
    currency: String(line?.currency || '').trim().toUpperCase(),
  })) : [];
  const contactSnapshot = {
    name: String(contact?.name || contact?.contactName || '').trim(),
    phone: String(contact?.phone || '').trim(),
    country: String(contact?.country || '').trim(),
  };
  if (!contactSnapshot.name || safeLines.length === 0) {
    throw workflowError('WHATSAPP_CRM_QUOTE_INVALID', 'CRM teklifi icin kisi ve en az bir ERP urunu gerekir.');
  }
  if (safeLines.some((line) => !line.productId || !line.stockCode || !line.productName || !line.currency || line.unitPrice < 0)) {
    throw workflowError('WHATSAPP_CRM_QUOTE_LINE_INVALID', 'Teklif satiri gecersizdir.');
  }
  if (new Set(safeLines.map((line) => line.currency)).size !== 1) {
    throw workflowError('WHATSAPP_CRM_QUOTE_CURRENCY_MIXED', 'Teklif satirlari ayni para biriminde olmalidir.');
  }
  const quote = {
    quoteNo: `CRM-TKL-${Date.now()}`,
    contact: contactSnapshot,
    currency: safeLines[0].currency,
    total: safeLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    status: 'draft',
    lines: safeLines,
  };
  const entry = await createPrivateWorkflowEntry({ id, type: 'quote', data: { quote }, actor, content: `CRM teklif taslağı: ${quote.quoteNo} · ${quote.total} ${quote.currency}` });
  return { id: entry.id, ...quote, createdAt: entry.createdAt, source: 'chatwoot' };
}

export async function addChatwootConversationTag({ conversationId: id, tag }) {
  const value = String(tag || '').trim();
  if (!value) throw workflowError('WHATSAPP_CRM_TAG_REQUIRED', 'Etiket zorunludur.');
  const numericId = conversationId(id);
  const current = await chatwootApiRequest(`/conversations/${numericId}/labels`);
  const labels = Array.isArray(current?.payload) ? current.payload : [];
  const next = [...new Set([...labels, value])];
  await chatwootApiRequest(`/conversations/${numericId}/labels`, { method: 'POST', body: { labels: next } });
  return { conversationId: numericId, tag: value, tags: next, source: 'chatwoot' };
}
