import { existingQuery, existingId } from './catalog/existingStock.js';
import { normalizeAccountIdentity } from "./accountIdentity.js";
import { resolveContactIdentity } from "./contactIdentity.js";
import { validateSendPayload, validateFileSignature } from "./outboundMedia.js";
import { createRequestControl } from "./requestControl.js";

const STORAGE_KEY = "melisa-crm-access-token";
const API_ROOT = "/api/live";
const requestControl = createRequestControl();

export function savedAccessKey() { try { return window.sessionStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; } }
export function saveAccessKey(value) { try { value ? window.sessionStorage.setItem(STORAGE_KEY, value) : window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* The active session still works in memory when storage is unavailable. */ } }

function dataOf(payload) { return payload?.data ?? payload ?? {}; }

function errorMessage(payload, status) {
  return payload?.error?.message || payload?.error || payload?.message || `HTTP ${status}`;
}

async function request(path, accessToken = "", options = {}) {
  const { timeoutMs = 20000, preserveEnvelope = false, preserveAuthDenial = false, signal: callerSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  callerSignal?.addEventListener("abort", cancel, { once: true });
  if (callerSignal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
  response = await requestControl.run(`${accessToken}:${path}`, () => fetch(`${API_ROOT}${path}`, {
    cache: "no-store",
    signal: controller.signal,
    ...fetchOptions,
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  }), (fetchOptions.method || "GET") === "GET" && !callerSignal);
  let payload;
  try { payload = await response.json(); }
  catch (error) {
    if (controller.signal.aborted || callerSignal?.aborted) throw error;
    if (response.ok) {
      const invalid = new Error("CRM sunucusundan geçerli bir yanıt alınamadı.");
      invalid.code = "CRM_INVALID_RESPONSE";
      throw invalid;
    }
    payload = {};
  }
  if (controller.signal.aborted) throw new DOMException("Request aborted", "AbortError");
  if (!response.ok || payload?.success === false) {
    const error = new Error(errorMessage(payload, response.status));
    error.status = response.status;
    error.code = payload?.error?.code || "";
    throw error;
  }
  return preserveEnvelope ? payload : dataOf(payload);
  } catch (error) {
    if (callerSignal?.aborted) throw new DOMException("CRM session request cancelled", "AbortError");
    if (controller.signal.aborted) {
      const timeout = new Error("CRM sunucusu zamanında yanıt vermedi. Bağlantıyı yeniden deneyebilirsiniz.");
      timeout.code = "CRM_REQUEST_TIMEOUT";
      if (preserveAuthDenial && [401,403].includes(response?.status)) timeout.status = response.status;
      throw timeout;
    }
    throw error;
  } finally { clearTimeout(timer); callerSignal?.removeEventListener("abort", cancel); }
}

function normalizeRole(role) {
  const value = String(role || "").toLocaleLowerCase("tr-TR");
  if (value === "patron" || value === "owner") return { code: "patron", displayName: "Patron" };
  if (value === "mudur" || value === "müdür" || value === "manager") return { code: "mudur", displayName: "Müdür" };
  return { code: "personel", displayName: "Personel" };
}

function enabledFlag(value) {
  return value === true || value === 1 || String(value).toLocaleLowerCase("tr-TR") === "true";
}

export function sessionPermissionSignals(value = {}) {
  const fields = ["liveSendEnabled", "sendEnabled", "sendReady", "liveSendApproved", "canSend", "send", "assignmentEnabled", "canAssign", "assign", "translationEnabled", "providerConnected", "bridgeReady"];
  const containers = [["", value], ...["permissions", "effectivePermissions", "features", "flags", "capabilities"].map((key) => [key, value[key]])];
  return containers.flatMap(([path, object]) => fields.flatMap((key) => {
    const flag = object?.[key];
    if (![true, false, 0, 1, "true", "false", "0", "1"].includes(flag)) return [];
    return [{ name: path ? `${path}.${key}` : key, value: String(flag) }];
  }));
}

export function normalizePermissions(value = {}) {
  const source = value.permissions || value.effectivePermissions || {};
  const includes = (permission) => Array.isArray(source) ? source.includes(permission) : enabledFlag(source[permission] ?? source[permission.replace("crm.", "")]);
  const role = normalizeRole(value.role);
  const canSend = includes("crm.send") || ["patron", "mudur"].includes(role.code);
  const sendFlag = value.liveSendEnabled ?? value.sendEnabled ?? value.features?.liveSendEnabled ?? value.features?.sendEnabled ?? value.flags?.sendEnabled;
  const sendFlagKnown = [true, false, 0, 1, "true", "false", "0", "1"].includes(sendFlag);
  return {
    ...value,
    accountIdentity: normalizeAccountIdentity(value),
    role: role.code,
    displayName: value.displayName || role.displayName,
    canAssign: includes("crm.assign") || ["patron", "mudur"].includes(role.code),
    canSend,
    assignmentEnabled: includes("crm.assign") || ["patron", "mudur"].includes(role.code),
    liveSendEnabled: canSend && enabledFlag(sendFlag),
    liveSendState: !canSend ? "forbidden" : !sendFlagKnown ? "unknown" : enabledFlag(sendFlag) ? "enabled" : "disabled",
    permissionSignals: sessionPermissionSignals(value),
  };
}

function asObject(value) { return value && typeof value === "object" ? value : {}; }

function firstValue(source, keys, fallback = "") {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return fallback;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && value < 10_000_000_000) return new Date(value * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function relativeTime(value) {
  const timestamp = normalizeTimestamp(value);
  if (!timestamp) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return "Şimdi";
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}

function initialsFor(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "MB";
  return `${parts[0][0] || ""}${parts.length > 1 ? parts.at(-1)[0] : ""}`.toLocaleUpperCase("tr-TR");
}

function mediaType(value = {}) {
  const raw = String(firstValue(value, ["type", "fileType", "file_type", "contentType", "content_type", "mimeType", "mime_type"], "")).toLocaleLowerCase("tr-TR");
  if (raw.includes("image")) return "image";
  if (raw.includes("video")) return "video";
  if (raw.includes("audio") || raw.includes("voice")) return "audio";
  if (raw.includes("location")) return "location";
  return "file";
}

function normalizeAttachment(value, index = 0) {
  const row = asObject(value);
  return {
    ...row,
    id: String(firstValue(row, ["id", "sourceId"], `attachment-${index}`)),
    type: mediaType(row),
    url: String(firstValue(row, ["url", "dataUrl", "data_url", "fileUrl", "file_url"], "")),
    thumbnailUrl: String(firstValue(row, ["thumbnailUrl", "thumbnail_url", "thumbUrl", "thumb_url"], "")),
    fileName: String(firstValue(row, ["fileName", "file_name", "filename", "name", "title"], "")),
    mimeType: String(firstValue(row, ["mimeType", "mime_type", "contentType", "content_type"], "")),
    fileSize: Number(firstValue(row, ["fileSize", "file_size", "size"], 0)) || 0,
    width: Number(firstValue(row, ["width"], 0)) || null,
    height: Number(firstValue(row, ["height"], 0)) || null,
  };
}

function attachmentLabel(attachments = []) {
  const types = attachments.map((item) => item.type);
  if (types.includes("image")) return "Fotoğraf";
  if (types.includes("video")) return "Video";
  if (types.includes("audio")) return "Sesli mesaj";
  if (types.includes("location")) return "Konum";
  return attachments.length ? "Dosya" : "Mesaj içeriği görüntülenemiyor";
}

function inlineImagePreview(value) {
  const compact = String(value || "").replace(/\s+/g, "");
  // Chatwoot can return a small JPEG preview in the text field of a media message.
  // Accept raster formats only; never interpret arbitrary message text as a URL.
  if (!compact || compact.length > 8_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return "";
  const mime = compact.startsWith("/9j/") ? "image/jpeg"
    : compact.startsWith("iVBORw0KGgo") ? "image/png"
      : compact.startsWith("R0lGOD") ? "image/gif"
        : compact.startsWith("UklGR") ? "image/webp" : "";
  return mime ? `data:${mime};base64,${compact}` : "";
}

function normalizeMessage(value, index = 0, context = {}) {
  const row = asObject(value);
  const sender = asObject(row.sender);
  const directionSignals = [
    row.messageType, row.message_type, row.direction, row.senderType, row.sender_type,
    sender.type, sender.senderType, sender.sender_type,
  ].filter((signal) => signal !== undefined && signal !== null)
    .map((signal) => String(signal).trim().toLocaleLowerCase("tr-TR"));
  const senderName = String(firstValue(row, ["senderName", "sender_name", "authorName", "author_name"], firstValue(sender, ["name", "displayName", "available_name"], ""))).trim();
  const sameName = (left, right) => left && right && String(left).trim().toLocaleLowerCase("tr-TR") === String(right).trim().toLocaleLowerCase("tr-TR");
  const senderMatchesAgent = sameName(senderName, context.assignedUserName);
  // Source direction takes precedence over names and IDs, which belong to
  // different contact/agent namespaces and are not reliable direction signals.
  const authoritative = [row.messageType, row.message_type]
    .map((signal) => String(signal ?? "").trim().toLowerCase())
    .find((signal) => ["0", "1", "2", "3", "in", "out", "incoming", "outgoing", "activity", "template"].includes(signal));
  const explicit = authoritative || (senderMatchesAgent ? "outgoing" : String(row.direction || "").trim().toLowerCase());
  const direction = ["2", "activity"].includes(explicit) ? "activity"
    : ["0", "in", "incoming"].includes(explicit) ? "incoming"
    : ["1", "3", "out", "outgoing", "template"].includes(explicit) ? "outgoing"
    : row.outgoing === true || row.isOutgoing === true || row.is_outgoing === true
      || directionSignals.some((signal) => ["agent", "user", "agentbot", "agent_bot"].includes(signal)) || senderMatchesAgent ? "outgoing" : "incoming";
  const attachmentRows = Array.isArray(row.attachments) ? row.attachments : Array.isArray(row.media) ? row.media : Array.isArray(row.files) ? row.files : row.attachment ? [row.attachment] : [];
  let attachments = attachmentRows.map(normalizeAttachment);
  const rawText = String(firstValue(row, ["text", "content", "body", "message"], "")).trim();
  const preview = inlineImagePreview(rawText);
  if (preview) {
    attachments = attachments.length
      ? attachments.map((attachment, attachmentIndex) => attachmentIndex === 0
        ? { ...attachment, type: "image", thumbnailUrl: preview } : attachment)
      : [{ id: `inline-image-${index}`, type: "image", url: "", thumbnailUrl: preview, fileName: "Fotoğraf" }];
  }
  const text = preview ? "" : rawText;
  return {
    ...row,
    id: String(firstValue(row, ["id", "sourceId"], `message-${index}`)),
    text,
    previewText: text || attachmentLabel(attachments),
    attachments,
    direction,
    createdAt: normalizeTimestamp(firstValue(row, ["createdAt", "created_at", "timestamp", "sentAt"])),
  };
}

export function conversationRevision(conversation = {}) {
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const loadedAt = Date.parse(messages.at(-1)?.createdAt || "") || 0;
  const activityAt = Date.parse(conversation.lastMessageAt || "") || 0;
  if (activityAt > loadedAt) return [conversation.lastMessageAt, conversation.preview].filter(Boolean).join("|");
  const latestIncoming = [...messages].reverse().find((message) => message.direction === "incoming");
  if (latestIncoming) return [
    latestIncoming.id,
    latestIncoming.createdAt,
    ...(latestIncoming.attachments || []).map((attachment) => attachment.id || attachment.url),
  ].filter(Boolean).map(String).join("|");
  // Inbox-only records may not include messages. Their last activity is the
  // best available fallback until conversation detail is loaded.
  return [conversation.lastMessageAt, conversation.preview].filter(Boolean).map(String).join("|");
}

export function applyReadReceipts(conversations = [], receipts = {}) {
  return conversations.map((conversation) => {
    const receipt = receipts[String(conversation.id)];
    if (!receipt || receipt.revision !== conversationRevision(conversation)) return conversation;
    return conversation.unread ? { ...conversation, unread: 0 } : conversation;
  });
}

export function effectiveInboxSummary(summary = {}, conversations = []) {
  const unread = conversations.reduce((total, conversation) => total + (Number(conversation.unread) || 0), 0);
  const pendingHumanReply = conversations.filter((conversation) => conversation.waitingForReply === true || (conversation.waitingForReply === undefined && Number(conversation.unread) > 0)).length;
  return { ...summary, unread, pendingHumanReply };
}

export function normalizeConversation(value, index = 0) {
  const row = asObject(value);
  const contact = asObject(row.contact || row.sender || row.meta?.sender);
  const assignee = asObject(row.assignee || row.meta?.assignee);
  const name = String(firstValue(row, ["name", "displayName", "contactName"], firstValue(contact, ["name", "displayName"], "İsimsiz müşteri")));
  const assignedUserName = String(firstValue(row, ["assignedUserName", "assigneeName", "owner"], firstValue(assignee, ["name"], "")));
  const contactId = firstValue(row, ["contactId", "contact_id"], firstValue(contact, ["id"], null));
  const messages = Array.isArray(row.messages)
    ? row.messages.map((message, messageIndex) => normalizeMessage(message, messageIndex, { contactName: name, contactId, assignedUserName })).sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return leftTime - rightTime;
    })
    : [];
  const latestMessage = asObject(row.lastMessage || row.last_message || messages.at(-1));
  const identity = resolveContactIdentity(row);
  const assignedUserId = firstValue(row, ["assignedUserId", "assigneeId"], firstValue(assignee, ["id"], null));
  const lastMessageAt = firstValue(row, ["lastMessageAt", "updatedAt", "updated_at"], firstValue(latestMessage, ["createdAt", "created_at", "timestamp"], ""));
  const unread = Number(firstValue(row, ["unread", "unreadCount", "unread_count"], 0)) || 0;
  const preview = String(firstValue(row, ["preview", "lastMessageText", "last_message_text"], firstValue(latestMessage, ["previewText", "text", "content", "body", "message"], attachmentLabel(latestMessage.attachments || []))));
  const channelRaw = String(firstValue(row, ["channel", "channelType", "channel_type"], "whatsapp")).toLocaleLowerCase("tr-TR");
  const channel = channelRaw.includes("instagram") ? "instagram" : channelRaw.includes("email") ? "email" : "whatsapp";
  const latestDirection = normalizeMessage(latestMessage, 0, { contactName: name, contactId, assignedUserName }).direction;
  const hasLatest = Object.keys(latestMessage).length > 0;
  return {
    ...row,
    id: String(firstValue(row, ["id", "conversationId", "sourceId"], `conversation-${index}`)),
    isLive: true,
    name,
    displayName: name,
    initials: initialsFor(name),
    ...identity,
    email: String(firstValue(row, ["email"], firstValue(contact, ["email"], ""))),
    assignedUserId,
    assignedUserName: assignedUserName || null,
    owner: assignedUserName || "Atanmamış",
    code: identity.phoneCountryCode || "—",
    country: identity.phoneCountry || (identity.phoneCountryStatus === "nonGeographic" ? "Uluslararası numara" : identity.phone ? "Ülke kesinleşmedi" : "Ülke bilgisi yok"),
    language: String(firstValue(row, ["language", "languageName", "language_name"], "Belirtilmedi")),
    wait: relativeTime(lastMessageAt),
    lastMessageAt: normalizeTimestamp(lastMessageAt),
    unread,
    waitingForReply: typeof row.pendingHumanReply === "boolean" ? row.pendingHumanReply
      : typeof row.waitingForReply === "boolean" ? row.waitingForReply
        : hasLatest ? latestDirection === "incoming" : null,
    preview,
    foreign: preview,
    translation: "",
    channel,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    messages,
  };
}

export function normalizeInboxPayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload.conversations || payload.items || payload.payload || [];
  const conversations = rows.map(normalizeConversation);
  const source = payload.summary || payload.counts || {};
  const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const summary = {
    total: numberOr(source.total ?? payload.total, conversations.length),
    unread: numberOr(source.unread ?? payload.unread, conversations.reduce((sum, item) => sum + item.unread, 0)),
    unassigned: numberOr(source.unassigned ?? payload.unassigned, conversations.filter((item) => item.owner === "Atanmamış").length),
    pendingHumanReply: numberOr(source.pendingHumanReply ?? source.waiting ?? payload.pendingHumanReply ?? payload.waiting, conversations.filter((item) => item.unread > 0).length),
  };
  return { conversations, summary };
}

export function mergeInboxConversations(currentRows, incomingRows, selectedId = "", detailConversation = null, preserveMissing = false) {
  const currentById = new Map((currentRows || []).map((item) => [String(item.id), item]));
  const merged = (incomingRows || []).map((item) => {
    if (String(item.id) === String(selectedId) && detailConversation) return { ...item, ...detailConversation };
    const existing = currentById.get(String(item.id));
    const incomingHasMessages = Array.isArray(item.messages) && item.messages.length > 0;
    if (String(item.id) === String(selectedId) && existing?.messages?.length && incomingHasMessages) {
      const history = new Map(existing.messages.map((message) => [String(message.id), message]));
      item.messages.forEach((message) => history.set(String(message.id), message));
      return { ...item, messages: [...history.values()].sort((a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)) };
    }
    if (!incomingHasMessages && Array.isArray(existing?.messages) && existing.messages.length > 0) {
      return { ...item, messages: existing.messages };
    }
    return item;
  });
  if (!preserveMissing) return merged;
  const seen = new Set(merged.map((item) => String(item.id)));
  return [...merged, ...(currentRows || []).filter((item) => !seen.has(String(item.id))).map((item) =>
    String(item.id) === String(selectedId) && detailConversation ? { ...item, ...detailConversation } : item
  )];
}

export function sortInboxByActivity(rows) {
  return [...(rows || [])].sort((left, right) => {
    const leftAt = Date.parse(left.lastMessageAt || "") || 0;
    const rightAt = Date.parse(right.lastMessageAt || "") || 0;
    return rightAt - leftAt;
  });
}

export function normalizeTranslationResponse(payload) {
  const row = asObject(payload);
  return {
    detectedLanguage: String(firstValue(row, ["detectedLanguage", "detected_language"], "")),
    targetLanguage: String(firstValue(row, ["targetLanguage", "target_language"], "")),
    translatedText: String(firstValue(row, ["translatedText", "translated_text", "translation"], "")),
    backTranslation: String(firstValue(row, ["backTranslation", "back_translation"], "")),
    model: String(firstValue(row, ["model"], "")),
    confidence: firstValue(row, ["confidence"], null),
    warning: String(firstValue(row, ["warning"], "")),
  };
}

function validateTurkishTranslation(result, original) {
  if (!/^(tr|turkish|türkçe|turkce)$/i.test(result.targetLanguage.trim()) || (result.detectedLanguage && !/^(tr|turkish|türkçe|turkce)$/i.test(result.detectedLanguage.trim()) && result.translatedText.trim() === original.trim())) {
    throw new Error("Türkçe çeviri doğrulanamadı. Orijinal mesaj korundu.");
  }
  return result;
}

export const MAX_CATALOG_PHOTO_BYTES = 3 * 1024 * 1024;
export function normalizeCatalogFilters({search='',brand='',category=''}={},authMode='erp') {
  if(authMode!=='crm')return {search:String(search).slice(0,200)};
  const filters={};
  for(const [name,value] of Object.entries({search,brand,category})) {
    if(typeof value!=='string')throw Object.assign(new Error('Katalog filtresi metin olmalı.'),{status:400,code:'INVALID_QUERY'});
    const normalized=value.trim();
    if(normalized.length>120)throw Object.assign(new Error('Katalog filtresi en fazla 120 karakter olabilir.'),{status:400,code:'INVALID_QUERY'});
    if(normalized)filters[name]=normalized;
  }
  return filters;
}
function catalogId(value) {
  const id = String(value ?? "");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw Object.assign(new Error("Ürün kimliği doğrulanamadı."), { code: "CATALOG_INVALID_ID" });
  return encodeURIComponent(id);
}
function catalogEnvelope(payload, list) {
  if (payload?.success !== true || !payload.meta || typeof payload.meta !== "object" || Array.isArray(payload.meta) || (list ? !Array.isArray(payload.data) : !payload.data || typeof payload.data !== "object" || Array.isArray(payload.data))) throw Object.assign(new Error("ERP katalog yanıtı doğrulanamadı."), { code: "CATALOG_CONTRACT_INVALID" });
  // Preserve meta without guessing its meaning; the source adapter validates it separately.
  return payload;
}
async function catalogPhoto(accessToken, id, { signal: callerSignal } = {}) {
  if (!accessToken) throw Object.assign(new Error("CRM oturumu gerekli."), { status: 401 });
  const path = `/crm/catalog/products/${catalogId(id)}/photo`,controller = new AbortController();
  const cancel = () => controller.abort();
  callerSignal?.addEventListener("abort", cancel, {once:true});
  if (callerSignal?.aborted) controller.abort();
  let timedOut=false,response;
  const timer = setTimeout(() => { timedOut=true;controller.abort(); }, 20000);
  try {
    response = await requestControl.run(`${accessToken}:${path}`, () => fetch(`${API_ROOT}${path}`, { cache: "no-store", redirect: "error", signal: controller.signal, headers: { Accept: "image/jpeg,image/png,image/webp", Authorization: `Bearer ${accessToken}` } }), false);
    if (!response.ok) { const payload=await response.json().catch(()=>({})); throw Object.assign(new Error(errorMessage(payload,response.status)),{status:response.status,code:payload?.error?.code||""}); }
    const type=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg","image/png","image/webp"].includes(type)) throw Object.assign(new Error("Ürün fotoğrafının dosya türü doğrulanamadı."), { status: 415 });
    if (Number(response.headers.get("content-length")) > MAX_CATALOG_PHOTO_BYTES) throw Object.assign(new Error("Ürün fotoğrafı güvenli okuma sınırını aşıyor."), { status: 413 });
    const reader=response.body?.getReader();if(!reader)throw new Error("Ürün fotoğrafı boş döndü.");
    const chunks=[];let size=0;
    try { while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_CATALOG_PHOTO_BYTES)throw Object.assign(new Error("Ürün fotoğrafı güvenli okuma sınırını aşıyor."),{status:413});chunks.push(chunk.value);} }
    catch(error){void reader.cancel().catch(()=>{});throw error;}
    if(!size)throw new Error("Ürün fotoğrafı boş döndü.");
    const blob=new Blob(chunks,{type});validateFileSignature(new Uint8Array(await blob.slice(0,16).arrayBuffer()),type);return blob;
  } catch(error) { if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{});controller.abort();if(callerSignal?.aborted)throw new DOMException("Catalog photo cancelled", "AbortError");if(timedOut)throw Object.assign(new Error("Ürün fotoğrafı zamanında alınamadı."),{code:"CRM_REQUEST_TIMEOUT",...([401,403].includes(response?.status)?{status:response.status}:{})});throw error; }
  finally {clearTimeout(timer);callerSignal?.removeEventListener("abort",cancel);}
}

export const liveApi = {
  erpDrafts: token => request('/crm/erp/drafts',token),
  erpLogin: (token,credentials) => request('/crm/erp/login',token,{method:'POST',body:JSON.stringify(credentials)}),
  erpCustomers: (token,erpToken,search) => request(`/crm/erp/customers?search=${encodeURIComponent(search)}`,token,{headers:{'x-erp-token':erpToken}}),
  erpDraft: (token,erpToken,draft) => request('/crm/erp/drafts',token,{method:'POST',headers:{'x-erp-token':erpToken},body:JSON.stringify(draft),timeoutMs:45000}),
  async existingCatalogProducts(token, query={}, {signal}={}) {
    if(!token) throw Object.assign(new Error('CRM oturumu gerekli.'),{status:401});
    const q=existingQuery(query), params=new URLSearchParams({...q,page:String(q.page),limit:String(q.limit),hasImage:'true'});
    return request(`/crm/catalog/products?${params}`,token,{preserveEnvelope:true,preserveAuthDenial:true,redirect:'error',signal});
  },
  existingCatalogPhoto(token,id,options={}) {
    if(!existingId(id))throw Object.assign(new Error('Ürün kimliği doğrulanamadı.'),{code:'CATALOG_CONTRACT_INVALID'});
    return catalogPhoto(token,id,options);
  },
  async catalogSignIn(token, { username, password }, {signal} = {}) {
    if (!token) throw Object.assign(new Error("CRM oturumu gerekli."), {status:401});
    if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) throw new Error("ERP kullanıcı adı ve şifre gerekli.");
    const result = await request("/crm/catalog/auth/sign-in", token, {method:"POST",body:JSON.stringify({username:username.trim(),password}),signal,redirect:"error",preserveEnvelope:true});
    const data = result?.data, expiresAt = typeof data?.expiresAt === "string" ? Date.parse(data.expiresAt) : NaN;
    if(result?.success !== true || data?.connected !== true || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || !Array.isArray(data?.permissions) || !data.permissions.includes("product.view")) throw Object.assign(new Error("ERP giriş yanıtı doğrulanamadı."), {code:"CATALOG_AUTH_RESPONSE_INVALID"});
    // Only this bounded deadline crosses into UI state; never return raw auth data.
    return {expiresAt};
  },
  async catalogSignOut(token, {signal} = {}) {
    if (!token) throw Object.assign(new Error("CRM oturumu gerekli."), {status:401});
    const result = await request("/crm/catalog/auth/sign-out", token, {method:"POST",body:JSON.stringify({}),timeoutMs:3000,signal,redirect:"error",preserveEnvelope:true});
    if(result?.success !== true || result?.data?.connected !== false) throw Object.assign(new Error("ERP çıkışı doğrulanamadı."), {code:"CATALOG_AUTH_RESPONSE_INVALID"});
    return {connected:false};
  },
  async catalogProducts(token, { search = "", brand = "", category = "", page = 1, limit = 100, signal, authMode = "erp" } = {}) {
    if(!token)throw Object.assign(new Error("CRM oturumu gerekli."),{status:401});
    if(!(authMode==='crm'?Number.isSafeInteger(page):Number.isInteger(page))||page<1||!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(new Error("Katalog sayfa aralığı geçersiz."),{status:400,code:'INVALID_QUERY'});
    const query=new URLSearchParams({...normalizeCatalogFilters({search,brand,category},authMode),page:String(page),limit:String(limit)});
    return catalogEnvelope(await request(`/crm/catalog/products?${query}`,token,{preserveEnvelope:true,preserveAuthDenial:true,redirect:"error",signal}),true);
  },
  async catalogProduct(token,id) {
    if(!token)throw Object.assign(new Error("CRM oturumu gerekli."),{status:401});
    return catalogEnvelope(await request(`/crm/catalog/products/${catalogId(id)}`,token,{preserveEnvelope:true,preserveAuthDenial:true,redirect:"error"}),false);
  },
  catalogPhoto,

  async health() {
    const result = await request("/health");
    return {
      providerConnected: enabledFlag(result.providerConnected),
      sendReady: enabledFlag(result.sendReady),
      sendEnabled: enabledFlag(result.sendEnabled),
      translationEnabled: enabledFlag(result.translationEnabled),
      checkedAt: result.checkedAt || "",
    };
  },
  async login(username, password, { signal } = {}) {
    const result = await request("/auth/login", "", { method: "POST", body: JSON.stringify({ username, password }), signal });
    const accessToken = result.accessToken || result.access_token || result.token;
    if (!accessToken) throw new Error("CRM giriş yanıtında erişim tokeni bulunamadı.");
    return { accessToken, expiresIn: result.expiresIn, user: result.user || null };
  },
  async session(token, options = {}) { return normalizePermissions(await request("/auth/me", token, options)); },
  // Chatwoot-backed inbox pages can take over 20 seconds; retain a bounded read
  // budget without extending sends or preventing session cancellation.
  async inbox(token, offset = 0, options = {}) { return normalizeInboxPayload(await request(`/crm/inbox?limit=100&offset=${Math.max(0, Number(offset) || 0)}`, token, { timeoutMs: 45000, ...options })); },
  async conversation(token, id) {
    const result = await request(`/crm/conversations/${id}`, token);
    return { conversation: normalizeConversation(result.conversation || result) };
  },
  async agents(token, options = {}) {
    const result = await request("/crm/agents", token, options);
    const rows = result.agents || result.items || (Array.isArray(result) ? result : []);
    return { agents: rows.map((item, index) => ({ ...item, id: item.id ?? item.agentId ?? index, name: item.name || item.displayName || `Temsilci ${index + 1}` })) };
  },
  async send(token, id, text, clientRequestId, media = null) {
    const payload = { text, media, clientRequestId };
    validateSendPayload(payload);
    const result = await request(`/crm/conversations/${id}/messages`, token, { method: "POST", body: JSON.stringify(payload) });
    return { ...result, message: result.message ? normalizeMessage({ ...result.message, direction: "outgoing" }) : null };
  },
  assign: (token, id, agentId) => request(`/crm/conversations/${id}/assign`, token, { method: "POST", body: JSON.stringify({ agentId }) }),
  async translate(token, id, { mode, text, targetLanguage }) {
    const body = { mode, text };
    if (mode === "incoming_to_tr") targetLanguage = "tr";
    if (targetLanguage && targetLanguage !== "auto") body.targetLanguage = targetLanguage;
    const result = normalizeTranslationResponse(await request(`/crm/conversations/${id}/translate`, token, { method: "POST", body: JSON.stringify(body), timeoutMs: 45000 }));
    if (!result.translatedText.trim()) throw new Error("Çeviri servisi boş yanıt verdi.");
    if (mode === "incoming_to_tr") validateTurkishTranslation(result, text);
    // A live test returned the English output as its own Turkish back-translation.
    // Obtain an explicit Turkish translation instead of displaying that echo.
    const comparable = (value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
    if (mode === "outgoing_from_tr" && (!result.backTranslation.trim() || comparable(result.backTranslation) === comparable(result.translatedText))) {
      const back = normalizeTranslationResponse(await request(`/crm/conversations/${id}/translate`, token, {
        method: "POST", timeoutMs: 45000,
        body: JSON.stringify({ mode: "incoming_to_tr", text: result.translatedText, targetLanguage: "tr" }),
      }));
      if (!back.translatedText.trim()) throw new Error("Türkçe geri çeviri alınamadı. Taslağınız korunuyor.");
      result.backTranslation = validateTurkishTranslation(back, result.translatedText).translatedText;
    }
    return result;
  },
};
