// Share overlapping reads; a late response must not restore a logged-out or
// replaced account. This only refreshes permission, never sends a message.
export function createPermissionRefresh({ getToken, getGeneration = () => 0, fetchSession, onSession, onExpired, onState }) {
  let pending = null;
  const refresh = function refresh() {
    const token = getToken();
    if (!token) return Promise.resolve(null);
    const generation = getGeneration();
    const current = () => getToken() === token && getGeneration() === generation;
    if (pending?.token === token && pending.generation === generation) return pending.promise;
    pending?.controller.abort();
    const request = { token, generation, controller: new AbortController(), promise: null };
    pending = request;
    onState({ busy: true, error: "" });
    request.promise = (async () => {
      try {
        const session = await fetchSession(token, { signal: request.controller.signal });
        if (!current()) return null;
        onSession(session);
        return session;
      } catch (error) {
        if (current()) {
          if (error.status === 401) onExpired();
          else onState({ error: error.status === 429 ? error.message : "Gönderim izni güncellenemedi. Bağlantıyı yeniden kontrol edin." });
        }
        throw error;
      } finally {
        if (pending === request) pending = null;
        if (current()) onState({ busy: false });
      }
    })();
    return request.promise;
  };
  refresh.invalidate = () => { pending?.controller.abort(); pending = null; };
  return refresh;
}
