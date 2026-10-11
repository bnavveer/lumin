import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateCohorts, formatHeadline, getTimeSavedMetrics, resetMetricsCache, COHORT_SQL } from '../src/metrics.js';

beforeEach(() => { resetMetricsCache(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const row = (src: string, user_id: string, submitted: number, scheduled: number, confirmed: number, hours?: number) =>
  ({ src, user_id, submitted, scheduled, confirmed, hours_to_submit: hours ?? null });

describe('aggregateCohorts', () => {
  it('computes percentages, medians (1 decimal) and missed interviews per cohort', () => {
    const { aid, baseline } = aggregateCohorts([
      row('aid', 'a1', 1, 1, 1, 2.04), row('aid', 'a2', 1, 1, 1, 4.06), row('aid', 'a3', 1, 0, 0, 3), row('aid', 'a4', 0, 1, 0),
      row('baseline', 'b1', 1, 1, 0, 30), row('baseline', 'b2', 0, 1, 1), row('baseline', 'b3', 0, 0, 0),
    ]);
    expect(aid).toEqual({ households: 4, submittedPct: 75, medianHoursToSubmit: 3, interviewMissedPct: 33.3 });
    expect(baseline).toEqual({ households: 3, submittedPct: 33.3, medianHoursToSubmit: 30, interviewMissedPct: 50 });
  });
  it('even-count median averages the middle two', () => {
    const { aid } = aggregateCohorts([row('aid', 'a', 1, 0, 0, 1), row('aid', 'b', 1, 0, 0, 2)]);
    expect(aid.medianHoursToSubmit).toBe(1.5);
  });
  it('returns zeros and null median for empty cohorts', () => {
    expect(aggregateCohorts([])).toEqual({
      aid: { households: 0, submittedPct: 0, medianHoursToSubmit: null, interviewMissedPct: 0 },
      baseline: { households: 0, submittedPct: 0, medianHoursToSubmit: null, interviewMissedPct: 0 },
    });
  });
  it('ignores hours for households that never submitted', () => {
    expect(aggregateCohorts([row('aid', 'a', 0, 0, 0, 9)]).aid.medianHoursToSubmit).toBeNull();
  });
});

describe('formatHeadline', () => {
  const m = (ah: number | null, bh: number | null) => ({
    aid: { households: 10, submittedPct: 80, medianHoursToSubmit: ah, interviewMissedPct: 5 },
    baseline: { households: 10, submittedPct: 40, medianHoursToSubmit: bh, interviewMissedPct: 30 },
    source: 'keewano' as const, asOf: 'now',
  });
  it('states hours saved when both medians exist', () => {
    const h = formatHeadline(m(3, 48));
    expect(h).toContain('45 hours faster');
    expect(h).toContain('80%');
  });
  it('falls back to submission rates when a median is missing', () => {
    expect(formatHeadline(m(null, 48))).toContain('80%');
    expect(formatHeadline(m(null, 48))).not.toContain('faster');
  });
});

describe('getTimeSavedMetrics', () => {
  const run = vi.fn(async (sql: string) => sql === COHORT_SQL
    ? [row('aid', 'a1', 1, 0, 0), row('baseline', 'b1', 1, 0, 0)]
    : [{ user_id: 'a1', reg: 1000, submitted_at: 1000 + 7200 }, { user_id: 'b1', reg: 1000, submitted_at: 1000 + 36000 }]);
  it('merges submit times, caches 30s', async () => {
    vi.useFakeTimers();
    run.mockClear();
    const a = await getTimeSavedMetrics(run);
    expect(a.source).toBe('keewano');
    expect(a.aid.medianHoursToSubmit).toBe(2);
    expect(a.baseline.medianHoursToSubmit).toBe(10);
    await getTimeSavedMetrics(run);
    expect(run).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_001);
    await getTimeSavedMetrics(run);
    expect(run).toHaveBeenCalledTimes(4);
  });
  it('throws a [metrics] error on failure', async () => {
    await expect(getTimeSavedMetrics(async () => { throw new Error('nope'); })).rejects.toThrow('[metrics]');
  });
});
