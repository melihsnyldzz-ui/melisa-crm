// The current gateway allows 300 requests per 15 minutes. Leave capacity for
// login, navigation, translation and manual sends; hidden tabs do not poll.
export const POLL_INTERVAL = Object.freeze({ conversation: 6000, inbox: 20000, permission: 60000, olderPage: 120000 });

export function createRequestControl({ now = Date.now } = {}) {
  let blockedUntil = 0;
  const reads = new Map();
  const limited = () => {
    const seconds = Math.max(1, Math.ceil((blockedUntil - now()) / 1000));
    return Object.assign(new Error(`CRM istek sınırına ulaştı. ${seconds} saniye sonra yeniden deneyin; taslağınız korunuyor.`), {
      status: 429, code: "CRM_RATE_LIMITED", retryAfterMs: seconds * 1000,
    });
  };
  return {
    run(key, operation, deduplicate = false) {
      if (now() < blockedUntil) return Promise.reject(limited());
      if (deduplicate && reads.has(key)) return reads.get(key).then((response) => response.clone());
      const promise = (async () => {
        const response = await operation();
        if (response.status === 429) {
          const retry = response.headers.get("Retry-After");
          const reset = Number(response.headers.get("RateLimit-Reset"));
          let delay = retry && /^\d+(\.\d+)?$/.test(retry.trim()) ? Number(retry) * 1000 : Date.parse(retry || "") - now();
          if (!Number.isFinite(delay) || delay <= 0) delay = reset > 0 ? reset * 1000 : 60000;
          blockedUntil = Math.max(blockedUntil, now() + delay);
          throw limited();
        }
        return response;
      })();
      if (deduplicate) {
        reads.set(key, promise);
        // No mutation or uncertain send is ever queued or retried here.
        const clear = () => { if (reads.get(key) === promise) reads.delete(key); };
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
