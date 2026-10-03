import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../config/env.js';
import { requireWebhookSecret } from './webhookSecurity.js';

function runMiddleware({ headers = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const req = {
      body,
      get(name) {
        return headers[name.toLowerCase()] || headers[name] || '';
      },
    };

    requireWebhookSecret(req, {}, (error) => resolve(error || null));
  });
}

test('accepts webhook when body apikey matches even if custom header is stale', async () => {
  const originalWebhookSecret = env.whatsapp.webhookSecret;
  const originalApiKey = env.evolution.apiKey;

  env.whatsapp.webhookSecret = 'current-secret';
  env.evolution.apiKey = 'current-secret';

  try {
    const error = await runMiddleware({
      headers: {
        'x-melisa-webhook-secret': 'old-secret',
      },
      body: {
        apikey: 'current-secret',
      },
    });

    assert.equal(error, null);
  } finally {
    env.whatsapp.webhookSecret = originalWebhookSecret;
    env.evolution.apiKey = originalApiKey;
  }
});

test('rejects webhook when no provided secret matches', async () => {
  const originalWebhookSecret = env.whatsapp.webhookSecret;
  const originalApiKey = env.evolution.apiKey;

  env.whatsapp.webhookSecret = 'current-secret';
  env.evolution.apiKey = 'current-secret';

  try {
    const error = await runMiddleware({
      headers: {
        'x-melisa-webhook-secret': 'old-secret',
      },
      body: {
        apikey: 'wrong-secret',
      },
    });

    assert.equal(error.code, 'WHATSAPP_CRM_WEBHOOK_FORBIDDEN');
    assert.equal(error.statusCode, 403);
  } finally {
    env.whatsapp.webhookSecret = originalWebhookSecret;
    env.evolution.apiKey = originalApiKey;
  }
});
