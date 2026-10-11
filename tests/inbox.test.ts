import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';

process.env.AID_LLM_CLASSIFY = '0'; // offline: rules-only classification
const logEvent = vi.fn(async () => {});
const addTimeline = vi.fn(async () => {});
const appendMessage = vi.fn(async () => {});
const getHousehold = vi.fn(async () => ({ id: 'h1', orgId: '00000000-0000-4000-8000-00000000a1d0', firstName: 'Rosa' }));
vi.mock('../src/keewano.js', () => ({ logEvent: (...a: unknown[]) => (logEvent as any)(...a) }));
vi.mock('../src/store.js', () => ({
  addTimeline: (...a: unknown[]) => (addTimeline as any)(...a),
  appendMessage: (...a: unknown[]) => (appendMessage as any)(...a),
  getHousehold: (...a: unknown[]) => (getHousehold as any)(...a),
}));

import { classifyCountyEmail, handleInboundEmail, registerInboxRoutes, setInboxClient } from '../src/inbox.js';
import { setAgentMailFetch, verifyWebhookSignature } from '../src/agentmail.js';

const NOW = new Date('2026-10-11T12:00:00Z');
const cls = (subject: string, text: string) => classifyCountyEmail({ subject, text, from: 'dpss@lacounty.gov' }, NOW);

describe('classifyCountyEmail', () => {
  it('parses interview date and time into a Pacific ISO timestamp', () => {
    const r = cls('CalFresh interview', 'Your interview is scheduled on October 16, 2026 at 9:00 AM.');
    expect(r.category).toBe('interview_scheduled');
    expect(r.extracted.atIso).toBe('2026-10-16T16:00:00.000Z'); // PDT = UTC-7
  });
  it('handles PM times and standard time after DST ends', () => {
    const r = cls('Interview appointment', 'We will call you for your interview on Nov 4, 2026 at 2:30 PM.');
    expect(r.extracted.atIso).toBe('2026-11-04T22:30:00.000Z'); // PST = UTC-8
  });
  it('extracts a documents list and deadline', () => {
    const r = cls('Documents needed', 'Please provide the following by October 25, 2026:\n- Pay stubs\n- Photo ID\n- Lease or utility bill');
    expect(r.category).toBe('documents_requested');
    expect(r.extracted.docs).toEqual(['pay stubs', 'photo ID', 'proof of address']);
    expect(r.extracted.deadlineIso).toBe('2026-10-26T00:00:00.000Z');
  });
  it('detects approval and the program', () => {
    const r = cls('Your Medi-Cal application has been approved', 'Coverage begins November 1, 2026.');
    expect(r).toMatchObject({ category: 'approved', extracted: { program: 'medi_cal' } });
  });
  it('detects denial with a reason', () => {
    const r = cls('Notice of Action: CalFresh denied', 'Your application was denied because your income exceeds the limit.');
    expect(r.category).toBe('denied');
    expect(r.extracted.reason).toContain('income exceeds');
  });
  it('detects renewal with a date', () => {
    const r = cls('CalFresh renewal due', 'Your annual recertification must be completed by 12/15/2026.');
    expect(r.category).toBe('renewal_due');
    expect(r.extracted.atIso).toBe('2026-12-15T17:00:00.000Z');
  });
  it('does not mistake "unable to approve" for approval', () => {
    expect(cls('Update', 'We are unable to approve your application.').category).toBe('denied');
  });
  it('returns other for newsletters', () => {
    expect(cls('County newsletter', 'Holiday office hours are posted online.').category).toBe('other');
  });
});

function fakeDb(existing: string[] = []) {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
      b.maybeSingle = async () => ({ data: null, error: null });
      b.insert = async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; };
      return b;
    },
  } as unknown as SupabaseClient;
  void existing;
  return { client, inserts };
}

describe('handleInboundEmail', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => setInboxClient());

  it('stores, logs InterviewScheduled, timeline and a case-thread note', async () => {
    const { client, inserts } = fakeDb();
    setInboxClient(client);
    await handleInboundEmail('h1', { id: 'm1', from: 'dpss@x.gov', subject: 'Interview', text: 'Your interview is on October 16, 2026 at 9:00 AM.' });
    expect(inserts[0]).toMatchObject({ id: 'm1', household_id: 'h1', category: 'interview_scheduled' });
    expect(addTimeline).toHaveBeenCalledWith('h1', 'Email from county: interview scheduled');
    expect(logEvent).toHaveBeenCalledWith('h1', { type: 'InterviewScheduled', at: 1792166400 });
    expect(appendMessage).toHaveBeenCalledWith('h1', 'assistant', expect.stringContaining('interview scheduled'));
  });
  it('maps denial to EscalatedToHuman and docs to DocsRequested', async () => {
    setInboxClient(fakeDb().client);
    await handleInboundEmail('h1', { id: 'm2', from: 'a', subject: 'Denied', text: 'denied because x' });
    expect(logEvent).toHaveBeenCalledWith('h1', { type: 'EscalatedToHuman', value: 'denial' });
    await handleInboundEmail('h1', { id: 'm3', from: 'a', subject: 'Documents needed', text: 'Please provide pay stubs and photo ID.' });
    expect(logEvent).toHaveBeenCalledWith('h1', { type: 'DocsRequested', value: 2 });
  });
});

describe('webhook + demo routes', () => {
  const app = new Hono();
  registerInboxRoutes(app);
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; setAgentMailFetch(); setInboxClient(); });

  const body = JSON.stringify({ event_type: 'message.received', message: { inbox_id: 'i', message_id: 'x', from: 'a', subject: 's' } });

  it('rejects a bad shared secret and an unconfigured webhook', async () => {
    delete process.env.AGENTMAIL_WEBHOOK_SECRET;
    expect((await app.request('/api/webhooks/agentmail', { method: 'POST', body })).status).toBe(503);
    process.env.AGENTMAIL_WEBHOOK_SECRET = 'good';
    expect((await app.request('/api/webhooks/agentmail?secret=bad', { method: 'POST', body })).status).toBe(401);
    expect((await app.request('/api/webhooks/agentmail', { method: 'POST', body })).status).toBe(401);
  });
  it('accepts a valid shared secret and ignores unknown inboxes', async () => {
    process.env.AGENTMAIL_WEBHOOK_SECRET = 'good';
    setInboxClient(fakeDb().client);
    const r = await app.request('/api/webhooks/agentmail?secret=good', { method: 'POST', body });
    expect(r.status).toBe(200);
  });
  it('verifies Svix signatures and rejects tampering or stale timestamps', () => {
    const key = Buffer.from('supersecretkey');
    const secret = `whsec_${key.toString('base64')}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac('sha256', key).update(`id1.${ts}.${body}`).digest('base64');
    const h = { id: 'id1', timestamp: ts, signature: `v1,${sig}` };
    expect(verifyWebhookSignature(body, h, secret)).toBe(true);
    expect(verifyWebhookSignature(body + 'x', h, secret)).toBe(false);
    expect(verifyWebhookSignature(body, { ...h, timestamp: String(Number(ts) - 3600) }, secret)).toBe(false);
  });
  it('disables the demo email route unless DEMO_MODE=true', async () => {
    process.env.DEMO_MODE = 'false';
    const r = await app.request('/api/demo/county-email', {
      method: 'POST', headers: { Authorization: 'Bearer abc' }, body: '{}',
    });
    expect([401, 404]).toContain(r.status);
    expect(r.status).not.toBe(200);
  });
});
