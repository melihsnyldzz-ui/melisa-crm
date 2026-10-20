import './offline-test-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {verifyTestPackage} from '../deploy/test-package.mjs';

const commit='439b63db8376a6b9d3ac8baa625ed98367022623';
const tree='0e58a21cdb2f20015ee8ac5db4ddb285bb3f3f5e';
const repoRoot='C:\\Sirket\\CRM\\melisa-crm';
const releasesRoot='C:\\Sirket\\CRM\\releases\\node-v24.19.0';
const executable='C:\\Sirket\\ERP\\tools\\node-v24.19.0\\node.exe';
const nodeSha256='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237';
const locks={gateway:'c487dc65e3a107f5235408fad3523c8242a4c01b62c7475154ad4ae41a627b96',frontend:'9064a36a0c86464db93cc261ffedbc92a87ea2092315e207301ca8a8aa6d4d24'};
const profile='crm18-node-v24.19.0';
const october20={profile:'crm20261020-node-v24.19.0',commit:'7ba6e4ebc8b70019136d603e6307741189ba03c1',tree:'db824c8a10b030faee6ea84a69cbb3cf86d7293a'};
const production=fs.readFileSync(new URL('../deploy/test-package.mjs',import.meta.url),'utf8');
const equal=(a,b)=>path.win32.resolve(a).toLowerCase()===path.win32.resolve(b).toLowerCase();

function fixture(change={},selected={commit,tree,profile}){
  const observed={platform:'win32',arch:'x64',version:'v24.19.0',execPath:executable,nodeSha256,tree:selected.tree,locks:{...locks},hardlinks:1,reparse:false,existing:false,...change};
  const calls={writes:[],nodeReads:0,lockReads:[],destinations:[]};
  // Run the actual builder up to its staging boundary with entirely synthetic
  // process, Git, digests and filesystem. No Node distribution/build/service is
  // started; these observations are never injectable into the production API.
  const mockFs={
    lstatSync(filename){const isNode=equal(filename,observed.execPath);return {isDirectory:()=>!isNode,isFile:()=>isNode,isSymbolicLink:()=>isNode&&Boolean(observed.binarySymlink),nlink:isNode?observed.hardlinks:1};},
    realpathSync:{native:filename=>observed.reparse&&equal(filename,path.win32.dirname(executable))||observed.binaryReparse&&equal(filename,observed.execPath)?filename+'-redirect':path.win32.resolve(filename)},
    readFileSync(filename){assert(equal(filename,observed.execPath));calls.nodeReads++;return Buffer.from('synthetic-node');},
    mkdirSync(filename){calls.writes.push(filename);if(path.win32.basename(filename).startsWith('.crm-shared-test-'))throw Object.assign(new Error('fixture staging boundary'),{code:'FIXTURE_STAGING_BOUNDARY'});},
    existsSync(filename){calls.destinations.push(filename);return observed.existing;},
  };
  const mockCrypto={...crypto,createHash(algorithm){const chunks=[];return {update(value){chunks.push(Buffer.isBuffer(value)?value:Buffer.from(value));return this;},digest(encoding){const bytes=Buffer.concat(chunks),value=bytes.toString();if(algorithm==='sha256'&&value==='synthetic-node')return observed.nodeSha256;for(const target of ['gateway','frontend'])if(algorithm==='sha256'&&value==='synthetic-lock-'+target)return observed.locks[target];return crypto.createHash(algorithm).update(bytes).digest(encoding);}};}};
  const mockGit=(command,args)=>{
    assert.equal(command,'git');const task=args.slice(2);
    if(task.join(' ')==='rev-parse --show-toplevel')return Buffer.from(args[1]);
    if(task[0]==='remote')return Buffer.from('https://github.com/melihsnyldzz-ui/melisa-crm.git');
    if(task[0]==='status')return Buffer.alloc(0);
    if(task.join(' ')==='branch --show-current')return Buffer.from('feature/synthetic-package-test');
    if(task[0]==='rev-parse'&&task[1]==='--verify')return Buffer.from(task[2].split('^')[0]);
    if(task[0]==='rev-parse'&&task[1].endsWith('^{tree}'))return Buffer.from(observed.tree);
    if(task[0]==='show'){const target=task[1].includes('/gateway/')?'gateway':'frontend';calls.lockReads.push(target);return Buffer.from('synthetic-lock-'+target);}
    throw Error('Unexpected fixture operation: '+task.join(' '));
  };
  const source=production.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')
    .replace(/^const canonicalRoot = .*;$/m,'const canonicalRoot = '+JSON.stringify(repoRoot)+';')
    .split('if(process.argv[1]&&samePath')[0];
  assert.equal(source.includes('import.meta'),false);
  const context={fs:mockFs,path:path.win32,crypto:mockCrypto,execFileSync:mockGit,process:{platform:observed.platform,arch:observed.arch,version:observed.version,execPath:observed.execPath,env:{},argv:[]},Buffer};
  vm.runInNewContext(source+'\nglobalThis.fixtureBuilder={createTestPackage,main};',context);
  return {calls,run:options=>context.fixtureBuilder.createTestPackage({repoRoot,commit:selected.commit,releasesRoot,isolatedPreparation:true,preparationProfile:selected.profile,...options}),main:context.fixtureBuilder.main};
}

test('closed Node24.19 profile reaches only the approved immutable staging boundary',()=>{
  const f=fixture();assert.throws(()=>f.run(),{code:'FIXTURE_STAGING_BOUNDARY'});
  assert.equal(f.calls.writes[0],releasesRoot);assert.equal(path.win32.dirname(f.calls.writes[1]),releasesRoot);
  assert.match(path.win32.basename(f.calls.writes[1]),new RegExp('^\\.crm-shared-test-'+commit+'-[0-9a-f-]+\\.tmp$'));
  assert.equal(f.calls.destinations[0],path.win32.join(releasesRoot,'crm-shared-test-'+commit));
  assert.equal(f.calls.nodeReads,1);assert.deepEqual(f.calls.lockReads.sort(),['frontend','gateway']);
});

test('closed profile can select its exact root without a caller-supplied path',()=>{
  const f=fixture();assert.throws(()=>f.run({releasesRoot:undefined}),{code:'FIXTURE_STAGING_BOUNDARY'});assert.equal(f.calls.writes[0],releasesRoot);
});

for(const [name,change]of Object.entries({platform:{platform:'linux'},architecture:{arch:'arm64'},version:{version:'v24.15.0'},binaryPath:{execPath:'C:\\Other\\node.exe'},binaryDigest:{nodeSha256:'0'.repeat(64)},sourceTree:{tree:'0'.repeat(40)},gatewayLock:{locks:{...locks,gateway:'0'.repeat(64)}},frontendLock:{locks:{...locks,frontend:'0'.repeat(64)}},hardlinkedBinary:{hardlinks:2}}))test('closed profile rejects '+name+' before any write',()=>{
  const f=fixture(change);assert.throws(()=>f.run(),{code:'PACKAGE_NODE2419_PROFILE_REJECTED'});assert.deepEqual(f.calls.writes,[]);
});

for(const [name,options]of Object.entries({otherSource:{commit:'a'.repeat(40)},otherRepo:{repoRoot:'C:\\Other\\crm'},otherRoot:{releasesRoot:'C:\\Other\\release'},baseRoot:{releasesRoot:'C:\\Sirket\\CRM\\releases'},otherVersionRoot:{releasesRoot:'C:\\Sirket\\CRM\\releases\\node-v24.20.0'},nestedRoot:{releasesRoot:releasesRoot+'\\extra'},nullRoot:{releasesRoot:null},notIsolated:{isolatedPreparation:false}}))test('closed profile rejects '+name+' request before any write',()=>{
  const f=fixture();assert.throws(()=>f.run(options),{code:'PACKAGE_NODE2419_PROFILE_REJECTED'});assert.deepEqual(f.calls.writes,[]);
});

test('closed profile rejects a reparse ancestor and refuses an existing immutable candidate',()=>{
  const link=fixture({reparse:true});assert.throws(()=>link.run(),{code:'PACKAGE_REPARSE_REJECTED'});assert.deepEqual(link.calls.writes,[]);
  const existing=fixture({existing:true});assert.throws(()=>existing.run(),{code:'PACKAGE_ALREADY_EXISTS'});assert.equal(existing.calls.writes.length,1);assert.equal(existing.calls.writes[0],releasesRoot);
});

test('unknown profiles and generic roots remain unavailable to API and CLI',()=>{
  const unknown=fixture();assert.throws(()=>unknown.run({preparationProfile:'any-node-version'}),{code:'PACKAGE_BUILD_PROFILE_REJECTED'});assert.deepEqual(unknown.calls.writes,[]);
  const standard=fixture();assert.throws(()=>standard.run({preparationProfile:undefined}),{code:'PACKAGE_RELEASE_ROOT_REJECTED'});assert.deepEqual(standard.calls.writes,[]);
  assert.throws(()=>standard.main(['create','--commit',commit,'--root',releasesRoot]),{code:'PACKAGE_CLI_ARGUMENTS_REJECTED'});
});

test('legacy default destination is unchanged; no variant suffix is added to its basename',()=>{
  const f=fixture();assert.throws(()=>f.run({preparationProfile:undefined,releasesRoot:undefined}),{code:'FIXTURE_STAGING_BOUNDARY'});
  const base='C:\\Sirket\\CRM\\releases';assert.equal(f.calls.writes[0],base);assert.equal(f.calls.destinations[0],path.win32.join(base,'crm-shared-test-'+commit));assert.equal(f.calls.nodeReads,0);assert.deepEqual(f.calls.lockReads,[]);
});

test('the actual package verifier still rejects another Node version before payload acceptance',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'crm-node2419-verifier-'));
  t.after(()=>{const absolute=fs.realpathSync(directory);assert(absolute.startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(absolute,{recursive:true,force:true});});
  const manifest={schemaVersion:1,kind:'melisa-crm-test-package',environment:'TEST',source:{repository:'https://github.com/melihsnyldzz-ui/melisa-crm.git',commit,tree},build:{viteCrmTest:true,nodeVersion:process.version==='v24.19.0'?'v24.15.0':'v24.19.0',platform:process.platform,arch:process.arch,dependencyInstall:'npm-ci-offline-ignore-scripts'},locks:{},entrypoints:{},externalDependencies:[],files:[],sourceFiles:[]};
  const bytes=Buffer.from(JSON.stringify(manifest));fs.writeFileSync(path.join(directory,'release-manifest.json'),bytes);
  assert.throws(()=>verifyTestPackage({packageRoot:directory,manifestSha256:crypto.createHash('sha256').update(bytes).digest('hex')}),{code:'PACKAGE_TOOLCHAIN_MISMATCH'});
});

test('20 October exact profile reaches only its pinned application staging boundary',()=>{
  const f=fixture({},october20);assert.throws(()=>f.run(),{code:'FIXTURE_STAGING_BOUNDARY'});
  assert.equal(f.calls.writes[0],releasesRoot);assert.equal(path.win32.dirname(f.calls.writes[1]),releasesRoot);
  assert.match(path.win32.basename(f.calls.writes[1]),new RegExp('^\\.crm-shared-test-'+october20.commit+'-[0-9a-f-]+\\.tmp$'));
  assert.equal(f.calls.destinations[0],path.win32.join(releasesRoot,'crm-shared-test-'+october20.commit));
  assert.equal(f.calls.nodeReads,1);assert.deepEqual(f.calls.lockReads.sort(),['frontend','gateway']);
});

test('20 October exact profile can select only its literal root when no root is supplied',()=>{
  const f=fixture({},october20);assert.throws(()=>f.run({releasesRoot:undefined}),{code:'FIXTURE_STAGING_BOUNDARY'});assert.equal(f.calls.writes[0],releasesRoot);
});

for(const [name,change]of Object.entries({platform:{platform:'linux'},architecture:{arch:'arm64'},version:{version:'v24.15.0'},binaryPath:{execPath:'C:\\Other\\node.exe'},binaryDigest:{nodeSha256:'0'.repeat(64)},sourceTree:{tree:'0'.repeat(40)},legacyTree:{tree},gatewayLock:{locks:{...locks,gateway:'0'.repeat(64)}},frontendLock:{locks:{...locks,frontend:'0'.repeat(64)}},hardlinkedBinary:{hardlinks:2},symlinkedBinary:{binarySymlink:true},redirectedBinary:{binaryReparse:true}}))test('20 October exact profile rejects '+name+' before any write',()=>{
  const f=fixture(change,october20);assert.throws(()=>f.run(),{code:'PACKAGE_NODE2419_PROFILE_REJECTED'});assert.deepEqual(f.calls.writes,[]);
});

for(const [name,options]of Object.entries({otherSource:{commit:'a'.repeat(40)},legacySource:{commit},otherRepo:{repoRoot:'C:\\Other\\crm'},otherRoot:{releasesRoot:'C:\\Other\\release'},baseRoot:{releasesRoot:'C:\\Sirket\\CRM\\releases'},otherVersionRoot:{releasesRoot:'C:\\Sirket\\CRM\\releases\\node-v24.20.0'},nestedRoot:{releasesRoot:releasesRoot+'\\extra'},relativeRoot:{releasesRoot:'releases\\node-v24.19.0'},nullRoot:{releasesRoot:null},notIsolated:{isolatedPreparation:false},omittedIsolation:{isolatedPreparation:undefined}}))test('20 October exact profile rejects '+name+' request before any write',()=>{
  const f=fixture({},october20);assert.throws(()=>f.run(options),{code:'PACKAGE_NODE2419_PROFILE_REJECTED'});assert.deepEqual(f.calls.writes,[]);
});

test('20 October profile and legacy profile cannot accept each other source tuples',()=>{
  const current=fixture({tree},october20);assert.throws(()=>current.run({commit}),{code:'PACKAGE_NODE2419_PROFILE_REJECTED'});assert.deepEqual(current.calls.writes,[]);
  const legacy=fixture({tree:october20.tree});assert.throws(()=>legacy.run({commit:october20.commit}),{code:'PACKAGE_NODE2419_PROFILE_REJECTED'});assert.deepEqual(legacy.calls.writes,[]);
});

test('20 October exact profile keeps reparse and immutable destination refusals',()=>{
  const link=fixture({reparse:true},october20);assert.throws(()=>link.run(),{code:'PACKAGE_REPARSE_REJECTED'});assert.deepEqual(link.calls.writes,[]);
  const existing=fixture({existing:true},october20);assert.throws(()=>existing.run(),{code:'PACKAGE_ALREADY_EXISTS'});assert.deepEqual(existing.calls.writes,[releasesRoot]);
});

test('20 October profile leaves the generic destination and closed CLI unchanged',()=>{
  const f=fixture({},october20);assert.throws(()=>f.run({preparationProfile:undefined,releasesRoot:undefined}),{code:'FIXTURE_STAGING_BOUNDARY'});
  const base='C:\\Sirket\\CRM\\releases';assert.equal(f.calls.writes[0],base);assert.equal(f.calls.destinations[0],path.win32.join(base,'crm-shared-test-'+october20.commit));assert.equal(f.calls.nodeReads,0);assert.deepEqual(f.calls.lockReads,[]);
  const noProfile=fixture({},october20);assert.throws(()=>noProfile.run({preparationProfile:undefined}),{code:'PACKAGE_RELEASE_ROOT_REJECTED'});assert.deepEqual(noProfile.calls.writes,[]);
  assert.throws(()=>f.main(['create','--commit',october20.commit,'--preparation-profile',october20.profile]),{code:'PACKAGE_CLI_ARGUMENTS_REJECTED'});
  const invalid=fixture({},october20);assert.throws(()=>invalid.run({isolatedPreparation:'true'}),{code:'PACKAGE_BUILD_PROFILE_REJECTED'});assert.deepEqual(invalid.calls.writes,[]);
});
