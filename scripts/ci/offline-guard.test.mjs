import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import dgram from 'node:dgram';
import dotenv from '../../apps/gateway/node_modules/dotenv/lib/main.js';
import { cleanEnvironment } from './environment.mjs';

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
