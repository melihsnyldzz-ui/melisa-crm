import {runDevProcess} from './run-dev-process.mjs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url)),cwd=path.join(root,'deployment-dependency','gateway');
const receiptRoot=path.join(root,'root-cause-evidence');
const result=await runDevProcess({stage:'gateway-missing-express',executable:'C:\\Program Files\\nodejs\\node.exe',
 args:['--import',pathToFileURL(path.join(root,'deployment-dependency','offline-test-guard.mjs')).href,
 '--test','--test-reporter=tap',path.join(cwd,'src','middleware','messageUploadParser.test.js')],cwd,receiptRoot});
console.log(JSON.stringify({stage:result.stage,exitCode:result.exitCode,
 exactErrorCode:/ERR_MODULE_NOT_FOUND/.test(result.stdout+result.stderr)?'ERR_MODULE_NOT_FOUND':null,
 missingPackage:/Cannot find package 'express'/.test(result.stdout+result.stderr)?'express':null,receiptRoot,runtimeActions:0}));
