// The account card is derived only from the authenticated /auth/me response.
// A Site owner, display name, contact or agent ID never establishes this identity.
export function normalizeAccountIdentity(value = {}) {
  const scalar = input => typeof input === 'string' && input.trim() ? input.trim() : null;
  const id = typeof value.id === 'number' && Number.isFinite(value.id) ? String(value.id) : scalar(value.id);
  return { id, username: scalar(value.username), role: scalar(value.role) };
}
export function isMobilePreviewPath(pathname = '') {
  return ['/mobile-preview','/mobile-preview/','/crm/mobile-preview','/crm/mobile-preview/'].includes(pathname);
}

export function accountIdentityKey(identity) {
  const account = normalizeAccountIdentity(identity);
  return account.id !== null ? `id:${account.id}` : account.username !== null ? `username:${account.username}` : '';
}
