// The current gateway allows 300 requests per 15 minutes. Leave capacity for
// login, navigation, translation and manual sends; hidden tabs do not poll.
export const POLL_INTERVAL = Object.freeze({ conversation: 6000, inbox: 20000, permission: 60000, olderPage: 120000 });
export const MAX_SCOPED_COOLDOWNS = 128;

// Candidates only: a cooldown becomes scoped only when this exact route's
// response confirms its budget. Unknown/mismatched responses remain global.
export function requestBudgetScope(path, method = 'GET') {
  const route = path.split('?')[0];
  if (method === 'GET' && /^\/crm\/catalog\/products(?:\/vega-[1-9][0-9]*(?:\/photo)?)?$/.test(route)) return 'catalog';
  if (method === 'GET' && route === '/auth/me') return 'verification';
  if (method === 'GET' && (route === '/crm/inbox' || /^\/crm\/conversations\/[1-9][0-9]*$/.test(route))) return 'crm-read';
  if (method === 'POST' && /^\/crm\/conversations\/[1-9][0-9]*\/messages$/.test(route)) return 'crm-send';
  if (method === 'POST' && route === '/auth/login') return 'login';
  if (method === 'POST' && /^\/crm\/conversations\/[1-9][0-9]*\/(?:translate|sales-draft)$/.test(route)) return 'translation';
  return 'global';
}

export function createRequestControl({ now = Date.now } = {}) {
  let blockedUntil = 0;
  const scopedBlocks = new Map();
  const reads = new Map();
  const prune = () => {
    const time = now();
    for (const [key, until] of scopedBlocks) if (until <= time) scopedBlocks.delete(key);
  };
  const limited = (until = blockedUntil) => {
    const seconds = Math.max(1, Math.ceil((until - now()) / 1000));
    return Object.assign(new Error(`CRM istek sınırına ulaştı. ${seconds} saniye sonra yeniden deneyin; taslağınız korunuyor.`), {
      status: 429, code: "CRM_RATE_LIMITED", retryAfterMs: seconds * 1000,
    });
  };
  return {
    run(key, operation, deduplicate = false, { actor = '', scope = 'global' } = {}) {
      prune();
      if (now() < blockedUntil) return Promise.reject(limited());
      const budgetKey = JSON.stringify([actor, scope]);
      const scopedUntil = scopedBlocks.get(budgetKey) || 0;
      if (now() < scopedUntil) return Promise.reject(limited(scopedUntil));
      if (scopedUntil) scopedBlocks.delete(budgetKey);
      const readKey = JSON.stringify([actor, scope, key]);
      if (deduplicate && reads.has(readKey)) return reads.get(readKey).then((response) => response.clone());
      const promise = (async () => {
        const response = await operation();
        if (response.status === 429) {
          const retry = response.headers.get("Retry-After");
          const reset = Number(response.headers.get("RateLimit-Reset"));
          let delay = retry && /^\d+(\.\d+)?$/.test(retry.trim()) ? Number(retry) * 1000 : Date.parse(retry || "") - now();
          if (!Number.isFinite(delay) || delay <= 0) delay = reset > 0 ? reset * 1000 : 60000;
          const header = response.headers.get('X-CRM-RateLimit-Scope');
          prune();
          // Never evict a valid cooldown to admit another actor. On overflow
          // retain existing limits and conservatively apply a global backoff.
          const trusted = ['catalog', 'verification', 'login', 'translation', 'crm-read', 'crm-send'].includes(scope) && header === scope
            && (scopedBlocks.has(budgetKey) || scopedBlocks.size < MAX_SCOPED_COOLDOWNS);
          const until = now() + delay;
          if (trusted) scopedBlocks.set(budgetKey, Math.max(scopedBlocks.get(budgetKey) || 0, until));
          else blockedUntil = Math.max(blockedUntil, until);
          throw limited(trusted ? scopedBlocks.get(budgetKey) : blockedUntil);
        }
        return response;
      })();
      if (deduplicate) {
        reads.set(readKey, promise);
        // No mutation or uncertain send is ever queued or retried here.
        const clear = () => { if (reads.get(readKey) === promise) reads.delete(readKey); };
        promise.then(clear, clear);
      }
      return deduplicate ? promise.then((response) => response.clone()) : promise;
    },
  };
}

// Keep at most one current foreground read behind an already-issued read.
export function queueForegroundRead(poll, run, isCurrent) {
  if(!poll.inFlight)return false;
  poll.resume=()=>{if(isCurrent())void run();};return true;
}
export function finishForegroundRead(poll) {
  poll.inFlight=false;const resume=poll.resume;poll.resume=null;
  if(resume)queueMicrotask(resume);
}
export function chatPollingPaused(hidden,catalogVisible){return Boolean(hidden||catalogVisible);}
