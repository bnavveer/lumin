import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Workflow } from '../shared/workflow.js';
import type { ScreeningInput } from '../src/applicationScreening.js';
import type { StoredDocument, StoredWorkflow } from '../src/workflow/model.js';
import { registerWorkflowRoutes } from '../src/workflow/routes.js';
import { WorkflowError, type ApplicantUser, type Profile, type WorkflowRepo } from '../src/workflow/repo.js';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const FULL: ScreeningInput = { county: 'los_angeles', size: 3, monthlyIncome: 1200, childrenUnder18: 1,
  pregnant: false, adultAge: 29, immigrationStatus: 'citizen', childrenAreCitizens: true };

function harness() {
  const profiles = new Map<string, Profile>();
  const workflows = new Map<string, StoredWorkflow>();
  const documents = new Map<string, StoredDocument>();
  const sessions = new Map<string, { fields: ScreeningInput; confirmed: boolean; householdId: string }>();
  const claims = new Map<string, string>();
  const edited = new Set<string>();
  const uploads: Uint8Array[] = [];
  const user = (id: string): ApplicantUser => ({ id, email: `${id}@example.test` });
  const clone = <T>(v: T): T => structuredClone(v);
  const repo: WorkflowRepo = {
    async authenticate(token) { return token === 'alice' ? user(A) : token === 'bob' ? user(B) : null; },
    async signup() { return { confirmationRequired: true }; },
    async profile(u) {
      if (!profiles.has(u.id)) profiles.set(u.id, { userId: u.id, email: u.email, firstName: null, phone: null, householdId: null, screeningAnswers: {} });
      const p = profiles.get(u.id)!;
      for (const [sid, owner] of claims) {
        const s = sessions.get(sid)!;
        if (owner === u.id && s.confirmed && ![...profiles.values()].some(v => v.userId !== u.id && v.householdId === s.householdId)) p.householdId = s.householdId;
      }
      return clone(p);
    },
    async updateProfile(u, values) {
      await this.profile(u);
      const p = profiles.get(u.id)!;
      if (values.firstName !== undefined) p.firstName = values.firstName;
      if (values.phone !== undefined) p.phone = values.phone;
      if (values.screeningAnswers !== undefined) { p.screeningAnswers = values.screeningAnswers; edited.add(u.id); }
      return clone(p);
    },
    async claimChat(uid, sid) {
      if (!sessions.has(sid)) throw new WorkflowError(404, 'Start a chat before linking it to your account.');
      if (claims.has(sid) && claims.get(sid) !== uid) throw new WorkflowError(409, 'This chat is already linked.');
      claims.set(sid, uid);
    },
    async screening(uid) {
      if (edited.has(uid)) return clone(profiles.get(uid)!.screeningAnswers);
      for (const [sid, owner] of claims) if (owner === uid) return clone(sessions.get(sid)!.fields);
      return {};
    },
    async list(uid) { return clone([...workflows.values()].filter(w => w.userId === uid)); },
    async get(uid, id) { const w = workflows.get(id); return w?.userId === uid ? clone(w) : null; },
    async create(uid, w) { workflows.set(w.id, clone({ userId: uid, workflow: w, version: 1 })); },
    async save(row) {
      const existing = workflows.get(row.workflow.id)!;
      if (existing.version !== row.version || existing.userId !== row.userId) throw new WorkflowError(409, 'Workflow changed.');
      workflows.set(row.workflow.id, clone({ ...row, version: row.version + 1 }));
    },
    async documents(uid) { return clone([...documents.values()].filter(d => d.userId === uid)); },
    async upload(doc, bytes) { documents.set(doc.id, clone(doc)); uploads.push(bytes); },
    async download(doc) { return `https://private-storage.example.test/${doc.id}?token=temporary`; },
    async deleteDocument(doc) { documents.delete(doc.id); },
  };
  const app = new Hono();
  registerWorkflowRoutes(app, { repo, now: () => new Date('2026-10-11T19:00:00Z'), eventMaxMs: 0 });
  const request = (path: string, init: RequestInit = {}, token = 'alice') => app.request(path, {
    ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> ?? {}) },
  });
  const post = (path: string, body: unknown, token = 'alice') => request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, token);
  const create = async (programs = ['calfresh']) => {
    const res = await post('/api/workflows', { programs });
    expect(res.status).toBe(201);
    return await res.json() as Workflow;
  };
  const upload = (id: string | null, docType = 'id', file = new File(['%PDF-1.7\nSynthetic test file'], 'test.pdf', { type: 'application/pdf' }), token = 'alice') => {
    const body = new FormData(); body.set('file', file); body.set('docType', docType);
    return request(id ? `/api/workflows/${id}/documents` : '/api/me/documents', { method: 'POST', body }, token);
  };
  return { app, request, post, create, upload, repo, profiles, workflows, documents, sessions, claims, uploads };
}

describe('applicant account and workflow API', () => {
  it('requires auth on every account route even in DEMO_MODE', async () => {
    const h = harness();
    const old = process.env.DEMO_MODE; process.env.DEMO_MODE = 'true';
    try {
      for (const path of ['/api/me', '/api/me/screening', '/api/me/documents', '/api/me/suggestions', '/api/workflows', `/api/workflows/${randomUUID()}/events`]) {
        expect((await h.app.request(path)).status).toBe(401);
        expect((await h.request(path, {}, 'bad-token')).status).toBe(401);
      }
    } finally { if (old === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = old; }
  });

  it('signup honors confirmation and never contacts real authentication services', async () => {
    const h = harness();
    expect((await h.post('/api/auth/signup', { email: 'invalid', password: 'x' })).status).toBe(400);
    const res = await h.post('/api/auth/signup', { email: 'new@example.test', password: 'test-password123' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, confirmationRequired: true });
    for (let i = 0; i < 4; i++) await h.post('/api/auth/signup', { email: 'new@example.test', password: 'test-password123' });
    expect((await h.post('/api/auth/signup', { email: 'new@example.test', password: 'test-password123' })).status).toBe(429);
  });

  it('typed phone never links an existing household or creates one with invented answers', async () => {
    const h = harness();
    const res = await h.post('/api/me/profile', { phone: '(213) 555-0123', firstName: 'Alice' });
    expect(await res.json()).toMatchObject({ userId: A, phone: '+12135550123', householdId: null });
    const matches = await (await h.request('/api/me/suggestions')).json();
    expect(matches.matches.every((m: { status: string }) => m.status === 'needs_info')).toBe(true);
    const w = await h.create();
    expect(w.householdId).toBeNull();
    expect(w.status).toBe('needs_attention');
    expect(w.steps[0].status).toBe('waiting_on_you');
  });

  it('claims a web session once and only promotes after that session has phone confirmation', async () => {
    const h = harness(); const sid = randomUUID(); const hid = randomUUID();
    h.sessions.set(sid, { fields: FULL, confirmed: false, householdId: hid });
    expect((await h.post('/api/me/link-chat', { chatSessionId: sid })).status).toBe(200);
    expect((await h.post('/api/me/link-chat', { chatSessionId: sid })).status).toBe(200);
    expect(await (await h.request('/api/me')).json()).toMatchObject({ householdId: null });
    expect((await h.post('/api/me/link-chat', { chatSessionId: sid }, 'bob')).status).toBe(409);
    h.sessions.get(sid)!.confirmed = true;
    expect(await (await h.request('/api/me')).json()).toMatchObject({ householdId: hid });
    expect((await h.post('/api/me/link-chat', { chatSessionId: randomUUID() })).status).toBe(404);
  });

  it('validates editable answers, supports clearing, and rejects profile ownership forging', async () => {
    const h = harness();
    expect((await h.post('/api/me/profile', { householdId: randomUUID() })).status).toBe(400);
    expect((await h.post('/api/me/profile', { screeningAnswers: { size: 2, childrenUnder18: 3 } })).status).toBe(400);
    expect((await h.post('/api/me/profile', { screeningAnswers: FULL })).status).toBe(200);
    expect(await (await h.request('/api/me/screening')).json()).toEqual(FULL);
    expect((await h.post('/api/me/profile', { screeningAnswers: { adultAge: null } })).status).toBe(200);
    expect(await (await h.request('/api/me/screening')).json()).not.toHaveProperty('adultAge');
    expect((await h.post('/api/me/profile', { screeningAnswers: { arbitrary: true } })).status).toBe(400);
  });

  it('denies cross-user reads, mutations, upload and event streams without revealing existence', async () => {
    const h = harness(); const w = await h.create();
    expect(await (await h.request('/api/workflows', {}, 'bob')).json()).toEqual([]);
    for (const path of [`/api/workflows/${w.id}`, `/api/workflows/${w.id}/events`]) expect((await h.request(path, {}, 'bob')).status).toBe(404);
    for (const action of ['run', 'approve', 'receipt']) expect((await h.post(`/api/workflows/${w.id}/${action}`, { stepId: w.steps[0].id, decision: 'approve' }, 'bob')).status).toBe(404);
    expect((await h.upload(w.id, 'id', undefined, 'bob')).status).toBe(404);
    expect(h.uploads).toHaveLength(0);
  });

  it('persists preparation and honest official handoff but cannot forge signatures/submission', async () => {
    const h = harness();
    await h.post('/api/me/profile', { screeningAnswers: FULL });
    let w = await h.create();
    expect(w.status).toBe('needs_documents');
    for (const type of ['id', 'paystub', 'lease']) {
      const res = await h.upload(w.id, type); expect(res.status).toBe(200); w = await res.json() as Workflow;
    }
    expect(w.status).toBe('ready_to_fill');
    const review = w.steps.find(s => s.kind === 'fill')!;
    expect((await h.post(`/api/workflows/${w.id}/approve`, { stepId: review.id, decision: 'approve', status: 'submitted' })).status).toBe(400);
    const approved = await h.post(`/api/workflows/${w.id}/approve`, { stepId: review.id, decision: 'approve' });
    expect(approved.status).toBe(200); w = await approved.json() as Workflow;
    expect(w.status).toBe('awaiting_signature');
    expect(w.nextSteps[0].action?.url).toBe('https://benefitscal.com/');
    const sign = w.steps.find(s => s.kind === 'sign')!;
    const submit = w.steps.find(s => s.kind === 'submit')!;
    expect((await h.post(`/api/workflows/${w.id}/approve`, { stepId: sign.id, decision: 'approve' })).status).toBe(409);
    expect((await h.post(`/api/workflows/${w.id}/run`, { stepId: submit.id })).status).toBe(409);
    expect((await h.post(`/api/workflows/${w.id}/run`, { stepId: w.steps[0].id })).status).toBe(409);
    const receipt = await h.post(`/api/workflows/${w.id}/receipt`, { program: 'calfresh', confirmation: 'USER-REPORTED-TEST', submittedAt: '2026-10-11T18:00:00Z' });
    w = await receipt.json() as Workflow;
    expect(w.status).toBe('needs_attention');
    expect(w.steps.find(s => s.kind === 'submit')?.status).not.toBe('done');
    expect(w.steps.find(s => s.kind === 'submit')?.evidence[0]).toMatchObject({ source: 'applicant_report', title: 'Receipt reported by you (not verified)' });
    expect(await (await h.request(`/api/workflows/${w.id}`)).json()).toEqual(w);
    const events = await h.request(`/api/workflows/${w.id}/events`);
    expect(events.headers.get('content-type')).toContain('text/event-stream');
    expect(await events.text()).toContain('event: update');
  });

  it('saves actual private file bytes and enforces type, size, document ownership and safe metadata', async () => {
    const h = harness();
    expect((await h.upload(null, 'not-a-type')).status).toBe(400);
    expect((await h.upload(null, 'id', new File(['fake'], 'fake.pdf', { type: 'application/pdf' }))).status).toBe(415);
    expect((await h.upload(null, 'id', new File(['html'], 'script.html', { type: 'text/html' }))).status).toBe(415);
    expect((await h.upload(null, 'id', new File([], 'empty.pdf', { type: 'application/pdf' }))).status).toBe(400);
    expect((await h.upload(null, 'id', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'too-big.pdf', { type: 'application/pdf' }))).status).toBe(413);
    expect(h.uploads).toHaveLength(0);
    const saved = await h.upload(null);
    expect(saved.status).toBe(201);
    const metadata = await saved.json();
    expect(metadata).toMatchObject({ status: 'received', fileName: 'test.pdf', contentType: 'application/pdf', workflowId: null });
    expect(metadata).not.toHaveProperty('storagePath'); expect(metadata).not.toHaveProperty('userId');
    expect(Buffer.from(h.uploads[0]!).toString()).toContain('%PDF-1.7');
    expect((await h.request(`/api/me/documents/${metadata.id}/download`, {}, 'bob')).status).toBe(404);
    expect((await h.request(`/api/me/documents/${metadata.id}`, { method: 'DELETE' }, 'bob')).status).toBe(404);
    expect((await h.request(`/api/me/documents/${metadata.id}/download`)).status).toBe(200);
    expect((await h.request(`/api/me/documents/${metadata.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await (await h.request('/api/me/documents')).json()).toEqual([]);
  });

  it('deleting a document reopens preparation instead of preserving a false ready state', async () => {
    const h = harness();
    await h.post('/api/me/profile', { screeningAnswers: FULL });
    const w = await h.create();
    for (const type of ['id', 'paystub', 'lease']) await h.upload(w.id, type);
    const idDoc = [...h.documents.values()].find(d => d.docType === 'id')!;
    await h.request(`/api/me/documents/${idDoc.id}`, { method: 'DELETE' });
    const after = await (await h.request(`/api/workflows/${w.id}`)).json() as Workflow;
    expect(after.status).toBe('needs_documents');
    expect(after.nextSteps[0].action?.docType).toBe('id');
  });

  it('reporting one program receipt preserves other program handoffs and cannot rewind to preparation', async () => {
    const h = harness();
    await h.post('/api/me/profile', { screeningAnswers: FULL });
    let w = await h.create(['calfresh', 'medi_cal']);
    for (const type of ['id', 'paystub', 'lease']) w = await (await h.upload(w.id, type)).json() as Workflow;
    w = await (await h.post(`/api/workflows/${w.id}/approve`, { stepId: w.steps.find(s => s.kind === 'fill')!.id, decision: 'approve' })).json() as Workflow;
    w = await (await h.post(`/api/workflows/${w.id}/receipt`, { program: 'calfresh', confirmation: 'TEST-REF' })).json() as Workflow;
    const otherSignId = w.steps.find(s => s.kind === 'sign' && s.program === 'medi_cal')!.id;
    expect(w.nextSteps.some(n => n.action?.stepId === otherSignId)).toBe(true);
    expect(w.nextSteps.some(n => n.title === 'Verify your application with the agency')).toBe(true);
    const early = await h.create();
    await h.post(`/api/workflows/${early.id}/receipt`, { program: 'calfresh', confirmation: 'REPORTED-EARLY' });
    expect((await h.post(`/api/workflows/${early.id}/run`, { stepId: early.steps[0].id })).status).toBe(409);
    expect((await h.post(`/api/workflows/${early.id}/run`, { stepId: early.steps.find(s => s.kind === 'documents')!.id })).status).toBe(409);
  });
});
