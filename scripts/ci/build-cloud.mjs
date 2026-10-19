import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanEnvironment } from './environment.mjs';
const cwd = fileURLToPath(new URL('../../apps/frontend/', import.meta.url));
const guard = new URL('./offline-guard.mjs', import.meta.url).href;
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.cloud-test.config.mjs', '--configLoader', 'native'], {
  cwd, env: { ...cleanEnvironment(), NODE_ENV: 'production', NODE_OPTIONS: `--import=${guard}` }, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
