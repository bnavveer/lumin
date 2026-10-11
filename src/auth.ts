import type { SupabaseClient } from '@supabase/supabase-js';
import { createMiddleware } from 'hono/factory';
import { optionalEnv } from './env.js';
import { admin, DEMO_ORG_ID } from './supabase.js';

export type StaffVars = { userId: string; orgId: string; role: string };

let override: SupabaseClient | undefined;
/** Test seam: replace the service-role client. Call with no args to restore. */
export function setAuthClient(client?: SupabaseClient): void {
  override = client;
}
const db = (): SupabaseClient => override ?? admin();

export const isDemoMode = (): boolean => optionalEnv('DEMO_MODE') === 'true';

async function resolveToken(token: string): Promise<StaffVars | 'invalid' | 'not_staff'> {
  const { data: u, error } = await db().auth.getUser(token);
  if (error || !u?.user) return 'invalid';
  const { data: row, error: rowErr } = await db()
    .from('staff').select('org_id, role').eq('user_id', u.user.id).maybeSingle();
  if (rowErr) throw new Error(`[auth] getStaffFromToken: ${rowErr.message}`);
  if (!row) return 'not_staff';
  const r = row as { org_id: string; role: string };
  return { userId: u.user.id, orgId: r.org_id, role: r.role };
}

/** Resolve a Supabase access token to a staff member, or null if invalid / not staff. */
export async function getStaffFromToken(token: string): Promise<StaffVars | null> {
  const r = await resolveToken(token);
  return typeof r === 'string' ? null : r;
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

export const requireStaff = createMiddleware<{ Variables: StaffVars }>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header) {
    if (isDemoMode()) {
      c.set('userId', 'demo');
      c.set('orgId', DEMO_ORG_ID);
      c.set('role', 'caseworker');
      return next();
    }
    return c.json({ error: 'Sign in required' }, 401);
  }
  const m = BEARER.exec(header.trim());
  if (!m) return c.json({ error: 'Sign in required' }, 401);
  const staff = await resolveToken(m[1]!);
  if (staff === 'invalid') return c.json({ error: 'Sign in required' }, 401);
  if (staff === 'not_staff') return c.json({ error: 'Not a staff member of any clinic' }, 403);
  c.set('userId', staff.userId);
  c.set('orgId', staff.orgId);
  c.set('role', staff.role);
  return next();
});
