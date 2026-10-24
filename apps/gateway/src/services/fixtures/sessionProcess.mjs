// Synthetic fixture only. Never uses real users, passwords, tokens or files.
import { env } from '../../config/env.js';
import jwt from 'jsonwebtoken';
import { authenticateCrmUser, verifyCrmAccessToken, createPasswordHash } from '../crmAuthService.js';
let raw = ''; for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw);
const password = 'Synthetic-fixture-password-2026!';
Object.assign(env.auth, { jwtSecret: 'synthetic-fixture-secret-more-than-32-characters', issuer: 'offline', audience: 'offline',
  tokenExpiresIn: '5m', personnelCanSend: false,
  users: [{ id: 'synthetic-owner', username: 'synthetic', role: input.changedRole ? 'personel' : 'patron', active: !input.disabled,
    passwordHash: createPasswordHash(password, 'fixed-synthetic-salt'), chatwootAgentId: 19 }] });
// Advance only this synthetic verifier process to the issued token's expiry.
// Normal login verifies its own result, so an already-expired login cannot
// return a token to exercise restart-time expiry verification.
if (input.mode === 'verify' && input.expired) {
  const expiresAt = jwt.decode(input.token)?.exp;
  if (!Number.isSafeInteger(expiresAt)) throw new Error('Synthetic expiry fixture requires an issued token');
  Date.now = () => expiresAt * 1000;
}
try {
  const result = input.mode === 'login' ? authenticateCrmUser({ username: 'synthetic', password })
    : verifyCrmAccessToken(input.token);
  process.stdout.write(JSON.stringify(input.mode === 'login' ? { token: result.accessToken } : { ok: true, role: result.role }));
} catch (e) { process.stdout.write(JSON.stringify({ ok: false, code: e.code })); }
