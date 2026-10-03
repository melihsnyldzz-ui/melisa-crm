import { env } from '../config/env.js';

function chatwootError(code, message, statusCode = 502, meta = undefined) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (meta) error.meta = meta;
  return error;
}

export function isChatwootApiConfigured() {
  return Boolean(env.chatwoot.baseUrl && env.chatwoot.accountId && env.chatwoot.apiAccessToken);
}

export async function chatwootApiRequest(path, { method = 'GET', body, media } = {}) {
  if (!isChatwootApiConfigured()) {
    throw chatwootError(
      'WHATSAPP_CRM_CHATWOOT_NOT_CONFIGURED',
      'Chatwoot API baglantisi yapilandirilmamis.',
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.chatwoot.timeoutMs);
  const endpoint = `${env.chatwoot.baseUrl}/api/v1/accounts/${env.chatwoot.accountId}${path}`;

  try {
    let requestBody = body ? JSON.stringify(body) : undefined;
    if (media) {
      const form = new FormData();
      for (const [key, value] of Object.entries(body || {})) form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      form.append('attachments[]', new Blob([Buffer.from(media.data, 'base64')], { type: media.mimeType }), media.fileName);
      requestBody = form;
    }
    const response = await fetch(endpoint, {
      method,
      redirect: 'error',
      headers: {
        api_access_token: env.chatwoot.apiAccessToken,
        ...(body && !media ? { 'Content-Type': 'application/json' } : {}),
      },
      body: requestBody,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      throw chatwootError(
        'WHATSAPP_CRM_CHATWOOT_READ_FAILED',
        `Chatwoot verisi okunamadi (HTTP ${response.status}).`,
        response.status === 401 || response.status === 403 ? 503 : 502,
        { providerStatus: response.status, providerCode: 'CHATWOOT_READ_REJECTED' },
      );
    }

    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw chatwootError('WHATSAPP_CRM_CHATWOOT_TIMEOUT', 'Chatwoot yanit vermedi.', 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
