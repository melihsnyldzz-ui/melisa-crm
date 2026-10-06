import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const TEST_PACKAGE_MANIFEST = 'release-manifest.json';
export const CRM_SOURCE_ORIGIN = 'https://github.com/melihsnyldzz-ui/melisa-crm.git';
const canonicalRoot = fileURLToPath(new URL('../',import.meta.url));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const failure = code => {throw Object.assign(new Error(code),{code});};
const hex = (value,length=64) => typeof value==='string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const samePath = (a,b) => process.platform==='win32' ? path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase() : path.resolve(a)===path.resolve(b);
const within = (parent,child) => {const relative=path.relative(parent,child);return relative===''||!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
const runtimeFiles = ['package.json','apps/gateway/package.json','apps/gateway/package-lock.json','apps/frontend/package.json','apps/frontend/package-lock.json','deploy/test-supervisor.mjs','deploy/test-server.mjs','deploy/test-erp-catalog.mjs','deploy/test-erp-orders.mjs','deploy/test-erp-read-environment.mjs','packages/contracts/index.mjs','packages/erp-adapter/services/crmCatalogReadSource.mjs','packages/erp-adapter/workers/crmExistingStockReadWorker.mjs'];
// Older verified packages remain valid rollback targets. The pool is mandatory
// only for an adapter that imports it, and is always sealed as a Git source blob.
const stockPoolPath='packages/erp-adapter/services/crmStockWorkerPool.mjs';
const canonicalCatalogPaths=['packages/erp-adapter/services/canonicalCatalog.mjs','packages/erp-adapter/services/canonicalCatalogReader.mjs'];
const buildFiles = ['apps/frontend/index.html','apps/frontend/vite.config.mjs','apps/frontend/scripts/prepare-sites-build.mjs','apps/frontend/worker/index.js','apps/frontend/.openai/hosting.json'];

export function safePackagePath(value) {
  return typeof value==='string' && value.length>0 && value.length<=500 && !value.includes('\\') && !/[<>:"|?*]/.test(value) && !value.startsWith('/')
    && !/[\u0000-\u001f\u007f]/.test(value) && value.split('/').every(part=>part && part!=='.' && part!=='..' && !/[ .]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
function privatePath(value) {
  const parts=value.toLowerCase().split('/');
  return parts.some(part=>['.git','runtime','logs','backups','uploads','.npmrc','.netrc','credentials.json'].includes(part)||/^\.env(?:\.|$)/.test(part))
    || /\.(?:pem|key|p12|pfx|db|sqlite|sqlite3|log|bak)$/i.test(value);
}
export function allowedSourcePath(value) {
  if(!safePackagePath(value)||privatePath(value)||/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.[^.]+$/i.test(value))return false;
  if(runtimeFiles.includes(value)||buildFiles.includes(value)||value==='deploy/test-package.mjs'||value===stockPoolPath||canonicalCatalogPaths.includes(value))return true;
  return /^apps\/gateway\/src\/.+\.(?:js|mjs|json)$/.test(value)
    || /^apps\/frontend\/src\/.+\.(?:js|jsx|mjs|css|svg|png|webp|jpg|jpeg)$/.test(value)
    || /^apps\/frontend\/public\/.+\.(?:svg|png|webp|jpg|jpeg|ico|woff2?)$/.test(value);
}
function allowedPayloadPath(value) {
  return allowedSourcePath(value)||safePackagePath(value)&&!privatePath(value)&&(
    /^apps\/gateway\/node_modules\/.+/.test(value)||/^apps\/frontend\/dist\/client\/.+\.(?:html|js|css|svg|png|webp|jpg|jpeg|ico|woff2?|ttf)$/.test(value));
}
function assertPublicBytes(name,bytes) {
  if(privatePath(name))failure('PACKAGE_PRIVATE_FILE_REJECTED');
  if(!/\.(?:[cm]?js|jsx|json|html|css|md|txt|ya?ml|map)$/i.test(name))return;
  const text=bytes.toString('utf8');
  if(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{50,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}|\bAKIA[A-Z0-9]{16}\b/.test(text))failure('PACKAGE_SECRET_CONTENT_REJECTED');
}
function assertPathAncestors(directory) {
  if(!path.isAbsolute(directory))failure('PACKAGE_ABSOLUTE_PATH_REQUIRED');
  let cursor=path.resolve(directory);
  while(true){
    const stat=fs.lstatSync(cursor);
    if(!stat.isDirectory()||stat.isSymbolicLink()||!samePath(fs.realpathSync.native(cursor),cursor))failure('PACKAGE_REPARSE_REJECTED');
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
}
function assertWindowsReparse(directory) {
  if(process.platform!=='win32')return;
  // Fixed PowerShell code receives the path only as an environment value.
  const code="$ErrorActionPreference='Stop'; $taskFiles=@(Get-Item -LiteralPath $env:CRM_PACKAGE_SCAN_ROOT -Force)+@(Get-ChildItem -LiteralPath $env:CRM_PACKAGE_SCAN_ROOT -Force -Recurse); if(@($taskFiles|Where-Object{($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count -gt 0){exit 19}";
  try{execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{env:{...process.env,CRM_PACKAGE_SCAN_ROOT:directory},stdio:['ignore','pipe','pipe'],windowsHide:true});}
  catch{failure('PACKAGE_REPARSE_REJECTED');}
}
function readInventory(directory,windowsChecked=false) {
  assertPathAncestors(directory);if(!windowsChecked)assertWindowsReparse(directory);
  const rows=[],directories=[],identities=new Set();
  function walk(current,relative=''){
    for(const entry of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(!safePackagePath(name)||identities.has(name.toLowerCase()))failure('PACKAGE_PATH_REJECTED');
      identities.add(name.toLowerCase());
      const absolute=path.join(current,entry.name),stat=fs.lstatSync(absolute);
      if(stat.isSymbolicLink()||!samePath(fs.realpathSync.native(absolute),absolute))failure('PACKAGE_REPARSE_REJECTED');
      if(stat.isDirectory()){directories.push(name);walk(absolute,name);continue;}
      if(!stat.isFile()||stat.nlink!==1)failure('PACKAGE_LINK_OR_SPECIAL_FILE_REJECTED');
      if(stat.size>100*1024*1024)failure('PACKAGE_FILE_TOO_LARGE');
      const bytes=fs.readFileSync(absolute),after=fs.lstatSync(absolute);
      if(bytes.length!==stat.size||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.nlink!==1)failure('PACKAGE_FILE_CHANGED');
      assertPublicBytes(name,bytes);
      rows.push({path:name,size:bytes.length,sha256:hash(bytes)});
    }
  }
  walk(directory);rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {files:rows,directories};
}
export function inventoryPackage(directory){return readInventory(directory);}
/** Omit two shipped documentation examples; the payload scanner stays strict. */
export function projectLockedRuntimeDocumentation(staging){
  assertPathAncestors(staging);assertWindowsReparse(staging);
  const dependencyRoot=path.join(staging,'apps/gateway/node_modules/dotenv');
  assertPathAncestors(dependencyRoot);
  const lock=JSON.parse(fs.readFileSync(path.join(staging,'apps/gateway/package-lock.json'),'utf8'));
  const packageFile=path.join(dependencyRoot,'package.json'),installed=JSON.parse(fs.readFileSync(packageFile,'utf8'));
  const locked=lock?.packages?.['node_modules/dotenv'];
  if(installed.name!=='dotenv'||typeof locked?.version!=='string'||installed.version!==locked.version||installed.main!=='lib/main.js'||!/^https:\/\/registry\.npmjs\.org\/dotenv\/-\/dotenv-[^/?#]+\.tgz$/.test(locked.resolved||'')||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(locked.integrity||''))failure('PACKAGE_DOCUMENTATION_PROVENANCE_REJECTED');
  const removed=[];
  for(const relative of ['apps/gateway/node_modules/dotenv/README.md','apps/gateway/node_modules/dotenv/README-es.md']){
    const absolute=path.resolve(staging,relative);
    if(!within(staging,absolute)||samePath(staging,absolute))failure('PACKAGE_STAGING_BOUNDARY_REJECTED');
    assertPathAncestors(path.dirname(absolute));
    const stat=fs.lstatSync(absolute);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||!samePath(fs.realpathSync.native(absolute),absolute))failure('PACKAGE_LINK_OR_SPECIAL_FILE_REJECTED');
    const bytes=fs.readFileSync(absolute);
    removed.push({path:relative,size:bytes.length,sha256:hash(bytes)});
  }
  // Verify every target before the first unlink; paths are exact, never a glob.
  for(const row of removed){const absolute=path.join(staging,row.path),stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||!samePath(fs.realpathSync.native(absolute),absolute)||stat.size!==row.size||hash(fs.readFileSync(absolute))!==row.sha256)failure('PACKAGE_DOCUMENTATION_CHANGED');}
  for(const row of removed)fs.unlinkSync(path.join(staging,row.path));
  return {dependency:'dotenv',version:locked.version,lockedIntegrity:locked.integrity,removed};
}
function keysOnly(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');}
export function validateLockedDependencies(lock,manifest) {
  if(lock?.lockfileVersion!==3||!lock.packages||!lock.packages['']||lock.name!==manifest?.name)failure('PACKAGE_LOCK_REJECTED');
  for(const field of ['dependencies','devDependencies','optionalDependencies']){
    const actual=lock.packages[''][field]||{},expected=manifest[field]||{};
    if(JSON.stringify(Object.entries(actual).sort())!==JSON.stringify(Object.entries(expected).sort()))failure('PACKAGE_LOCK_MANIFEST_MISMATCH');
  }
  for(const [name,entry] of Object.entries(lock.packages)){
    if(name==='')continue;
    if(!safePackagePath(name)||!name.startsWith('node_modules/')||entry.link||typeof entry.version!=='string'||!/^https:\/\/registry\.npmjs\.org\/[^\s]+$/.test(entry.resolved||'')||!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity||''))failure('PACKAGE_LOCK_REJECTED');
  }
  return true;
}
function validateManifest(manifest) {
  if(!keysOnly(manifest,['schemaVersion','kind','environment','source','build','locks','entrypoints','externalDependencies','files','sourceFiles'])||manifest.schemaVersion!==1||manifest.kind!=='melisa-crm-test-package'||manifest.environment!=='TEST')failure('PACKAGE_MANIFEST_REJECTED');
  if(!keysOnly(manifest.source,['repository','commit','tree'])||manifest.source.repository!==CRM_SOURCE_ORIGIN||!hex(manifest.source.commit,40)||!hex(manifest.source.tree,40))failure('PACKAGE_SOURCE_REJECTED');
  if(!keysOnly(manifest.build,['viteCrmTest','nodeVersion','platform','arch','dependencyInstall'])||manifest.build.viteCrmTest!==true||!/^v\d+\.\d+\.\d+$/.test(manifest.build.nodeVersion)||!['win32','linux','darwin'].includes(manifest.build.platform)||!['x64','arm64'].includes(manifest.build.arch)||manifest.build.dependencyInstall!=='npm-ci-offline-ignore-scripts')failure('PACKAGE_BUILD_REJECTED');
  if(manifest.build.nodeVersion!==process.version||manifest.build.platform!==process.platform||manifest.build.arch!==process.arch)failure('PACKAGE_TOOLCHAIN_MISMATCH');
  if(!keysOnly(manifest.entrypoints,['supervisor','server'])||manifest.entrypoints.supervisor!=='deploy/test-supervisor.mjs'||manifest.entrypoints.server!=='deploy/test-server.mjs')failure('PACKAGE_ENTRYPOINT_REJECTED');
  if(JSON.stringify(manifest.externalDependencies)!==JSON.stringify(['private-test-configuration','canonical-erp-test-api-root','canonical-erp-test-order-service']))failure('PACKAGE_EXTERNAL_DEPENDENCIES_REJECTED');
  if(!keysOnly(manifest.locks,['gateway','frontend']))failure('PACKAGE_LOCK_REJECTED');
  for(const target of ['gateway','frontend'])if(!keysOnly(manifest.locks[target],['path','sha256'])||manifest.locks[target].path!==`apps/${target}/package-lock.json`||!hex(manifest.locks[target].sha256))failure('PACKAGE_LOCK_REJECTED');
  if(!Array.isArray(manifest.files)||manifest.files.length<runtimeFiles.length||manifest.files.length>100000||!Array.isArray(manifest.sourceFiles))failure('PACKAGE_FILES_REJECTED');
  const names=new Set();let previous='';
  for(const row of manifest.files){
    if(!keysOnly(row,['path','size','sha256'])||!allowedPayloadPath(row.path)||row.path<=previous||names.has(row.path.toLowerCase())||!Number.isSafeInteger(row.size)||row.size<0||!hex(row.sha256))failure('PACKAGE_FILES_REJECTED');
    previous=row.path;names.add(row.path.toLowerCase());
  }
  for(const name of [...runtimeFiles,'apps/frontend/dist/client/index.html','apps/gateway/node_modules/dotenv/lib/main.js'])if(!names.has(name.toLowerCase()))failure('PACKAGE_REQUIRED_FILE_MISSING');
  const sources=new Set();previous='';
  for(const row of manifest.sourceFiles){
    if(!keysOnly(row,['path','gitBlob'])||!allowedSourcePath(row.path)||!hex(row.gitBlob,40)||!names.has(row.path.toLowerCase())||row.path<=previous)failure('PACKAGE_SOURCE_FILES_REJECTED');
    sources.add(row.path);previous=row.path;
  }
  for(const row of manifest.files)if(allowedSourcePath(row.path)&&!sources.has(row.path))failure('PACKAGE_SOURCE_FILES_REJECTED');
  return manifest;
}
export function verifyTestPackage({packageRoot,manifestSha256}) {
  if(!path.isAbsolute(packageRoot||'')||typeof manifestSha256!=='string'||!/^[a-fA-F0-9]{64}$/.test(manifestSha256))failure('PACKAGE_VERIFY_ARGUMENTS_REJECTED');
  manifestSha256=manifestSha256.toLowerCase();
  assertPathAncestors(packageRoot);
  assertWindowsReparse(packageRoot);
  const filename=path.join(packageRoot,TEST_PACKAGE_MANIFEST),stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size>8*1024*1024)failure('PACKAGE_MANIFEST_REJECTED');
  const bytes=fs.readFileSync(filename);if(hash(bytes)!==manifestSha256)failure('PACKAGE_MANIFEST_HASH_MISMATCH');
  let manifest;try{manifest=JSON.parse(bytes.toString('utf8'));}catch{failure('PACKAGE_MANIFEST_REJECTED');}
  validateManifest(manifest);
  const inventory=readInventory(packageRoot,true),payload=inventory.files.filter(row=>row.path!==TEST_PACKAGE_MANIFEST);
  if(JSON.stringify(payload)!==JSON.stringify(manifest.files))failure('PACKAGE_PAYLOAD_MISMATCH');
  const expectedDirs=new Set();for(const row of manifest.files){const parts=row.path.split('/');while(parts.length>1){parts.pop();expectedDirs.add(parts.join('/'));}}
  if(inventory.directories.some(name=>!expectedDirs.has(name)))failure('PACKAGE_UNLISTED_DIRECTORY');
  for(const target of ['gateway','frontend']){
    const lock=manifest.locks[target];if(payload.find(row=>row.path===lock.path)?.sha256!==lock.sha256)failure('PACKAGE_LOCK_HASH_MISMATCH');
    validateLockedDependencies(JSON.parse(fs.readFileSync(path.join(packageRoot,lock.path),'utf8')),JSON.parse(fs.readFileSync(path.join(packageRoot,`apps/${target}/package.json`),'utf8')));
  }
  for(const source of manifest.sourceFiles){const bytes=fs.readFileSync(path.join(packageRoot,source.path));if(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')!==source.gitBlob)failure('PACKAGE_GIT_BLOB_MISMATCH');}
  if(fs.readFileSync(path.join(packageRoot,'deploy/test-erp-catalog.mjs'),'utf8').includes('crmStockWorkerPool.mjs')&&!manifest.sourceFiles.some(row=>row.path===stockPoolPath))failure('PACKAGE_REQUIRED_FILE_MISSING');
  if(fs.readFileSync(path.join(packageRoot,'deploy/test-erp-catalog.mjs'),'utf8').includes('canonicalCatalogReader.mjs')&&canonicalCatalogPaths.some(name=>!manifest.sourceFiles.some(row=>row.path===name)))failure('PACKAGE_REQUIRED_FILE_MISSING');
  return {packageRoot:path.resolve(packageRoot),manifestSha256,sourceCommit:manifest.source.commit,sourceTree:manifest.source.tree,supervisor:manifest.entrypoints.supervisor,environment:'TEST'};
}
function git(repo,args,options={}){return execFileSync('git',['-C',repo,...args],{stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:32*1024*1024,...options});}
export function verifyGitPackageSource(repoRoot,commit){
  if(!path.isAbsolute(repoRoot)||!hex(commit,40))failure('PACKAGE_SOURCE_ARGUMENTS_REJECTED');
  assertPathAncestors(repoRoot);
  if(!samePath(git(repoRoot,['rev-parse','--show-toplevel']).toString().trim(),repoRoot))failure('PACKAGE_REPO_ROOT_REJECTED');
  if(git(repoRoot,['remote','get-url','origin']).toString().trim()!==CRM_SOURCE_ORIGIN||git(repoRoot,['remote','get-url','--push','origin']).toString().trim()!==CRM_SOURCE_ORIGIN)failure('PACKAGE_ORIGIN_REJECTED');
  if(git(repoRoot,['status','--porcelain=v1','--untracked-files=all']).length)failure('PACKAGE_DIRTY_CHECKOUT');
  const branch=git(repoRoot,['branch','--show-current']).toString().trim();if(!branch||branch==='main'||branch==='master')failure('PACKAGE_FEATURE_BRANCH_REQUIRED');
  if(git(repoRoot,['rev-parse','--verify',`${commit}^{commit}`]).toString().trim()!==commit)failure('PACKAGE_COMMIT_REJECTED');
  return git(repoRoot,['rev-parse',`${commit}^{tree}`]).toString().trim();
}
export function selectPackageSource(treeOutput){
  const rows=[];
  for(const entry of treeOutput.toString('utf8').split('\0').filter(Boolean)){
    const match=/^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/.exec(entry);if(!match)failure('PACKAGE_GIT_TREE_REJECTED');
    const [,mode,type,gitBlob,name]=match;
    if(!allowedSourcePath(name))continue;
    if(!['100644','100755'].includes(mode)||type!=='blob')failure('PACKAGE_SOURCE_LINK_REJECTED');
    rows.push({path:name,gitBlob});
  }
  rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const seen=new Set();for(const row of rows){if(seen.has(row.path.toLowerCase()))failure('PACKAGE_SOURCE_CASE_COLLISION');seen.add(row.path.toLowerCase());}
  for(const name of [...runtimeFiles,...buildFiles])if(!rows.some(row=>row.path===name))failure('PACKAGE_SOURCE_REQUIRED_FILE_MISSING');
  return rows;
}
export function offlineBuildEnvironment(staging){
  // Build inputs must not inherit a credential, private dotenv reference or VITE_*.
  const env={};for(const [key,value]of Object.entries(process.env))if(/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|LOCALAPPDATA|APPDATA|USERPROFILE|HOME|HOMEDRIVE|HOMEPATH|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i.test(key))env[key]=value;
  return {...env,VITE_CRM_TEST:'1',NODE_ENV:'production',npm_config_offline:'true',npm_config_ignore_scripts:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_userconfig:path.join(staging,'.npm-user-config'),npm_config_globalconfig:path.join(staging,'.npm-global-config')};
}
export function pinnedNpmCliCandidates(nodeExecutable=process.execPath){
  if(!path.isAbsolute(nodeExecutable))failure('PACKAGE_PINNED_NODE_PATH_REQUIRED');
  const directory=path.dirname(nodeExecutable);
  return [path.join(directory,'node_modules','npm','bin','npm-cli.js'),path.resolve(directory,'..','lib','node_modules','npm','bin','npm-cli.js')];
}
export function resolvePinnedNpmCli(nodeExecutable=process.execPath){
  for(const filename of pinnedNpmCliCandidates(nodeExecutable)){
    if(!fs.existsSync(filename))continue;
    assertPathAncestors(path.dirname(filename));
    const stat=fs.lstatSync(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||!samePath(fs.realpathSync.native(filename),filename))failure('PACKAGE_PINNED_NPM_CLI_REJECTED');
    return filename;
  }
  failure('PACKAGE_PINNED_NPM_CLI_REQUIRED');
}
function npmCi(directory,{production=false,env}){
  // Only the used Node install's bounded Windows/Unix distribution locations.
  // npm's JS CLI avoids cmd.exe quoting and PATH package-script execution.
  const npmPath=resolvePinnedNpmCli();
  try{execFileSync(process.execPath,[npmPath,'ci','--offline','--ignore-scripts','--no-audit','--no-fund','--bin-links=false',...(production?['--omit=dev']:['--include=dev'])],{cwd:directory,env,stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:16*1024*1024});}
  catch{failure('PACKAGE_OFFLINE_DEPENDENCY_INSTALL_FAILED');}
}
export function createTestPackage({repoRoot=canonicalRoot,commit,releasesRoot=path.join(path.dirname(path.resolve(repoRoot)),'releases')}){
  const tree=verifyGitPackageSource(repoRoot,commit);
  if(!path.isAbsolute(releasesRoot)||!samePath(releasesRoot,path.join(path.dirname(path.resolve(repoRoot)),'releases'))||within(repoRoot,releasesRoot))failure('PACKAGE_RELEASE_ROOT_REJECTED');
  assertPathAncestors(path.dirname(releasesRoot));fs.mkdirSync(releasesRoot,{recursive:true});assertPathAncestors(releasesRoot);
  const destination=path.join(releasesRoot,`crm-test-${commit}`),staging=path.join(releasesRoot,`.crm-test-${commit}-${crypto.randomUUID()}.tmp`);
  if(fs.existsSync(destination))failure('PACKAGE_ALREADY_EXISTS');
  fs.mkdirSync(staging);
  try{
    const sourceFiles=selectPackageSource(git(repoRoot,['ls-tree','-r','-z',commit]));
    for(const row of sourceFiles){const bytes=git(repoRoot,['cat-file','blob',row.gitBlob]);assertPublicBytes(row.path,bytes);const absolute=path.join(staging,row.path);fs.mkdirSync(path.dirname(absolute),{recursive:true});fs.writeFileSync(absolute,bytes,{flag:'wx'});}
    const locks={};for(const target of ['gateway','frontend']){const name=`apps/${target}/package-lock.json`;validateLockedDependencies(JSON.parse(fs.readFileSync(path.join(staging,name),'utf8')),JSON.parse(fs.readFileSync(path.join(staging,`apps/${target}/package.json`),'utf8')));locks[target]={path:name,sha256:hash(fs.readFileSync(path.join(staging,name)))};}
    const env=offlineBuildEnvironment(staging);for(const file of [env.npm_config_userconfig,env.npm_config_globalconfig])fs.writeFileSync(file,'',{flag:'wx'});
    npmCi(path.join(staging,'apps/gateway'),{production:true,env});npmCi(path.join(staging,'apps/frontend'),{env});
    try{execFileSync(process.execPath,[path.join(staging,'apps/frontend/node_modules/vite/bin/vite.js'),'build','--configLoader','native'],{cwd:path.join(staging,'apps/frontend'),env,stdio:['ignore','pipe','pipe'],windowsHide:true,maxBuffer:16*1024*1024});}
    catch{failure('PACKAGE_FRONTEND_BUILD_FAILED');}
    // Verified newly-created staging child only; never delete a checkout/runtime.
    const buildDeps=path.join(staging,'apps/frontend/node_modules');assertPathAncestors(buildDeps);assertWindowsReparse(buildDeps);
    if(!within(staging,buildDeps)||samePath(staging,buildDeps))failure('PACKAGE_STAGING_BOUNDARY_REJECTED');
    fs.rmSync(buildDeps,{recursive:true});
    for(const file of [env.npm_config_userconfig,env.npm_config_globalconfig]){if(!within(staging,file)||samePath(staging,file))failure('PACKAGE_STAGING_BOUNDARY_REJECTED');fs.unlinkSync(file);}
    projectLockedRuntimeDocumentation(staging);
    const files=inventoryPackage(staging).files;
    for(const row of files)if(!allowedPayloadPath(row.path))failure('PACKAGE_UNEXPECTED_PAYLOAD');
    const manifest={schemaVersion:1,kind:'melisa-crm-test-package',environment:'TEST',source:{repository:CRM_SOURCE_ORIGIN,commit,tree},build:{viteCrmTest:true,nodeVersion:process.version,platform:process.platform,arch:process.arch,dependencyInstall:'npm-ci-offline-ignore-scripts'},locks,entrypoints:{supervisor:'deploy/test-supervisor.mjs',server:'deploy/test-server.mjs'},externalDependencies:['private-test-configuration','canonical-erp-test-api-root','canonical-erp-test-order-service'],files,sourceFiles};
    const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n'),manifestSha256=hash(manifestBytes);fs.writeFileSync(path.join(staging,TEST_PACKAGE_MANIFEST),manifestBytes,{flag:'wx'});
    verifyGitPackageSource(repoRoot,commit);verifyTestPackage({packageRoot:staging,manifestSha256});
    if(fs.existsSync(destination))failure('PACKAGE_ALREADY_EXISTS');
    for(const row of [...files,{path:TEST_PACKAGE_MANIFEST}])fs.chmodSync(path.join(staging,row.path),0o444);
    fs.renameSync(staging,destination);
    return verifyTestPackage({packageRoot:destination,manifestSha256});
  }catch(error){
    // Failed staging is retained for diagnosis; an existing release is never edited.
    if(error.code&&/^PACKAGE_[A-Z_]+$/.test(error.code))throw error;
    failure('PACKAGE_PREPARATION_FAILED');
  }
}

function main(args){
  const command=args.shift(),options={};
  while(args.length){const name=args.shift(),value=args.shift();if(!name?.startsWith('--')||!value||options[name]!==undefined)failure('PACKAGE_CLI_ARGUMENTS_REJECTED');options[name]=value;}
  if(command==='verify'&&Object.keys(options).sort().join(',')==='--manifest-sha256,--package-root')return verifyTestPackage({packageRoot:options['--package-root'],manifestSha256:options['--manifest-sha256']});
  if(command==='create'&&Object.keys(options).sort().join(',')==='--commit')return createTestPackage({commit:options['--commit']});
  failure('PACKAGE_CLI_ARGUMENTS_REJECTED');
}
if(process.argv[1]&&samePath(process.argv[1],fileURLToPath(import.meta.url))){
  try{process.stdout.write(JSON.stringify(main(process.argv.slice(2)))+'\n');}
  catch(error){process.stderr.write(/^PACKAGE_[A-Z_]+$/.test(error.code||'')?error.code+'\n':'PACKAGE_VERIFICATION_FAILED\n');process.exitCode=1;}
}
