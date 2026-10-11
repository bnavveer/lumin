import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStaffFromToken, isDemoMode, requireStaff, setAuthClient, type StaffVars } from '../src/auth.js';
import { DEMO_ORG_ID } from '../src/supabase.js';

const fake = (users: Record<string, string>, staff: Record<string, { org_id: string; role: string }>) =>
  ({
    auth: {
      getUser: async (t: string) => users[t]
        ? { data: { user: { id: users[t] } }, error: null }
        : { data: { user: null }, error: { message: 'bad jwt' } },
    },
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: staff[id] ?? null, error: null }) }),
      }),
    }),
  }) as unknown as SupabaseClient;

const app = new Hono<{ Variables: StaffVars }>();
app.get('/me', requireStaff, (c) => c.json({ userId: c.get('userId'), orgId: c.get('orgId'), role: c.get('role') }));

let prevDemo: string | undefined;
beforeEach(() => {
  prevDemo = process.env.DEMO_MODE;
  delete process.env.DEMO_MODE;
  setAuthClient(fake({ good: 'u1', loner: 'u2' }, { u1: { org_id: 'o1', role: 'admin' } }));
});
afterEach(() => {
  if (prevDemo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = prevDemo;
  setAuthClient();
});

describe('requireStaff', () => {
  it('401 with no Authorization header', async () => {
    const res = await app.request('/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in required' });
  });
  it('401 on malformed header', async () => {
    for (const h of ['good', 'Basic abc', 'Bearer ', 'Bearer a b']) {
      expect((await app.request('/me', { headers: { Authorization: h } })).status).toBe(401);
    }
  });
  it('401 on invalid token', async () => {
    expect((await app.request('/me', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
  });
  it('403 when user is not staff', async () => {
    const res = await app.request('/me', { headers: { Authorization: 'Bearer loner' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Not a staff member of any clinic' });
  });
  it('sets context for staff', async () => {
    const res = await app.request('/me', { headers: { Authorization: 'Bearer good' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'u1', orgId: 'o1', role: 'admin' });
  });
  it('demo bypass only when DEMO_MODE=true and no header', async () => {
    process.env.DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(true);
    const res = await app.request('/me');
    expect(await res.json()).toEqual({ userId: 'demo', orgId: DEMO_ORG_ID, role: 'caseworker' });
    // a bad header is still rejected in demo mode
    expect((await app.request('/me', { headers: { Authorization: 'Bearer nope' } })).status).toBe(401);
  });
});

describe('getStaffFromToken', () => {
  it('returns staff or null', async () => {
    expect(await getStaffFromToken('good')).toEqual({ userId: 'u1', orgId: 'o1', role: 'admin' });
    expect(await getStaffFromToken('loner')).toBeNull();
    expect(await getStaffFromToken('nope')).toBeNull();
  });
});
