import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { isAbsolute, basename, dirname, join, relative, sep, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editablePolicy, salesError } from './policy.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)));
const MAX_BYTES = 16_384;
const locks = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = metadata => `${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`;
const revisionOf = policy => hash(JSON.stringify(policy));

function trustedPath(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !isAbsolute(value)) throw salesError('AI_POLICY_FILE_INVALID', 503);
  const path = resolve(value), inside = relative(repositoryRoot, path);
  if (!inside || (!inside.startsWith(`..${sep}`) && inside !== '..' && !isAbsolute(inside))) {
    throw salesError('AI_POLICY_FILE_INVALID', 503);
  }
  return path;
}

async function readSnapshot(path, assertAccess = () => {}) {
  assertAccess();
  if (!path) { const policy = editablePolicy(); return { policy, revision: revisionOf(policy), configured: false }; }
  // A configured parent junction must not redirect a source-external setting into Git.
  const parent = await realpath(dirname(path));
  assertAccess();
  trustedPath(join(parent, basename(path)));
  let metadata;
  try { metadata = await lstat(path); }
  catch (error) {
    assertAccess();
    if (error.code === 'ENOENT') { const policy = editablePolicy(); return { policy, revision: revisionOf(policy), configured: false }; }
    throw error;
  }
  assertAccess();
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size > MAX_BYTES) {
    throw salesError('AI_POLICY_FILE_INVALID', 503);
  }
  const handle = await open(path, 'r');
  try {
    assertAccess();
    const opened = await handle.stat();
    assertAccess();
    if (identity(opened) !== identity(metadata)) throw salesError('AI_POLICY_CHANGED', 409);
    const bytes = await handle.readFile();
    assertAccess();
    if (bytes.length > MAX_BYTES) throw salesError('AI_POLICY_FILE_INVALID', 503);
    const after = await lstat(path);
    assertAccess();
    if (identity(after) !== identity(metadata)) throw salesError('AI_POLICY_CHANGED', 409);
    const policy = editablePolicy(JSON.parse(bytes.toString('utf8')));
    return { policy, revision: revisionOf(policy), configured: true, fileIdentity: identity(metadata) };
  } finally { await handle.close(); assertAccess(); }
}

async function serialized(path, operation) {
  const previous = locks.get(path) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(path, current);
  await previous;
  try { return await operation(); }
  finally { release(); if (locks.get(path) === current) locks.delete(path); }
}

function safeFileError(error) {
  if (error?.code?.startsWith('AI_') || error?.code?.startsWith('AUTH_')
      || error?.code?.startsWith('WHATSAPP_CRM_')) return error;
  return salesError('AI_POLICY_FILE_INVALID', 503);
}

/** The only location is the trusted server setting, never request data. */
export function createSalesPolicyStore({ getPath = () => process.env.CRM_AI_SALES_RULES_FILE,
  fs = { lstat, open, rename, unlink } } = {}) {
  // fs is injectable only for the commit operation's offline race/failure tests.
  const location = () => trustedPath(getPath());
  return {
    async read({ assertAccess = () => {} } = {}) {
      try {
        const path = location();
        const check = () => { assertAccess(); if (location() !== path) throw salesError('AI_POLICY_CHANGED', 409); };
        const result = await readSnapshot(path, check);
        check();
        const { fileIdentity, ...publicResult } = result;
        return publicResult;
      } catch (error) { throw safeFileError(error); }
    },
    async write({ policy, revision, assertAccess = () => {} }) {
      let temporary;
      try {
        assertAccess();
        const path = location();
        if (!path) throw salesError('AI_POLICY_NOT_CONFIGURED', 503);
        const check = () => { assertAccess(); if (location() !== path) throw salesError('AI_POLICY_CHANGED', 409); };
        const normalized = editablePolicy({ ...editablePolicy(policy), version: `owner-${Date.now()}-${randomUUID()}` });
        const bytes = Buffer.from(JSON.stringify(normalized, null, 2) + '\n');
        if (bytes.length > MAX_BYTES) throw salesError('AI_POLICY_INVALID');
        if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) throw salesError('AI_POLICY_REVISION_REQUIRED', 409);
        return await serialized(path, async () => {
          check();
          const current = await readSnapshot(path, check);
          if (!current.configured) throw salesError('AI_POLICY_NOT_CONFIGURED', 503);
          if (current.revision !== revision) throw salesError('AI_POLICY_CHANGED', 409);
          temporary = join(dirname(path), `.sales-rules-${randomUUID()}.tmp`);
          const handle = await fs.open(temporary, 'wx', 0o600);
          try { check(); await handle.writeFile(bytes); check(); await handle.sync(); check(); }
          finally { await handle.close(); }
          check();
          // Recheck content AND file identity after staging, before replacing the current file.
          const beforeCommit = await readSnapshot(path, check);
          if (beforeCommit.revision !== revision || beforeCommit.fileIdentity !== current.fileIdentity) {
            throw salesError('AI_POLICY_CHANGED', 409);
          }
          check();
          await fs.rename(temporary, path);
          temporary = undefined;
          check();
          const saved = await readSnapshot(path, check);
          if (JSON.stringify(saved.policy) !== JSON.stringify(normalized)) throw salesError('AI_POLICY_CHANGED', 409);
          check();
          const { fileIdentity, ...publicResult } = saved;
          return publicResult;
        });
      } catch (error) { throw safeFileError(error); }
      finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
    },
  };
}

export const salesPolicyStore = createSalesPolicyStore();
