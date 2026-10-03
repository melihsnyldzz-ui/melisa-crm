import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(file => /\.(?:js|mjs|cjs)$/.test(file));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {
    stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} tracked JavaScript modules; JSX is checked by the frontend build.`);
