import { env } from '../config/env.js';
import { resolvePhoneIdentity } from '../utils/phoneIdentity.js';
import { chatwootApiRequest } from './chatwootApiService.js';
import { assertConversationAccess } from './crmAuthService.js';
import { waapiSendReady, refreshWaapiReadiness } from './waapiReadiness.js';
import { WAAPI_RECIPIENT } from '../providers/waapiProvider.js';
import { enrichWaapiReceipt } from './waapiReceiptService.js';

const CHATWOOT_PAGE_SIZE = 25;
const CHATWOOT_MAX_OVERVIEW_LIMIT = CHATWOOT_PAGE_SIZE * 20;

function isChatwootSendEnabled() {
  if (env.whatsapp.provider === 'waapi') return waapiSendReady();
  if (!['chatwoot', 'evolution'].includes(env.whatsapp.provider) || !env.whatsapp.sendEnabled) return false;

  const providerConfigured = env.whatsapp.provider === 'chatwoot'
    ? Boolean(env.chatwoot.baseUrl && env.chatwoot.accountId && env.chatwoot.apiAccessToken)
    : Boolean(env.evolution.apiUrl && env.evolution.apiKey && env.evolution.instance);
  if (!providerConfigured) return false;

  return env.whatsapp.testNumberOnly
    ? env.whatsapp.allowedTestNumbers.length > 0
    : env.whatsapp.liveSendApproved;
}

function toIsoDate(value) {
  if (!value) return null;
  const numericValue = Number(value);
  const date = Number.isFinite(numericValue) ? new Date(numericValue * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function messageType(message) {
  const attachment = message?.attachments?.[0];
  if (attachment?.file_type === 'image') return 'image';
  if (attachment?.file_type === 'video') return 'video';
  if (attachment?.file_type === 'audio') return 'audio';
  if (attachment) return 'file';
  return 'text';
}

function normalizedToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeChatwootMessageType(message = {}) {
  const value = normalizedToken(message.message_type ?? message.messageType);
  if (value === '0' || value === 'incoming') return 'incoming';
  if (value === '1' || value === 'outgoing') return 'outgoing';
  if (value === '2' || value === 'activity') return 'activity';
  if (value === '3' || value === 'template') return 'template';
  return 'unknown';
}

export function normalizeChatwootSenderType(message = {}) {
  const value = message.sender_type ?? message.senderType ?? message.sender?.type ?? '';
  return String(value).trim();
}

function explicitOutgoingFlag(message = {}) {
  const value = message.outgoing ?? message.isOutgoing ?? message.is_outgoing;
  if (typeof value === 'boolean') return value;
  if (value === 1 || normalizedToken(value) === 'true') return true;
  if (value === 0 || normalizedToken(value) === 'false') return false;
  return null;
}

export function normalizeChatwootMessageDirection(message = {}) {
  const type = normalizeChatwootMessageType(message);
  if (type === 'incoming') return 'incoming';
  if (type === 'outgoing' || type === 'template') return 'outgoing';
  if (type === 'activity') return null;

  const senderType = normalizedToken(normalizeChatwootSenderType(message)).replace(/[ _-]/g, '');
  if (senderType === 'user' || senderType === 'agent' || senderType === 'agentbot') return 'outgoing';
  if (senderType === 'contact') return 'incoming';

  const outgoing = explicitOutgoingFlag(message);
  if (outgoing !== null) return outgoing ? 'outgoing' : 'incoming';

  return 'incoming';
}

function mapAttachment(attachment = {}) {
  return {
    id: attachment.id ?? null,
    file_type: attachment.file_type || 'file',
    content_type: attachment.content_type || '',
    data_url: attachment.data_url || '',
    thumb_url: attachment.thumb_url || '',
    file_name: attachment.file_name || attachment.fallback_title || '',
    file_size: attachment.file_size ?? null,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    extension: attachment.extension || '',
  };
}

export function mapChatwootMessage(message) {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments.map(mapAttachment)
    : [];
  const attachment = attachments[0] || {};
  const createdAt = toIsoDate(message.created_at ?? message.createdAt);
  return {
    id: message.id,
    direction: normalizeChatwootMessageDirection(message),
    messageType: normalizeChatwootMessageType(message),
    senderType: normalizeChatwootSenderType(message),
    createdAt,
    type: messageType(message),
    text: message.content || '',
    imageUrl: attachment.file_type === 'image' ? (attachment.data_url || attachment.thumb_url || '') : '',
    mediaUrl: attachment.data_url || '',
    thumbnailUrl: attachment.thumb_url || '',
    mimeType: attachment.content_type || '',
    fileName: attachment.file_name || '',
    fileSize: attachment.file_size ?? '',
    attachments,
    time: createdAt
      ? new Date(createdAt).toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul',
      })
      : '',
    status: message.content_attributes?.provider === 'waapi' ? 'accepted' : (message.status || 'sent'),
    received_at: createdAt,
  };
}

async function readMessages(conversation) {
  const response = await chatwootApiRequest(`/conversations/${conversation.id}/messages`);
  const rows = response?.payload || [];
  const workflow = rows
    .filter((message) => message.private && message.content_attributes?.melisa_crm)
    .map((message) => ({ id: message.id, ...message.content_attributes.melisa_crm }));
  return {
    messages: await Promise.all(rows
      .filter((message) => !message.private && normalizeChatwootMessageType(message) !== 'activity')
      .slice(-20)
      .map(row => enrichWaapiReceipt(mapChatwootMessage(row), row))),
    workflow,
  };
}

function workflowModel(entries = []) {
  const notes = entries.filter((item) => item.type === 'note').map((item) => item.data?.note).filter(Boolean);
  return {
    notes: notes.join('\n'),
    tasks: entries.filter((item) => item.type === 'task').map((item) => ({ id: item.id, ...item.data })),
    productInterests: entries.filter((item) => item.type === 'product').map((item) => ({ eventId: item.id, ...item.data?.product })),
    quotes: entries.filter((item) => item.type === 'quote').map((item) => ({ id: item.id, ...item.data?.quote, createdAt: item.createdAt })),
  };
}

function isGroupConversation(conversation) {
  const sender = conversation?.meta?.sender || {};
  return String(sender.identifier || '').toLowerCase().endsWith('@g.us')
    || String(sender.name || '').toLocaleUpperCase('tr-TR').includes('(GROUP)');
}

async function readAllConversationPages() {
  const conversations = [];
  let page = 1;
  let reportedTotal = 0;

  while (page <= 20) {
    const response = await chatwootApiRequest(`/conversations?status=all&page=${page}`);
    const rows = response?.data?.payload || [];
    reportedTotal = Number(response?.data?.meta?.all_count || reportedTotal || rows.length);
    conversations.push(...rows);

    if (rows.length < CHATWOOT_PAGE_SIZE || conversations.length >= reportedTotal) break;
    page += 1;
  }

  return conversations;
}

function crmUserIdForAgent(agentId) {
  const crmUser = env.auth.users.find((user) => Number(user?.chatwootAgentId) === Number(agentId));
  if (crmUser?.id) return String(crmUser.id);

  const entry = [...env.chatwoot.agentPersonnelMap.entries()]
    .find(([, mappedAgentId]) => Number(mappedAgentId) === Number(agentId));
  return entry?.[0] || null;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function mapConversation(conversation, messageData, { canSend, canAssign }) {
  const sender = conversation.meta?.sender || {};
  const assignee = conversation.meta?.assignee || null;
  const phone = sender.phone_number || '';
  const messages = messageData.messages || [];
  const workflow = workflowModel(messageData.workflow || []);

  return {
    id: conversation.id,
    sourceId: conversation.id,
    source: 'chatwoot',
    status: conversation.status || 'open',
    assignedUserId: crmUserIdForAgent(assignee?.id),
    assignedUserName: assignee?.available_name || assignee?.name || '',
    chatwootAgentId: assignee?.id || null,
    teamName: conversation.meta?.team?.name || '',
    stage: conversation.custom_attributes?.melisa_stage || 'Yeni',
    contactName: sender.name || phone || sender.identifier || `Chatwoot ${conversation.id}`,
    displayName: sender.name || null,
    profilePictureUrl: sender.thumbnail || '',
    phone,
    phoneIdentity: resolvePhoneIdentity(phone),
    tags: conversation.labels || [],
    notes: workflow.notes,
    tasks: workflow.tasks,
    productInterests: workflow.productInterests,
    quotes: workflow.quotes,
    provider: 'chatwoot',
    instanceKey: `chatwoot-inbox-${conversation.inbox_id}`,
    remoteJid: sender.identifier || '',
    unread: Number(conversation.unread_count || 0),
    lastMessageAt: toIsoDate(conversation.last_activity_at || conversation.timestamp || conversation.updated_at),
    messages,
    capabilities: {
      read: true,
      send: canSend && (env.whatsapp.provider !== 'waapi' || phone.replace(/\D/g, '') === WAAPI_RECIPIENT),
      assign: canAssign,
      updateStatus: false,
      localWorkflow: false,
    },
  };
}

export async function listChatwootInboxOverview({ limit = 25, offset = 0, user = null } = {}) {
  await refreshWaapiReadiness();
  const sendEnabled = isChatwootSendEnabled();
  const canSend = sendEnabled && (!user || user.permissions?.includes('crm.send'));
  const canAssign = (!user || user.permissions?.includes('crm.assign'));
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const safeLimit = Math.min(Math.max(Number(limit) || CHATWOOT_PAGE_SIZE, 1), CHATWOOT_MAX_OVERVIEW_LIMIT);
  const allRows = await readAllConversationPages();
  const inboxRows = env.chatwoot.inboxId
    ? allRows.filter((conversation) => Number(conversation.inbox_id) === Number(env.chatwoot.inboxId))
    : allRows;
  const visibleRows = env.chatwoot.includeGroups
    ? inboxRows
    : inboxRows.filter((conversation) => !isGroupConversation(conversation));
  const accessibleRows = user?.role === 'personel'
    ? visibleRows.filter((conversation) => Number(conversation.meta?.assignee?.id) === Number(user.chatwootAgentId))
    : visibleRows;
  const rows = accessibleRows.slice(safeOffset, safeOffset + safeLimit);
  const messagesByConversation = await mapWithConcurrency(rows, 5, readMessages);
  const total = accessibleRows.length;

  const conversations = rows.map((conversation, rowIndex) => mapConversation(
    conversation,
    messagesByConversation[rowIndex] || { messages: [], workflow: [] },
    { canSend, canAssign },
  ));

  return {
    conversations,
    summary: {
      total,
      open: accessibleRows.filter((item) => item.status === 'open').length,
      unread: accessibleRows.reduce((sum, item) => sum + Number(item.unread_count || 0), 0),
      pendingHumanReply: conversations.filter((item) => item.status === 'open' && item.messages.at(-1)?.direction === 'incoming').length,
      source: 'chatwoot-crm',
    },
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      hasNext: safeOffset + conversations.length < total,
      nextOffset: safeOffset + conversations.length < total ? safeOffset + conversations.length : null,
      total,
    },
    capabilities: {
      read: true,
      send: canSend,
      assign: canAssign,
      updateStatus: false,
      localWorkflow: false,
    },
    boundaries: [
      sendEnabled
        ? `Message sending is enabled through the guarded ${env.whatsapp.provider} outbound provider.`
        : 'Chatwoot message sending is disabled until the guarded send configuration is approved.',
      env.chatwoot.includeGroups ? 'Chatwoot group conversations are visible.' : 'Chatwoot group conversations are hidden from the customer inbox.',
      'Chatwoot assignment is restricted to CRM users linked to a Chatwoot agent.',
      'This API does not expose ERP, product, price, stock or order operations.',
    ],
  };
}

export async function getChatwootConversationDetail({ conversationId, user }) {
  await refreshWaapiReadiness();
  const numericId = Number(conversationId);
  if (!Number.isInteger(numericId) || numericId < 1) {
    const error = new Error('Konusma kimligi gecersiz.');
    error.code = 'WHATSAPP_CRM_CONVERSATION_INVALID';
    error.statusCode = 400;
    throw error;
  }

  let rawConversation;
  try {
    rawConversation = await chatwootApiRequest(`/conversations/${numericId}`);
  } catch (error) {
    if (error?.statusCode !== 404) throw error;
  }
  if (!rawConversation
    || (env.chatwoot.inboxId && Number(rawConversation.inbox_id) !== Number(env.chatwoot.inboxId))
    || (!env.chatwoot.includeGroups && isGroupConversation(rawConversation))) {
    const error = new Error('Konusma bulunamadi.');
    error.code = 'WHATSAPP_CRM_CONVERSATION_NOT_FOUND';
    error.statusCode = 404;
    throw error;
  }

  const messageData = await readMessages(rawConversation);
  const conversation = mapConversation(rawConversation, messageData, {
    canSend: isChatwootSendEnabled() && Boolean(user?.permissions?.includes('crm.send')),
    canAssign: Boolean(user?.permissions?.includes('crm.assign')),
  });

  return assertConversationAccess(user, conversation);
}

export async function listChatwootAgents() {
  const response = await chatwootApiRequest('/agents');
  const rows = Array.isArray(response) ? response : (response?.payload || []);
  return rows.map((agent) => ({
    id: Number(agent.id),
    name: agent.available_name || agent.name || `Temsilci ${agent.id}`,
    availability: agent.availability_status || 'unknown',
    role: agent.role || 'agent',
  }));
}
