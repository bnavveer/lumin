import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { rateLimit } from '../src/rateLimit.js';
import type { Conversation } from '../src/conversation.js';

describe('combined app', () => {
  it('serves the browser app and public phone config without exposing environment values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aid-web-test-'));
    try {
      writeFileSync(join(dir, 'index.html'), '<html><body>Aid frontend</body></html>');
      const app = createApp({} as Conversation, { phone: '+12135550100', webRoot: dir });
      expect(await (await app.request('/api/config')).json()).toEqual({ phone: '+12135550100' });
      expect(await (await app.request('/health')).json()).toEqual({ ok: true });
      for (const route of ['/chat', '/privacy-policy', '/terms']) {
        const response = await app.request(route);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('Aid frontend');
      }
      expect((await app.request('/api/not-a-route')).status).toBe(404);
      expect((await app.request('/assets/missing.js')).status).toBe(404);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('omits unavailable or non-dialable channel identifiers', async () => {
    const app = createApp({} as Conversation, { phone: 'line-id-secret' });
    expect(await (await app.request('/api/config')).json()).toEqual({ phone: null });
  });
});

describe('onboarding rate limiter', () => {
  afterEach(() => vi.useRealTimers());
  it('limits a client for the window and then allows another request', async () => {
    vi.useFakeTimers();
    const app = new Hono();
    app.get('/', rateLimit({ max: 1, windowMs: 1000, key: c => c.req.header('client') ?? 'one' }), c => c.text('ok'));
    expect((await app.request('/')).status).toBe(200);
    const limited = await app.request('/');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('1');
    expect((await app.request('/', { headers: { client: 'two' } })).status).toBe(200);
    vi.advanceTimersByTime(1000);
    expect((await app.request('/')).status).toBe(200);
  });
});
