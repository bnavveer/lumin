// Applicant accounts: Supabase Auth email/password. DEMO_MODE never bypasses this.
import { createMiddleware } from 'hono/factory';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import type { Me } from '../../shared/workflow.js';
import type { Household } from '../contracts.js';
import { fieldsFromHousehold, householdId, mergeFields, normalizePhone, toHousehold, type IntakeFields } from '../intake.js';
import { DEMO_ORG_ID } from '../supabase.js';
import type { WorkflowDeps } from './deps.js';
import type { AccountRow } from './store.js';

export type ApplicantVars = { userId: string; email: string };

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;
const TOKEN = /^[A-Za-z0-9._~+/=-]{10,4096}$/;

/** Bearer token, or `?access_token=` (only where allowed: EventSource cannot send headers). */
export function requireApplicant(deps: WorkflowDeps, opts: { allowQueryToken?: boolean } = {}) {
  return createMiddleware<{ Variables: ApplicantVars }>(async (c, next) => {
    const header = c.req.header('Authorization');
    let token = header ? BEARER.exec(header.trim())?.[1] : undefined;
    if (!token && opts.allowQueryToken) {
      const q = c.req.query('access_token');
      if (q && TOKEN.test(q)) token = q;
    }
    if (!token) return c.json({ error: 'Sign in required' }, 401);
    const user = await deps.auth.getUser(token).catch(() => null);
    if (!user) return c.json({ error: 'Sign in required' }, 401);
    c.set('userId', user.id);
    c.set('email', user.email);
    return next();
  });
}

export const SignupBody = z.object({
  email: z.email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  firstName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(32).optional(),
});

export const ProfileBody = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(32).optional(),
  currentPassword: z.string().min(1).max(200).optional(),
});

export const CONTACT_LOCKED_ERROR = 'Enter your password to change saved contact details.';

/** True when the patch changes a contact value that is already saved (filling an empty one needs no password). */
export const changesSavedContact = (saved: { firstName: string | null; phone: string | null }, next: { firstName?: string | null; phone?: string | null }): boolean =>
  (next.firstName !== undefined && !!saved.firstName && next.firstName !== saved.firstName)
  || (next.phone !== undefined && !!saved.phone && next.phone !== saved.phone);

/** Parse a US phone; '' means "no phone". Throws RangeError on garbage. */
export function cleanPhone(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw.trim() === '') return null;
  return normalizePhone(raw);
}

// Placeholder answers so a household row can exist before the chat has collected everything.
// The chat (or a later profile edit) overwrites them; the fill uses whatever is on file.
const DEFAULT_FIELDS: IntakeFields = {
  county: 'los_angeles', size: 1, monthlyIncome: 0, childrenUnder18: 0, pregnant: false, adultAge: 30,
  immigrationStatus: 'unknown', childrenAreCitizens: true,
};

export const accountHouseholdId = (userId: string): string => uuidv5(`acct:${userId}`, uuidv5.URL);

export async function getOrCreateAccount(deps: WorkflowDeps, userId: string): Promise<AccountRow> {
  const existing = await deps.repo.getAccount(userId);
  if (existing) return existing;
  const fresh: AccountRow = { userId, householdId: null, phone: null, firstName: null, createdAt: new Date().toISOString() };
  await deps.repo.saveAccount(fresh);
  return fresh;
}

/**
 * Make sure the account has a household: keyed by phone when there is one (same id the text/voice
 * channels use), otherwise by the account id. `fields` (e.g. from a web chat session) win over what's on file.
 */
export async function ensureHousehold(deps: WorkflowDeps, account: AccountRow, fields: IntakeFields = {}): Promise<{ account: AccountRow; household: Household }> {
  const hid = account.phone ? householdId(account.phone) : account.householdId ?? accountHouseholdId(account.userId);
  const phone = account.phone ?? `acct:${account.userId}`;
  const existing = await deps.households.get(hid);
  const base = existing ? fieldsFromHousehold(existing) : DEFAULT_FIELDS;
  const merged = mergeFields(mergeFields(DEFAULT_FIELDS, base), { ...fields, ...(account.firstName && !fields.firstName ? { firstName: account.firstName } : {}) });
  const household = toHousehold(hid, existing?.orgId ?? DEMO_ORG_ID, existing?.phone ?? phone, merged);
  const changed = !existing || JSON.stringify(fieldsFromHousehold(existing)) !== JSON.stringify(fieldsFromHousehold(household));
  if (changed) await deps.households.upsert(household);
  const next = account.householdId === hid ? account : { ...account, householdId: hid };
  if (next !== account) await deps.repo.saveAccount(next);
  return { account: next, household };
}

export const toMe = (a: AccountRow, email: string): Me => ({
  userId: a.userId, email, householdId: a.householdId, phone: a.phone, firstName: a.firstName,
  contactLocked: Boolean(a.firstName && a.phone),
});
