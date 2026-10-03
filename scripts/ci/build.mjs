import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment } from './environment.mjs';

const cwd = fileURLToPath(new URL('../../apps/frontend/', import.meta.url));
const guard = new URL('./offline-guard.mjs', import.meta.url).href;
const env = { ...cleanEnvironment(), NODE_ENV: 'production', NODE_OPTIONS: `--import=${guard}` };
// Run the same checked-in build steps without shell/npm credential inheritance.
for (const script of [fileURLToPath(new URL('./build-frontend.mjs', import.meta.url)), 'scripts/prepare-sites-build.mjs']) {
  const args = [script];
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
