// Time-saved metrics: Aid cohort vs baseline cohort (Source event), computed from Keewano.
import type { CohortMetrics, TimeSavedMetrics } from '../web/src/lib/types.js';
import { keewanoSql } from './keewano.js';

type Row = Record<string, unknown>;
export type RunSql = (sql: string) => Promise<Row[]>;

/** One row per household: its cohort (Source) and per-user flags. */
export const COHORT_SQL = `SELECT "Source" AS src, user_id,
  count("ApplicationSubmitted") AS submitted, count("InterviewScheduled") AS scheduled, count("InterviewConfirmed") AS confirmed
FROM events WHERE "Source" IS NOT NULL GROUP BY src, user_id`;

/** One row per household that submitted: seconds from first appearing to first submission. */
export const SUBMIT_TIME_SQL = `SELECT user_id, user_registration_time AS reg, min(event_datetime) AS submitted_at
FROM events WHERE occurrence("ApplicationSubmitted") = 1 GROUP BY user_id, user_registration_time`;

const num = (v: unknown): number => {
  if (v instanceof Date) return v.getTime() / 1000;
  const n = typeof v === 'string' && /[-T:]/.test(v) && Number.isNaN(Number(v)) ? Date.parse(v) / 1000 : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round1 = (x: number): number => Math.round(x * 10) / 10;
const pct = (n: number, d: number): number => (d === 0 ? 0 : round1((100 * n) / d));
const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return round1(s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2);
};

/** Pure. Rows: {src, user_id, submitted, scheduled, confirmed, hours_to_submit?}. A user counts once per cohort. */
export function aggregateCohorts(rows: Row[]): { baseline: CohortMetrics; aid: CohortMetrics } {
  const build = (src: 'aid' | 'baseline'): CohortMetrics => {
    const byUser = new Map<string, Row>();
    for (const r of rows) if (String(r.src).toLowerCase() === src) byUser.set(String(r.user_id), r);
    const users = [...byUser.values()];
    const hours = users
      .filter(r => num(r.submitted) > 0 && r.hours_to_submit != null)
      .map(r => num(r.hours_to_submit))
      .filter(h => h >= 0);
    const scheduled = users.filter(r => num(r.scheduled) > 0);
    return {
      households: users.length,
      submittedPct: pct(users.filter(r => num(r.submitted) > 0).length, users.length),
      medianHoursToSubmit: median(hours),
      interviewMissedPct: pct(scheduled.filter(r => num(r.confirmed) === 0).length, scheduled.length),
    };
  };
  return { baseline: build('baseline'), aid: build('aid') };
}

export function formatHeadline(m: TimeSavedMetrics): string {
  const { baseline: b, aid: a } = m;
  if (a.medianHoursToSubmit == null || b.medianHoursToSubmit == null || b.medianHoursToSubmit <= 0) {
    return `Aid households submit ${a.submittedPct}% of applications vs ${b.submittedPct}% without Aid`;
  }
  const faster = Math.max(0, round1(b.medianHoursToSubmit - a.medianHoursToSubmit));
  return `Aid households submit ${faster} hours faster (${a.medianHoursToSubmit}h vs ${b.medianHoursToSubmit}h median), ` +
    `${a.submittedPct}% submitted vs ${b.submittedPct}%, and miss ${a.interviewMissedPct}% of interviews vs ${b.interviewMissedPct}%`;
}

const TTL_MS = 30_000;
let cache: { at: number; value: TimeSavedMetrics } | undefined;
export const resetMetricsCache = (): void => { cache = undefined; };

export async function getTimeSavedMetrics(runSql: RunSql = keewanoSql): Promise<TimeSavedMetrics> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const [cohort, times] = await Promise.all([runSql(COHORT_SQL), runSql(SUBMIT_TIME_SQL)]);
    const hoursByUser = new Map(times.map(t => [String(t.user_id), (num(t.submitted_at) - num(t.reg)) / 3600]));
    const merged = cohort.map(r => ({ ...r, hours_to_submit: hoursByUser.get(String(r.user_id)) ?? null }));
    const value: TimeSavedMetrics = { ...aggregateCohorts(merged), source: 'keewano', asOf: new Date().toISOString() };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    throw new Error(`[metrics] Keewano cohort query failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
