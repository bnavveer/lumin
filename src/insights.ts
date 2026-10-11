// Self-improving loop: Keewano tells us which nudge wording gets households to act; the agent sends more of it.
import { keewanoSql } from './keewano.js';

type Row = Record<string, unknown>;
export type RunSql = (sql: string) => Promise<Row[]>;
export type NudgeKind = 'interview_nudge' | 'docs_nudge' | 'renewal_start';
export interface NudgeVariant { id: string; text: (name: string) => string }
export interface VariantStat { sent: number; succeeded: number }
export type VariantStats = Record<string, VariantStat>;

const UNKNOWN_NUMBER = 'Please answer calls from unknown numbers, it will be me.';

export const NUDGE_VARIANTS: Record<NudgeKind, NudgeVariant[]> = {
  interview_nudge: [
    { id: 'interview_direct', text: n => `Hi ${n}, your benefits interview is coming up soon. Reply 1 to confirm, or 2 and I'll call to reschedule. ${UNKNOWN_NUMBER} - Lumin` },
    { id: 'interview_warm', text: n => `Hi ${n}, it's Lumin. Your interview is within 2 days and I want to make sure you don't lose your spot. Reply 1 to confirm, or 2 and I'll call to reschedule. ${UNKNOWN_NUMBER} - Lumin` },
    { id: 'interview_call', text: n => `${n}, the county will call you for your interview soon. Reply 1 to confirm, or 2 and I'll call to reschedule. They may show as an unknown number, so please pick up. - Lumin` },
  ],
  docs_nudge: [
    { id: 'docs_photo', text: n => `Hi ${n}, I still need your recent pay stubs to finish your application. Just text me a photo of them right here. - Lumin` },
    { id: 'docs_quick', text: n => `Hi ${n}, one thing left: a photo of your last two pay stubs. Snap them with your phone and send them here, it takes a minute. - Lumin` },
    { id: 'docs_deadline', text: n => `${n}, your application is waiting on pay stubs. Text me a photo of them today so we can submit before anything expires. - Lumin` },
  ],
  renewal_start: [
    { id: 'renewal_start', text: n => `Hi ${n}, your benefits renewal is due soon. Reply YES and I'll prepare the paperwork for you to sign, no forms needed. - Lumin` },
    { id: 'renewal_urgent', text: n => `${n}, don't let your benefits lapse: renewal is due within a month. Reply YES and I'll do the heavy lifting. - Lumin` },
  ],
};

export const VARIANT_SQL = `SELECT "NudgeVariant" AS variant, count("NudgeVariant") AS sent,
  count("InterviewConfirmed") AS confirmed, count("DocReceived") AS docs, count("PacketSigned") AS signed
FROM events WHERE "NudgeVariant" IS NOT NULL GROUP BY variant`;

/** Per variant: nudges sent vs how many were followed by a confirmation, document or signature. */
export async function variantStats(runSql: RunSql = keewanoSql): Promise<VariantStats> {
  const out: VariantStats = {};
  for (const r of await runSql(VARIANT_SQL)) {
    const id = String(r.variant ?? '');
    if (!id) continue;
    const sent = Number(r.sent) || 0;
    const succ = (Number(r.confirmed) || 0) + (Number(r.docs) || 0) + (Number(r.signed) || 0);
    const prev = out[id] ?? { sent: 0, succeeded: 0 };
    out[id] = { sent: prev.sent + sent, succeeded: Math.min(prev.sent + sent, prev.succeeded + succ) };
  }
  return out;
}

/** Laplace-smoothed epsilon-greedy: explore with probability epsilon, otherwise the best (succ+1)/(sent+2). */
export function pickNudgeVariant(
  kind: NudgeKind, stats: VariantStats, rng: () => number = Math.random, epsilon = 0.2,
): NudgeVariant {
  const variants = NUDGE_VARIANTS[kind];
  if (rng() < epsilon) return variants[Math.min(variants.length - 1, Math.floor(rng() * variants.length))]!;
  const score = (v: NudgeVariant) => { const s = stats[v.id]; return ((s?.succeeded ?? 0) + 1) / ((s?.sent ?? 0) + 2); };
  return variants.reduce((best, v) => (score(v) > score(best) ? v : best));
}

const TTL_MS = 60_000;
let cache: { at: number; stats: VariantStats } | undefined;
export const resetInsightsCache = (): void => { cache = undefined; };

/** Chooses a variant using cached Keewano stats; any failure falls back to the first variant. */
export async function chooseNudge(
  kind: NudgeKind, name: string, runSql: RunSql = keewanoSql, rng: () => number = Math.random,
): Promise<{ variantId: string; text: string }> {
  let stats: VariantStats = {};
  try {
    if (!cache || Date.now() - cache.at >= TTL_MS) cache = { at: Date.now(), stats: await variantStats(runSql) };
    stats = cache.stats;
  } catch (err) {
    console.error('[insights] variant stats unavailable, using first variant:', err);
    const first = NUDGE_VARIANTS[kind][0]!;
    return { variantId: first.id, text: first.text(name) };
  }
  const v = pickNudgeVariant(kind, stats, rng);
  return { variantId: v.id, text: v.text(name) };
}
