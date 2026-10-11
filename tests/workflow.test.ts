import { describe, expect, it, vi } from 'vitest';
import type { Workflow } from '../shared/workflow.js';
import type { Household } from '../src/contracts.js';
import type { HeldDoc, WorkflowDeps } from '../src/workflow/deps.js';
import { createEngine } from '../src/workflow/engine.js';
import { workflowApp } from '../src/workflow/routes.js';
import { memoryWorkflowRepo } from '../src/workflow/store.js';

interface Opts { dial?: boolean; fillStatus?: 'stopped_for_signature' | 'error' }

function setup(opts: Opts = {}) {
  const repo = memoryWorkflowRepo();
  const households = new Map<string, Household>();
  const docs: HeldDoc[] = [];
  const users = new Map<string, { id: string; email: string; password: string }>();
  const tokens = new Map<string, string>();
  const sent: { to: string; body: string }[] = [];
  const calls: string[] = [];
  const events: string[] = [];
  const deps: WorkflowDeps = {
    repo,
    auth: {
      async createUser(email, password) {
        if ([...users.values()].some(u => u.email === email)) return 'exists';
        const id = `00000000-0000-4000-8000-${String(users.size + 1).padStart(12, '0')}`;
        users.set(id, { id, email, password });
        tokens.set(`tok-${id}`, id);
        return { userId: id };
      },
      async getUser(token) {
        const id = tokens.get(token);
        const u = id ? users.get(id) : undefined;
        return u ? { id: u.id, email: u.email } : null;
      },
    },
    households: {
      get: async id => households.get(id),
      upsert: async h => { households.set(h.id, { ...h }); },
    },
    chatFields: async () => ({ county: 'san_francisco', size: 3, monthlyIncome: 1800 }),
    research: {
      fromResearch: async () => ({ answer: 'Bring ID and pay stubs [1].', citations: [{ title: 'CalFresh basics', url: 'https://www.cdss.ca.gov/calfresh', source: 'research/apply-food-cash-tax.md', detail: 'Bring ID and pay stubs.' }] }),
      fromWeb: async () => ({ answer: 'Offices open 8-5 [1].', citations: [{ title: 'DPSS offices', url: 'https://dpss.lacounty.gov', source: 'exa:dpss.lacounty.gov', detail: 'Open 8-5.' }] }),
      section8: async () => [],
      summarize: async () => 'Have your ID and recent pay stubs ready. Apply online at BenefitsCal.',
    },
    docs: {
      list: async hid => docs.filter(d => d.storagePath.includes(hid)),
      store: async (hid, _org, _buf, _ct, docType) => {
        const id = `doc-${docs.length + 1}`;
        docs.push({ id, docType, status: 'needs_review', storagePath: `org/${hid}/${id}.jpg`, extracted: null, expiresAt: null });
        return { id };
      },
      extract: async () => ({ name: 'SYNTHETIC' }),
      signedUrl: async p => `https://signed.example/${p}`,
      storeScreenshot: async () => 'https://signed.example/shot.png',
    },
    fill: {
      run: vi.fn(async o => {
        o.onEvent?.({ at: new Date().toISOString(), step: 'live_view', message: 'live view: https://live.kernel.example/abc' });
        o.onEvent?.({ at: new Date().toISOString(), step: 'page', message: 'Household: Members' });
        return opts.fillStatus === 'error'
          ? { status: 'error' as const, pagesCompleted: 2, missingFields: [], detail: 'boom' }
          : { status: 'stopped_for_signature' as const, pagesCompleted: 12, missingFields: [], liveViewUrl: 'https://live.kernel.example/abc', screenshotPath: '/tmp/x.png', replayViewUrl: 'https://replay.kernel.example/r', sessionId: 'kb-123' };
      }),
      publicBase: async () => 'https://pub.example',
      localBase: () => 'http://localhost:3000',
      kernelAvailable: () => true,
    },
    county: { submit: async () => 'LA-2026-123456' },
    dial: {
      configured: () => opts.dial ?? false,
      officePhone: () => (opts.dial ? '+15555550100' : null),
      placeCall: async o => { calls.push(o.to); return 'call-1'; },
      getCall: async () => ({ done: true, transcript: 'Agent: Your interview is Monday at 10am.' }),
      sendText: async (to, body) => { sent.push({ to, body }); return 'msg-1'; },
    },
    summarizeCall: async () => ({ outcome: 'booked', details: 'Interview Monday at 10am.' }),
    log: async (_h, e) => { events.push(e.type); },
    sleep: async () => undefined,
    callPoll: { intervalMs: 1, timeoutMs: 10 },
  };
  const engine = createEngine(deps);
  const liveCalls: string[] = [];
  const app = workflowApp(deps, engine, async (sid, replay) => { liveCalls.push(sid); return { url: `https://live.kernel.example/fresh-${sid}`, status: 'live', ...(replay ? { replayUrl: replay } : {}) }; });
  const req = (path: string, init: RequestInit & { token?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
    if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json');
    return app.request(path, { ...init, headers });
  };
  async function signup(email = 'a@aid.test', extra: Record<string, string> = {}) {
    const res = await req('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password: 'longenough', ...extra }) });
    expect(res.status).toBe(201);
    const u = [...users.values()].find(x => x.email === email)!;
    return `tok-${u.id}`;
  }
  async function create(token: string, programs: string[]) {
    const res = await req('/api/workflows', { method: 'POST', token, body: JSON.stringify({ programs }) });
    expect(res.status).toBe(201);
    const wf = (await res.json()) as Workflow;
    await engine.idle();
    return wf;
  }
  const get = async (token: string, id: string) => (await (await req(`/api/workflows/${id}`, { token })).json()) as Workflow;
  const step = (wf: Workflow, kind: string) => wf.steps.find(s => s.kind === kind && s.status !== 'skipped') ?? wf.steps.find(s => s.kind === kind)!;
  async function upload(token: string, id: string, docType: string) {
    const form = new FormData();
    form.append('file', new File([Buffer.from('SYNTHETIC TEST DATA')], 'x.jpg', { type: 'image/jpeg' }));
    form.append('docType', docType);
    const res = await app.request(`/api/workflows/${id}/documents`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
    await engine.idle();
    return res;
  }
  async function toSignature(token: string) {
    const wf = await create(token, ['calfresh', 'medi_cal']);
    for (const t of ['id', 'paystub', 'lease']) expect((await upload(token, wf.id, t)).status).toBe(200);
    return get(token, wf.id);
  }
  async function approve(token: string, id: string, stepId: string, decision = 'approve') {
    const res = await req(`/api/workflows/${id}/approve`, { method: 'POST', token, body: JSON.stringify({ stepId, decision }) });
    await engine.idle();
    return res;
  }
  return { deps, engine, app, req, signup, create, get, step, upload, toSignature, approve, sent, calls, events, households, liveCalls };
}

describe('accounts', () => {
  it('validates signup and returns 409 for an existing email', async () => {
    const t = setup();
    const bad = await t.req('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: 'nope', password: 'x' }) });
    expect(bad.status).toBe(400);
    const short = await t.req('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: 'a@aid.test', password: 'short' }) });
    expect(((await short.json()) as { error: string }).error).toMatch(/8 characters/);
    await t.signup('a@aid.test');
    const dup = await t.req('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email: 'a@aid.test', password: 'longenough' }) });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: string }).error).toMatch(/already exists/);
  });

  it('requireApplicant returns 401 without a valid token, even in DEMO_MODE', async () => {
    vi.stubEnv('DEMO_MODE', 'true');
    const t = setup();
    expect((await t.req('/api/me')).status).toBe(401);
    expect((await t.req('/api/workflows', { token: 'garbage-token' })).status).toBe(401);
    vi.unstubAllEnvs();
  });

  it('profile links a household by phone', async () => {
    const t = setup();
    const token = await t.signup();
    const res = await t.req('/api/me/profile', { method: 'POST', token, body: JSON.stringify({ firstName: 'Ana', phone: '(555) 555-0142' }) });
    const me = (await res.json()) as { phone: string; householdId: string; firstName: string };
    expect(me.phone).toBe('+15555550142');
    expect(me.firstName).toBe('Ana');
    expect(t.households.get(me.householdId)?.phone).toBe('+15555550142');
  });
});

describe('workflow', () => {
  it('research attaches citations, then documents wait on you', async () => {
    const t = setup();
    const token = await t.signup();
    const wf = await t.get(token, (await t.create(token, ['calfresh', 'medi_cal', 'wic'])).id);
    const research = wf.steps.filter(s => s.kind === 'research');
    expect(research).toHaveLength(3);
    expect(research.every(s => s.status === 'done')).toBe(true);
    expect(research[0]!.evidence.some(e => e.kind === 'citation' && e.source === 'research/apply-food-cash-tax.md')).toBe(true);
    expect(research[0]!.evidence.some(e => e.source?.startsWith('exa:'))).toBe(true);
    expect(t.step(wf, 'documents').status).toBe('waiting_on_you');
    expect(wf.status).toBe('needs_documents');
    const upload = wf.nextSteps.find(n => n.action?.type === 'upload')!;
    expect(upload.action?.stepId).toBe(t.step(wf, 'documents').id);
    expect(upload.action?.docType).toBeTruthy();
    const wic = wf.steps.find(s => s.kind === 'fill' && s.program === 'wic')!;
    expect(wic.status).toBe('skipped');
    expect(wf.nextSteps.some(n => n.action?.type === 'open_url' && n.action.url?.includes('wic'))).toBe(true);
    expect(t.events).toContain('AgentToolCalled');
  });

  it('uploads advance the documents step, then fill stops for signature with live view evidence', async () => {
    const t = setup();
    const token = await t.signup();
    const wf = await t.create(token, ['calfresh', 'medi_cal']);
    expect((await t.upload(token, wf.id, 'id')).status).toBe(200);
    let cur = await t.get(token, wf.id);
    expect(t.step(cur, 'documents').status).toBe('waiting_on_you');
    expect(t.step(cur, 'documents').summary).not.toMatch(/Photo ID/);
    cur = await t.toSignature(token);
    const fill = t.step(cur, 'fill');
    expect(t.step(cur, 'documents').status).toBe('done');
    expect(fill.status).toBe('done');
    expect(fill.evidence.map(e => e.kind)).toEqual(expect.arrayContaining(['live_view', 'screenshot', 'replay']));
    expect(cur.status).toBe('awaiting_signature');
    const sign = cur.nextSteps.find(n => n.action?.type === 'sign')!;
    expect(sign.action?.stepId).toBe(t.step(cur, 'sign').id);
    expect(sign.action?.url).toBe('https://pub.example/mock/benefitscal/p/ABPAP');
    expect(t.events).toContain('DocReceived');
  });

  it('rejects bad uploads', async () => {
    const t = setup();
    const token = await t.signup();
    const wf = await t.create(token, ['calfresh']);
    const form = new FormData();
    form.append('file', new File(['x'], 'x.gif', { type: 'image/gif' }));
    form.append('docType', 'id');
    const res = await t.app.request(`/api/workflows/${wf.id}/documents`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(400);
  });

  it('approving the signature submits and records the confirmation; the call waits for approval', async () => {
    const t = setup({ dial: true });
    const token = await t.signup('b@aid.test', { phone: '5555550142' });
    let wf = await t.toSignature(token);
    expect((await t.approve(token, wf.id, t.step(wf, 'sign').id)).status).toBe(200);
    wf = await t.get(token, wf.id);
    expect(t.step(wf, 'sign').status).toBe('done');
    const submit = t.step(wf, 'submit');
    expect(submit.status).toBe('done');
    expect(submit.evidence.find(e => e.kind === 'confirmation')?.title).toContain('LA-2026-123456');
    expect(t.events).toEqual(expect.arrayContaining(['PacketSigned', 'ApplicationSubmitted']));
    const call = t.step(wf, 'call');
    expect(call.status).toBe('waiting_on_you');
    expect(t.calls).toHaveLength(0);
    expect(wf.nextSteps[0]?.action).toMatchObject({ type: 'approve', stepId: call.id });
    expect(t.sent[0]?.body).toContain('LA-2026-123456');
    expect(t.step(wf, 'follow_up').status).toBe('done');
    expect(wf.nextSteps.some(n => n.actor === 'county')).toBe(true);

    await t.approve(token, wf.id, call.id);
    wf = await t.get(token, wf.id);
    expect(t.calls).toEqual(['+15555550100']);
    expect(t.step(wf, 'call').status).toBe('done');
    expect(t.step(wf, 'call').evidence[0]?.kind).toBe('call_transcript');
    expect(t.events).toEqual(expect.arrayContaining(['CallPlaced', 'CallOutcome']));
    expect(wf.status).toBe('done');
  });

  it('skips notify without a phone and skips an approved call without Dial', async () => {
    const t = setup({ dial: false });
    const token = await t.signup();
    let wf = await t.toSignature(token);
    await t.approve(token, wf.id, t.step(wf, 'sign').id);
    wf = await t.get(token, wf.id);
    expect(t.step(wf, 'notify').status).toBe('skipped');
    expect(t.step(wf, 'notify').summary).toMatch(/No phone/);
    await t.approve(token, wf.id, t.step(wf, 'call').id);
    wf = await t.get(token, wf.id);
    expect(t.step(wf, 'call').status).toBe('skipped');
    expect(t.sent).toHaveLength(0);
  });

  it('a failed fill offers a retry with a stepId', async () => {
    const t = setup({ fillStatus: 'error' });
    const token = await t.signup();
    const wf = await t.toSignature(token);
    expect(t.step(wf, 'fill').status).toBe('failed');
    expect(wf.status).toBe('needs_attention');
    const retry = wf.nextSteps.find(n => n.action?.type === 'run')!;
    expect(retry.action?.stepId).toBe(t.step(wf, 'fill').id);
  });

  it("returns 404 for another user's workflow", async () => {
    const t = setup();
    const a = await t.signup('a@aid.test');
    const b = await t.signup('b@aid.test');
    const wf = await t.create(a, ['wic']);
    expect((await t.req(`/api/workflows/${wf.id}`, { token: b })).status).toBe(404);
    expect((await t.req(`/api/workflows/${wf.id}/approve`, { method: 'POST', token: b, body: JSON.stringify({ stepId: wf.steps[0]!.id, decision: 'approve' }) })).status).toBe(404);
    const list = (await (await t.req('/api/workflows', { token: b })).json()) as unknown[];
    expect(list).toHaveLength(0);
    const mine = (await (await t.req('/api/workflows', { token: a })).json()) as { progress: { total: number } }[];
    expect(mine).toHaveLength(1);
  });

  it('suggestions come from the chat session when given', async () => {
    const t = setup();
    const token = await t.signup();
    const res = await t.req('/api/me/suggestions?chatSessionId=6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b', { token });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { matches: unknown[] }).matches.length).toBeGreaterThan(5);
  });

  it('the SSE stream emits workflow updates (token in the query string)', async () => {
    const t = setup();
    const token = await t.signup();
    const wf = await t.create(token, ['calfresh']);
    const res = await t.app.request(`/api/workflows/${wf.id}/events?access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let text = '';
    const readUntil = async (n: number) => {
      while ((text.match(/event: update/g) ?? []).length < n) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value);
      }
    };
    await readUntil(1);
    await t.upload(token, wf.id, 'id');
    await readUntil(2);
    await reader.cancel();
    expect((text.match(/event: update/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(text).toContain(`"id":"${wf.id}"`);
    expect((await t.app.request(`/api/workflows/${wf.id}/events`)).status).toBe(401);
  });
});

describe('GET /api/workflows/:id/live', () => {
  it('returns a fresh live view URL to the owner and 404 to anyone else', async () => {
    const t = setup();
    const owner = await t.signup('owner@aid.test', { phone: '4155550111' });
    const other = await t.signup('other@aid.test', { phone: '4155550112' });
    const wf = await t.toSignature(owner);
    expect(t.step(wf, 'fill').status).toBe('done');
    const res = await t.req(`/api/workflows/${wf.id}/live`, { token: owner });
    expect(res.status).toBe(200);
    const body = await res.json() as { url: string; status: string; replayUrl?: string };
    expect(body).toMatchObject({ url: 'https://live.kernel.example/fresh-kb-123', status: 'live', replayUrl: 'https://replay.kernel.example/r' });
    expect(t.liveCalls).toEqual(['kb-123']);
    expect((await t.req(`/api/workflows/${wf.id}/live`, { token: other })).status).toBe(404);
    expect((await t.req(`/api/workflows/${wf.id}/live`)).status).toBe(401);
    expect(t.liveCalls).toEqual(['kb-123']);
  });

  it('keeps the live view on the workflow while the browser is held for signing', async () => {
    const t = setup();
    const tok = await t.signup('held@aid.test', { phone: '4155550113' });
    const wf = await t.toSignature(tok);
    expect(wf.liveViewUrl).toBe('https://live.kernel.example/abc');
  });

  it('rejects target real unless ALLOW_REAL_BENEFITSCAL=true', async () => {
    const t = setup();
    const tok = await t.signup('real@aid.test', { phone: '4155550114' });
    const prev = process.env.ALLOW_REAL_BENEFITSCAL;
    delete process.env.ALLOW_REAL_BENEFITSCAL;
    const res = await t.req('/api/workflows', { method: 'POST', token: tok, body: JSON.stringify({ programs: ['calfresh'], target: 'real' }) });
    expect(res.status).toBe(400);
    if (prev !== undefined) process.env.ALLOW_REAL_BENEFITSCAL = prev;
  });
});
