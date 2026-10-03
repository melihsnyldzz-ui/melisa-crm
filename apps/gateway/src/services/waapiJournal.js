import { mkdir, open, readFile, readdir, rename, link, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

export class WaapiJournal {
  constructor(root = fileURLToPath(new URL('../../runtime/waapi', import.meta.url))) { this.root = root; }
  key(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
  file(group, key) {
    if (!['events', 'state'].includes(group) || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid journal key');
    return path.join(this.root, group, `${key}.json`);
  }
  async get(group, key) {
    try { return JSON.parse(await readFile(this.file(group, key), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  async put(group, key, value, exclusive = false) {
    const target = this.file(group, key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    try {
      if (exclusive) await link(temp, target); else await rename(temp, target);
      return true;
    } catch (e) {
      if (exclusive && e.code === 'EEXIST') { await this.get(group, key); return false; }
      throw e;
    } finally { await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
  async accept(event) {
    const key = this.key(`${event.instanceId}:${event.event}:${event.providerMessageId || crypto.randomUUID()}:${event.ack ?? ''}`);
    const created = await this.put('events', key, { event, receivedAt: new Date().toISOString(), done: false }, true);
    return { accepted: true, duplicate: !created };
  }
  async pending(instanceId) {
    await mkdir(path.join(this.root, 'events'), { recursive: true });
    const result = [];
    for (const name of await readdir(path.join(this.root, 'events'))) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const key = name.slice(0, -5); const value = await this.get('events', key);
      // Retain other instances' history without letting their backlog consume this batch.
      if (instanceId !== undefined && String(value.event?.instanceId) !== String(instanceId)) continue;
      if (!value.done && (!value.retryAt || Date.parse(value.retryAt) <= Date.now())) result.push({ key, ...value });
      if (result.length >= 100) break;
    }
    return result;
  }
}
export const waapiJournal = new WaapiJournal();
