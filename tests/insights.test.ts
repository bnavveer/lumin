import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NUDGE_VARIANTS, chooseNudge, pickNudgeVariant, resetInsightsCache, variantStats } from '../src/insights.js';

beforeEach(() => { resetInsightsCache(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('NUDGE_VARIANTS', () => {
  it('has 2-3 variants per kind, under 320 chars, signed Aid, unique ids', () => {
    const ids = new Set<string>();
    for (const vs of Object.values(NUDGE_VARIANTS)) {
      expect(vs.length).toBeGreaterThanOrEqual(2);
      expect(vs.length).toBeLessThanOrEqual(3);
      for (const v of vs) {
        const t = v.text('Maria');
        expect(t.length).toBeLessThan(320);
        expect(t.trimEnd().endsWith('Aid')).toBe(true);
        expect(t).toContain('Maria');
        expect(ids.has(v.id)).toBe(false);
        ids.add(v.id);
      }
    }
  });
  it('interview variants carry the reply options and unknown-number warning', () => {
    for (const v of NUDGE_VARIANTS.interview_nudge) {
      const t = v.text('Rosa');
      expect(t).toContain("Reply 1 to confirm, or 2 and I'll call to reschedule");
      expect(t).toMatch(/unknown number/i);
    }
  });
  it('docs variants ask for a photo of pay stubs', () => {
    for (const v of NUDGE_VARIANTS.docs_nudge) expect(v.text('James')).toMatch(/photo.*pay stubs|pay stubs.*photo/i);
  });
});

describe('variantStats', () => {
  it('sums successes and never exceeds sent', async () => {
    const stats = await variantStats(async () => [
      { variant: 'interview_direct', sent: 10, confirmed: 6, docs: 0, signed: 0 },
      { variant: 'docs_photo', sent: 2, confirmed: 0, docs: 1, signed: 1 },
    ]);
    expect(stats).toEqual({ interview_direct: { sent: 10, succeeded: 6 }, docs_photo: { sent: 2, succeeded: 2 } });
  });
});

describe('pickNudgeVariant', () => {
  const stats = {
    interview_direct: { sent: 20, succeeded: 4 },
    interview_warm: { sent: 20, succeeded: 15 },
    interview_call: { sent: 20, succeeded: 8 },
  };
  it('exploits the best smoothed rate when rng is above epsilon', () => {
    expect(pickNudgeVariant('interview_nudge', stats, () => 0.9).id).toBe('interview_warm');
  });
  it('explores a random variant when rng is below epsilon', () => {
    const seq = [0.1, 0.99];
    let i = 0;
    expect(pickNudgeVariant('interview_nudge', stats, () => seq[i++]!).id).toBe('interview_call');
  });
  it('Laplace smoothing prefers an untested variant over one with a poor record', () => {
    const s = { docs_photo: { sent: 10, succeeded: 0 } };
    expect(pickNudgeVariant('docs_nudge', s, () => 0.9).id).not.toBe('docs_photo');
  });
  it('tie with no data picks the first variant', () => {
    expect(pickNudgeVariant('renewal_start', {}, () => 0.9).id).toBe(NUDGE_VARIANTS.renewal_start[0]!.id);
  });
});

describe('chooseNudge', () => {
  it('uses cached stats for 60s', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => [{ variant: 'docs_quick', sent: 10, confirmed: 0, docs: 9, signed: 0 }]);
    const a = await chooseNudge('docs_nudge', 'James', run, () => 0.9);
    expect(a.variantId).toBe('docs_quick');
    expect(a.text).toContain('James');
    await chooseNudge('docs_nudge', 'James', run, () => 0.9);
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await chooseNudge('docs_nudge', 'James', run, () => 0.9);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('falls back to the first variant when Keewano fails', async () => {
    const r = await chooseNudge('interview_nudge', 'Rosa', async () => { throw new Error('down'); });
    expect(r.variantId).toBe(NUDGE_VARIANTS.interview_nudge[0]!.id);
  });
});
