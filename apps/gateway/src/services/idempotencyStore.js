const seenEvents = new Map();
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function cleanup(now = Date.now()) {
  for (const [key, expiresAt] of seenEvents.entries()) {
    if (expiresAt <= now) {
      seenEvents.delete(key);
    }
  }
}

export async function markEventOnce(eventKey, ttlMs = DEFAULT_TTL_MS) {
  const key = String(eventKey || '').trim();
  if (!key) {
    const error = new Error('Webhook event key is required for idempotency');
    error.code = 'WHATSAPP_CRM_EVENT_KEY_REQUIRED';
    error.statusCode = 400;
    throw error;
  }

  const now = Date.now();
  cleanup(now);

  if (seenEvents.has(key)) {
    return {
      firstSeen: false,
      key,
    };
  }

  seenEvents.set(key, now + ttlMs);
  return {
    firstSeen: true,
    key,
  };
}

export function getIdempotencyStoreStatus() {
  cleanup();
  return {
    backend: 'memory',
    eventCount: seenEvents.size,
    note: 'Sprint 001 skeleton uses memory idempotency; Redis-backed idempotency is reserved for the next implementation sprint.',
  };
}
