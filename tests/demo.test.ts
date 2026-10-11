import { describe, it, expect, afterEach } from 'vitest';
import { isDemoMode, demoCases, demoCaseDetail, demoMetrics, demoAutopilot, demoAnswer } from '../src/demo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STUCK = ['Rosa', 'James', 'Lin', 'Marcus'];

describe('demo data', () => {
  afterEach(() => { delete process.env.DEMO_MODE; });
  it('isDemoMode follows env', () => {
    expect(isDemoMode()).toBe(false);
    process.env.DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(true);
  });
  it('every case id is a UUID and resolves with 6 eligibility entries', () => {
    const cases = demoCases();
    expect(cases.length).toBeGreaterThanOrEqual(8);
    for (const c of cases) {
      expect(c.id).toMatch(UUID);
      const d = demoCaseDetail(c.id)!;
      expect(d.household.id).toBe(c.id);
      expect(d.household.orgId).toBe('00000000-0000-4000-8000-00000000a1d0');
      expect(d.eligibility).toHaveLength(6);
      expect(d.documents).toEqual([]);
    }
    expect(demoCaseDetail('nope')).toBeUndefined();
  });
  it('actions appear only on the 4 stuck cases', () => {
    const withActions = demoCases().filter(c => c.actions.length > 0).map(c => c.firstName);
    expect(withActions.sort()).toEqual([...STUCK].sort());
    const kinds = Object.fromEntries(demoCases().map(c => [c.firstName, c.actions[0]?.kind]));
    expect(kinds).toMatchObject({ Rosa: 'interview_nudge', James: 'docs_nudge', Lin: 'submit', Marcus: 'waitlist_check' });
    expect(demoAutopilot().actions).toHaveLength(4);
    expect(demoAutopilot().source).toBe('keewano');
  });
  it('Maria and Marcus have their scripted detail', () => {
    const id = (n: string) => demoCases().find(c => c.firstName === n)!.id;
    const m = demoCaseDetail(id('Maria'))!;
    expect(m.messages.length).toBeGreaterThanOrEqual(6);
    expect(m.messages.length).toBeLessThanOrEqual(10);
    expect(m.submissions[0]).toMatchObject({ kind: 'minimal', confirmation: 'LA-2026-418093' });
    const k = demoCaseDetail(id('Marcus'))!;
    expect(k.calls[0]).toMatchObject({ outcome: 'waitlist_closed' });
    expect(k.calls[0].transcript).toMatch(/^agent: /);
    expect(k.calls[0].transcript).toMatch(/\nuser: /);
  });
  it('metrics match the story', () => {
    const m = demoMetrics();
    expect(m.source).toBe('demo');
    expect(m.baseline).toMatchObject({ households: 60, submittedPct: 75, medianHoursToSubmit: 312, interviewMissedPct: 30 });
    expect(m.aid).toMatchObject({ households: 64, submittedPct: 100, medianHoursToSubmit: 1.4, interviewMissedPct: 3.1 });
  });
  it('demoAnswer covers its keywords and ends with the demo tag', () => {
    for (const q of ['how fast do we submit?', 'who missed interview', 'which documents are missing', 'any renewals due', 'waitlist status', 'random']) {
      expect(demoAnswer(q)).toMatch(/ \(demo data\)$/);
    }
    expect(demoAnswer('time')).toContain('312');
    expect(demoAnswer('interview')).toContain('3.1%');
    expect(demoAnswer('waitlist')).toContain('Marcus');
    expect(demoAnswer('zzz')).not.toBe(demoAnswer('waitlist'));
  });
});
