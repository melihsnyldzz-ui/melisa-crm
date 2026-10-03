import { timingSafeEqual } from "node:crypto";

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authenticate(request, config) {
  const header = request.headers.authorization || "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (key && safeEqual(key, config.ownerAccessKey)) return { role: "owner", displayName: "Patron" };
  if (key && safeEqual(key, config.managerAccessKey)) return { role: "manager", displayName: "Müdür" };
  return null;
}

export function createRateLimiter({ limit = 20, windowMs = 60_000 } = {}) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || now - current.startedAt >= windowMs) {
      buckets.set(key, { startedAt: now, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

