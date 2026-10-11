import type { Context, MiddlewareHandler } from 'hono';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  key: (c: Context) => string;
}

// In-memory fixed-window limiter. Fine for a single-process demo server.
export function rateLimit({ windowMs, max, key }: RateLimitOptions): MiddlewareHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    const k = key(c);
    const cur = hits.get(k);
    if (!cur || cur.resetAt <= now) {
      hits.set(k, { count: 1, resetAt: now + windowMs });
    } else if (cur.count >= max) {
      c.header('Retry-After', String(Math.ceil((cur.resetAt - now) / 1000)));
      return c.json({ error: 'Too many requests, slow down' }, 429);
    } else {
      hits.set(k, { count: cur.count + 1, resetAt: cur.resetAt });
    }
    await next();
  };
}
