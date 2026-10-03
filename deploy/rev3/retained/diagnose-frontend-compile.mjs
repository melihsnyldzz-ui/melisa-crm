import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {runDevProcess} from './run-dev-process.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const front=path.join(root,'deployment-dependency','frontend');
const receiptRoot=path.join(root,'compile-evidence',new Date().toISOString().replace(/[-:.]/g,''));
const guard=pathToFileURL(path.join(root,'deployment-dependency','offline-test-guard.mjs')).href;
const result=await runDevProcess({stage:'frontend-vite-build',executable:'C:\\Program Files\\nodejs\\node.exe',
 args:['--import',guard,path.join(front,'node_modules','vite','bin','vite.js'),'build'],
 cwd:front,receiptRoot,nodeEnv:'production'});
console.log(JSON.stringify({exitCode:result.exitCode,receiptRoot,productionRuntimeActions:0}));
process.exitCode=result.exitCode===0?0:1;
