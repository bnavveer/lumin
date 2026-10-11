import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { County, Program } from './contracts.js';
import { optionalEnv } from './env.js';
import { keewanoSql } from './keewano.js';
import { hasModel } from './llm/routes.js';
import { admin } from './supabase.js';

export const PROGRAMS = ['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8'] as const satisfies readonly Program[];
export const COUNTIES = ['los_angeles', 'san_francisco'] as const satisfies readonly County[];
export const ROLES = ['caseworker', 'admin'] as const;
export type StaffRole = (typeof ROLES)[number];

/** Error carrying an HTTP status; routes map it straight to a response. */
export class HttpError extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409 | 502, message: string) {
    super(message);
  }
}

let override: SupabaseClient | undefined;
/** Test seam: replace the service-role client. Call with no args to restore. */
export function setOnboardingClient(client?: SupabaseClient): void {
  override = client;
}
const db = (): SupabaseClient => override ?? admin();

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

export const OrgSettingsSchema = z.object({
  autopilot: z.object({
    enabled: z.boolean().default(true),
    quietHours: z.object({ start: Time.default('20:00'), end: Time.default('08:00') }).default({ start: '20:00', end: '08:00' }),
    nudges: z.object({
      interview_nudge: z.boolean().default(true),
      docs_nudge: z.boolean().default(true),
      submit: z.boolean().default(true),
      waitlist_check: z.boolean().default(true),
      renewal_start: z.boolean().default(true),
    }).default({ interview_nudge: true, docs_nudge: true, submit: true, waitlist_check: true, renewal_start: true }),
  }).default({
    enabled: true,
    quietHours: { start: '20:00', end: '08:00' },
    nudges: { interview_nudge: true, docs_nudge: true, submit: true, waitlist_check: true, renewal_start: true },
  }),
  programs: z.array(z.enum(PROGRAMS)).min(1, 'Pick at least one program').default([...PROGRAMS]),
  escalateAfterNoAnswers: z.number().int().min(1).max(10).default(3),
});
export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

export const defaultSettings = (): OrgSettings => OrgSettingsSchema.parse({});

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Immutable deep merge: plain objects merge key by key, everything else (arrays included) is replaced. */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlain(base) || !isPlain(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = deepMerge(base[k], v);
  }
  return out;
}

/** Partial version of the settings schema, used to validate PUT bodies. */
export const SettingsPatchSchema = z.object({
  autopilot: z.object({
    enabled: z.boolean(),
    quietHours: z.object({ start: Time, end: Time }).partial(),
    nudges: z.object({
      interview_nudge: z.boolean(), docs_nudge: z.boolean(), submit: z.boolean(),
      waitlist_check: z.boolean(), renewal_start: z.boolean(),
    }).partial(),
  }).partial(),
  programs: z.array(z.enum(PROGRAMS)).min(1, 'Pick at least one program'),
  escalateAfterNoAnswers: z.number().int().min(1).max(10),
}).partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export interface OrgView { id: string; name: string; county: County; aidPhone: string | null; settings: OrgSettings }

interface OrgRow { id: string; name: string; county: string | null; aid_phone: string | null; settings: unknown }

function toOrgView(row: OrgRow): OrgView {
  const parsed = OrgSettingsSchema.safeParse(row.settings ?? {});
  return {
    id: row.id,
    name: row.name,
    county: (row.county === 'san_francisco' ? 'san_francisco' : 'los_angeles'),
    aidPhone: row.aid_phone ?? null,
    settings: parsed.success ? parsed.data : defaultSettings(),
  };
}

const fail = (ctx: string, err: { message: string }): never => {
  throw new Error(`[onboarding] ${ctx}: ${err.message}`);
};

export async function createOrgForUser(
  user: { id: string; email: string },
  input: { clinicName: string; county: County },
): Promise<OrgView> {
  const { data: existing, error: exErr } = await db().from('staff').select('org_id').eq('user_id', user.id).maybeSingle();
  if (exErr) fail('createOrgForUser lookup', exErr);
  if (existing) throw new HttpError(409, 'You already belong to a clinic');

  const { data: org, error } = await db().from('orgs')
    .insert({ name: input.clinicName, county: input.county, settings: defaultSettings(), created_by: user.id })
    .select('id, name, county, aid_phone, settings').single();
  if (error || !org) return fail('createOrgForUser insert org', error ?? { message: 'no row returned' });

  const row = org as OrgRow;
  const { error: staffErr } = await db().from('staff').insert({ user_id: user.id, org_id: row.id, role: 'admin' });
  if (staffErr) {
    await db().from('orgs').delete().eq('id', row.id); // roll back the orphan org
    if ((staffErr as { code?: string }).code === '23505') throw new HttpError(409, 'You already belong to a clinic');
    fail('createOrgForUser insert staff', staffErr);
  }
  return toOrgView(row);
}

export async function getOrg(orgId: string): Promise<OrgView> {
  const { data, error } = await db().from('orgs').select('id, name, county, aid_phone, settings').eq('id', orgId).maybeSingle();
  if (error) fail('getOrg', error);
  if (!data) throw new HttpError(404, 'Clinic not found');
  return toOrgView(data as OrgRow);
}

export async function updateOrgSettings(orgId: string, patch: unknown): Promise<OrgView> {
  const parsedPatch = SettingsPatchSchema.safeParse(patch);
  if (!parsedPatch.success) throw new HttpError(400, parsedPatch.error.issues[0]?.message ?? 'Invalid settings');
  const current = await getOrg(orgId);
  const merged = OrgSettingsSchema.safeParse(deepMerge(current.settings, parsedPatch.data));
  if (!merged.success) throw new HttpError(400, merged.error.issues[0]?.message ?? 'Invalid settings');
  const { error } = await db().from('orgs').update({ settings: merged.data }).eq('id', orgId);
  if (error) fail('updateOrgSettings', error);
  return { ...current, settings: merged.data };
}

export interface TeamMember { userId: string; email: string | null; role: string; status: 'active' | 'invited' }

async function findUserByEmail(email: string): Promise<{ id: string } | undefined> {
  const lower = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail('listUsers', error);
    const users = data?.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === lower);
    if (hit) return { id: hit.id };
    if (users.length < 200) break;
  }
  return undefined;
}

export async function inviteStaff(orgId: string, invitedBy: string, email: string, role: StaffRole): Promise<TeamMember> {
  const redirectTo = `${optionalEnv('PUBLIC_BASE_URL') ?? ''}/#/staff/login`;
  let userId: string | undefined;
  let alreadyRegistered = false;

  const { data, error } = await db().auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    if (!/already.*(registered|exists)|email_exists/i.test(`${error.message} ${(error as { code?: string }).code ?? ''}`)) {
      console.error('[onboarding] invite failed:', error.message);
      throw new HttpError(502, 'Could not send the invite. Check the email and try again.');
    }
    alreadyRegistered = true;
    userId = (await findUserByEmail(email))?.id;
    if (!userId) throw new HttpError(502, 'That email is registered but could not be linked.');
  } else {
    userId = data?.user?.id;
    if (!userId) throw new HttpError(502, 'Invite did not return a user.');
  }

  const { data: existing, error: exErr } = await db().from('staff').select('org_id').eq('user_id', userId).maybeSingle();
  if (exErr) fail('inviteStaff lookup', exErr);
  if (existing) {
    const same = (existing as { org_id: string }).org_id === orgId;
    throw new HttpError(409, same ? 'Already on your team' : 'That person already belongs to another clinic');
  }

  const { error: sErr } = await db().from('staff').insert({ user_id: userId, org_id: orgId, role });
  if (sErr) fail('inviteStaff insert staff', sErr);
  const { error: iErr } = await db().from('staff_invites').insert({
    org_id: orgId, email, role, invited_by: invitedBy, accepted_at: alreadyRegistered ? new Date().toISOString() : null,
  });
  if (iErr) fail('inviteStaff insert invite', iErr);
  return { userId, email, role, status: alreadyRegistered ? 'active' : 'invited' };
}

export async function listTeam(orgId: string): Promise<TeamMember[]> {
  const { data: staff, error } = await db().from('staff').select('user_id, role').eq('org_id', orgId);
  if (error) fail('listTeam staff', error);
  const members = await Promise.all(((staff ?? []) as Array<{ user_id: string; role: string }>).map(async (s) => {
    const { data } = await db().auth.admin.getUserById(s.user_id);
    const u = data?.user;
    return {
      userId: s.user_id,
      email: u?.email ?? null,
      role: s.role,
      status: u && (u.last_sign_in_at || u.email_confirmed_at) ? 'active' : 'invited',
    } as TeamMember;
  }));
  return members;
}

export interface SetupCheck { key: string; label: string; ok: boolean; detail: string }

const CHECK_TIMEOUT_MS = 5000;

async function timed(key: string, label: string, run: () => Promise<{ ok: boolean; detail: string }>): Promise<SetupCheck> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const r = await Promise.race([
      run(),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timed out after 5s')), CHECK_TIMEOUT_MS); }),
    ]);
    return { key, label, ...r };
  } catch (err) {
    // Never echo upstream error text: it can contain hostnames or credentials.
    console.warn(`[onboarding] check ${key} failed:`, err instanceof Error ? err.message : err);
    return { key, label, ok: false, detail: err instanceof Error && err.message.startsWith('timed out') ? 'Timed out after 5s' : 'Unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

const has = (name: string): boolean => !!optionalEnv(name);

export async function setupStatus(orgId: string): Promise<{ checks: SetupCheck[] }> {
  const checks = await Promise.all([
    timed('supabase', 'Supabase (database and sign-in)', async () => {
      const { error } = await db().from('orgs').select('id').eq('id', orgId).limit(1);
      if (error) throw new Error(error.message);
      return { ok: true, detail: 'Connected' };
    }),
    timed('keewano', 'Keewano (agent memory)', async () => {
      if (!has('KEEWANO_SDK_KEY') && !has('KEEWANO_PAT')) return { ok: false, detail: 'Not configured' };
      const rows = await keewanoSql<{ n: number | string; households: number | string }>('SELECT count(*) AS n, count(DISTINCT user_id) AS households FROM events');
      const r = rows[0];
      return { ok: true, detail: `${Number(r?.n ?? 0).toLocaleString('en-US')} events across ${Number(r?.households ?? 0).toLocaleString('en-US')} households` };
    }),
    timed('claude', 'Claude (the caseworker brain)', async () =>
      hasModel() ? { ok: true, detail: 'AI credential set' } : { ok: false, detail: 'Missing AI credential (NEON_AI_GATEWAY_* or ANTHROPIC_API_KEY)' }),
    timed('dial', 'Dial (phone calls)', async () => {
      if (!has('DIAL_API_KEY') || !has('DIAL_FROM_NUMBER_ID')) return { ok: false, detail: 'Calling is not configured' };
      const { data } = await db().from('orgs').select('aid_phone').eq('id', orgId).maybeSingle();
      const phone = (data as { aid_phone: string | null } | null)?.aid_phone;
      return phone ? { ok: true, detail: `Calling from ${phone}` } : { ok: true, detail: 'Calling ready; Lumin number pending' };
    }),
    timed('devin', 'Devin (county portal filing)', async () =>
      has('DEVIN_API_KEY') ? { ok: true, detail: 'API key set' } : { ok: false, detail: 'Missing API key' }),
    timed('demo', 'Demo mode', async () =>
      optionalEnv('DEMO_MODE') === 'true'
        ? { ok: true, detail: 'On: canned data is used if a service fails' }
        : { ok: true, detail: 'Off: live data only' }),
  ]);
  return { checks };
}
