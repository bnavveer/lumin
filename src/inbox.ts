import type { SupabaseClient } from '@supabase/supabase-js';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { CaseEvent } from './contracts.js';
import { optionalEnv } from './env.js';
import { isDemoMode, requireStaff } from './auth.js';
import { admin } from './supabase.js';
import { addTimeline, appendMessage, getHousehold } from './store.js';
import { logEvent } from './keewano.js';
import {
  createInbox, getMessage, listMessages, sendMessage, verifyWebhookSignature, type AmMessage,
} from './agentmail.js';
import { classifyCountyEmail, classifyCountyEmailWithLlm, type Classification } from './inboxClassifier.js';
import { demoEmail, DEMO_TEMPLATES } from './inboxDemo.js';

export { classifyCountyEmail } from './inboxClassifier.js';
export type { Classification, EmailCategory } from './inboxClassifier.js';

let override: SupabaseClient | undefined;
/** Test seam: replace the service-role client. Call with no args to restore. */
export function setInboxClient(c?: SupabaseClient): void {
  override = c;
}
const db = (): SupabaseClient => override ?? admin();
const fail = (op: string, e: { message: string }): never => {
  throw new Error(`[inbox] ${op}: ${e.message}`);
};

export interface CaseInbox { householdId: string; inboxId: string; address: string }
export interface InboundEmail { id: string; from: string; subject: string; text: string; receivedAt?: string }
export interface StoredEmail {
  id: string; fromAddr: string; subject: string; receivedAt: string; category: string; extracted: unknown;
}

export async function getCaseInbox(householdId: string): Promise<CaseInbox | undefined> {
  const { data, error } = await db().from('case_inboxes')
    .select('household_id, inbox_id, address').eq('household_id', householdId).maybeSingle();
  if (error) fail('getCaseInbox', error);
  if (!data) return undefined;
  const r = data as { household_id: string; inbox_id: string; address: string };
  return { householdId: r.household_id, inboxId: r.inbox_id, address: r.address };
}

async function householdIdForInbox(inboxId: string): Promise<string | undefined> {
  const { data, error } = await db().from('case_inboxes').select('household_id').eq('inbox_id', inboxId).maybeSingle();
  if (error) fail('householdIdForInbox', error);
  return (data as { household_id: string } | null)?.household_id;
}

/** Creates the case's AgentMail inbox once (`aid-case-<first 8 of id>`) and stores it. */
export async function ensureCaseInbox(householdId: string): Promise<CaseInbox> {
  const existing = await getCaseInbox(householdId);
  if (existing) return existing;
  const username = `aid-case-${householdId.replace(/-/g, '').slice(0, 8)}`;
  const inbox = await createInbox(username, 'Aid caseworker');
  const row = { household_id: householdId, inbox_id: inbox.inbox_id, address: inbox.email };
  const { error } = await db().from('case_inboxes').upsert(row, { onConflict: 'household_id' });
  if (error) fail('ensureCaseInbox', error);
  return { householdId, inboxId: inbox.inbox_id, address: inbox.email };
}

const toIso = (s?: string): string => {
  const t = s ? Date.parse(s) : NaN;
  return new Date(Number.isNaN(t) ? Date.now() : t).toISOString();
};

const LABELS: Record<Classification['category'], string> = {
  interview_scheduled: 'interview scheduled',
  documents_requested: 'documents requested',
  approved: 'approved',
  denied: 'denied',
  renewal_due: 'renewal due',
  other: 'other',
};

function summarize(c: Classification, subject: string): string {
  const x = c.extracted;
  switch (c.category) {
    case 'interview_scheduled':
      return x.atIso ? `County emailed: interview scheduled for ${x.atIso}. I will send reminders.` : `County emailed about an interview ("${subject}") but I could not read the date. A caseworker should check.`;
    case 'documents_requested':
      return `County emailed: documents requested${x.docs?.length ? ` (${x.docs.join(', ')})` : ''}${x.deadlineIso ? `, due ${x.deadlineIso.slice(0, 10)}` : ''}.`;
    case 'approved':
      return `County emailed: your ${x.program ?? 'benefits'} application was approved.`;
    case 'denied':
      return `County emailed a denial${x.reason ? ` (${x.reason})` : ''}. A caseworker will review the appeal options.`;
    case 'renewal_due':
      return `County emailed: renewal due${x.atIso ? ` ${x.atIso.slice(0, 10)}` : ''}.`;
    default:
      return `County emailed ("${subject}"). Filed for a caseworker to review.`;
  }
}

function eventsFor(c: Classification): CaseEvent | undefined {
  const x = c.extracted;
  switch (c.category) {
    case 'interview_scheduled':
      return x.at ? { type: 'InterviewScheduled', at: x.at } : { type: 'EscalatedToHuman', value: 'interview_date_unreadable' };
    case 'documents_requested':
      return { type: 'DocsRequested', value: Math.max(1, x.docs?.length ?? 0) };
    case 'approved':
      return { type: 'Approved', value: x.program ?? 'calfresh' };
    case 'renewal_due':
      return { type: 'RenewalDue', at: x.at ?? Math.floor(Date.now() / 1000) + 30 * 86_400 };
    case 'denied':
      return { type: 'EscalatedToHuman', value: 'denial' };
    default:
      return undefined;
  }
}

/** Stores, classifies, logs to Keewano and the timeline. Idempotent per email id. Returns false if already seen. */
export async function handleInboundEmail(householdId: string, email: InboundEmail): Promise<Classification | undefined> {
  const { data: seen, error: seenErr } = await db().from('inbound_emails').select('id').eq('id', email.id).maybeSingle();
  if (seenErr) fail('handleInboundEmail.lookup', seenErr);
  if (seen) return undefined;

  const c = await classifyCountyEmailWithLlm({ subject: email.subject, text: email.text, from: email.from }, new Date(), { householdId });
  const { error } = await db().from('inbound_emails').insert({
    id: email.id, household_id: householdId, from_addr: email.from, subject: email.subject,
    received_at: toIso(email.receivedAt), category: c.category, extracted: c.extracted,
  });
  if (error) fail('handleInboundEmail.insert', error);

  await addTimeline(householdId, `Email from county: ${LABELS[c.category]}`);
  const event = eventsFor(c);
  if (event) await logEvent(householdId, event);
  await appendMessage(householdId, 'assistant', summarize(c, email.subject));
  try { // propose (or, with AUTO_CALL_ON_EMAIL, place) a county call; never fails email handling
    const [{ onCountyEmail }, { liveCallsRuntime }] = await Promise.all([import('./calls/triggers.js'), import('./calls/live.js')]);
    await onCountyEmail(liveCallsRuntime(), { householdId, category: c.category, extracted: c.extracted });
  } catch (err) { console.error('[inbox] call trigger failed:', err instanceof Error ? err.message : err); }
  return c;
}

const bodyOf = (m: AmMessage): string => m.text ?? m.extracted_text ?? m.preview ?? '';

/** Polling fallback: pulls received messages not yet stored. Returns how many were processed. */
export async function syncInbox(householdId: string): Promise<number> {
  const inbox = await getCaseInbox(householdId);
  if (!inbox) return 0;
  const recent = (await listMessages(inbox.inboxId, 20)).filter((m) => !m.labels?.includes('sent'));
  let n = 0;
  for (const m of [...recent].reverse()) {
    const { data } = await db().from('inbound_emails').select('id').eq('id', m.message_id).maybeSingle();
    if (data) continue;
    const full = await getMessage(inbox.inboxId, m.message_id);
    const r = await handleInboundEmail(householdId, {
      id: full.message_id, from: full.from, subject: full.subject ?? '', text: bodyOf(full), receivedAt: full.timestamp,
    });
    if (r) n += 1;
  }
  return n;
}

export async function listInboundEmails(householdId: string, limit = 20): Promise<StoredEmail[]> {
  const { data, error } = await db().from('inbound_emails')
    .select('id, from_addr, subject, received_at, category, extracted')
    .eq('household_id', householdId).order('received_at', { ascending: false }).limit(limit);
  if (error) fail('listInboundEmails', error);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string, fromAddr: r.from_addr as string, subject: r.subject as string,
    receivedAt: r.received_at as string, category: r.category as string, extracted: r.extracted,
  }));
}

const DemoBody = z.object({
  householdId: z.uuid(),
  template: z.enum(DEMO_TEMPLATES).default('interview_scheduled'),
});

async function ensureDemoSender(): Promise<string> {
  const address = optionalEnv('AGENTMAIL_DEMO_INBOX') ?? 'la-county-dpss-demo@agentmail.to';
  try {
    await createInbox(address.split('@')[0]!, 'LA County DPSS Demo');
  } catch (err) {
    // Already exists is the normal case; anything else surfaces when the send fails.
    if (!(err instanceof Error) || !/\b(409|already)/i.test(err.message)) console.warn('[inbox] demo sender:', err instanceof Error ? err.message : err);
  }
  return address;
}

export function registerInboxRoutes(app: Hono<any>): void {
  app.post('/api/webhooks/agentmail', async (c) => {
    const raw = await c.req.text();
    const secret = optionalEnv('AGENTMAIL_WEBHOOK_SECRET');
    if (!secret) return c.json({ error: 'Webhook not configured' }, 503);
    const sig = c.req.header('svix-signature');
    const ok = sig
      ? verifyWebhookSignature(raw, { id: c.req.header('svix-id'), timestamp: c.req.header('svix-timestamp'), signature: sig }, secret)
      : c.req.query('secret') === secret;
    if (!ok) return c.json({ error: 'Unauthorized' }, 401);

    let evt: { event_type?: string; message?: AmMessage };
    try { evt = JSON.parse(raw); } catch { return c.json({ error: 'Bad JSON' }, 400); }
    if (evt.event_type !== 'message.received' || !evt.message) return c.json({ ok: true, ignored: true });

    const m = evt.message;
    const hid = await householdIdForInbox(m.inbox_id);
    if (!hid) return c.json({ ok: true, ignored: 'unknown inbox' });
    const result = await handleInboundEmail(hid, {
      id: m.message_id, from: m.from, subject: m.subject ?? '', text: bodyOf(m), receivedAt: m.timestamp,
    });
    return c.json({ ok: true, category: result?.category ?? 'duplicate' });
  });

  const scoped = async (c: any): Promise<string | Response> => {
    const id = c.req.param('id');
    const h = await getHousehold(id);
    return h && h.orgId === c.var.orgId ? id : c.json({ error: 'Not found' }, 404);
  };

  app.get('/api/staff/cases/:id/inbox', requireStaff, async (c) => {
    const id = await scoped(c);
    if (typeof id !== 'string') return id;
    const inbox = await getCaseInbox(id);
    if (!inbox) return c.json({ address: null, emails: [] });
    try { await syncInbox(id); } catch (err) { console.warn('[inbox] sync failed:', err instanceof Error ? err.message : err); }
    return c.json({ address: inbox.address, emails: await listInboundEmails(id) });
  });

  app.post('/api/staff/cases/:id/inbox', requireStaff, async (c) => {
    const id = await scoped(c);
    if (typeof id !== 'string') return id;
    const inbox = await ensureCaseInbox(id);
    return c.json({ address: inbox.address });
  });

  app.post('/api/demo/county-email', async (c, next) => {
    if (!isDemoMode()) return c.json({ error: 'Not found' }, 404);
    return next();
  }, requireStaff, async (c) => {
    const parsed = DemoBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: 'householdId (uuid) and a valid template are required' }, 400);
    const hid = parsed.data.householdId;
    const h = await getHousehold(hid);
    if (!h || h.orgId !== c.var.orgId) return c.json({ error: 'Not found' }, 404);
    const inbox = await ensureCaseInbox(hid);
    const from = await ensureDemoSender();
    const mail = demoEmail(parsed.data.template, h.firstName);
    const sent = await sendMessage(from, { to: inbox.address, subject: mail.subject, text: mail.text });
    return c.json({ ok: true, from, to: inbox.address, template: parsed.data.template, messageId: sent.message_id });
  });
}
