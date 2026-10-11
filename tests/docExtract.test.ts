import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXTRACT_SCHEMAS, addDays, buildPrompt, computeDates, pickProvider, pollExtraction,
  pollPendingExtractions, setExtractDeps, startExtraction,
} from '../src/docExtract.js';
import { setVaultClient } from '../src/vault.js';
import { fakeDb } from './_fakeDb.js';

const STUB = { employerName: 'ACME', payPeriodStart: '2026-09-16', payPeriodEnd: '2026-09-30', payDate: '2026-10-02', grossPay: 1240, netPay: 1010 };
let logs: unknown[];
let session: { done: boolean; structuredOutput: unknown };
const baseDeps = () => ({
  createSession: vi.fn(async () => ({ id: 'devin-1', url: 'https://app.devin.ai/sessions/1' })),
  getSession: vi.fn(async (id: string) => ({ id, status: 'x', url: '', ...session })),
  getMessageAnswer: vi.fn(async () => null),
  hasModel: vi.fn(() => false),
  claudeExtract: vi.fn(async () => STUB),
  logEvent: vi.fn(async (_h: string, e: unknown) => { logs.push(e); }),
  getTimeline: vi.fn(async () => []),
});
const seed = () => fakeDb({ documents: [{ id: 'd1', household_id: 'h1', doc_type: 'paystub', storage_path: 'o/h/d1.png', status: 'received' }] });

beforeEach(() => { logs = []; session = { done: false, structuredOutput: null }; });
afterEach(() => { setExtractDeps(); setVaultClient() });

describe('schemas and dates', () => {
  it('parses a paystub with nulls and optional fields', () => {
    expect(EXTRACT_SCHEMAS.paystub.safeParse(STUB).success).toBe(true);
    expect(EXTRACT_SCHEMAS.paystub.safeParse({ ...STUB, grossPay: null }).success).toBe(true);
    expect(EXTRACT_SCHEMAS.paystub.safeParse({ ...STUB, grossPay: 'lots' }).success).toBe(false);
  });
  it('expiry math', () => {
    expect(addDays('2026-10-02', 30)).toBe('2026-11-01');
    expect(computeDates('paystub', STUB)).toEqual({ docDate: '2026-09-30', expiresAt: '2026-11-01' });
    expect(computeDates('id', { expirationDate: '2029-05-05' }).expiresAt).toBe('2029-05-05');
  });
  it('prompt has no secrets and states constraints', () => {
    process.env.DEVIN_API_KEY = 'SECRET123';
    const p = buildPrompt('paystub', 'https://signed.example/x');
    expect(p).not.toContain('SECRET123');
    expect(p).toMatch(/null/); expect(p).toMatch(/Do not store/);
    delete process.env.DEVIN_API_KEY;
  });
});

describe('lifecycle', () => {
  it('start -> reading, poll pending, then read with dates and events logged once', async () => {
    const f = seed(); setVaultClient(f.client);
    const d = baseDeps(); setExtractDeps(d);
    const r = await startExtraction('d1');
    expect(r).toMatchObject({ provider: 'devin', sessionId: 'devin-1' });
    expect(f.signed[0]).toBe('o/h/d1.png:3600');
    expect(f.tables.documents![0]).toMatchObject({ status: 'reading', extract_provider: 'devin', extract_session: 'devin-1' });

    expect(await pollPendingExtractions()).toBe(0);
    session = { done: true, structuredOutput: { answer: STUB } };
    expect(await pollPendingExtractions()).toBe(1);
    expect(f.tables.documents![0]).toMatchObject({ status: 'read', doc_date: '2026-09-30', expires_at: '2026-11-01' });
    expect(logs).toEqual([{ type: 'DocReceived', value: 'paystub' }, { type: 'AgentToolCalled', value: 'devin_doc_extract' }]);
    await pollExtraction('d1'); // no-op once read
    expect(logs).toHaveLength(2);
  });

  it('needs_review when fields are null or output is malformed', async () => {
    const f = seed(); setVaultClient(f.client); setExtractDeps(baseDeps());
    await startExtraction('d1');
    session = { done: true, structuredOutput: { answer: { ...STUB, netPay: null } } };
    expect((await pollExtraction('d1')).status).toBe('needs_review');

    const g = seed(); setVaultClient(g.client);
    await startExtraction('d1');
    session = { done: true, structuredOutput: { answer: { grossPay: 'x' } } };
    expect((await pollExtraction('d1')).status).toBe('needs_review');
  });

  it('skips DocReceived if the timeline already has it', async () => {
    const f = seed(); setVaultClient(f.client);
    setExtractDeps({ ...baseDeps(), getTimeline: vi.fn(async () => [{ label: 'DocReceived: paystub', at: '' }]) });
    await startExtraction('d1');
    session = { done: true, structuredOutput: { answer: STUB } };
    await pollExtraction('d1');
    expect(logs).toEqual([{ type: 'AgentToolCalled', value: 'devin_doc_extract' }]);
  });
});

describe('message fallback', () => {
  it('parses the answer from Devin messages when structured_output is null', async () => {
    const { answerFromMessages } = await import('../src/docExtract.js');
    expect(answerFromMessages(['hi', `{"answer": {"a": 1}}\n\n- note {x}`])).toEqual({ a: 1 });
    expect(answerFromMessages(['no json'])).toBeNull();
    const f = seed(); setVaultClient(f.client);
    setExtractDeps({ ...baseDeps(), getMessageAnswer: vi.fn(async () => STUB) });
    await startExtraction('d1');
    session = { done: true, structuredOutput: null, status: 'finished' } as never;
    expect((await pollExtraction('d1')).status).toBe('read');
  });
});

describe('provider switch', () => {
  it('uses devin by default and claude when hasModel()', async () => {
    setExtractDeps(baseDeps());
    expect(pickProvider()).toBe('devin');
    const f = seed(); setVaultClient(f.client);
    const d = { ...baseDeps(), hasModel: vi.fn(() => true) }; setExtractDeps(d);
    expect(pickProvider()).toBe('claude');
    const r = await startExtraction('d1');
    expect(r).toMatchObject({ provider: 'claude', status: 'read' });
    expect(d.createSession).not.toHaveBeenCalled();
    expect(f.tables.documents![0]).toMatchObject({ status: 'read', extract_provider: 'claude' });
  });
});
