import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/keewano.js', () => ({ keewanoSql: vi.fn(async () => [{ source: 'aid', households: 4 }]) }));
vi.mock('../src/metrics.js', () => ({ getTimeSavedMetrics: vi.fn(async () => { throw new Error('boom'); }) }));
vi.mock('../src/autopilot.js', () => ({ getAutopilotState: vi.fn(async () => ({ actions: [], lastRunAt: null, source: 'keewano' })) }));

import { getDeepDive, startDeepDive } from '../src/deepDive.js';
import { setDevinFetch } from '../src/devin.js';

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

describe('deep dive', () => {
  beforeEach(() => {
    process.env.DEVIN_API_KEY = 'DEVIN_SECRET_123';
    process.env.KEEWANO_PAT = 'KEEWANO_SECRET_456';
  });
  afterEach(() => setDevinFetch());

  it('builds a prompt with snapshot and question but no secrets', async () => {
    const f = vi.fn(async () => json({ session_id: 'devin-1' }));
    setDevinFetch(f as unknown as typeof fetch);
    const r = await startDeepDive('Who is at risk?', 'org');
    expect(r.id).toBe('devin-1');
    const body = (f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
    const { prompt } = JSON.parse(body) as { prompt: string };
    expect(prompt).toContain('Who is at risk?');
    expect(prompt).toContain('"households":4');
    expect(prompt).toContain('unavailable'); // failed metrics query is caught separately
    expect(body).not.toContain('DEVIN_SECRET_123');
    expect(body).not.toContain('KEEWANO_SECRET_456');
    expect(prompt.length).toBeLessThan(31_000);
  });

  it('rejects empty and over-long questions', async () => {
    await expect(startDeepDive('  ', 'o')).rejects.toThrow(RangeError);
    await expect(startDeepDive('x'.repeat(501), 'o')).rejects.toThrow(RangeError);
  });

  it('parses structured output', async () => {
    setDevinFetch((async () => json({
      status_enum: 'finished', structured_output: { answer: 'A', evidence: ['e', 3], followUps: ['f'] },
    })) as unknown as typeof fetch);
    const r = await getDeepDive('devin-1');
    expect(r).toMatchObject({ done: true, answer: 'A', evidence: ['e'], followUps: ['f'] });
  });
});
