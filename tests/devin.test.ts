import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDevinSession, devinSessionUrl, getDevinSession, setDevinFetch } from '../src/devin.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('devin client', () => {
  beforeEach(() => { process.env.DEVIN_API_KEY = 'devin-key-SECRET'; });
  afterEach(() => setDevinFetch());

  it('creates a session with bearer auth', async () => {
    const f = vi.fn(async () => json({ session_id: 'devin-abc', url: 'https://app.devin.ai/sessions/abc' }));
    setDevinFetch(f as unknown as typeof fetch);
    const r = await createDevinSession('hi', 't');
    expect(r).toEqual({ id: 'devin-abc', url: 'https://app.devin.ai/sessions/abc' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.devin.ai/v1/sessions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer devin-key-SECRET');
  });

  it('maps session details and done state', async () => {
    setDevinFetch((async () => json({ status_enum: 'working', structured_output: null })) as unknown as typeof fetch);
    expect((await getDevinSession('devin-abc')).done).toBe(false);
    setDevinFetch((async () => json({ status_enum: 'finished', structured_output: { answer: 'x' } })) as unknown as typeof fetch);
    const s = await getDevinSession('devin-abc');
    expect(s.done).toBe(true);
    expect(s.url).toBe(devinSessionUrl('devin-abc'));
  });

  it('prefixes errors with [devin] and never leaks the key', async () => {
    setDevinFetch((async () => json({ detail: 'nope' }, 401)) as unknown as typeof fetch);
    const err = await createDevinSession('p', 't').catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^\[devin\]/);
    expect((err as Error).message).not.toContain('SECRET');
    delete process.env.DEVIN_API_KEY;
    await expect(getDevinSession('x')).rejects.toThrow(/^\[devin\]/);
  });
});
