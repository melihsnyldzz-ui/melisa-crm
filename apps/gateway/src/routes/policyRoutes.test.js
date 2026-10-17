import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, writeFile, open, rename, unlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { authenticateCrmUser, createPasswordHash } from '../services/crmAuthService.js';
import { createSalesPolicyStore } from '../services/salesAgent/policyStore.mjs';
import { APPROVED_BUSINESS_RULES, editablePolicy } from '../services/salesAgent/policy.mjs';

const defaultPolicy = () => editablePolicy();
const code = value => error => error.code === value;
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'crm-sales-policy-fixture-'));
  const path = join(directory, 'rules.json');
  await writeFile(path, JSON.stringify(defaultPolicy()));
  const dispose = async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(basename(directory), /^crm-sales-policy-fixture-/);
    await rm(directory, { recursive: true, force: true });
  };
  return { directory, path, dispose };
}

test('sales policy store atomically replaces a valid policy and generates its own version', async () => {
  const f = await fixture();
  try {
    const store = createSalesPolicyStore({ getPath: () => f.path });
    const before = await store.read();
    assert.equal(before.configured, true); assert.match(before.revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(before).sort(), ['businessRules', 'configured', 'policy', 'revision']);
    const changed = { ...before.policy, version: 'client-cannot-name-active-version', minimumOrderMode: 'none', salesNotes: 'Personel inceler.' };
    const saved = await store.write({ policy: changed, revision: before.revision });
    assert.match(saved.policy.version, /^owner-/); assert.notEqual(saved.policy.version, changed.version);
    assert.notEqual(saved.revision, before.revision);
    assert.equal(saved.policy.minimumOrderMode, 'none');
    assert.deepEqual(JSON.parse(await readFile(f.path, 'utf8')), saved.policy);
    assert.deepEqual(await store.read(), saved);
    assert.deepEqual(await readdir(f.directory), ['rules.json']);
    await assert.rejects(store.write({ policy: changed, revision: before.revision }), code('AI_POLICY_CHANGED'));
  } finally { await f.dispose(); }
});

test('same-revision concurrent edits commit once, preserving the winner', async () => {
  const f = await fixture();
  try {
    const store = createSalesPolicyStore({ getPath: () => f.path });
    const current = await store.read();
    const results = await Promise.allSettled(['First', 'Second'].map(salesNotes => store.write({
      policy: { ...current.policy, salesNotes }, revision: current.revision,
    })));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'AI_POLICY_CHANGED');
    assert.equal((await store.read()).policy.salesNotes, results.find(result => result.status === 'fulfilled').value.policy.salesNotes);
  } finally { await f.dispose(); }
});

test('staging failures never truncate the current JSON and remove the temporary file', async () => {
  const f = await fixture();
  try {
    const original = await readFile(f.path, 'utf8');
    const store = createSalesPolicyStore({ getPath: () => f.path, fs: {
      open, unlink, rename: async () => { throw new Error('RAW_PATH_OR_STORAGE_SENTINEL'); },
    } });
    const current = await store.read();
    await assert.rejects(store.write({ policy: { ...current.policy, minimumOrderMode: 'none' }, revision: current.revision }), error => {
      assert.equal(error.code, 'AI_POLICY_FILE_INVALID'); assert.equal(error.message.includes('SENTINEL'), false); return true;
    });
    assert.equal(await readFile(f.path, 'utf8'), original);
    assert.deepEqual(await readdir(f.directory), ['rules.json']);
  } finally { await f.dispose(); }
});

test('a same-content file replacement during staging is rejected by identity, without overwriting it', async () => {
  const f = await fixture();
  try {
    const original = await readFile(f.path, 'utf8');
    const store = createSalesPolicyStore({ getPath: () => f.path, fs: {
      rename, unlink, open: async (...args) => {
        const handle = await open(...args);
        const nativeWrite = handle.writeFile.bind(handle);
        handle.writeFile = async bytes => {
          await nativeWrite(bytes);
          const replacement = join(f.directory, 'replacement.json');
          await writeFile(replacement, original);
          await rename(replacement, f.path);
        };
        return handle;
      },
    } });
    const current = await store.read();
    await assert.rejects(store.write({ policy: { ...current.policy, minimumOrderMode: 'none' }, revision: current.revision }), code('AI_POLICY_CHANGED'));
    assert.equal(await readFile(f.path, 'utf8'), original);
    assert.deepEqual(await readdir(f.directory), ['rules.json']);
  } finally { await f.dispose(); }
});

test('revocation and target changes after awaited staging reject before the commit', async () => {
  const f = await fixture();
  try {
    const original = await readFile(f.path, 'utf8');
    for (const mutation of ['access', 'path']) {
      let allowed = true, path = f.path;
      const store = createSalesPolicyStore({ getPath: () => path, fs: { rename, unlink, open: async (...args) => {
        const handle = await open(...args), nativeWrite = handle.writeFile.bind(handle);
        handle.writeFile = async bytes => { await nativeWrite(bytes); if (mutation === 'access') allowed = false;
          else path = join(f.directory, 'other.json'); };
        return handle;
      } } });
      const current = await store.read();
      const assertAccess = () => { if (!allowed) throw Object.assign(new Error('revoked'), { code: 'AI_AUTH_REQUIRED', statusCode: 401 }); };
      await assert.rejects(store.write({ policy: { ...current.policy, minimumOrderMode: 'none' }, revision: current.revision, assertAccess }),
        code(mutation === 'access' ? 'AI_AUTH_REQUIRED' : 'AI_POLICY_CHANGED'));
      assert.equal(await readFile(f.path, 'utf8'), original);
      assert.deepEqual(await readdir(f.directory), ['rules.json']);
    }
  } finally { await f.dispose(); }
});

test('real HTTP policy routes allow all CRM readers, only patron edits, and never expose a filesystem path', async t => {
  const f = await fixture();
  const originalAuth = { ...env.auth }, originalPath = process.env.CRM_AI_SALES_RULES_FILE;
  const password = 'Synthetic-policy-route-password!';
  Object.assign(env.auth, { jwtSecret: 'synthetic-policy-route-jwt-secret-longer-than-thirty-two',
    issuer: 'synthetic-policy-route', audience: 'synthetic-policy-client', personnelCanSend: false,
    users: ['patron', 'mudur', 'personel'].map(role => ({ id: `policy-${role}`, username: `policy-${role}`, displayName: 'Fixture',
      role, active: true, passwordHash: createPasswordHash(password, `policy-${role}`) })) });
  process.env.CRM_AI_SALES_RULES_FILE = f.path;
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const tokens = Object.fromEntries(['patron', 'mudur', 'personel'].map(role => [role,
    authenticateCrmUser({ username: `policy-${role}`, password }).accessToken]));
  const request = async ({ role = 'patron', method = 'GET', body, authorization = `Bearer ${tokens[role]}` } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/crm/sales-rules`, { method,
      headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = { status: response.status, body: await response.json() };
    assert.equal(JSON.stringify(result.body).includes(f.directory), false);
    return result;
  };
  try {
    await t.test('all existing roles read facts; only patron gets writable', async () => {
      for (const role of ['patron', 'mudur', 'personel']) {
        const result = await request({ role });
        assert.equal(result.status, 200); assert.equal(result.body.data.writable, role === 'patron');
        assert.equal(result.body.data.policy.minimumOrderMode, 'unconfigured');
        assert.deepEqual(result.body.data.businessRules, APPROVED_BUSINESS_RULES);
        assert.match(result.body.data.revision, /^[a-f0-9]{64}$/);
      }
      assert.equal((await request({ authorization: '' })).status, 401);
    });
    await t.test('manager and personnel cannot write; stale revision cannot replace owner changes', async () => {
      const initial = (await request()).body.data;
      const body = { policy: { ...initial.policy, minimumOrderMode: 'none' }, revision: initial.revision };
      for (const role of ['mudur', 'personel']) assert.equal((await request({ role, method: 'PUT', body })).status, 403);
      const updated = await request({ method: 'PUT', body });
      assert.equal(updated.status, 200); assert.equal(updated.body.data.policy.minimumOrderMode, 'none');
      assert.notEqual(updated.body.data.policy.version, initial.policy.version);
      assert.equal((await request({ method: 'PUT', body })).status, 409);
      assert.deepEqual((await request()).body.data, updated.body.data);
    });
    await t.test('path/body facts, unsafe execution flags and invalid country fields are rejected without writes', async () => {
      const current = (await request()).body.data, original = await readFile(f.path, 'utf8');
      for (const body of [
        { policy: current.policy, revision: current.revision, filepath: 'ignored-client-path' },
        { policy: { ...current.policy, autoSend: true }, revision: current.revision },
        { policy: { ...current.policy, countryRules: [{ country: 'Irak', minimumOrderMode: 'amount', minimumOrder: null }] }, revision: current.revision },
        { policy: null, revision: current.revision },
      ]) assert.equal((await request({ method: 'PUT', body })).status, 400);
      assert.equal(await readFile(f.path, 'utf8'), original);
    });
    await t.test('even a patron cannot override the sourced fixed rules through the editable policy', async () => {
      const current = (await request()).body.data, original = await readFile(f.path, 'utf8');
      for (const override of [{ businessRules: { shippingPayer: 'seller' } }, { wholesaleOnly: false },
        { breakSeries: true }, { shippingPayer: 'seller' }]) {
        const rejected = await request({ method: 'PUT', body: { policy: { ...current.policy, ...override }, revision: current.revision } });
        assert.equal(rejected.status, 400); assert.equal(rejected.body.error.code, 'AI_POLICY_INVALID');
      }
      assert.equal(await readFile(f.path, 'utf8'), original);
      assert.deepEqual((await request()).body.data.businessRules, APPROVED_BUSINESS_RULES);
    });
    await t.test('no configured file returns unknown facts and cannot create or edit a file', async () => {
      const original = await readFile(f.path, 'utf8');
      delete process.env.CRM_AI_SALES_RULES_FILE;
      const current = await request();
      assert.equal(current.status, 200); assert.equal(current.body.data.configured, false);
      assert.equal(current.body.data.writable, false); assert.equal(current.body.data.policy.minimumOrderMode, 'unconfigured');
      const body = { policy: current.body.data.policy, revision: current.body.data.revision };
      assert.equal((await request({ method: 'PUT', body })).status, 503);
      process.env.CRM_AI_SALES_RULES_FILE = join(f.directory, 'missing.json');
      assert.equal((await request()).body.data.configured, false);
      assert.equal((await request({ method: 'PUT', body })).status, 503);
      assert.deepEqual(await readdir(f.directory), ['rules.json']);
      assert.equal(await readFile(f.path, 'utf8'), original);
      process.env.CRM_AI_SALES_RULES_FILE = f.path;
    });
    await t.test('invalid server file is a safe explicit failure; legacy minimum remains compatible', async () => {
      await writeFile(f.path, 'RAW_BROKEN_JSON_PATH_SENTINEL');
      const broken = await request();
      assert.equal(broken.status, 503); assert.equal(JSON.stringify(broken.body).includes('SENTINEL'), false);
      await writeFile(f.path, JSON.stringify({ version: 'legacy-v1', minimumOrder: { amountMinor: 100_000, currency: 'USD' }, telegramUrl: null }));
      const legacy = await request();
      assert.equal(legacy.status, 200); assert.equal(legacy.body.data.policy.minimumOrderMode, 'amount');
      assert.equal(legacy.body.data.policy.minimumOrder.amountMinor, 100_000);
      process.env.CRM_AI_SALES_RULES_FILE = join(resolve('.'), 'AGENTS.md');
      assert.equal((await request()).status, 503);
      process.env.CRM_AI_SALES_RULES_FILE = f.path;
    });
    await t.test('an existing token loses access immediately when the account is deactivated', async () => {
      env.auth.users[0].active = false;
      assert.equal((await request()).status, 401);
      env.auth.users[0].active = true;
    });
  } finally {
    await new Promise(resolve => server.close(resolve)); Object.assign(env.auth, originalAuth);
    if (originalPath === undefined) delete process.env.CRM_AI_SALES_RULES_FILE; else process.env.CRM_AI_SALES_RULES_FILE = originalPath;
    await f.dispose();
  }
});
