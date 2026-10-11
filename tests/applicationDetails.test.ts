import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationReadiness, type ApplicationDetails } from '../shared/applicationDetails.js';
import { buildAnswers, PAGES } from '../src/benefitscal/spec.js';
import type { Household } from '../src/contracts.js';
import { mergeFields } from '../src/intake.js';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import { AgentDetailsSchema, agentPatch, detailsToExtra, validPastDate } from '../src/workflow/applicationDetails.js';
import { absorbChatDetails, accountForChat, mergeAccountDetails } from '../src/workflow/applicationDetailsDb.js';
import { signupRedirect, supabasePasswordCheck, supabaseWorkflowRepo } from '../src/workflow/repo.js';
import { practiceExtra } from '../src/workflow/steps/fill.js';

const NOW = new Date('2026-10-11T19:00:00Z');
const H: Household = { id: 'h1', orgId: 'o1', phone: '+12135550100', firstName: 'Mari', county: 'los_angeles', size: 2, monthlyIncome: 1800,
  childrenUnder18: 1, pregnant: false, adultAge: 35, immigrationStatus: 'citizen', childrenAreCitizens: true };
const optionValues = (name: string) => PAGES.flatMap(p => p.fields).find(f => f.name === name)!.options!.map(o => o.value);

describe('details -> BenefitsCal spec fields', () => {
  it('maps every pay frequency and relationship to a valid spec option value', () => {
    for (const payFrequency of ['weekly', 'biweekly', 'semi_monthly', 'monthly'] as const) {
      expect(optionValues('pay_frequency')).toContain(detailsToExtra({ hasJob: true, payFrequency }).pay_frequency);
    }
    for (const relationship of ['spouse', 'child', 'parent', 'sibling', 'other_relative', 'unrelated'] as const) {
      const extra = detailsToExtra({ members: [{ firstName: 'A', lastName: 'B', dateOfBirth: '2010-01-01', relationship }] });
      expect(optionValues('member_relationship')).toContain(extra.member_relationship);
    }
  });

  it('uses the first household member, spec yes/no and checkbox forms, monthly rent, and clips to maxLength', () => {
    const d: ApplicationDetails = {
      legalFirstName: 'Maria', middleName: 'Elena', lastName: 'Lopez', dateOfBirth: '1990-04-12', homeless: false,
      street: '100 Main St', apt: '4B', city: 'Los Angeles', zip: '90012', hasJob: true, employerName: 'A Very Long Employer Name Inc',
      payFrequency: 'semi_monthly', grossPay: 950.5, hoursPerWeek: 32, rentAmount: 0, paysUtilities: false, interviewPreference: 'phone',
      members: [
        { firstName: 'Ana', lastName: 'Lopez', dateOfBirth: '2015-06-01', relationship: 'child' },
        { firstName: 'Luis', lastName: 'Lopez', dateOfBirth: '1988-01-30', relationship: 'spouse' },
      ],
    };
    const answers = buildAnswers(H, detailsToExtra(d));
    expect(answers).toMatchObject({
      first_name: 'Maria', middle_name: 'Elena', last_name: 'Lopez', dob: '1990-04-12', homeless: 'no', street: '100 Main St', apt: '4B',
      zip: '90012', member_first_name: 'Ana', member_dob: '2015-06-01', member_relationship: 'child', has_job: 'yes',
      employer_name: 'A Very Long Employer', pay_frequency: 'semi_monthly', gross_pay: '950.5', hours_per_week: '32',
      rent_amount: '0', rent_frequency: 'monthly', interview_type: 'phone',
    });
    expect(answers.pays_utilities).toBe(false); // checkbox: a boolean, unchecked
    expect(detailsToExtra({ paysUtilities: true }).pays_utilities).toBe(true);
    expect(detailsToExtra({ homeless: true }).homeless).toBe('yes');
  });

  it('never maps job details when nobody has a job, and never invents anything missing', () => {
    expect(detailsToExtra({ hasJob: false, employerName: 'Old Job', grossPay: 100 })).toEqual({ has_job: 'no' });
    expect(detailsToExtra({})).toEqual({});
  });

  it('practice replica placeholders fill only unanswered keys', () => {
    const { extra, placeholders } = practiceExtra({ lastName: 'Lopez', hasJob: false }, 'abcdef0123');
    expect(extra.last_name).toBe('Lopez');
    expect(extra.street).toBe('123 Demo Street');
    expect(placeholders).not.toContain('last_name');
    expect(placeholders).not.toContain('employer_name');
    expect(placeholders).toContain('street');
  });
});

describe('dates and the chat tool patch', () => {
  it('accepts real past dates only', () => {
    expect(validPastDate('1990-04-12', NOW)).toBe(true);
    expect(validPastDate('2026-10-11', NOW)).toBe(true);
    for (const bad of ['2026-10-12', '1990-02-30', '1899-12-31', '1990-4-12', '']) expect(validPastDate(bad, NOW)).toBe(false);
  });

  it('upserts household members by place in the household and rejects gaps or future dates', () => {
    const m = { firstName: 'Ana', lastName: 'Lopez', dateOfBirth: '2015-06-01', relationship: 'child' as const };
    expect(agentPatch({}, { householdMember: { personNumber: 3, ...m } }, NOW)).toMatch(/person 2/);
    const first = agentPatch({}, { householdMember: { personNumber: 2, ...m }, lastName: ' Lopez ' }, NOW);
    expect(first).toEqual({ members: [m], lastName: 'Lopez' });
    const fixed = agentPatch({ members: [m] }, { householdMember: { personNumber: 2, ...m, firstName: 'Anna' } }, NOW);
    expect(fixed).toEqual({ members: [{ ...m, firstName: 'Anna' }] });
    expect(agentPatch({}, { dateOfBirth: '2030-01-01' }, NOW)).toMatch(/Not saved/);
    expect(agentPatch({}, { householdMember: { personNumber: 2, ...m, dateOfBirth: '2030-01-01' } }, NOW)).toMatch(/Not saved/);
  });

  it('the chat tool schema converts to a JSON schema the model can use', () => {
    const schema = z.toJSONSchema(AgentDetailsSchema) as { properties: Record<string, unknown>; required?: string[] };
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['legalFirstName', 'householdMember', 'payFrequency', 'interviewPreference']));
    expect(schema.required ?? []).toEqual([]);
    expect(JSON.stringify(schema)).not.toMatch(/ssn|social|bank|password/i);
    expect(() => betaZodTool({ name: 'save_application_details', description: 'x', inputSchema: AgentDetailsSchema, run: async () => 'ok' })).not.toThrow();
  });

  it('readiness asks for each other household member the screening counts', () => {
    const r = applicationReadiness({}, { county: 'los_angeles', size: 2, monthlyIncome: 0 });
    expect(r.missing.map(m => m.field)).toEqual(expect.arrayContaining(['members.0.firstName', 'members.0.dateOfBirth', 'members.0.relationship']));
  });

  it('intake merges application details key by key', () => {
    expect(mergeFields({ size: 2, application: { lastName: 'Lopez', zip: '90012' } }, { application: { zip: '90013' } }))
      .toEqual({ size: 2, application: { lastName: 'Lopez', zip: '90013' } });
  });
});

type Query = { table: string; action: string; filters: Record<string, unknown>; values?: unknown };
function database(resolve: (q: Query) => unknown, rpc: (fn: string, args: Record<string, unknown>) => unknown = () => null) {
  const queries: Query[] = [];
  const rpcs: [string, Record<string, unknown>][] = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => { rpcs.push([fn, args]); return { data: rpc(fn, args), error: null }; }),
    from(table: string) {
      const q: Query = { table, action: 'select', filters: {} }; queries.push(q);
      const chain = {
        select() { return chain; },
        upsert(values: unknown) { q.action = 'upsert'; q.values = values; return chain; },
        update(values: unknown) { q.action = 'update'; q.values = values; return chain; },
        eq(key: string, value: unknown) { q.filters[key] = value; return chain; },
        order() { return chain; }, limit() { return chain; }, maybeSingle() { return chain; }, single() { return chain; },
        then(onFulfilled: (result: unknown) => unknown) { return Promise.resolve({ data: resolve(q), error: null }).then(onFulfilled); },
      };
      return chain;
    },
  };
  return { client: () => client as unknown as SupabaseClient, queries, rpcs };
}

describe('application details storage', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('merges atomically through the RPC; null clears a key', async () => {
    const d = database(() => null, () => ({ lastName: 'Lopez', bogus: 1 }));
    expect(await mergeAccountDetails(d.client, 'u1', { lastName: 'Lopez', apt: null })).toEqual({ lastName: 'Lopez' });
    expect(d.rpcs).toEqual([['merge_applicant_application_details', { p_user_id: 'u1', p_set: { lastName: 'Lopez' }, p_clear: ['apt'], p_fill_only: false }]]);
  });

  it('moves chat-collected details into the account (account answers win) and strips them from the intake', async () => {
    const d = database(q => (q.table === 'intakes' && q.action === 'select' && q.filters.id === 'web:s1' ? { fields: { size: 3, application: { lastName: 'Lopez', zip: '90012' } } } : null));
    await absorbChatDetails(d.client, 'u1', ['web:s1', 'web:s1', 'web:empty']);
    expect(d.rpcs).toEqual([['merge_applicant_application_details', { p_user_id: 'u1', p_set: { lastName: 'Lopez', zip: '90012' }, p_clear: [], p_fill_only: true }]]);
    expect(d.queries.filter(q => q.action === 'update')).toEqual([{ table: 'intakes', action: 'update', filters: { id: 'web:s1' }, values: { fields: { size: 3 } } }]);
  });

  it('copies chat details right after a successful claim', async () => {
    const d = database(q => {
      if (q.table === 'applicant_profiles') return { household_id: 'hh-1' };
      if (q.table === 'intakes' && q.filters.id === 'hh-1') return { fields: { application: { dateOfBirth: '1990-04-12' } } };
      return null;
    }, fn => (fn === 'claim_applicant_chat' ? 'ok' : {}));
    await supabaseWorkflowRepo(d.client).claimChat('u1', '6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b');
    expect(d.queries.filter(q => q.table === 'intakes' && q.action === 'select').map(q => q.filters.id)).toEqual(['web:6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b', 'hh-1']);
    expect(d.rpcs.find(r => r[0] === 'merge_applicant_application_details')?.[1]).toMatchObject({ p_set: { dateOfBirth: '1990-04-12' }, p_fill_only: true });
  });

  it('screening never returns chat application details', async () => {
    const d = database(q => {
      if (q.table === 'applicant_profiles') return { household_id: 'hh', screening_answers_initialized: false };
      if (q.table === 'intakes') return { fields: { size: 3, application: { lastName: 'Lopez' } } };
      return null;
    });
    expect(await supabaseWorkflowRepo(d.client).screening('u1')).toEqual({ size: 3 });
  });

  it('finds the account for a verified household first, else for the claimed web session', async () => {
    const d = database(q => (q.table === 'applicant_profiles' && q.filters.household_id === 'hh' ? { user_id: 'owner-by-phone' }
      : q.table === 'applicant_chat_claims' && q.filters.session_id === '6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b' ? { user_id: 'owner-by-claim' } : null));
    expect(await accountForChat(d.client, { intakeId: 'hh' })).toBe('owner-by-phone');
    expect(await accountForChat(d.client, { intakeId: 'web:6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b' })).toBe('owner-by-claim');
    expect(await accountForChat(d.client, { intakeId: 'other-hh' })).toBeNull();
    // An unconfirmed web session never resolves through a phone household.
    expect(d.queries.filter(q => q.table === 'applicant_profiles')).toHaveLength(2);
  });

  it('signup confirmation links land on the dashboard', async () => {
    expect(signupRedirect('https://lumin.example/')).toBe('https://lumin.example/dashboard');
    vi.stubEnv('PUBLIC_BASE_URL', '') // don't depend on the developer's .env
    expect(signupRedirect(undefined)).toBeUndefined();
    vi.stubEnv('PUBLIC_BASE_URL', 'https://lumin.example//');
    const signUp = vi.fn(async (_input: unknown) => ({ data: { session: null, user: { id: 'new' } }, error: null }));
    const repo = supabaseWorkflowRepo(database(() => null).client, () => ({ auth: { signUp } }) as unknown as SupabaseClient);
    await repo.signup({ email: 'new@example.test', password: 'local-test-password' });
    expect(signUp.mock.calls[0]?.[0]).toMatchObject({ options: { emailRedirectTo: 'https://lumin.example/dashboard' } });
  });

  it('password check signs in on a fresh isolated client and revokes that session', async () => {
    const made: { signInWithPassword: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn> }[] = [];
    const check = supabasePasswordCheck(() => {
      const auth = {
        signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => password === 'right'
          ? { data: { user: { email }, session: { access_token: 't' } }, error: null }
          : { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }),
        signOut: vi.fn(async () => ({ error: null })),
      };
      made.push(auth);
      return { auth } as unknown as SupabaseClient;
    });
    expect(await check('a@example.test', 'right')).toBe(true);
    expect(await check('a@example.test', 'wrong')).toBe(false);
    expect(await check('a@example.test', '')).toBe(false);
    expect(made).toHaveLength(2); // a new client per check; empty password never calls Supabase
    expect(made[0]!.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(made[1]!.signOut).not.toHaveBeenCalled();
  });
});
