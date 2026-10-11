import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { optionalEnv } from './env.js';

/**
 * Rate-limit key for the caller. Proxy headers are client-controlled unless a trusted proxy sets them,
 * so they are only honored when TRUST_PROXY=true; then the rightmost X-Forwarded-For hop (the one our
 * proxy appended) is used. Otherwise the socket address is used.
 */
export function clientIp(c: Context): string {
  if (optionalEnv('TRUST_PROXY') === 'true') {
    const hop = c.req.header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
    if (hop) return hop;
    const real = c.req.header('x-real-ip')?.trim();
    if (real) return real;
  }
  try {
    return getConnInfo(c).remote.address ?? 'local';
  } catch {
    return 'local';
  }
}
