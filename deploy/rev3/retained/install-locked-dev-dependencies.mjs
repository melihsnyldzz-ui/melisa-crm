// Installs only the existing two reviewed package-locks into REV2 DEV folders.
// No lifecycle scripts, user/global auth config, existing user cache or network
// proxy config is imported. This is not invoked by the real Apply entry.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {runDevProcess} from './run-dev-process.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const project=process.argv[2];
if(!['gateway','frontend'].includes(project))throw Error('FIXED_DEV_PROJECT_REQUIRED');
const cwd=path.join(root,'deployment-dependency',project),lockPath=path.join(cwd,'package-lock.json');
const lockBytes=await readFile(lockPath),lock=JSON.parse(lockBytes);
for(const [name,p] of Object.entries(lock.packages)){
 if(!name)continue;
 if(p.resolved && new URL(p.resolved).origin!=='https://registry.npmjs.org')throw Error('OFFICIAL_REGISTRY_LOCK_REQUIRED');
 if(p.resolved && !p.integrity)throw Error('LOCK_INTEGRITY_REQUIRED');
}
const sha=b=>createHash('sha256').update(b).digest('hex');
const packageSha=sha(await readFile(path.join(cwd,'package.json'))),lockSha=sha(lockBytes);
const stamp=new Date().toISOString().replace(/[-:.]/g,'');
const receiptRoot=path.join(root,'dependency-evidence',project+'-'+stamp);
const cache=path.join(root,'public-dev-registry-cache',project);
await mkdir(cache,{recursive:true});
const args=['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js','ci',
 '--ignore-scripts','--no-audit','--no-fund','--include=dev','--include=optional',
 '--registry=https://registry.npmjs.org/','--userconfig='+path.join(root,'dependency-public-userconfig.txt'),
 '--globalconfig='+path.join(root,'dependency-public-globalconfig.txt'),'--cache='+cache,'--loglevel=error'];
const result=await runDevProcess({stage:'npm-ci-'+project,executable:'C:\\Program Files\\nodejs\\node.exe',args,cwd,receiptRoot,timeoutMs:240000});
if(sha(await readFile(lockPath))!==lockSha||sha(await readFile(path.join(cwd,'package.json')))!==packageSha)throw Error('NPM_CHANGED_PINNED_INPUT');
const receipt={project,status:result.exitCode===0?'PASS':'FAIL',exitCode:result.exitCode,
 packageSha256:packageSha,lockSha256:lockSha,lockfileVersion:lock.lockfileVersion,
 registry:'https://registry.npmjs.org/',lifecycleScripts:false,userCredentialConfig:false,
 existingUserCacheUsed:false,receiptRoot,productionRuntimeActions:0};
await writeFile(path.join(receiptRoot,'INSTALL_RESULT.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify(receipt));
process.exitCode=result.exitCode===0?0:1;
