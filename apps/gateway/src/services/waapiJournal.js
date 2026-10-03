import { mkdir, open, readFile, readdir, rename, link, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
const mutations = new Map();

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
  serial(group, key, work) {
    const target = this.file(group, key);
    const previous = mutations.get(target) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    mutations.set(target, next);
    next.finally(() => { if (mutations.get(target) === next) mutations.delete(target); }).catch(() => {});
    return next;
  }
  put(group, key, value, exclusive = false) {
    return this.serial(group, key, () => this.atomicPut(group, key, value, exclusive));
  }
  update(group, key, change) {
    return this.serial(group, key, async () => {
      const current = await this.get(group, key);
      const next = change(current);
      if (next !== undefined) await this.atomicPut(group, key, next);
      return next ?? current;
    });
  }
  async atomicPut(group, key, value, exclusive = false) {
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
    let mediaHydrated = false;
    if (!created && event.media) {
      await this.update('events', key, current => {
        if (!current?.event?.mediaPending) return undefined;
        for (const field of ['instanceId','providerMessageId','direction','phone','text']) {
          if (String(current.event[field] ?? '') !== String(event[field] ?? '')) {
            throw Object.assign(new Error('Conflicting message hydration'), { code: 'WHATSAPP_CRM_WAAPI_EVENT_CONFLICT', statusCode: 409 });
          }
        }
        mediaHydrated = true;
        return { ...current, event: { ...current.event, media: event.media, mediaPending: false },
          done: false, retryAt: null, mediaHydratedAt: new Date().toISOString() };
      });
    }
    return { accepted: true, duplicate: !created, ...(mediaHydrated ? { mediaHydrated: true } : {}) };
  }
  async pending(instanceId) {
    await mkdir(path.join(this.root, 'events'), { recursive: true });
    const result = [];
    for (const name of await readdir(path.join(this.root, 'events'))) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const key = name.slice(0, -5); const value = await this.get('events', key);
      // Retain other instances' history without letting their backlog consume this batch.
      if (instanceId !== undefined && String(value.event?.instanceId) !== String(instanceId)) continue;
      const retryAt = Date.parse(value.retryAt);
      if (!value.done && (!Number.isFinite(retryAt) || retryAt <= Date.now())) result.push({ key, ...value });
    }
    const order = item => Number.isSafeInteger(item.event?.timestamp) && item.event.timestamp > 0
      ? item.event.timestamp * 1000 : (Date.parse(item.receivedAt) || 0);
    return result.sort((a, b) => order(a) - order(b)
      || (Date.parse(a.receivedAt) || 0) - (Date.parse(b.receivedAt) || 0) || a.key.localeCompare(b.key)).slice(0, 100);
  }
}
export const waapiJournal = new WaapiJournal();
