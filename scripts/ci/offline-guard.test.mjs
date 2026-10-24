import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import dgram from 'node:dgram';
import dotenv from '../../apps/gateway/node_modules/dotenv/lib/main.js';
import { cleanEnvironment } from './environment.mjs';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

test('CI environment excludes application credentials and frontend build overrides', () => {
  assert.deepEqual(cleanEnvironment({ PATH: 'tools', SQL_PASSWORD: 'synthetic', VITE_API_URL: 'fixture',
    GH_TOKEN: 'synthetic', WAAPI_API_TOKEN: 'synthetic', NODE_OPTIONS: 'unapproved', PORT: '4200' }), { PATH: 'tools' });
});
test('dotenv cannot load a local file or populate the environment during CI', () => {
  assert.deepEqual(dotenv.config({ path: 'must-not-read.env' }), { parsed: {} });
  dotenv.populate(process.env, { CI_GUARD_SYNTHETIC: 'must-not-load' });
  assert.equal(process.env.CI_GUARD_SYNTHETIC, undefined);
});
test('CI rejects external requests, unregistered loopback sockets and fixed listeners', () => {
  assert.throws(() => fetch('https://fixture.example/'), /guard rejected/);
  const socket = new net.Socket();
  assert.throws(() => socket.connect(5432, '127.0.0.1'), /guard rejected/);
  socket.destroy();
  const server = net.createServer();
  assert.throws(() => server.listen(4200, '127.0.0.1'), /guard rejected/);
  assert.throws(() => dgram.createSocket('udp4'), /guard rejected/);
});

test('B5 explicit clean frontend profile survives the real guarded Vite build', {timeout:120000}, async t => {
  const script = fileURLToPath(new URL('./build-frontend.mjs', import.meta.url));
  const guard = new URL('./offline-guard.mjs', import.meta.url).href;
  const expected = {VITE_CRM_TEST:'1',VITE_CRM_ISOLATED_PREPARATION:'1',VITE_CRM_CLEAN_SYNTHETIC_TEST:'1',VITE_ERP_ORDER_TEST_DATABASE:'MELISA_ERP_CLEAN_TEST_20261022'};
  function realBuild(args, preload, check) {
    const parent = path.resolve(tmpdir());
    const directory = mkdtempSync(path.join(parent,'crm-build-profile-'));
    try {
      writeFileSync(path.join(directory,'index.html'),'<script type="module" src="/entry.js"></script>');
      writeFileSync(path.join(directory,'entry.js'),'globalThis.profile = {...import.meta.env, unsafeCredentialPresent:__B5_LEAKED_TOKEN__};');
      writeFileSync(path.join(directory,'vite.config.mjs'),'export default {build:{modulePreload:false,minify:false},define:{__B5_LEAKED_TOKEN__:JSON.stringify(Boolean(process.env.B5_SERVICE_TOKEN))}};');
      writeFileSync(path.join(directory,'.env'),'VITE_FROM_DOTENV=must-not-load\nVITE_CRM_TEST=must-not-load');
      const env = {...cleanEnvironment(),NODE_ENV:'production',B5_SERVICE_TOKEN:'synthetic-fixture-only',VITE_UNAPPROVED:'must-not-leak',VITE_CRM_TEST:'ambient-override'};
      if (preload) env.NODE_OPTIONS = `--import=${guard}`;
      const result = spawnSync(process.execPath,[script,...args],{cwd:directory,env,encoding:'utf8',windowsHide:true,timeout:45000});
      if (result.error) throw result.error;
      check(result,directory);
    } finally {
      assert.equal(path.dirname(directory),parent);
      assert(path.basename(directory).startsWith('crm-build-profile-'));
      rmSync(directory,{recursive:true,force:true});
    }
  }
  function compiledProfile(result,directory) {
    assert.equal(result.status,0,result.stderr);
    const assets = path.join(directory,'dist/assets');
    const files = readdirSync(assets).filter(name=>name.endsWith('.js'));
    assert.equal(files.length,1);
    const context = {};
    runInNewContext(readFileSync(path.join(assets,files[0]),'utf8'),context,{timeout:1000});
    assert.equal(context.profile.unsafeCredentialPresent,false);
    return Object.fromEntries(Object.entries(context.profile).filter(([key])=>key.startsWith('VITE_')));
  }
  await t.test('default build remains clean without TEST flags or dotenv',()=>{
    realBuild([],true,(result,directory)=>assert.deepEqual(compiledProfile(result,directory),{}));
  });
  await t.test('explicit fixed profile is applied after the preloaded guard',()=>{
    realBuild(['--profile=clean-synthetic-20261022'],true,(result,directory)=>assert.deepEqual(compiledProfile(result,directory),expected));
  });
  await t.test('explicit profile loads the guard even without caller preload',()=>{
    realBuild(['--profile=clean-synthetic-20261022'],false,(result,directory)=>assert.deepEqual(compiledProfile(result,directory),expected));
  });
  await t.test('unknown profiles and arbitrary overrides are rejected before building',()=>{
    for (const args of [['--profile=live'],['--profile=clean-synthetic-20261022','--define=arbitrary']]) {
      realBuild(args,true,(result,directory)=>{
        assert.notEqual(result.status,0);
        assert.match(result.stderr,/Unsupported frontend build profile/);
        assert.equal(existsSync(path.join(directory,'dist')),false);
      });
    }
  });
});
