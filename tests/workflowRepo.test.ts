import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { screenApplications } from '../src/applicationScreening.js';
import { newWorkflow } from '../src/workflow/model.js';
import { supabaseWorkflowRepo } from '../src/workflow/repo.js';

type Query = { table: string; action: string; filters: Record<string, unknown>; values?: unknown };
function database(resolve: (q: Query) => unknown) {
  const queries: Query[] = [];
  const signup = vi.fn();
  const client = {
    auth: { signUp: signup },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from(table: string) {
      const q: Query = { table, action: 'select', filters: {} }; queries.push(q);
      const chain = {
        select() { return chain; },
        upsert(values: unknown) { q.action = 'upsert'; q.values = values; return chain; },
        insert(values: unknown) { q.action = 'insert'; q.values = values; return chain; },
        update(values: unknown) { q.action = 'update'; q.values = values; return chain; },
        eq(key: string, value: unknown) { q.filters[key] = value; return chain; },
        order() { return chain; }, limit() { return chain; }, maybeSingle() { return chain; }, single() { return chain; },
        then(onFulfilled: (result: unknown) => unknown) { return Promise.resolve({ data: resolve(q), error: null }).then(onFulfilled); },
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, queries, signup };
}

describe('Supabase applicant persistence', () => {
  it('reads canonical confirmed phone answers after SMS corrections rather than a stale web snapshot', async () => {
    const d = database(q => {
      if (q.table === 'applicant_profiles') return { household_id: 'verified-household', screening_answers_initialized: false };
      if (q.table === 'intakes' && q.filters.id === 'verified-household' && q.filters.status === 'confirmed') return { fields: { size: 3, monthlyIncome: 700 } };
      if (q.table === 'applicant_chat_claims') return [{ session_id: 'stale-session' }];
      return null;
    });
    const repo = supabaseWorkflowRepo(() => d.client);
    expect(await repo.screening('owner')).toEqual({ size: 3, monthlyIncome: 700 });
    expect(d.queries.find(q => q.table === 'intakes')?.filters).toEqual({ id: 'verified-household', status: 'confirmed' });
    expect(d.queries.some(q => q.table === 'applicant_chat_claims')).toBe(false);
  });

  it('does not return fields for a different claimed household when the canonical intake is unavailable', async () => {
    const d = database(q => {
      if (q.table === 'applicant_profiles') return { household_id: 'household-A', screening_answers_initialized: false };
      if (q.table === 'applicant_chat_claims') return [{ session_id: 'session-B' }];
      if (q.table === 'intakes' && q.filters.id === 'web:session-B') return { fields: { monthlyIncome: 99999 }, household_id: 'household-B', status: 'confirmed' };
      return null;
    });
    expect(await supabaseWorkflowRepo(() => d.client).screening('owner')).toEqual({});
  });

  it('keeps deliberately edited or cleared account answers canonical', async () => {
    const d = database(q => q.table === 'applicant_profiles' ? { household_id: 'household', screening_answers_initialized: true, screening_answers: {} } : null);
    expect(await supabaseWorkflowRepo(() => d.client).screening('owner')).toEqual({});
    expect(d.queries.some(q => q.table === 'intakes')).toBe(false);
  });

  it('all workflow reads and writes include auth ownership, and saves compare version atomically', async () => {
    const d = database(() => []);
    const repo = supabaseWorkflowRepo(() => d.client);
    await repo.get('owner', 'workflow');
    expect(d.queries[0]?.filters).toEqual({ id: 'workflow', user_id: 'owner' });
    const w = newWorkflow(null, ['calfresh'], screenApplications({}), new Date().toISOString());
    await expect(repo.save({ userId: 'owner', version: 5, workflow: w })).rejects.toMatchObject({ status: 409 });
    expect(d.queries[1]?.filters).toEqual({ id: w.id, user_id: 'owner', version: 5 });
  });

  it('signup uses an isolated public auth client and preserves email verification policy', async () => {
    const d = database(() => null);
    const signUp = vi.fn(async (_input: unknown) => ({ data: { session: null, user: { id: 'new' } }, error: null }));
    const isolated = { auth: { signUp } } as unknown as SupabaseClient;
    const repo = supabaseWorkflowRepo(() => d.client, () => isolated);
    expect(await repo.signup({ email: 'new@example.test', password: 'local-test-password', phone: '+12135550123' })).toEqual({ confirmationRequired: true });
    expect(signUp).toHaveBeenCalledOnce();
    expect(d.signup).not.toHaveBeenCalled();
    expect(signUp.mock.calls[0]?.[0]).toMatchObject({ options: { data: { phone: '+12135550123' } } });
  });
});
