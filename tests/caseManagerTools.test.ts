import { describe, expect, it, vi } from 'vitest';
import { buildTools, HouseholdInput, type TurnContext } from '../src/caseManager/tools.js';
import { defaultState, memoryRepo } from '../src/caseManager/state.js';
import type { ConversationDeps } from '../src/caseManager/deps.js';
import type { Household } from '../src/contracts.js';

const household: Household = { id: '00000000-0000-4000-8000-000000000001', orgId: 'test', phone: '+12135550100',
  county: 'los_angeles', size: 3, monthlyIncome: 1800, childrenUnder18: 2, pregnant: false, adultAge: 31,
  immigrationStatus: 'citizen', childrenAreCitizens: true };
const answers = { county: household.county, size: household.size, monthlyIncome: household.monthlyIncome,
  childrenUnder18: household.childrenUnder18, pregnant: household.pregnant, adultAge: household.adultAge,
  immigrationStatus: household.immigrationStatus, childrenAreCitizens: household.childrenAreCitizens };

function setup(stage: 'screening' | 'active', alreadyScreened = false) {
  const repo = memoryRepo();
  const save = vi.spyOn(repo, 'upsertHousehold');
  const deps = { repo, logEvent: vi.fn(async () => {}) } as unknown as ConversationDeps;
  const ctx: TurnContext = { deps, household: { ...household }, clinic: 'Test Clinic', proposed: [], escalated: false,
    state: { ...defaultState(household.id), stage, pendingContext: { screened: alreadyScreened } } };
  const tools = buildTools(ctx);
  const execute = (name: string, input: unknown) =>
    (tools[name] as { execute: (input: unknown, options: unknown) => Promise<unknown> }).execute(input, {});
  return { repo, save, ctx, execute };
}

describe('case manager household and escalation safeguards', () => {
  it('keeps initial case screening available and prevents a later model turn from overwriting it', async () => {
    const t = setup('screening');
    expect(await t.execute('update_household', answers)).toMatchObject({ saved: true });
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.ctx.state.stage).toBe('active');
    expect(await t.execute('update_household', { ...answers, monthlyIncome: 9000 })).toMatchObject({ error: expect.stringMatching(/fresh confirmation/) });
    expect(t.save).toHaveBeenCalledTimes(1);
    expect((await t.repo.getHousehold(household.id))?.monthlyIncome).toBe(1800);
  });

  it.each([['active', false], ['screening', true]] as const)('requires fresh intake confirmation for an existing %s household', async (stage, screened) => {
    const t = setup(stage, screened);
    expect(await t.execute('update_household', { ...answers, monthlyIncome: 9000 })).toMatchObject({ error: expect.stringMatching(/No profile changes/) });
    expect(t.save).not.toHaveBeenCalled();
    expect(t.ctx.household.monthlyIncome).toBe(1800);
  });

  it('rejects inconsistent child counts before persisting initial case screening', async () => {
    const t = setup('screening');
    const invalid = { ...answers, size: 1, childrenUnder18: 2 };
    expect(HouseholdInput.safeParse(invalid).success).toBe(false);
    expect(await t.execute('update_household', invalid)).toMatchObject({ error: expect.stringMatching(/household counts/) });
    expect(t.save).not.toHaveBeenCalled();
    expect(t.ctx.state.stage).toBe('screening');
  });

  it('records a human help request without promising a response time', async () => {
    const t = setup('active');
    const response = await t.execute('escalate_to_human', { reason: 'requested' });
    expect(response).toMatchObject({ escalated: true, tell: expect.stringMatching(/cannot promise a response time/) });
    expect(JSON.stringify(response)).not.toMatch(/1 business day/);
    expect((await t.repo.getTimeline(household.id)).some(row => /caseworker/.test(row.label))).toBe(true);
  });
});
