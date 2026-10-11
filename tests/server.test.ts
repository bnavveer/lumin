import { beforeEach, describe, expect, it, vi } from 'vitest';

const HID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const hh = (id: string, orgId: string) => ({ id, orgId, phone: '+1', firstName: 'Ana', county: 'los_angeles', size: 3, monthlyIncome: 1000, childrenUnder18: 1, pregnant: false, adultAge: 30, immigrationStatus: 'citizen', childrenAreCitizens: true });
const state = vi.hoisted(() => ({ demo: false, fail: false }));

vi.mock('../src/env.js', () => ({
  env: (n: string) => n,
  optionalEnv: (n: string) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pub_key', SUPABASE_SECRET_KEY: 'SECRET_VALUE' } as Record<string, string>)[n],
}));
vi.mock('../src/auth.js', () => ({
  isDemoMode: () => state.demo,
  requireStaff: async (c: any, next: any) => {
    if (c.req.header('authorization') !== 'Bearer ok') return c.json({ error: 'Unauthorized' }, 401);
    c.set('orgId', 'org-1'); c.set('userId', 'user-1'); c.set('role', 'staff');
    await next();
  },
}));
vi.mock('../src/store.js', () => ({
  listHouseholds: vi.fn(async () => { if (state.fail) throw new Error('db down'); return [hh(HID, 'org-1')]; }),
  getHousehold: vi.fn(async (id: string) => (id === HID ? hh(HID, 'org-1') : id === OTHER ? hh(OTHER, 'org-2') : undefined)),
  getMessages: vi.fn(async () => []),
  listCalls: vi.fn(async () => []),
  listSubmissions: vi.fn(async () => []),
  getTimeline: vi.fn(async () => [{ label: 'a', at: '2026-01-01T00:00:00Z' }, { label: 'b', at: '2026-01-02T00:00:00Z' }]),
  listDocuments: vi.fn(async () => [{ id: 'd', householdId: HID, docType: 'id', storagePath: 'p/x.jpg', contentType: 'image/jpeg', at: 'now' }]),
  saveSubmission: vi.fn(async () => undefined),
}));
vi.mock('../src/eligibility.js', () => ({ checkEligibility: vi.fn(() => [{ program: 'calfresh', status: 'likely' }]) }));
vi.mock('../src/autopilot.js', () => ({
  getAutopilotState: vi.fn(async () => ({ actions: [{ householdId: HID, kind: 'docs_nudge', source: 'keewano', detail: 'd' }, { householdId: 'zz', kind: 'submit', source: 'keewano', detail: 'e' }], lastRunAt: null, source: 'keewano' })),
}));
vi.mock('../src/staffAsk.js', () => ({ askStaffQuestion: vi.fn(async () => { if (state.fail) throw new Error('x'); return 'answer'; }) }));
vi.mock('../src/metrics.js', () => ({ getTimeSavedMetrics: vi.fn(async () => ({ source: 'keewano' })) }));
vi.mock('../src/documents.js', () => ({ signedUrl: vi.fn(async (p: string) => `https://signed/${p}`) }));
vi.mock('../src/links.js', () => ({ verifyPacketToken: (_id: string, t: string) => t === 'good' }));
vi.mock('../src/demo.js', () => ({
  demoCases: () => [{ id: 'demo' }], demoCaseDetail: (id: string) => ({ household: { id } }),
  demoMetrics: () => ({ source: 'demo' }), demoAutopilot: () => ({ actions: [], lastRunAt: null, source: 'keewano' }),
}));

import { createApp } from '../src/server.js';
import * as store from '../src/store.js';

const packet = { renderPacket: vi.fn(async () => '<p>packet</p>'), sign: vi.fn(async () => undefined) };
const auth = { headers: { authorization: 'Bearer ok' } };
const json = (body: unknown, extra: Record<string, string> = {}) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
const screen = { county: 'los_angeles', size: 3, monthlyIncome: 1500, childrenUnder18: 1, pregnant: false, adultAge: 30, immigrationStatus: 'citizen', childrenAreCitizens: true };

let app: ReturnType<typeof createApp>;
beforeEach(() => { state.demo = false; state.fail = false; app = createApp({ packet }); vi.clearAllMocks(); });

describe('server', () => {
  it('health', async () => {
    const r = await app.request('/api/health');
    expect(await r.json()).toEqual({ ok: true });
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('public-config does not leak the secret key', async () => {
    const text = await (await app.request('/api/public-config')).text();
    expect(JSON.parse(text)).toEqual({ supabaseUrl: 'https://x.supabase.co', supabasePublishableKey: 'pub_key', demoMode: false });
    expect(text).not.toContain('SECRET_VALUE');
  });

  it('staff routes require auth', async () => {
    for (const p of ['/api/staff/cases', '/api/staff/cases/' + HID, '/api/staff/autopilot', '/api/staff/metrics']) {
      expect((await app.request(p)).status).toBe(401);
    }
    expect((await app.request('/api/staff/ask', json({ q: 'hi' }))).status).toBe(401);
  });

  it('cases are org scoped with last event and per-household actions', async () => {
    const r = await app.request('/api/staff/cases', auth);
    const body = await r.json();
    expect(store.listHouseholds).toHaveBeenCalledWith('org-1');
    expect(body).toHaveLength(1);
    expect(body[0].lastEvent.label).toBe('b');
    expect(body[0].actions).toHaveLength(1);
  });

  it('case detail maps documents and 404s for another org or unknown id', async () => {
    const ok = await (await app.request(`/api/staff/cases/${HID}`, auth)).json();
    expect(ok.documents[0].url).toBe('https://signed/p/x.jpg');
    expect((await app.request(`/api/staff/cases/${OTHER}`, auth)).status).toBe(404);
    expect((await app.request('/api/staff/cases/nope', auth)).status).toBe(404);
  });

  it('ask validates, answers, and maps failure to 502', async () => {
    const h = { authorization: 'Bearer ok' };
    expect((await app.request('/api/staff/ask', json({ q: '' }, h))).status).toBe(400);
    expect((await app.request('/api/staff/ask', json({ q: 'x'.repeat(501) }, h))).status).toBe(400);
    expect(await (await app.request('/api/staff/ask', json({ q: 'hi' }, h))).json()).toEqual({ answer: 'answer' });
    state.fail = true;
    const r = await app.request('/api/staff/ask', json({ q: 'hi' }, h));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ error: 'Keewano is unavailable right now, try again' });
  });

  it('ask is limited to 10 per minute', async () => {
    const h = { authorization: 'Bearer ok' };
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await app.request('/api/staff/ask', json({ q: 'hi' }, h))).status;
    expect(last).toBe(429);
  });

  it('screen rejects bad input and returns matches', async () => {
    expect((await app.request('/api/screen', json({ ...screen, size: 0 }))).status).toBe(400);
    expect((await app.request('/api/screen', json({ ...screen, county: 'nowhere' }))).status).toBe(400);
    const r = await app.request('/api/screen', json(screen));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ program: 'calfresh', status: 'likely' }]);
  });

  it('screen is limited to 30 per minute per IP', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await app.request('/api/screen', json(screen))).status;
    expect(last).toBe(429);
  });

  it('packet token is enforced', async () => {
    const bad = await app.request(`/p/${HID}?t=bad`);
    expect(bad.status).toBe(403);
    expect(await bad.text()).toContain('This link has expired. Text Aid for a new one.');
    expect(packet.renderPacket).not.toHaveBeenCalled();
    expect((await app.request(`/p/${HID}/sign?t=bad`, { method: 'POST' })).status).toBe(403);
    expect(packet.sign).not.toHaveBeenCalled();
    expect(await (await app.request(`/p/${HID}?t=good`)).text()).toBe('<p>packet</p>');
    const s = await app.request(`/p/${HID}/sign?t=good`, { method: 'POST' });
    expect(s.status).toBe(303);
    expect(s.headers.get('location')).toBe(`/p/${HID}?t=good&signed=1`);
  });

  it('packet errors give a friendly 500 page', async () => {
    packet.renderPacket.mockRejectedValueOnce(new Error('boom'));
    const r = await app.request(`/p/${HID}?t=good`);
    expect(r.status).toBe(500);
    expect(await r.text()).toContain('Something went wrong');
  });

  it('county application returns a formatted confirmation and saves it', async () => {
    const r = await app.request('/county/api/applications', json({ householdId: HID, kind: 'minimal', payload: { a: 1 } }));
    const { confirmation } = await r.json();
    expect(confirmation).toMatch(/^LA-\d{4}-\d{6}$/);
    expect(store.saveSubmission).toHaveBeenCalledWith(HID, 'minimal', confirmation, { a: 1 });
    const unknown = await app.request('/county/api/applications', json({ householdId: '33333333-3333-4333-8333-333333333333', kind: 'full', payload: {} }));
    expect(unknown.status).toBe(400);
    expect((await app.request('/api/county/applications')).status).toBe(200);
  });

  it('falls back to demo data in DEMO_MODE only', async () => {
    state.fail = true;
    expect((await app.request('/api/staff/cases', auth)).status).toBe(500);
    state.demo = true;
    expect(await (await app.request('/api/staff/cases', auth)).json()).toEqual([{ id: 'demo' }]);
  });
});
