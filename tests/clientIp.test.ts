import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { clientIp } from '../src/clientIp.js';

const app = new Hono().get('/', (c) => c.text(clientIp(c)));
const ip = async (headers: Record<string, string>) => (await app.request('/', { headers })).text();

describe('clientIp', () => {
  afterEach(() => { delete process.env.TRUST_PROXY; });

  it('ignores spoofable proxy headers unless TRUST_PROXY=true', async () => {
    expect(await ip({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' })).toBe('local');
  });

  it('uses the rightmost X-Forwarded-For hop behind a trusted proxy', async () => {
    process.env.TRUST_PROXY = 'true';
    expect(await ip({ 'x-forwarded-for': 'spoofed, 9.9.9.9' })).toBe('9.9.9.9');
    expect(await ip({ 'x-real-ip': '5.6.7.8' })).toBe('5.6.7.8');
    expect(await ip({})).toBe('local');
  });
});
