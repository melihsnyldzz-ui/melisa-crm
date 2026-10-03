import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
function processFixture(input) {
  return new Promise((resolve,reject) => {
    const child = spawn(process.execPath, ['--import', new URL('../../../offline-test-guard.mjs', import.meta.url).href, fileURLToPath(new URL('./fixtures/sessionProcess.mjs', import.meta.url))], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: ['pipe','pipe','pipe'], windowsHide: true,
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
    child.once('error', reject); child.once('exit', code => {
      if (code !== 0) reject(new Error('Synthetic session child failed: ' + code + ' ' + stderr));
      else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
test('fresh gateway process accepts existing synthetic session only with unchanged active user configuration', async () => {
  const { token } = await processFixture({ mode: 'login' });
  assert.deepEqual(await processFixture({ mode: 'verify', token }), { ok: true, role: 'patron' });
  assert.deepEqual(await processFixture({ mode: 'verify', token, disabled: true }), { ok: false, code: 'AUTH_TOKEN_INVALID' });
  assert.deepEqual(await processFixture({ mode: 'verify', token, changedRole: true }), { ok: false, code: 'AUTH_TOKEN_INVALID' });
  const expired = await processFixture({ mode: 'login', expired: true });
  assert.deepEqual(await processFixture({ mode: 'verify', token: expired.token }), { ok: false, code: 'AUTH_TOKEN_EXPIRED' });
});
