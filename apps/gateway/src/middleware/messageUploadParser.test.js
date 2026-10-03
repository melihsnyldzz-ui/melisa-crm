import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { env } from '../config/env.js';
import { authenticateCrmUser, createPasswordHash } from '../services/crmAuthService.js';
import { createMessageUploadParser } from './messageUploadParser.js';
test('large media parser authenticates first, allows 10 MiB base64 and preserves other route limits', async t => {
  const original = { ...env.auth }; t.after(() => Object.assign(env.auth, original));
  const password = 'Synthetic-fixture-password-2026!';
  Object.assign(env.auth, { jwtSecret: 'synthetic-fixture-secret-more-than-32-characters', issuer: 'offline', audience: 'offline', tokenExpiresIn: '5m', personnelCanSend: false,
    users: ['patron','personel'].map((role,i) => ({ id: 'offline-' + i, username: role, role, active: true, passwordHash: createPasswordHash(password, 'fixture-salt-' + i) })) });
  const owner = authenticateCrmUser({ username: 'patron', password }).accessToken;
  const staff = authenticateCrmUser({ username: 'personel', password }).accessToken;
  const app = express(); let handles = 0;
  app.use(createMessageUploadParser()); app.use(express.json({ limit: '5mb' }));
  app.post(['/crm/conversations/:id/messages', '/other'], (req,res) => { handles++; res.json({ size: req.body.media.dataUrl.length }); });
  app.use((e,_req,res,_next) => res.status(e.statusCode || e.status || 500).json({ code: e.code || e.type }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const body = JSON.stringify({ media: { dataUrl: 'data:application/pdf;base64,' + Buffer.alloc(10 * 1024 * 1024).toString('base64') } });
  const post = (path, token, value = body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: value });
  assert.equal((await post('/crm/conversations/55/messages')).status, 401);
  assert.equal((await post('/crm/conversations/55/messages', staff)).status, 403);
  assert.equal((await post('/crm/conversations/55/messages', owner)).status, 200);
  assert.equal((await post('/other', owner)).status, 413);
  assert.equal((await post('/crm/conversations/55/messages', owner, JSON.stringify({ media: { dataUrl: 'a'.repeat(16 * 1024 * 1024) } }))).status, 413);
  assert.equal(handles, 1);
});
