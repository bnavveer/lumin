import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setAuthClient } from '../src/auth.js';
import {
  OrgSettingsSchema, createOrgForUser, defaultSettings, deepMerge, setOnboardingClient, setupStatus, updateOrgSettings, HttpError,
} from '../src/onboarding.js';
import { registerOnboardingRoutes } from '../src/onboardingRoutes.js';

type Row = Record<string, unknown>;

/** Minimal in-memory fake of the supabase calls onboarding uses. */
function fakeDb(seed: { orgs?: Row[]; staff?: Row[]; tokens?: Record<string, { id: string; email: string }> } = {}) {
  const tables: Record<string, Row[]> = { orgs: [...(seed.orgs ?? [])], staff: [...(seed.staff ?? [])], staff_invites: [] };
  let n = 0;
  const from = (t: string) => {
    let filters: Array<[string, unknown]> = [];
    let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row = {};
    const match = () => tables[t]!.filter((r) => filters.every(([k, v]) => r[k] === v));
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (p: Row) => { mode = 'insert'; payload = p; return q; },
      update: (p: Row) => { mode = 'update'; payload = p; return q; },
      delete: () => { mode = 'delete'; return q; },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      limit: () => q,
      maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
      single: async () => {
        const row = { id: `id${++n}`, ...payload };
        tables[t]!.push(row);
        return { data: row, error: null };
      },
      then: (res: (v: unknown) => unknown) => {
        if (mode === 'insert') tables[t]!.push({ id: `id${++n}`, ...payload });
        if (mode === 'update') match().forEach((r) => Object.assign(r, payload));
        if (mode === 'delete') tables[t] = tables[t]!.filter((r) => !match().includes(r));
        const out = { data: mode === 'select' ? match() : null, error: null };
        filters = [];
        return Promise.resolve(out).then(res);
      },
    };
    return q;
  };
  const client = {
    from,
    auth: {
      getUser: async (tok: string) => seed.tokens?.[tok]
        ? { data: { user: seed.tokens[tok] }, error: null }
        : { data: { user: null }, error: { message: 'bad' } },
    },
  } as unknown as SupabaseClient;
  return { client, tables };
}

describe('settings', () => {
  it('defaults: all nudges on, quiet hours 20:00-08:00, 6 programs, escalate after 3', () => {
    const s = defaultSettings();
    expect(Object.values(s.autopilot.nudges).every(Boolean)).toBe(true);
    expect(s.autopilot.quietHours).toEqual({ start: '20:00', end: '08:00' });
    expect(s.programs).toHaveLength(6);
    expect(s.escalateAfterNoAnswers).toBe(3);
  });

  it('deep merges nested objects without mutating the base and replaces arrays', () => {
    const base = defaultSettings();
    const merged = deepMerge(base, { autopilot: { nudges: { submit: false } }, programs: ['calfresh'] }) as typeof base;
    expect(merged.autopilot.nudges.submit).toBe(false);
    expect(merged.autopilot.nudges.docs_nudge).toBe(true);
    expect(merged.programs).toEqual(['calfresh']);
    expect(base.autopilot.nudges.submit).toBe(true);
  });

  it('rejects invalid settings', () => {
    expect(OrgSettingsSchema.safeParse({ escalateAfterNoAnswers: 0 }).success).toBe(false);
    expect(OrgSettingsSchema.safeParse({ autopilot: { quietHours: { start: '25:00' } } }).success).toBe(false);
    expect(OrgSettingsSchema.safeParse({ programs: [] }).success).toBe(false);
  });

  it('updateOrgSettings persists a merged patch and rejects unknown keys', async () => {
    const { client, tables } = fakeDb({ orgs: [{ id: 'o1', name: 'C', county: 'los_angeles', settings: {} }] });
    setOnboardingClient(client);
    const out = await updateOrgSettings('o1', { escalateAfterNoAnswers: 5, autopilot: { enabled: false } });
    expect(out.settings.escalateAfterNoAnswers).toBe(5);
    expect(out.settings.autopilot.nudges.submit).toBe(true);
    expect((tables.orgs![0]!.settings as { autopilot: { enabled: boolean } }).autopilot.enabled).toBe(false);
    await expect(updateOrgSettings('o1', { bogus: 1 })).rejects.toBeInstanceOf(HttpError);
  });
});

describe('createOrgForUser', () => {
  afterEach(() => setOnboardingClient());

  it('creates the org and an admin staff row', async () => {
    const { client, tables } = fakeDb();
    setOnboardingClient(client);
    const org = await createOrgForUser({ id: 'u1', email: 'a@b.co' }, { clinicName: 'Sunrise Clinic', county: 'los_angeles' });
    expect(org.name).toBe('Sunrise Clinic');
    expect(tables.staff).toEqual([expect.objectContaining({ user_id: 'u1', role: 'admin', org_id: org.id })]);
    expect(tables.orgs[0]).toMatchObject({ created_by: 'u1' });
  });

  it('rejects an existing staff member with 409', async () => {
    const { client, tables } = fakeDb({ staff: [{ user_id: 'u1', org_id: 'o9', role: 'caseworker' }] });
    setOnboardingClient(client);
    await expect(createOrgForUser({ id: 'u1', email: 'a@b.co' }, { clinicName: 'X Clinic', county: 'los_angeles' }))
      .rejects.toMatchObject({ status: 409 });
    expect(tables.orgs).toHaveLength(0);
  });
});

describe('routes', () => {
  const tokens = { admin: { id: 'ua', email: 'a@x.co' }, cw: { id: 'uc', email: 'c@x.co' }, newbie: { id: 'un', email: 'n@x.co' } };
  let app: Hono;
  beforeEach(() => {
    delete process.env.DEMO_MODE;
    const { client } = fakeDb({
      orgs: [{ id: 'o1', name: 'C', county: 'los_angeles', settings: {} }],
      staff: [{ user_id: 'ua', org_id: 'o1', role: 'admin' }, { user_id: 'uc', org_id: 'o1', role: 'caseworker' }],
      tokens,
    });
    // requireStaff uses setAuthClient; requireUser uses admin() so seed the env to make it resolvable offline.
    setAuthClient(client);
    setOnboardingClient(client);
    app = new Hono();
    registerOnboardingRoutes(app);
  });
  afterEach(() => { setAuthClient(); setOnboardingClient(); });

  const call = (method: string, path: string, token?: string, json?: unknown) =>
    app.request(path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    });

  it('requires sign-in', async () => {
    expect((await call('GET', '/api/staff/org')).status).toBe(401);
  });

  it('caseworkers can read the org but cannot change settings, view team or invite', async () => {
    expect((await call('GET', '/api/staff/org', 'cw')).status).toBe(200);
    expect((await call('PUT', '/api/staff/settings', 'cw', { escalateAfterNoAnswers: 2 })).status).toBe(403);
    expect((await call('GET', '/api/staff/team', 'cw')).status).toBe(403);
    expect((await call('POST', '/api/staff/team/invite', 'cw', { email: 'x@y.co', role: 'caseworker' })).status).toBe(403);
  });

  it('admins can update settings; invalid patches are 400 with {error}', async () => {
    const ok = await call('PUT', '/api/staff/settings', 'admin', { escalateAfterNoAnswers: 2 });
    expect(ok.status).toBe(200);
    const bad = await call('PUT', '/api/staff/settings', 'admin', { escalateAfterNoAnswers: 99 });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: expect.any(String) });
  });

  it('validates invite bodies', async () => {
    expect((await call('POST', '/api/staff/team/invite', 'admin', { email: 'nope', role: 'caseworker' })).status).toBe(400);
    expect((await call('POST', '/api/staff/team/invite', 'admin', { email: 'a@b.co', role: 'owner' })).status).toBe(400);
  });
});

describe('setupStatus', () => {
  const KEYS = ['ANTHROPIC_API_KEY', 'NEON_AI_GATEWAY_BASE_URL', 'NEON_AI_GATEWAY_TOKEN', 'NEON_AI_TOKEN_AGENT', 'DIAL_API_KEY', 'DIAL_FROM_NUMBER_ID', 'DEVIN_API_KEY', 'KEEWANO_SDK_KEY', 'KEEWANO_PAT', 'DEMO_MODE'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    KEYS.forEach((k) => { saved[k] = process.env[k]; });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
    setOnboardingClient();
    vi.restoreAllMocks();
  });

  it('never leaks secret values and reflects presence', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-SECRET-1';
    process.env.DIAL_API_KEY = 'dial-SECRET-2';
    process.env.DIAL_FROM_NUMBER_ID = 'num-SECRET-3';
    process.env.DEVIN_API_KEY = 'devin-SECRET-4';
    delete process.env.KEEWANO_SDK_KEY;
    delete process.env.KEEWANO_PAT;
    const { client } = fakeDb({ orgs: [{ id: 'o1', name: 'C', aid_phone: '+12135550100', settings: {} }] });
    setOnboardingClient(client);
    const out = await setupStatus('o1');
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/SECRET/);
    const by = Object.fromEntries(out.checks.map((c) => [c.key, c]));
    expect(by.claude!.ok).toBe(true);
    expect(by.dial!.ok).toBe(true);
    expect(by.devin!.ok).toBe(true);
    expect(by.keewano!.ok).toBe(false);
    expect(by.supabase!.ok).toBe(true);
    expect(Object.keys(by)).toEqual(['supabase', 'keewano', 'claude', 'dial', 'devin', 'demo']);
  });

  it('reports missing keys as not ok', async () => {
    KEYS.forEach((k) => delete process.env[k]);
    const { client } = fakeDb({ orgs: [{ id: 'o1', name: 'C', settings: {} }] });
    setOnboardingClient(client);
    const by = Object.fromEntries((await setupStatus('o1')).checks.map((c) => [c.key, c]));
    expect(by.claude!.ok).toBe(false);
    expect(by.dial!.ok).toBe(false);
    expect(by.devin!.ok).toBe(false);
  });

  it('treats a configured AI gateway as a working Claude credential', async () => {
    KEYS.forEach((k) => delete process.env[k]);
    process.env.NEON_AI_GATEWAY_BASE_URL = 'https://gw.example/v1';
    process.env.NEON_AI_GATEWAY_TOKEN = 'gw-SECRET';
    const { client } = fakeDb({ orgs: [{ id: 'o1', name: 'C', settings: {} }] });
    setOnboardingClient(client);
    const out = await setupStatus('o1');
    expect(JSON.stringify(out)).not.toMatch(/SECRET/);
    expect(out.checks.find((c) => c.key === 'claude')!.ok).toBe(true);
  });
});
