export function safeRequestPath(req) {
  const path = String(req.originalUrl || '').split('?')[0];
  return path.replace(/\/webhooks\/waapi(?:\/.*)?/i, '/webhooks/waapi/[REDACTED]');
}
