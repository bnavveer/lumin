// Lane B autopilot loop: Keewano decides who needs a nudge, the text engine words it, a pluggable Outbox sends it.
// Works without Lane A: the default Outbox just appends to the household thread and logs the text.
import type { Action, ActionKind } from './contracts.js';
import { findActions } from './autopilot.js';
import { chooseNudge, type NudgeKind } from './insights.js';
import { logEvent } from './keewano.js';
import { appendMessage, claimAction, getHousehold } from './store.js';
import { pollPendingExtractions } from './docExtract.js';
import { applyWaitlistStatus, checkSection8Waitlists } from './waitlistWatcher.js';

export type Outbox = (householdId: string, phone: string, text: string) => Promise<void>;

const WAITLIST_EVERY_MS = 6 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 120_000;
const NUDGE_KINDS: ReadonlySet<ActionKind> = new Set<ActionKind>(['interview_nudge', 'docs_nudge', 'renewal_start']);

export const defaultOutbox: Outbox = async (hid, phone, text) => {
  await appendMessage(hid, 'assistant', text);
  console.log(`[outbox] -> ${phone} : ${text}`);
};
let outbox: Outbox = defaultOutbox;
/** Lane A's main.ts plugs Dial's sendText in here. No args restores the default. */
export function setOutbox(fn?: Outbox): void { outbox = fn ?? defaultOutbox; }

export interface TickResult {
  found: number;
  allowed: number;
  sent: Array<{ householdId: string; kind: ActionKind; variantId?: string; text: string }>;
  skipped: Array<{ householdId: string; kind: ActionKind; reason: string }>;
  extractionsPolled: number | null;
  waitlist: { ran: boolean; householdsUpdated?: number };
  errors: string[];
}

const allowList = (): Set<string> =>
  new Set((process.env.AUTOPILOT_ALLOW ?? '').split(',').map(s => s.trim()).filter(Boolean));
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const today = (): string => new Date().toISOString().slice(0, 10);

type ConversationApi = { proactiveMessage?: (hid: string, kind: ActionKind) => Promise<Array<{ text: string }>> };
async function conversationText(hid: string, kind: ActionKind): Promise<string | undefined> {
  try {
    const mod = (await import('./conversation/index.js')) as ConversationApi;
    if (typeof mod.proactiveMessage !== 'function') return undefined;
    const msgs = await mod.proactiveMessage(hid, kind);
    const text = msgs.map(m => m.text).join('\n\n').trim();
    return text || undefined;
  } catch (err) {
    console.warn('[demoRunner] conversation engine unavailable, using chooseNudge:', errMsg(err));
    return undefined;
  }
}

async function handleAction(a: Action, allow: Set<string>, r: TickResult): Promise<void> {
  const skip = (reason: string): void => { r.skipped.push({ householdId: a.householdId, kind: a.kind, reason }); };
  if (!allow.has(a.householdId)) return skip('not in AUTOPILOT_ALLOW');
  r.allowed++;
  const h = await getHousehold(a.householdId);
  if (!h) return skip('household not found');
  if (!(await claimAction(a.householdId, a.kind, today()))) return skip('already sent today');

  let text = await conversationText(a.householdId, a.kind);
  let variantId: string | undefined;
  if (!text) {
    if (NUDGE_KINDS.has(a.kind)) {
      const n = await chooseNudge(a.kind as NudgeKind, h.firstName ?? 'there');
      text = n.text; variantId = n.variantId;
    } else {
      text = `Hi ${h.firstName ?? 'there'}, it's Aid with an update on your application. Reply HELP anytime. Aid`;
    }
  }
  await outbox(a.householdId, h.phone, text);
  await logEvent(a.householdId, { type: 'NudgeSent', value: a.kind });
  if (variantId) await logEvent(a.householdId, { type: 'NudgeVariant', value: variantId });
  r.sent.push({ householdId: a.householdId, kind: a.kind, ...(variantId ? { variantId } : {}), text });
}

let running = false;
let lastWaitlistAt = 0;

/** One autopilot tick. Never overlaps: a second concurrent call returns immediately with an error note. */
export async function runAutopilotOnce(): Promise<TickResult> {
  const r: TickResult = { found: 0, allowed: 0, sent: [], skipped: [], extractionsPolled: null, waitlist: { ran: false }, errors: [] };
  if (running) { r.errors.push('previous tick still running'); return r; }
  running = true;
  try {
    const allow = allowList();
    try {
      const actions = await findActions();
      r.found = actions.length;
      for (const a of actions) {
        try { await handleAction(a, allow, r); }
        catch (err) { r.errors.push(`${a.kind}:${a.householdId}: ${errMsg(err)}`); }
      }
    } catch (err) { r.errors.push(`findActions: ${errMsg(err)}`); }

    try { r.extractionsPolled = await pollPendingExtractions(); }
    catch (err) { r.errors.push(`pollPendingExtractions: ${errMsg(err)}`); }

    if (Date.now() - lastWaitlistAt >= WAITLIST_EVERY_MS) {
      lastWaitlistAt = Date.now();
      try {
        const results = await checkSection8Waitlists();
        r.waitlist = { ran: true, householdsUpdated: await applyWaitlistStatus(results) };
      } catch (err) { r.errors.push(`waitlist: ${errMsg(err)}`); }
    }
  } finally { running = false; }
  console.log(`[autopilot] found=${r.found} allowed=${r.allowed} sent=${r.sent.length} errors=${r.errors.length}`);
  return r;
}

export function startAutopilotLoop(opts: { intervalMs?: number } = {}): () => void {
  const intervalMs = opts.intervalMs ?? (Number(process.env.AUTOPILOT_MS) || DEFAULT_INTERVAL_MS);
  const timer = setInterval(() => { void runAutopilotOnce().catch(err => console.error('[autopilot] tick failed:', errMsg(err))); }, intervalMs);
  timer.unref?.();
  console.log(`[autopilot] loop started, every ${intervalMs}ms, allow=${allowList().size} households`);
  return () => clearInterval(timer);
}
