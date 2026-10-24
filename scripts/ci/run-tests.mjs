import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cleanEnvironment } from './environment.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(file => /\.test\.(?:js|mjs)$/.test(file));
const groups = [
  ['Frontend', 'apps/frontend', files.filter(file => file.startsWith('apps/frontend/'))],
  ['Gateway', 'apps/gateway', files.filter(file => file.startsWith('apps/gateway/'))],
  ['ERP contracts and CI boundary', '.', files.filter(file => !file.startsWith('apps/'))],
];
// New CI files have not necessarily been committed during a local preflight.
groups[2][2].push('scripts/ci/offline-guard.test.mjs');
const guard = new URL('./offline-guard.mjs', import.meta.url).href;
const env = { ...cleanEnvironment(), NODE_ENV: 'test', NODE_OPTIONS: `--import=${guard}` };
for (const [name, directory, selected] of groups) {
  const unique = [...new Set(selected)];
  if (!unique.length) throw new Error(`${name}: no tests found`);
  console.log(`${name}: ${unique.length} test files`);
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
    ...unique.map(file => path.join(root, file))], {
    cwd: path.join(root, directory), env, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
