import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {allowedSourcePath,CRM_SOURCE_ORIGIN,inventoryPackage,offlineBuildEnvironment,pinnedNpmCliCandidates,projectLockedRuntimeDocumentation,resolvePinnedNpmCli,safePackagePath,selectPackageSource,TEST_PACKAGE_MANIFEST,validateLockedDependencies,verifyGitPackageSource,verifyTestPackage} from '../deploy/test-package.mjs';

const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const runtime=['package.json','apps/gateway/package.json','apps/gateway/package-lock.json','apps/frontend/package.json','apps/frontend/package-lock.json','deploy/test-supervisor.mjs','deploy/test-server.mjs','deploy/test-erp-catalog.mjs','deploy/test-erp-orders.mjs','deploy/test-erp-read-environment.mjs','packages/contracts/index.mjs','packages/erp-adapter/services/crmCatalogReadSource.mjs','packages/erp-adapter/workers/crmExistingStockReadWorker.mjs'];
const build=['apps/frontend/index.html','apps/frontend/vite.config.mjs','apps/frontend/scripts/prepare-sites-build.mjs','apps/frontend/worker/index.js','apps/frontend/.openai/hosting.json'];
const sort=rows=>rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
const lock=name=>({name,lockfileVersion:3,packages:{'':{name,dependencies:{dotenv:'16.4.7'}},'node_modules/dotenv':{version:'16.4.7',resolved:'https://registry.npmjs.org/dotenv/-/dotenv-16.4.7.tgz',integrity:'sha512-'+Buffer.alloc(64,7).toString('base64')}}});
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'melisa-test-package-fixture-'));
  t.after(()=>{const resolved=fs.realpathSync(root);assert.ok(resolved.startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
  const write=(name,bytes)=>{const full=path.join(root,name);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes);};
  for(const name of [...runtime,...build])write(name,Buffer.from(name.endsWith('.json')?'{}\n':'// synthetic offline package fixture\n'));
  for(const target of ['gateway','frontend']){
    write(`apps/${target}/package.json`,JSON.stringify({name:'synthetic-'+target,dependencies:{dotenv:'16.4.7'}}));write(`apps/${target}/package-lock.json`,JSON.stringify(lock('synthetic-'+target)));
  }
  write('apps/frontend/dist/client/index.html','<html>synthetic TEST build</html>');write('apps/frontend/dist/client/assets/test.js','console.log("synthetic");');write('apps/gateway/node_modules/dotenv/lib/main.js','// synthetic locked dependency fixture');
  const files=inventoryPackage(root).files;
  const manifest={schemaVersion:1,kind:'melisa-crm-test-package',environment:'TEST',source:{repository:CRM_SOURCE_ORIGIN,commit:'a'.repeat(40),tree:'b'.repeat(40)},build:{viteCrmTest:true,nodeVersion:process.version,platform:process.platform,arch:process.arch,dependencyInstall:'npm-ci-offline-ignore-scripts'},locks:Object.fromEntries(['gateway','frontend'].map(target=>[target,{path:`apps/${target}/package-lock.json`,sha256:digest(fs.readFileSync(path.join(root,`apps/${target}/package-lock.json`)))}])),entrypoints:{supervisor:'deploy/test-supervisor.mjs',server:'deploy/test-server.mjs'},externalDependencies:['private-test-configuration','canonical-erp-test-api-root','canonical-erp-test-order-service'],files,sourceFiles:sort([...runtime,...build].map(name=>({path:name,gitBlob:blob(fs.readFileSync(path.join(root,name)))})))};
  let sha;
  const seal=()=>{const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');write(TEST_PACKAGE_MANIFEST,bytes);sha=digest(bytes);return sha;};seal();
  return{root,manifest,write,seal,get sha(){return sha;},verify:()=>verifyTestPackage({packageRoot:root,manifestSha256:sha})};
}
test('complete offline package verifies exact frontend/backend/dependency bytes and exposes only safe metadata',t=>{
  const f=fixture(t),metadata=f.verify();assert.deepEqual(metadata,{packageRoot:f.root,manifestSha256:f.sha,sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),supervisor:'deploy/test-supervisor.mjs',environment:'TEST'});
  assert.deepEqual(verifyTestPackage({packageRoot:f.root,manifestSha256:f.sha.toUpperCase()}),metadata);
  assert.equal(f.manifest.files.some(row=>row.path.includes('node_modules/dotenv')),true);assert.equal(f.manifest.files.some(row=>row.path.includes('/dist/client/')),true);
});

test('stock pool is sealed for new adapters while older rollback packages still verify',t=>{
  const old=fixture(t);assert.equal(old.verify().environment,'TEST');
  const f=fixture(t),adapter='deploy/test-erp-catalog.mjs',pool='packages/erp-adapter/services/crmStockWorkerPool.mjs';
  f.write(adapter,"import {createCrmStockWorkerPool} from '../packages/erp-adapter/services/crmStockWorkerPool.mjs';\n");
  f.manifest.files=inventoryPackage(f.root).files.filter(row=>row.path!==TEST_PACKAGE_MANIFEST);
  f.manifest.sourceFiles.find(row=>row.path===adapter).gitBlob=blob(fs.readFileSync(path.join(f.root,adapter)));f.seal();
  assert.throws(()=>f.verify(),{code:'PACKAGE_REQUIRED_FILE_MISSING'});
  assert.equal(allowedSourcePath(pool),true);f.write(pool,'export const createCrmStockWorkerPool=()=>{};\n');
  f.manifest.files=inventoryPackage(f.root).files.filter(row=>row.path!==TEST_PACKAGE_MANIFEST);
  f.manifest.sourceFiles.push({path:pool,gitBlob:blob(fs.readFileSync(path.join(f.root,pool)))});sort(f.manifest.sourceFiles);f.seal();
  assert.equal(f.verify().environment,'TEST');
});

test('B5 terminal contract is sealed when imported while older rollback packages remain valid',t=>{
  const old=fixture(t);assert.equal(old.verify().environment,'TEST');
  const f=fixture(t),importer='apps/gateway/src/services/crmAuthService.js',contract='packages/contracts/terminal-handoff.mjs';
  f.write(importer,"import {validateTerminalRequest} from '../../../../packages/contracts/terminal-handoff.mjs';\n");
  f.manifest.files=inventoryPackage(f.root).files.filter(row=>row.path!==TEST_PACKAGE_MANIFEST);
  f.manifest.sourceFiles.push({path:importer,gitBlob:blob(fs.readFileSync(path.join(f.root,importer)))});sort(f.manifest.sourceFiles);f.seal();
  assert.throws(()=>f.verify(),{code:'PACKAGE_REQUIRED_FILE_MISSING'});
  assert.equal(allowedSourcePath(contract),true);assert.equal(allowedSourcePath('packages/contracts/unapproved.mjs'),false);
  f.write(contract,'export const validateTerminalRequest=value=>value;\n');
  f.manifest.files=inventoryPackage(f.root).files.filter(row=>row.path!==TEST_PACKAGE_MANIFEST);
  f.manifest.sourceFiles.push({path:contract,gitBlob:blob(fs.readFileSync(path.join(f.root,contract)))});sort(f.manifest.sourceFiles);f.seal();
  assert.equal(f.verify().environment,'TEST');
});

test('B5 clean passive preparation uses the existing fixed clean frontend flags',t=>{
  const f=fixture(t),env=offlineBuildEnvironment(f.root,{isolatedPreparation:true,preparationProfile:'clean-synthetic-20261022'});
  assert.equal(env.VITE_CRM_TEST,'1');assert.equal(env.VITE_CRM_ISOLATED_PREPARATION,'1');
  assert.equal(env.VITE_CRM_CLEAN_SYNTHETIC_TEST,'1');assert.equal(env.VITE_ERP_ORDER_TEST_DATABASE,'MELISA_ERP_CLEAN_TEST_20261022');
  assert.equal(env.npm_config_offline,'true');assert.equal(env.npm_config_ignore_scripts,'true');
  assert.throws(()=>offlineBuildEnvironment(f.root,{preparationProfile:'clean-synthetic-20261022'}),{code:'PACKAGE_BUILD_PROFILE_REJECTED'});
  assert.throws(()=>offlineBuildEnvironment(f.root,{isolatedPreparation:true,preparationProfile:'unapproved'}),{code:'PACKAGE_BUILD_PROFILE_REJECTED'});
});

test('B5 clean passive manifest binds the explicit profile without changing older packages',t=>{
  const f=fixture(t);f.manifest.build.isolatedPreparation=true;f.manifest.build.preparationProfile='clean-synthetic-20261022';f.seal();
  assert.equal(f.verify().environment,'TEST');
  f.manifest.build.preparationProfile='unapproved';f.seal();assert.throws(()=>f.verify(),{code:'PACKAGE_BUILD_REJECTED'});
  f.manifest.build.preparationProfile='clean-synthetic-20261022';delete f.manifest.build.isolatedPreparation;f.seal();assert.throws(()=>f.verify(),{code:'PACKAGE_BUILD_REJECTED'});
});
test('changed backend, frontend or dependency byte, same-size edit, missing file and unlisted file all fail verification',t=>{
  for(const change of ['apps/gateway/package.json','apps/frontend/dist/client/assets/test.js','apps/gateway/node_modules/dotenv/lib/main.js']){
    const f=fixture(t),file=path.join(f.root,change),bytes=fs.readFileSync(file);bytes[0]=bytes[0]===65?66:65;fs.writeFileSync(file,bytes);assert.throws(()=>f.verify(),{code:'PACKAGE_PAYLOAD_MISMATCH'});
  }
  const missing=fixture(t);fs.unlinkSync(path.join(missing.root,'deploy/test-server.mjs'));assert.throws(()=>missing.verify(),{code:'PACKAGE_PAYLOAD_MISMATCH'});
  const extra=fixture(t);extra.write('apps/gateway/node_modules/dotenv/untracked.txt','unlisted');assert.throws(()=>extra.verify(),{code:'PACKAGE_PAYLOAD_MISMATCH'});
});
test('manifest tampering or wrong external pin fails before trusting payload metadata',t=>{
  const f=fixture(t);assert.throws(()=>verifyTestPackage({packageRoot:f.root,manifestSha256:'c'.repeat(64)}),{code:'PACKAGE_MANIFEST_HASH_MISMATCH'});
  f.manifest.source.commit='short';f.seal();assert.throws(()=>f.verify(),{code:'PACKAGE_SOURCE_REJECTED'});
  f.manifest.source.commit='a'.repeat(40);f.manifest.environment='LIVE';f.seal();assert.throws(()=>f.verify(),{code:'PACKAGE_MANIFEST_REJECTED'});
});
test('path traversal, case collisions, unknown metadata and absent execution entrypoints are rejected',t=>{
  for(const bad of ['../private','/absolute','C:/private','apps\\gateway\\src\\a.js','apps/gateway/src/../a.js','apps/gateway/src/CON.js','apps/gateway/src/file.js.'])assert.equal(safePackagePath(bad),false);
  for(const mutate of [m=>m.files[0].path='../outside',m=>m.files.push({...m.files[0]}),m=>m.files[0].token='private',m=>m.entrypoints.supervisor='deploy/unknown.mjs',m=>m.sourceFiles[0].gitBlob='bad']){
    const f=fixture(t);mutate(f.manifest);f.seal();assert.throws(()=>f.verify());
  }
});
test('private files and high-confidence credentials cannot be sealed even if a manifest were repinned',t=>{
  const f=fixture(t);f.write('apps/gateway/node_modules/dotenv/.env','synthetic');assert.throws(()=>inventoryPackage(f.root),{code:'PACKAGE_PRIVATE_FILE_REJECTED'});
  fs.unlinkSync(path.join(f.root,'apps/gateway/node_modules/dotenv/.env'));f.write('apps/gateway/src/secret.js',"const example='ghp_"+'x'.repeat(36)+"';");assert.throws(()=>inventoryPackage(f.root),{code:'PACKAGE_SECRET_CONTENT_REJECTED'});
});
test('directory reparse/junctions and hardlinked payload files are rejected without following external content',t=>{
  const f=fixture(t),outside=fs.mkdtempSync(path.join(os.tmpdir(),'melisa-package-external-fixture-'));
  t.after(()=>{assert.ok(fs.realpathSync(outside).startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(outside,{recursive:true,force:true});});
  fs.writeFileSync(path.join(outside,'safe.txt'),'synthetic outside bytes');
  const junction=path.join(f.root,'apps/gateway/node_modules/external');fs.symlinkSync(outside,junction,process.platform==='win32'?'junction':'dir');assert.throws(()=>f.verify(),{code:'PACKAGE_REPARSE_REJECTED'});fs.unlinkSync(junction);
  fs.linkSync(path.join(outside,'safe.txt'),path.join(f.root,'apps/gateway/node_modules/dotenv/linked.txt'));assert.throws(()=>f.verify(),{code:'PACKAGE_LINK_OR_SPECIAL_FILE_REJECTED'});
});
test('empty unlisted directory is rejected and source blobs cannot be repinned to edited payload bytes',t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.root,'empty'));assert.throws(()=>f.verify(),{code:'PACKAGE_UNLISTED_DIRECTORY'});fs.rmdirSync(path.join(f.root,'empty'));
  const name='deploy/test-server.mjs';f.write(name,'// edited but unapproved source');f.manifest.files.find(row=>row.path===name).size=fs.statSync(path.join(f.root,name)).size;f.manifest.files.find(row=>row.path===name).sha256=digest(fs.readFileSync(path.join(f.root,name)));f.seal();assert.throws(()=>f.verify(),{code:'PACKAGE_GIT_BLOB_MISMATCH'});
});
test('locked dependencies reject lifecycle-independent local/link/custom registry or mismatched manifests',()=>{
  const manifest={name:'synthetic',dependencies:{dotenv:'16.4.7'}};assert.equal(validateLockedDependencies(lock('synthetic'),manifest),true);
  for(const mutate of [l=>l.lockfileVersion=2,l=>l.packages[''].dependencies.dotenv='changed',l=>l.packages['node_modules/dotenv'].link=true,l=>l.packages['node_modules/dotenv'].resolved='file:private',l=>l.packages['node_modules/dotenv'].resolved='https://example.test/module.tgz',l=>delete l.packages['node_modules/dotenv'].integrity]){const value=lock('synthetic');mutate(value);assert.throws(()=>validateLockedDependencies(value,manifest));}
});
test('Git source selection excludes private/untracked scope and rejects symlink/submodule executable source',t=>{
  const f=fixture(t);const entries=f.manifest.sourceFiles.map(row=>`100644 blob ${row.gitBlob}\t${row.path}`);
  const tree=extra=>Buffer.from([...entries,...extra].join('\0')+'\0');const selected=selectPackageSource(tree([`100644 blob ${'d'.repeat(40)}\t.env`,`100644 blob ${'d'.repeat(40)}\tCRM_STATUS.md`,`100644 blob ${'d'.repeat(40)}\tapps/gateway/src/private.test.js`]));
  assert.equal(selected.length,f.manifest.sourceFiles.length);assert.equal(allowedSourcePath('.env'),false);assert.equal(allowedSourcePath('runtime/ai-sales-rules.json'),false);assert.equal(allowedSourcePath('apps/gateway/src/routes/conversationRoutes.js'),true);
  assert.equal(allowedSourcePath('deploy/test-package.mjs'),true);const optional=selectPackageSource(tree([`100644 blob ${'d'.repeat(40)}\tdeploy/test-package.mjs`]));assert.equal(optional.length,selected.length+1);
  for(const kind of ['120000 blob','160000 commit'])assert.throws(()=>selectPackageSource(tree([`${kind} ${'d'.repeat(40)}\tapps/gateway/src/linked.js`])),{code:'PACKAGE_SOURCE_LINK_REJECTED'});
});
test('verify CLI emits safe JSON only on success and exposes no paths or raw errors on failure',t=>{
  const f=fixture(t),script=fileURLToPath(new URL('../deploy/test-package.mjs',import.meta.url));
  const good=spawnSync(process.execPath,[script,'verify','--package-root',f.root,'--manifest-sha256',f.sha],{encoding:'utf8',windowsHide:true});assert.equal(good.status,0);assert.equal(JSON.parse(good.stdout).sourceCommit,'a'.repeat(40));assert.equal(good.stderr,'');
  const bad=spawnSync(process.execPath,[script,'verify','--package-root',f.root,'--manifest-sha256','c'.repeat(64)],{encoding:'utf8',windowsHide:true});assert.equal(bad.status,1);assert.equal(bad.stdout,'');assert.equal(bad.stderr.trim(),'PACKAGE_MANIFEST_HASH_MISMATCH');assert.equal(bad.stderr.includes(f.root),false);
});
test('actual npm config initializes from separate empty config files with offline/scripts guards and no private build variables',t=>{
  const f=fixture(t);process.env.CRM_BASELINE_ENV='synthetic-private-path';process.env.VITE_PRIVATE_TEST_KEY='synthetic-private-value';process.env.OPENAI_API_KEY='synthetic';
  t.after(()=>{delete process.env.CRM_BASELINE_ENV;delete process.env.VITE_PRIVATE_TEST_KEY;delete process.env.OPENAI_API_KEY;});
  const env=offlineBuildEnvironment(f.root);assert.notEqual(env.npm_config_userconfig,env.npm_config_globalconfig);assert.equal(env.CRM_BASELINE_ENV,undefined);assert.equal(env.VITE_PRIVATE_TEST_KEY,undefined);assert.equal(env.OPENAI_API_KEY,undefined);assert.equal(env.VITE_CRM_TEST,'1');assert.equal(env.npm_config_ignore_scripts,'true');
  fs.writeFileSync(env.npm_config_userconfig,'');fs.writeFileSync(env.npm_config_globalconfig,'');
  const cli=resolvePinnedNpmCli();assert.ok(fs.existsSync(cli));
  const result=spawnSync(process.execPath,[cli,'config','get','offline'],{cwd:f.root,env,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'true');
});
test('npm resolver uses only bounded Node-prefix Windows/Unix candidates and rejects a linked CLI',t=>{
  const f=fixture(t),node=path.join(f.root,'node-prefix','bin',process.platform==='win32'?'node.exe':'node');fs.mkdirSync(path.dirname(node),{recursive:true});fs.writeFileSync(node,'synthetic executable identity');
  const [windows,unix]=pinnedNpmCliCandidates(node);assert.equal(windows,path.join(path.dirname(node),'node_modules/npm/bin/npm-cli.js'));assert.equal(unix,path.join(f.root,'node-prefix/lib/node_modules/npm/bin/npm-cli.js'));
  assert.throws(()=>resolvePinnedNpmCli(node),{code:'PACKAGE_PINNED_NPM_CLI_REQUIRED'});
  fs.mkdirSync(path.dirname(unix),{recursive:true});fs.writeFileSync(unix,'// synthetic Unix distribution CLI');assert.equal(resolvePinnedNpmCli(node),unix);
  fs.mkdirSync(path.dirname(windows),{recursive:true});fs.writeFileSync(windows,'// synthetic Windows distribution CLI');assert.equal(resolvePinnedNpmCli(node),windows);
  const linked=path.join(f.root,'extra-link.js');fs.linkSync(windows,linked);assert.throws(()=>resolvePinnedNpmCli(node),{code:'PACKAGE_PINNED_NPM_CLI_REJECTED'});
});
test('isolated Git fixture enforces exact source origin, full commit, feature branch and no dirty/untracked source',t=>{
  const f=fixture(t),git=args=>execFileSync('git',['-C',f.root,...args],{stdio:['ignore','pipe','pipe'],windowsHide:true}).toString().trim();
  git(['init','-b','feature/offline-package-fixture']);git(['remote','add','origin',CRM_SOURCE_ORIGIN]);git(['add','.']);git(['-c','commit.gpgsign=false','-c','user.name=Offline Fixture','-c','user.email=offline-fixture@example.invalid','commit','-m','Synthetic offline package fixture']);
  const commit=git(['rev-parse','HEAD']),tree=git(['rev-parse','HEAD^{tree}']);assert.equal(verifyGitPackageSource(f.root,commit),tree);
  assert.throws(()=>verifyGitPackageSource(f.root,commit.slice(0,7)),{code:'PACKAGE_SOURCE_ARGUMENTS_REJECTED'});
  git(['remote','set-url','origin','https://example.invalid/wrong.git']);assert.throws(()=>verifyGitPackageSource(f.root,commit),{code:'PACKAGE_ORIGIN_REJECTED'});git(['remote','set-url','origin',CRM_SOURCE_ORIGIN]);
  f.write('untracked-private.txt','synthetic only');assert.throws(()=>verifyGitPackageSource(f.root,commit),{code:'PACKAGE_DIRTY_CHECKOUT'});fs.unlinkSync(path.join(f.root,'untracked-private.txt'));
  git(['checkout','--detach',commit]);assert.throws(()=>verifyGitPackageSource(f.root,commit),{code:'PACKAGE_FEATURE_BRANCH_REQUIRED'});
});
function documentationFixture(t){
  const f=fixture(t),packageName='apps/gateway/node_modules/dotenv/';
  f.write(packageName+'package.json',JSON.stringify({name:'dotenv',version:'16.4.7',main:'lib/main.js'}));f.write(packageName+'LICENSE','Synthetic public license');
  const example='```env\nPRIVATE_KEY="-----BEGIN '+'RSA PRIVATE KEY-----\n...\n-----END '+'RSA PRIVATE KEY-----"\n```';
  for(const name of ['README.md','README-es.md'])f.write(packageName+name,example);
  return{...f,packageName,example};
}
test('runtime projection removes only two locked dotenv distribution docs while keeping lock, package, license and runtime bytes',t=>{
  const f=documentationFixture(t),keep=['apps/gateway/package-lock.json',f.packageName+'package.json',f.packageName+'LICENSE',f.packageName+'lib/main.js'];
  const before=keep.map(name=>digest(fs.readFileSync(path.join(f.root,name))));assert.throws(()=>inventoryPackage(f.root),{code:'PACKAGE_SECRET_CONTENT_REJECTED'});
  const report=projectLockedRuntimeDocumentation(f.root);assert.equal(report.version,'16.4.7');assert.equal(report.dependency,'dotenv');assert.deepEqual(report.removed.map(row=>row.path),[f.packageName+'README.md',f.packageName+'README-es.md']);assert.ok(report.removed.every(row=>row.sha256===digest(f.example)&&row.size===Buffer.byteLength(f.example)));
  assert.deepEqual(keep.map(name=>digest(fs.readFileSync(path.join(f.root,name)))),before);assert.equal(inventoryPackage(f.root).files.some(row=>row.path===f.packageName+'README.md'),false);
  f.write(f.packageName+'README.md',f.example);assert.throws(()=>inventoryPackage(f.root),{code:'PACKAGE_SECRET_CONTENT_REJECTED'});
});
test('projection leaves other dependency docs and runtime key examples subject to the same strict scanner',t=>{
  for(const name of ['apps/gateway/node_modules/other/README.md','apps/gateway/node_modules/dotenv/lib/key-example.js']){
    const f=documentationFixture(t);f.write(name,f.example);projectLockedRuntimeDocumentation(f.root);assert.equal(fs.existsSync(path.join(f.root,name)),true);assert.throws(()=>inventoryPackage(f.root),{code:'PACKAGE_SECRET_CONTENT_REJECTED'});
  }
});
test('documentation projection rejects changed package provenance and hardlinked target before deleting either file',t=>{
  const f=documentationFixture(t);f.write(f.packageName+'package.json',JSON.stringify({name:'dotenv',version:'other',main:'lib/main.js'}));assert.throws(()=>projectLockedRuntimeDocumentation(f.root),{code:'PACKAGE_DOCUMENTATION_PROVENANCE_REJECTED'});assert.equal(fs.existsSync(path.join(f.root,f.packageName+'README.md')),true);
  f.write(f.packageName+'package.json',JSON.stringify({name:'dotenv',version:'16.4.7',main:'lib/main.js'}));fs.linkSync(path.join(f.root,f.packageName+'README-es.md'),path.join(f.root,'linked-doc.md'));assert.throws(()=>projectLockedRuntimeDocumentation(f.root),{code:'PACKAGE_LINK_OR_SPECIAL_FILE_REJECTED'});assert.equal(fs.existsSync(path.join(f.root,f.packageName+'README.md')),true);assert.equal(fs.existsSync(path.join(f.root,f.packageName+'README-es.md')),true);
});
