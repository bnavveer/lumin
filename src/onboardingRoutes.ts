import type { Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { z } from 'zod';
import { requireStaff, type StaffVars } from './auth.js';
import { admin } from './supabase.js';
import { COUNTIES, ROLES, HttpError, createOrgForUser, getOrg, inviteStaff, listTeam, setupStatus, updateOrgSettings } from './onboarding.js';
import { rateLimit } from './rateLimit.js';
import { clientIp } from './clientIp.js';

type UserVars = { user: { id: string; email: string } };

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

/** Any valid Supabase user (not necessarily staff yet). */
export const requireUser = createMiddleware<{ Variables: UserVars }>(async (c, next) => {
  const m = BEARER.exec((c.req.header('Authorization') ?? '').trim());
  if (!m) return c.json({ error: 'Sign in required' }, 401);
  const { data, error } = await admin().auth.getUser(m[1]!);
  if (error || !data?.user?.email) return c.json({ error: 'Sign in required' }, 401);
  c.set('user', { id: data.user.id, email: data.user.email });
  return next();
});

const CreateOrg = z.object({
  clinicName: z.string().trim().min(2, 'Clinic name must be 2 to 120 characters').max(120, 'Clinic name must be 2 to 120 characters'),
  county: z.enum(COUNTIES),
});
const Invite = z.object({ email: z.email().max(254), role: z.enum(ROLES) });

const body = (c: Context): Promise<unknown> => c.req.json().catch(() => null);

function handle(c: Context, err: unknown): Response {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error('[onboarding] unhandled', err instanceof Error ? err.message : err);
  return c.json({ error: 'Internal server error' }, 500);
}

const adminOnly = createMiddleware<{ Variables: StaffVars }>(async (c, next) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Only clinic admins can do this' }, 403);
  return next();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerOnboardingRoutes(app: Hono<any>): void {
  app.post('/api/onboarding/org', rateLimit({ windowMs: 60_000, max: 10, key: (c) => `org:${clientIp(c)}` }), requireUser, async (c) => {
    const parsed = CreateOrg.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
    try {
      return c.json(await createOrgForUser(c.get('user'), parsed.data), 201);
    } catch (err) { return handle(c, err); }
  });

  // Registered on /api/staff/*: requireStaff resolves role + org from the Bearer token.
  app.get('/api/staff/org', requireStaff, async (c) => {
    try { return c.json(await getOrg(c.get('orgId'))); } catch (err) { return handle(c, err); }
  });

  app.put('/api/staff/settings', requireStaff, adminOnly, async (c) => {
    try { return c.json(await updateOrgSettings(c.get('orgId'), await body(c))); } catch (err) { return handle(c, err); }
  });

  app.get('/api/staff/team', requireStaff, adminOnly, async (c) => {
    try { return c.json(await listTeam(c.get('orgId'))); } catch (err) { return handle(c, err); }
  });

  app.post('/api/staff/team/invite', requireStaff, adminOnly, async (c) => {
    const parsed = Invite.safeParse(await body(c));
    if (!parsed.success) return c.json({ error: 'Enter a valid email and a role of caseworker or admin' }, 400);
    try {
      return c.json(await inviteStaff(c.get('orgId'), c.get('userId'), parsed.data.email.toLowerCase(), parsed.data.role), 201);
    } catch (err) { return handle(c, err); }
  });

  app.get('/api/staff/setup-status', requireStaff, async (c) => {
    try { return c.json(await setupStatus(c.get('orgId'))); } catch (err) { return handle(c, err); }
  });
}
