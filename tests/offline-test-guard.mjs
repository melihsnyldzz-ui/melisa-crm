// Development-only guard; never deploy or load this file in the live gateway.
import net from 'node:net';
const compiledProductionBuild = process.env.NODE_ENV === 'production';
for (const key of Object.keys(process.env)) {
  if (/^(WAAPI_|WHATSAPP_|CHATWOOT_|EVOLUTION_|OPENAI_|PG|REDIS_|DATABASE_)/.test(key)
    || ['PORT', 'NODE_ENV'].includes(key)) delete process.env[key];
}
process.env.NODE_ENV = compiledProductionBuild ? 'production' : 'test';
const nativeFetch = globalThis.fetch;
const livePorts = new Set(['1433', '3100', '4000', '4100', '4200', '4212', '5173', '5432', '6379', '8080']);
const nativeConnect = net.Socket.prototype.connect;
const nativeListen = net.Server.prototype.listen;
const fixturePorts = new Set();
net.Server.prototype.listen = function (...args) {
  this.once('listening', () => fixturePorts.add(String(this.address()?.port)));
  const first = args[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    if (first.port !== 0 || first.path || first.fd != null || first.handle) {
      throw new Error('Development test guard requires an ephemeral loopback fixture listener');
    }
    const host = first.host || '127.0.0.1';
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
      throw new Error('Development test guard rejected non-loopback fixture listener');
    }
    args[0] = {...first, host};
  } else {
    if (first !== 0) throw new Error('Development test guard rejected fixed-port or pipe listener');
    if (typeof args[1] === 'string') {
      if (!['127.0.0.1', 'localhost', '::1'].includes(args[1])) {
        throw new Error('Development test guard rejected non-loopback fixture listener');
      }
    } else args.splice(1, 0, '127.0.0.1');
  }
  return nativeListen.apply(this, args);
};
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const option = typeof values[0] === 'object' ? values[0] : { port: values[0], host: values[1] };
  const host = typeof option?.host === 'string' ? option.host : 'localhost';
  const port = String(option?.port || '');
  if (!/^\d+$/.test(port) || !['127.0.0.1', 'localhost', '::1'].includes(host) || livePorts.has(port) || !fixturePorts.has(port)) {
    throw new Error('Development test guard rejected external, pipe or live-service socket access');
  }
  return nativeConnect.apply(this, args);
};
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || livePorts.has(url.port) || !fixturePorts.has(url.port)) {
    throw new Error('Development test guard rejected external or live-service HTTP access');
  }
  return nativeFetch(input, options);
};
