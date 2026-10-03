import crypto from 'node:crypto';
import Redis from 'ioredis';
import { env } from '../config/env.js';

const attempts = new Map();
const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;

function attemptError(code, message, statusCode = 409, meta = undefined) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (meta) error.meta = meta;
  return error;
}

function cleanup(now = Date.now()) {
  for (const [key, attempt] of attempts.entries()) {
    if (attempt.expiresAt <= now) attempts.delete(key);
  }
}

export function validateClientRequestId(value) {
  const clientRequestId = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(clientRequestId)) {
    throw attemptError(
      'WHATSAPP_CRM_CLIENT_REQUEST_ID_REQUIRED',
      'Gecerli bir clientRequestId zorunludur (8-128 karakter).',
      400,
    );
  }
  return clientRequestId;
}

export function fingerprintOutbound(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function beginOutboundAttempt({ clientRequestId, fingerprint, conversationId, provider }) {
  const key = validateClientRequestId(clientRequestId);
  const now = Date.now();
  cleanup(now);
  const existing = attempts.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      throw attemptError(
        'WHATSAPP_CRM_IDEMPOTENCY_CONFLICT',
        'clientRequestId daha once farkli bir mesaj icin kullanildi.',
        409,
        { deliveryState: existing.state, clientRequestId: key },
      );
    }
    return { created: false, attempt: { ...existing } };
  }

  const attempt = {
    clientRequestId: key,
    fingerprint,
    conversationId: String(conversationId || ''),
    provider,
    state: 'PENDING',
    providerMessageId: null,
    chatwootMessageId: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + ATTEMPT_TTL_MS,
  };
  attempts.set(key, attempt);
  return { created: true, attempt: { ...attempt } };
}

export function updateOutboundAttempt(clientRequestId, changes) {
  const key = validateClientRequestId(clientRequestId);
  const existing = attempts.get(key);
  if (!existing) throw attemptError('WHATSAPP_CRM_ATTEMPT_NOT_FOUND', 'Gonderim denemesi bulunamadi.', 404);
  const updated = {
    ...existing,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  attempts.set(key, updated);
  return { ...updated };
}

export function publicOutboundAttempt(attempt, { duplicate = false } = {}) {
  return {
    clientRequestId: attempt.clientRequestId,
    conversationId: attempt.conversationId,
    provider: attempt.provider,
    deliveryState: attempt.state,
    providerMessageIdPresent: Boolean(attempt.providerMessageId),
    chatwootMessageIdPresent: Boolean(attempt.chatwootMessageId),
    duplicate,
    updatedAt: attempt.updatedAt,
  };
}

export function resetOutboundAttemptsForTests() {
  attempts.clear();
}

export function createMemoryOutboundAttemptStore() {
  return {
    begin: async (input) => beginOutboundAttempt(input),
    update: async (clientRequestId, changes) => updateOutboundAttempt(clientRequestId, changes),
    reset: () => resetOutboundAttemptsForTests(),
    backend: 'memory',
  };
}

let redisClient = null;

function getRedisClient() {
  if (!env.redis.url) {
    throw attemptError(
      'WHATSAPP_CRM_IDEMPOTENCY_UNAVAILABLE',
      'Kalici gonderim idempotency servisi yapilandirilmamis.',
      503,
    );
  }
  if (!redisClient) {
    redisClient = new Redis(env.redis.url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });
    redisClient.on('error', () => {});
  }
  return redisClient;
}

function redisKey(clientRequestId) {
  const namespace = /^[a-z0-9:-]{1,80}$/.test(process.env.CRM_OUTBOUND_NAMESPACE || '') ? process.env.CRM_OUTBOUND_NAMESPACE : 'whatsapp-crm';
  return `${namespace}:outbound:${validateClientRequestId(clientRequestId)}`;
}

async function redisCommand(work) {
  try {
    const client = getRedisClient();
    if (client.status === 'wait') await client.connect();
    return await work(client);
  } catch (error) {
    if (String(error?.code || '').startsWith('WHATSAPP_CRM_')) throw error;
    throw attemptError(
      'WHATSAPP_CRM_IDEMPOTENCY_UNAVAILABLE',
      'Kalici gonderim idempotency servisine ulasilamadi; mesaj gonderilmedi.',
      503,
    );
  }
}

export function createRedisOutboundAttemptStore(command = redisCommand) { return {
  backend: command !== redisCommand || env.redis.url ? 'redis' : 'unavailable',
  async begin({ clientRequestId, fingerprint, conversationId, provider }) {
    const key = redisKey(clientRequestId);
    const now = Date.now();
    const attempt = {
      clientRequestId: validateClientRequestId(clientRequestId),
      fingerprint,
      conversationId: String(conversationId || ''),
      provider,
      state: 'PENDING',
      providerMessageId: null,
      chatwootMessageId: null,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: now + ATTEMPT_TTL_MS,
    };
    return command(async (client) => {
      const created = provider === 'waapi'
        ? await client.set(key, JSON.stringify(attempt), 'NX')
        : await client.set(key, JSON.stringify(attempt), 'PX', ATTEMPT_TTL_MS, 'NX');
      if (created === 'OK') return { created: true, attempt };
      const raw = await client.get(key);
      if (!raw) {
        throw attemptError(
          'WHATSAPP_CRM_IDEMPOTENCY_UNAVAILABLE',
          'Kalici gonderim kaydi dogrulanamadi; mesaj gonderilmedi.',
          503,
        );
      }
      const existing = JSON.parse(raw);
      if (existing.fingerprint !== fingerprint) {
        throw attemptError(
          'WHATSAPP_CRM_IDEMPOTENCY_CONFLICT',
          'clientRequestId daha once farkli bir mesaj icin kullanildi.',
          409,
          { deliveryState: existing.state, clientRequestId: existing.clientRequestId },
        );
      }
      return { created: false, attempt: existing };
    });
  },
  async update(clientRequestId, changes) {
    const key = redisKey(clientRequestId);
    return command(async (client) => {
      const raw = await client.get(key);
      if (!raw) throw attemptError('WHATSAPP_CRM_ATTEMPT_NOT_FOUND', 'Gonderim denemesi bulunamadi.', 404);
      const existing = JSON.parse(raw);
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      const ttl = Number(await client.pttl(key));
      const saved = existing.provider === 'waapi' || ttl === -1
        ? await client.set(key, JSON.stringify(updated), 'XX')
        : await client.set(key, JSON.stringify(updated), 'PX', Math.max(ttl, 1000), 'XX');
      if (saved !== 'OK') throw attemptError('WHATSAPP_CRM_IDEMPOTENCY_UNAVAILABLE', 'Kalici gonderim guncellemesi dogrulanamadi.', 503);
      return updated;
    });
  },
}; }
export const outboundAttemptStore = createRedisOutboundAttemptStore();
