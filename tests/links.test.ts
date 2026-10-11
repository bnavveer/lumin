import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packetToken, packetUrl, verifyPacketToken } from '../src/links.js';

const saved = { s: process.env.PACKET_LINK_SECRET, b: process.env.PUBLIC_BASE_URL };
beforeEach(() => {
  process.env.PACKET_LINK_SECRET = 'test-secret';
  process.env.PUBLIC_BASE_URL = 'https://aid.example';
});
afterEach(() => {
  for (const [k, v] of [['PACKET_LINK_SECRET', saved.s], ['PUBLIC_BASE_URL', saved.b]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const NOW = 1_800_000_000;

describe('packet tokens', () => {
  it('round-trips', () => {
    const t = packetToken('h1', 3600, NOW);
    expect(t.startsWith(`${NOW + 3600}.`)).toBe(true);
    expect(verifyPacketToken('h1', t, NOW + 10)).toBe(true);
  });
  it('rejects a tampered signature or expiry', () => {
    const t = packetToken('h1', 3600, NOW);
    expect(verifyPacketToken('h1', t.slice(0, -2) + 'AA', NOW)).toBe(false);
    const sig = t.split('.')[1];
    expect(verifyPacketToken('h1', `${NOW + 999999}.${sig}`, NOW)).toBe(false);
  });
  it('rejects the wrong household', () => {
    expect(verifyPacketToken('h2', packetToken('h1', 3600, NOW), NOW)).toBe(false);
  });
  it('rejects expired tokens', () => {
    const t = packetToken('h1', 60, NOW);
    expect(verifyPacketToken('h1', t, NOW + 61)).toBe(false);
  });
  it('rejects garbage without throwing', () => {
    for (const g of ['', 'abc', '.', '123.', '.abc', 'x.y', '1.2.3', '99999999999999.zz']) {
      expect(verifyPacketToken('h1', g, NOW)).toBe(false);
    }
  });
  it('packetUrl embeds a valid token', () => {
    const url = new URL(packetUrl('h1'));
    expect(url.origin + url.pathname).toBe('https://aid.example/p/h1');
    expect(verifyPacketToken('h1', url.searchParams.get('t')!)).toBe(true);
  });
});
