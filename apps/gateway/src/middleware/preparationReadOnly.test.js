import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../app.js';

test('isolated preparation rejects every mutation with readable Turkish and preserves reads and normal login', async () => {
  const previous = process.env.CRM_ISOLATED_PREPARATION;
  process.env.CRM_ISOLATED_PREPARATION = 'true';
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(`${origin}/synthetic-mutation`, { method });
      assert.equal(response.status, 403);
      const result = await response.json();
      assert.equal(result.error.code, 'CRM_PREPARATION_READ_ONLY');
      assert.equal(result.error.message, 'Ortak hazırlık ortamında mevcut CRM kayıtları değiştirilemez.');
      assert.equal(result.error.message.includes('\uFFFD'), false);
    }
    const read = await fetch(`${origin}/synthetic-missing-read`);
    assert.equal(read.status, 404);
    assert.notEqual((await read.json()).error.code, 'CRM_PREPARATION_READ_ONLY');
    const login = await fetch(`${origin}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(login.status, 401);
    assert.equal((await login.json()).error.code, 'WHATSAPP_CRM_LOGIN_FAILED');
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.CRM_ISOLATED_PREPARATION;
    else process.env.CRM_ISOLATED_PREPARATION = previous;
  }
});
