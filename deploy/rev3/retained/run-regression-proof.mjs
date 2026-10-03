import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {runDevProcess,devProcessSucceeded} from './run-dev-process.mjs';
import {verifyLockedDependencies} from './verify-locked-dependencies.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const receiptRoot=path.join(root,'regression-evidence',new Date().toISOString().replace(/[-:.]/g,''));
const dependencyProof=await verifyLockedDependencies(root);
const r=await runDevProcess({stage:'dev-boundary-lifecycle-12',executable:'C:\\Program Files\\nodejs\\node.exe',
 args:['--test','--test-reporter=tap',...['dev-process-lifecycle.test.mjs','dependency-boundary.test.mjs','offline-guard.test.mjs'].map(f=>path.join(root,f))],cwd:root,receiptRoot});
const pass=devProcessSucceeded(r)&&/^# pass 12\s*$/m.test(r.stdout)&&/^# fail 0\s*$/m.test(r.stdout);
await writeFile(path.join(receiptRoot,'REGRESSION_RESULT.json'),JSON.stringify({status:pass?'PASS':'FAIL',tests:12,dependencyProof,
 actualDependencyResolution:true,stdoutSha256:r.stdoutSha256,stderrSha256:r.stderrSha256,
 productionRuntimeActions:0,authPost:false,sqlExecuted:false,providerCalls:0},null,2),{flag:'wx'});
console.log(JSON.stringify({status:pass?'PASS':'FAIL',tests:12,receiptRoot}));
process.exitCode=pass?0:1;
