// Autopilot: Keewano's answers decide what the agent does next. Every Action comes from a Keewano SQL query.
import type { Action, ActionKind } from './contracts.js';
import type { AutopilotState } from '../web/src/lib/types.js';
import { keewanoSql } from './keewano.js';

type Row = Record<string, unknown>;
export type RunSql = (sql: string) => Promise<Row[]>;

// Each query returns one row per household (user_id = household id). Per-user state is computed in an inner
// SELECT ... GROUP BY user_id, then filtered by the outer query (Keewano SQL has no joins or window functions).
// WHERE "X" > 0 / IS NOT NULL selects the stretch of a user's timeline after X first happened, so aggregates
// inside it only see events that came after X.
export const QUERIES: Record<ActionKind, string> = {
  // interview scheduled within the next 48h and not yet confirmed
  interview_nudge: `SELECT s.user_id AS user_id, s.at AS at FROM (
  SELECT user_id, max("InterviewScheduled") AS at, count("InterviewConfirmed") AS confirmed
  FROM events WHERE "Source" = 'aid' GROUP BY user_id) s
WHERE s.confirmed = 0 AND s.at BETWEEN now() AND now() + INTERVAL '48 hours' LIMIT 200`,
  // documents requested more than 3 days ago and none received since
  docs_nudge: `SELECT s.user_id AS user_id, s.requested_at AS requested_at FROM (
  SELECT user_id, min(event_datetime) AS requested_at, count("DocReceived") AS received
  FROM events WHERE "Source" = 'aid' AND "DocsRequested" > 0 GROUP BY user_id) s
WHERE s.received = 0 AND s.requested_at < now() - INTERVAL '3 days' LIMIT 200`,
  // packet signed but never submitted
  submit: `SELECT s.user_id AS user_id FROM (
  SELECT user_id, count("PacketSigned") AS signed, count("ApplicationSubmitted") AS submitted
  FROM events WHERE "Source" = 'aid' GROUP BY user_id) s
WHERE s.signed > 0 AND s.submitted = 0 LIMIT 200`,
  // waitlist closed (still closed: no later 'open') for 7+ days
  waitlist_check: `SELECT s.user_id AS user_id, s.closed_at AS closed_at FROM (
  SELECT user_id, min(event_datetime) AS closed_at, count("WaitlistStatus") AS closed
  FROM events WHERE "Source" = 'aid' AND "WaitlistStatus" = 'closed' GROUP BY user_id) s
WHERE s.closed_at < now() - INTERVAL '7 days' LIMIT 200`,
  // renewal due within 30 days and no packet signed since the RenewalDue event
  renewal_start: `SELECT s.user_id AS user_id, s.due AS due FROM (
  SELECT user_id, max("RenewalDue") AS due, count("PacketSigned") AS signed
  FROM events WHERE "Source" = 'aid' AND "RenewalDue" IS NOT NULL GROUP BY user_id) s
WHERE s.signed = 0 AND s.due BETWEEN now() AND now() + INTERVAL '30 days' LIMIT 200`,
};

const DETAIL: Record<ActionKind, string> = {
  interview_nudge: 'Interview within 48h, not confirmed',
  docs_nudge: 'Documents requested over 3 days ago, none received',
  submit: 'Packet signed, application not yet submitted',
  waitlist_check: 'Waitlist closed for 7+ days, recheck due',
  renewal_start: 'Renewal due within 30 days, not started',
};

/** Pure: turns query rows into Actions, skipping rows without an id and de-duping within the query. */
export function rowsToActions(kind: ActionKind, rows: Row[], idColumn = 'user_id'): Action[] {
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const row of rows) {
    const raw = row[idColumn];
    const householdId = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw);
    if (!householdId || seen.has(householdId)) continue;
    seen.add(householdId);
    out.push({ householdId, kind, source: 'keewano', detail: DETAIL[kind] });
  }
  return out;
}

/** Runs every query; one failing query is logged and skipped. Throws only if ALL queries fail. */
export async function findActions(runSql: RunSql = keewanoSql): Promise<Action[]> {
  const kinds = Object.keys(QUERIES) as ActionKind[];
  const settled = await Promise.allSettled(kinds.map(k => runSql(QUERIES[k])));
  const seen = new Set<string>();
  const actions: Action[] = [];
  let failures = 0;
  settled.forEach((res, i) => {
    if (res.status === 'rejected') {
      failures++;
      console.error(`[autopilot] ${kinds[i]} query failed:`, res.reason);
      return;
    }
    for (const a of rowsToActions(kinds[i]!, res.value)) {
      const key = `${a.householdId}:${a.kind}`;
      if (!seen.has(key)) { seen.add(key); actions.push(a); }
    }
  });
  if (failures === kinds.length) throw new Error('[autopilot] every Keewano query failed');
  return actions;
}

const TTL_MS = 20_000;
let cache: { at: number; state: AutopilotState } | undefined;
export const resetAutopilotCache = (): void => { cache = undefined; };

export async function getAutopilotState(runSql: RunSql = keewanoSql): Promise<AutopilotState> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.state;
  const actions = await findActions(runSql);
  const state: AutopilotState = { actions, lastRunAt: new Date().toISOString(), source: 'keewano' };
  cache = { at: Date.now(), state };
  return state;
}
