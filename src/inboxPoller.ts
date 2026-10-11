// Polls every case's AgentMail inbox so county emails are processed without anyone opening the dashboard.
// handleInboundEmail -> onCountyEmail then proposes (or, with AUTO_CALL_ON_EMAIL=true, places) the follow-up call.
// Webhooks are better in production (POST /api/webhooks/agentmail); this covers local/demo runs with no public URL.
import { admin } from './supabase.js';
import { syncInbox } from './inbox.js';

export const INBOX_POLL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

export async function pollAllInboxes(): Promise<number> {
  const { data, error } = await admin().from('case_inboxes').select('household_id').limit(200);
  if (error) throw new Error(`[inboxPoller] list inboxes: ${error.message}`);
  let processed = 0;
  for (const row of data ?? []) {
    try { processed += await syncInbox(row.household_id as string); }
    catch (err) { console.warn('[inboxPoller] sync failed:', err instanceof Error ? err.message : err); }
  }
  return processed;
}

export function startInboxPoller(intervalMs = INBOX_POLL_MS): void {
  if (timer || !process.env.AGENTMAIL_API_KEY) return;
  const tick = async (): Promise<void> => {
    if (running) return; // never overlap ticks
    running = true;
    try {
      const n = await pollAllInboxes();
      if (n > 0) console.log(`[inboxPoller] processed ${n} new email(s)`);
    } catch (err) {
      console.warn('[inboxPoller] tick failed:', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => { void tick(); }, intervalMs);
  void tick();
}
