// Development/CI only. Never load this module in deployed application processes.
import dotenv from '../../apps/gateway/node_modules/dotenv/lib/main.js';
import dgram from 'node:dgram';
import { cleanEnvironment } from './environment.mjs';

const clean = cleanEnvironment();
for (const key of Object.keys(process.env)) {
  if (!(key in clean)) delete process.env[key];
}
// A Node child must inherit this guard, including the session-restart fixture.
process.env.NODE_OPTIONS = `--import=${import.meta.url}`;
// env.js and child fixtures cannot reload an ignored local credential file.
const disabled = () => ({ parsed: {} });
dotenv.config = disabled;
dotenv.configDotenv = disabled;
dotenv.populate = disabled;
dgram.createSocket = () => { throw new Error('CI guard rejected UDP access'); };
await import('../../tests/offline-test-guard.mjs');
