import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createWaapiWebhookRoutes } from './waapiWebhookRoutes.js';
import { safeRequestPath } from '../utils/safeRequestPath.js';
import { env } from '../config/env.js';
import { createApp } from '../app.js';
import { createPasswordHash } from '../services/crmAuthService.js';

test('WAAPI webhook authentication is independent of JWT and fails closed', async t => {
  const secret = 'a'.repeat(64); let accepted = 0;
  const app = express(); app.use(createWaapiWebhookRoutes({ config: { webhookSecret: secret }, accept: async () => { accepted++; return { accepted: true }; } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/webhooks/waapi/`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
  assert.equal((await fetch(base + 'wrong', options)).status, 401);
  assert.equal((await fetch(base + secret, options)).status, 202); assert.equal(accepted, 1);
  assert.equal(safeRequestPath({ originalUrl: `/webhooks/waapi/${secret}?token=SECRET` }), '/webhooks/waapi/[REDACTED]');
});
test('WAAPI webhook responds non-2xx if durable acceptance fails', async t => {
  const app = express(); const secret = 'b'.repeat(64);
  app.use(createWaapiWebhookRoutes({ config: { webhookSecret: secret }, accept: async () => { throw new Error('storage unavailable'); } }));
  app.use((err, req, res, next) => res.sendStatus(503));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/webhooks/waapi/${secret}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
});

test('WAAPI CRM personnel cannot reach provider or bridge send operations', async t => {
  const auth = { ...env.auth }; const whatsapp = { ...env.whatsapp };
  t.after(() => { Object.assign(env.auth, auth); Object.assign(env.whatsapp, whatsapp); });
  const password = 'Synthetic-Staff-Password-2026!';
  Object.assign(env.auth, { jwtSecret: 'synthetic-test-secret-at-least-thirty-two-chars', personnelCanSend: false,
    users: [{ id: 'waapi-staff', username: 'waapi-staff', active: true, role: 'personel', chatwootAgentId: 7, passwordHash: createPasswordHash(password) }] });
  Object.assign(env.whatsapp, { provider: 'waapi', sendEnabled: true, liveSendApproved: true });
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch; t.after(() => { globalThis.fetch = nativeFetch; });
  globalThis.fetch = (url, opts) => { assert(String(url).startsWith(base), 'No upstream call may run for denied staff'); return nativeFetch(url, opts); };
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'waapi-staff', password }) });
  assert.equal(login.status, 200); const session = await login.json();
  const response = await fetch(`${base}/crm/conversations/55/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.data.accessToken}` }, body: JSON.stringify({ text: 'synthetic', media: null, clientRequestId: 'staff-waapi-test' }) });
  assert.equal(response.status, 403);
});
