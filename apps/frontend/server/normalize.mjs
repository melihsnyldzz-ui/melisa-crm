function array(value) { return Array.isArray(value) ? value : []; }

function initials(name) {
  return String(name || "Müşteri").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
}

function dateFromUnix(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || !number) return "";
  return new Date(number * 1000).toISOString();
}

function attachmentType(attachment = {}) {
  const raw = String(attachment.file_type || attachment.type || attachment.content_type || attachment.mime_type || "").toLowerCase();
  if (raw.includes("image")) return "image";
  if (raw.includes("video")) return "video";
  if (raw.includes("audio") || raw.includes("voice")) return "audio";
  if (raw.includes("location")) return "location";
  return "file";
}

function normalizeAttachment(attachment, index = 0) {
  const source = attachment && typeof attachment === "object" ? attachment : {};
  return {
    id: String(source.id ?? `attachment-${index}`),
    type: attachmentType(source),
    url: String(source.data_url || source.dataUrl || source.file_url || source.fileUrl || source.url || ""),
    thumbnailUrl: String(source.thumb_url || source.thumbnail_url || source.thumbnailUrl || ""),
    fileName: String(source.file_name || source.filename || source.name || source.title || ""),
    mimeType: String(source.content_type || source.mime_type || source.mimeType || ""),
    fileSize: Number(source.file_size || source.fileSize || source.size || 0) || 0,
    width: Number(source.width || 0) || null,
    height: Number(source.height || 0) || null,
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

export function normalizeMessage(message, index = 0) {
  const directionSignals = [
    message?.message_type, message?.messageType, message?.direction,
    message?.sender_type, message?.senderType, message?.sender?.type,
  ].filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim().toLowerCase());
  const outgoing = message?.outgoing === true || message?.isOutgoing === true || message?.is_outgoing === true
    || directionSignals.some((value) => ["1", "3", "outgoing", "template", "agent", "user", "agentbot", "agent_bot"].includes(value));
  const attachments = array(message?.attachments).map(normalizeAttachment);
  const content = String(message?.content || message?.content_attributes?.items?.[0]?.title || "").trim();
  return {
    id: String(message?.id ?? `message-${index}`),
    text: content,
    previewText: content || attachmentLabel(attachments),
    attachments,
    direction: outgoing ? "outgoing" : "incoming",
    createdAt: dateFromUnix(message?.created_at),
    status: String(message?.status || ""),
  };
}

export function conversationPayload(raw) {
  return array(raw?.data?.payload ?? raw?.payload ?? raw?.data ?? raw);
}

export function normalizeConversation(conversation, includeMessages = false) {
  const sender = conversation?.meta?.sender || conversation?.contact || {};
  const assignee = conversation?.meta?.assignee || conversation?.assignee || null;
  const lastMessage = conversation?.last_non_activity_message || array(conversation?.messages).at(-1) || {};
  const lastAttachments = array(lastMessage?.attachments).map(normalizeAttachment);
  const lastContent = String(lastMessage?.content || "").trim();
  const name = String(sender?.name || sender?.available_name || sender?.phone_number || `Müşteri #${conversation?.id}`);
  const normalized = {
    id: String(conversation?.id), initials: initials(name), name, contactName: name, displayName: name,
    phone: String(sender?.phone_number || sender?.identifier || ""), email: String(sender?.email || ""),
    country: String(sender?.country_name || "—"), code: String(sender?.country_code || "--").slice(0, 2).toUpperCase(),
    language: String(conversation?.custom_attributes?.language || "Otomatik"),
    wait: dateFromUnix(conversation?.waiting_since || conversation?.last_activity_at), unread: Number(conversation?.unread_count || 0),
    owner: assignee?.name || "Atanmamış", assignedUserId: assignee?.id ?? null, assignedUserName: assignee?.name || null,
    teamName: conversation?.meta?.team?.name || null, channel: "whatsapp", preview: lastContent || attachmentLabel(lastAttachments),
    foreign: lastContent, translation: "", status: String(conversation?.status || "open"),
    inboxId: Number(conversation?.inbox_id || 0), lastMessageAt: dateFromUnix(conversation?.last_activity_at || lastMessage?.created_at),
    tags: array(conversation?.labels).map(String),
  };
  if (includeMessages) normalized.messages = array(conversation?.messages).map(normalizeMessage);
  return normalized;
}

export function normalizeInbox(raw) {
  const conversations = conversationPayload(raw).map((item) => normalizeConversation(item));
  const meta = raw?.data?.meta || raw?.meta || {};
  return {
    conversations,
    summary: {
      total: Number(meta?.all_count ?? conversations.length),
      open: Number(meta?.mine_count ?? conversations.filter((item) => item.status === "open").length),
      unread: conversations.reduce((sum, item) => sum + item.unread, 0),
      pendingHumanReply: conversations.filter((item) => item.unread > 0).length,
      unassigned: conversations.filter((item) => !item.assignedUserId).length,
    },
  };
}
