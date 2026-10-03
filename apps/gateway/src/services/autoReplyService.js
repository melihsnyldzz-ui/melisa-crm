import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { env } from '../config/env.js';
import { sendCrmTextMessage } from './sendService.js';

const lastReplyByTarget = new Map();

function normalizeText(value = '') {
  return String(value)
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

function isPrivateTarget(remoteJid = '') {
  const jid = String(remoteJid).trim().toLowerCase();
  return Boolean(jid) && !jid.endsWith('@g.us') && !jid.endsWith('@broadcast');
}

function mimeTypeForPath(path = '') {
  const extension = extname(path).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export function evaluateAutoReply(event = {}, options = {}) {
  const enabled = options.enabled ?? env.whatsapp.autoReply.enabled;
  const keyword = options.keyword ?? env.whatsapp.autoReply.keyword;
  const imagePath = options.imagePath ?? env.whatsapp.autoReply.imagePath;
  const evolutionInstance = options.evolutionInstance ?? env.whatsapp.autoReply.evolutionInstance;
  const cooldownMs = options.cooldownMs ?? env.whatsapp.autoReply.cooldownMs;
  const now = options.now ?? Date.now();
  const target = String(event.remoteJid || event.phone || '').trim();

  if (!enabled) return { eligible: false, reason: 'disabled' };
  if (!imagePath) return { eligible: false, reason: 'image-path-missing' };
  if (!evolutionInstance) return { eligible: false, reason: 'instance-missing' };
  if (String(event.instanceKey || '') !== evolutionInstance) return { eligible: false, reason: 'wrong-instance' };
  if (event.direction !== 'inbound') return { eligible: false, reason: 'not-inbound' };
  if (!isPrivateTarget(event.remoteJid)) return { eligible: false, reason: 'not-private-chat' };
  if (normalizeText(event.text) !== normalizeText(keyword)) return { eligible: false, reason: 'keyword-mismatch' };

  const lastReplyAt = lastReplyByTarget.get(target) || 0;
  if (lastReplyAt && now - lastReplyAt < cooldownMs) {
    return { eligible: false, reason: 'cooldown' };
  }

  return { eligible: true, target, imagePath, evolutionInstance, now };
}

export async function handleAutoReply(event = {}, context = {}, dependencies = {}) {
  const decision = evaluateAutoReply(event, dependencies.options);
  if (!decision.eligible) return decision;

  const loadFile = dependencies.readFile || readFile;
  const sendMessage = dependencies.sendMessage || sendCrmTextMessage;
  const image = await loadFile(decision.imagePath);
  const mimeType = mimeTypeForPath(decision.imagePath);

  const result = await sendMessage({
    conversationId: context.conversationId,
    phone: event.phone,
    remoteJid: event.remoteJid,
    contactName: event.contactName,
    instanceKey: decision.evolutionInstance,
    clientRequestId: `auto-reply:${event.eventId}`,
    text: '',
    media: {
      dataUrl: `data:${mimeType};base64,${image.toString('base64')}`,
      mimeType,
      mediaType: 'image',
      fileName: `melisa-baby${extname(decision.imagePath).toLowerCase() || '.jpg'}`,
    },
  });

  lastReplyByTarget.set(decision.target, decision.now);
  return { eligible: true, sent: true, result };
}

export function resetAutoReplyCooldowns() {
  lastReplyByTarget.clear();
}
