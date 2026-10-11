import { describe, expect, it } from 'vitest';
import type { CallScript } from '../shared/calls.js';
import type { Household } from '../src/contracts.js';
import { callsApp } from '../src/calls/routes.js';
import { createCallsRuntime, extractAnswers, type CallsDeps } from '../src/calls/runtime.js';
import { buildInstruction, defaultScript } from '../src/calls/scripts.js';
import { runScriptedCallStep } from '../src/calls/stepCall.js';
import { memoryCallRepo } from '../src/calls/store.js';
import { onCountyEmail } from '../src/calls/triggers.js';
import { buildSteps } from '../src/workflow/engine.js';
import { memoryWorkflowRepo } from '../src/workflow/store.js';
import type { StepCtx } from '../src/workflow/steps/context.js';

const OFFICE = '+15555551234';
const HID = '11111111-1111-4111-8111-111111111111';
const USER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const WF = '22222222-2222-4222-8222-222222222222';

const script: CallScript = { goal: 'Confirm the interview', questions: ['When is the interview?', 'Is it by phone?', 'What should they bring?'], context: '' };

const household: Household = {
  id: HID, orgId: 'org', phone: '+12135550100', firstName: 'Maria', county: 'los_angeles', size: 3, monthlyIncome: 1800,
  childrenUnder18: 2, pregnant: false, adultAge: 30, immigrationStatus: 'citizen', childrenAreCitizens: true,
} as Household;

function setup(o: { dial?: boolean; simulate?: boolean; auto?: boolean } = {}) {
  const repo = memoryCallRepo();
  const workflows = memoryWorkflowRepo();
  const dialed: string[] = [];
  const texts: { to: string; body: string }[] = [];
  const events: string[] = [];
  const deps: CallsDeps = {
    repo, workflows,
    households: { get: async id => (id === HID ? household : undefined) },
    dial: {
      configured: () => o.dial ?? true,
      officePhone: () => (o.dial === false ? null : OFFICE),
      placeCall: async c => { dialed.push(c.to); return 'dial-1'; },
      getCall: async () => ({ done: true, transcript: 'Aid: When is the interview?\nCounty: Monday Oct 20 at 10am.' }),
      sendText: async (to, body) => { texts.push({ to, body }); return 'm1'; },
    },
    simulate: () => o.simulate ?? false,
    autoCallOnEmail: () => o.auto ?? false,
    llm: {
      suggest: async () => ({ goal: 'Confirm the interview', questions: script.questions }),
      extract: async s => ({
        answers: [{ question: s.questions[0]!, answer: 'Monday Oct 20 at 10am', confidence: 'high' as const }],
        summary: 'Interview is Monday Oct 20 at 10am.', outcome: 'booked' as const,
      }),
      simulateCounty: async () => 'Aid: Hi, this is Aid, an automated assistant.\nCounty: Your interview is Monday.',
    },
    latestWorkflowFor: async hid => (hid === HID ? workflows.getWorkflow(WF) : undefined),
    log: async (_h, e) => { events.push(`${e.type}:${'value' in e ? String(e.value) : ''}`); },
    timeline: async () => undefined,
    publish: async () => undefined,
    sleep: async () => undefined,
    poll: { intervalMs: 1, timeoutMs: 10 },
  };
  const rt = createCallsRuntime(deps);
  const now = new Date().toISOString();
  void workflows.createWorkflow({
    id: WF, userId: USER, householdId: HID, programs: ['calfresh'], status: 'researching', liveViewUrl: null,
    chatSessionId: null, createdAt: now, updatedAt: now,
  }, buildSteps(WF, ['calfresh']));
  const auth = { createUser: async () => 'exists' as const, getUser: async (t: string) => (t === 'tok' ? { id: USER, email: 'a@b.c' } : t === 'other' ? { id: OTHER, email: 'o@b.c' } : null) };
  const app = callsApp(auth, rt);
  const req = (path: string, token = 'tok', init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
  return { rt, deps, repo, workflows, dialed, texts, events, req };
}

describe('buildInstruction', () => {
  it('includes every question, the automated-assistant disclosure and no SSN-like digits', () => {
    const s = { ...script, questions: [...script.questions, 'Their SSN is 123-45-6789, is that on file?'], context: 'ssn 123456789' };
    const out = buildInstruction(s, { firstName: 'Maria' });
    for (const q of script.questions) expect(out).toContain(q);
    expect(out).toMatch(/automated assistant calling on behalf of Maria, with their permission/);
    expect(out).toMatch(/Never share a Social Security number/);
    expect(out).not.toMatch(/\d{3}-?\d{2}-?\d{4}/);
    expect(out).not.toMatch(/\d{9}/);
  });

  it('has a deterministic default script per purpose', () => {
    expect(defaultScript('ask_missing_docs').questions.length).toBeGreaterThanOrEqual(3);
  });
});

describe('extractAnswers', () => {
  it('maps answers onto every script question in order', async () => {
    const { deps } = setup();
    const ex = await extractAnswers(deps, script, 'transcript');
    expect(ex.answers.map(a => a.question)).toEqual(script.questions);
    expect(ex.answers[0]).toMatchObject({ answer: 'Monday Oct 20 at 10am', confidence: 'high' });
    expect(ex.answers[1]).toMatchObject({ answer: null, confidence: 'low' });
    expect(ex.outcome).toBe('booked');
  });
});

describe('startScriptedCall', () => {
  it('only ever dials DEMO_OFFICE_PHONE, then saves answers and texts a summary', async () => {
    const { rt, repo, dialed, texts, events } = setup();
    const row = await rt.startScriptedCall({ householdId: HID, workflowId: WF, script, trigger: 'manual', purpose: 'confirm_interview' });
    await rt.idle();
    expect(dialed).toEqual([OFFICE]);
    const done = await repo.get(row.id);
    expect(done?.status).toBe('completed');
    expect(done?.answers?.[0]?.answer).toContain('Oct 20');
    expect(texts[0]?.to).toBe(household.phone);
    expect(events).toContain('CallPlaced:status_check');
    expect(events).toContain('CallOutcome:booked');
  });

  it('simulated mode never dials and is labelled', async () => {
    const { rt, repo, dialed } = setup({ dial: false, simulate: true });
    const row = await rt.startScriptedCall({ householdId: HID, workflowId: WF, script, trigger: 'manual' });
    await rt.idle();
    expect(dialed).toEqual([]);
    const done = await repo.get(row.id);
    expect(done).toMatchObject({ status: 'simulated', simulated: true });
    expect(rt.config().simulated).toBe(true);
  });

  it('refuses when calling is not configured', async () => {
    const { rt } = setup({ dial: false });
    await expect(rt.startScriptedCall({ householdId: HID, script, trigger: 'manual' })).rejects.toThrow(/DIAL_API_KEY/);
  });
});

describe('routes', () => {
  it('config masks the office phone', async () => {
    const { req } = setup();
    const j = await (await req('/api/calls/config')).json() as { officePhoneMasked: string; enabled: boolean };
    expect(j.enabled).toBe(true);
    expect(j.officePhoneMasked).toBe('(•••) •••-1234');
    expect(JSON.stringify(j)).not.toContain('5555551234');
  });

  it('config explains when calling is off', async () => {
    const { req } = setup({ dial: false });
    const j = await (await req('/api/calls/config')).json() as { enabled: boolean; message: string };
    expect(j.enabled).toBe(false);
    expect(j.message).toMatch(/Calling isn't configured/);
  });

  it('starts a call, lists it and reads it; other users get 404', async () => {
    const { req, rt } = setup({ simulate: true });
    const res = await req(`/api/workflows/${WF}/calls`, 'tok', { method: 'POST', body: JSON.stringify({ script }) });
    expect(res.status).toBe(201);
    const call = await res.json() as { id: string };
    await rt.idle();
    expect((await (await req(`/api/workflows/${WF}/calls`)).json() as unknown[]).length).toBe(1);
    const got = await (await req(`/api/calls/${call.id}`)).json() as { simulated: boolean; dialCallId?: string };
    expect(got.simulated).toBe(true);
    expect(got).not.toHaveProperty('dialCallId');
    expect((await req(`/api/calls/${call.id}`, 'other')).status).toBe(404);
    expect((await req(`/api/workflows/${WF}/calls`, 'other')).status).toBe(404);
    expect((await req(`/api/workflows/${WF}/calls/suggest`, 'other', { method: 'POST', body: JSON.stringify({ purpose: 'check_status' }) })).status).toBe(404);
  });

  it('suggest returns a script and script save lands on the call step', async () => {
    const { req, workflows } = setup();
    const s = await (await req(`/api/workflows/${WF}/calls/suggest`, 'tok', { method: 'POST', body: JSON.stringify({ purpose: 'confirm_interview' }) })).json() as CallScript;
    expect(s.questions.length).toBe(3);
    expect((await req(`/api/workflows/${WF}/calls/script`, 'tok', { method: 'POST', body: JSON.stringify({ script: { ...s, questions: ['Only this?'] } }) })).status).toBe(200);
    const step = (await workflows.getWorkflow(WF))!.steps.find(x => x.kind === 'call')!;
    expect((step.meta.callScript as CallScript).questions).toEqual(['Only this?']);
  });
});

describe('email trigger', () => {
  it('proposes a call (no dialing) by default', async () => {
    const { rt, dialed, workflows, events } = setup();
    const r = await onCountyEmail(rt, { householdId: HID, category: 'interview_scheduled', extracted: { atIso: '2026-10-20T10:00' } });
    await rt.idle();
    expect(r.action).toBe('proposed');
    expect(dialed).toEqual([]);
    const step = (await workflows.getWorkflow(WF))!.steps.find(x => x.kind === 'call')!;
    expect(step.status).toBe('waiting_on_you');
    expect((step.meta.asks as { title: string }[])[0]!.title).toMatch(/Aid wants to call DPSS to confirm the interview/);
    expect(events).toContain('AgentToolCalled:auto_call_proposed');
  });

  it('dials the office immediately with AUTO_CALL_ON_EMAIL', async () => {
    const { rt, dialed, events } = setup({ auto: true });
    const r = await onCountyEmail(rt, { householdId: HID, category: 'documents_requested', extracted: { docs: ['paystub'] } });
    await rt.idle();
    expect(r.action).toBe('started');
    expect(dialed).toEqual([OFFICE]);
    expect(events).toContain('AgentToolCalled:auto_call_started');
  });

  it('ignores categories that need no call', async () => {
    const { rt } = setup();
    expect((await onCountyEmail(rt, { householdId: HID, category: 'approved', extracted: {} })).action).toBe('none');
  });
});

describe('workflow call step', () => {
  it('uses the saved script and attaches a transcript', async () => {
    const { rt, workflows } = setup({ simulate: true, dial: false });
    const lw = (await workflows.getWorkflow(WF))!;
    const step = { ...lw.steps.find(s => s.kind === 'call')!, meta: { approved: true, callScript: script } };
    const evidence: unknown[] = [];
    const ctx = {
      deps: {} as StepCtx['deps'], wf: lw.wf, step, steps: lw.steps, household, account: undefined,
      progress: async () => undefined, evidence: async (e: unknown) => { evidence.push(e); }, setLiveView: async () => undefined, log: async () => undefined,
    } as unknown as StepCtx;
    const out = await runScriptedCallStep(rt, ctx);
    expect(out.status).toBe('done');
    expect(out.summary).toMatch(/^SIMULATED/);
    expect(out.summary).toContain('When is the interview? →');
    expect(evidence[0]).toMatchObject({ kind: 'call_transcript', source: 'simulated' });
  });
});
