import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUERIES, rowsToActions, findActions, getAutopilotState, resetAutopilotCache } from '../src/autopilot.js';

beforeEach(() => { resetAutopilotCache(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('QUERIES', () => {
  it('has one Source=aid query for every action kind', () => {
    expect(Object.keys(QUERIES).sort()).toEqual(['docs_nudge', 'interview_nudge', 'renewal_start', 'submit', 'waitlist_check']);
    for (const sql of Object.values(QUERIES)) { expect(sql).toContain("'aid'"); expect(sql).toContain('user_id'); }
  });
});

describe('rowsToActions', () => {
  it('maps rows to keewano actions, skipping blanks and duplicates', () => {
    const acts = rowsToActions('submit', [{ user_id: 'a' }, { user_id: 'a' }, { user_id: '' }, { user_id: null }, { user_id: 'b' }]);
    expect(acts.map(a => a.householdId)).toEqual(['a', 'b']);
    expect(acts[0]).toMatchObject({ kind: 'submit', source: 'keewano' });
    expect(acts[0]!.detail.length).toBeGreaterThan(5);
  });
  it('honours a custom id column', () => {
    expect(rowsToActions('docs_nudge', [{ hid: 'x' }], 'hid')[0]!.householdId).toBe('x');
  });
});

describe('findActions', () => {
  it('survives one failing query and de-dupes', async () => {
    const run = vi.fn(async (sql: string) => {
      if (sql === QUERIES.docs_nudge) throw new Error('boom');
      if (sql === QUERIES.submit) return [{ user_id: 'lin' }];
      if (sql === QUERIES.interview_nudge) return [{ user_id: 'rosa' }, { user_id: 'rosa' }];
      return [];
    });
    const acts = await findActions(run);
    expect(run).toHaveBeenCalledTimes(5);
    expect(acts.map(a => `${a.householdId}:${a.kind}`).sort()).toEqual(['lin:submit', 'rosa:interview_nudge']);
  });
  it('throws when every query fails', async () => {
    await expect(findActions(async () => { throw new Error('down'); })).rejects.toThrow('[autopilot]');
  });
});

describe('getAutopilotState', () => {
  it('caches for 20s then refreshes', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => [] as Record<string, unknown>[]);
    const first = await getAutopilotState(run);
    expect(first.source).toBe('keewano');
    expect(new Date(first.lastRunAt!).getTime()).not.toBeNaN();
    await getAutopilotState(run);
    expect(run).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(20_001);
    await getAutopilotState(run);
    expect(run).toHaveBeenCalledTimes(10);
  });
});
