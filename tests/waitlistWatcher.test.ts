import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Household } from '../src/contracts.js';

const logEvent = vi.fn(async () => {});
const addTimeline = vi.fn(async () => {});
const listHouseholds = vi.fn<() => Promise<Household[]>>();
vi.mock('../src/keewano.js', () => ({ logEvent }));
vi.mock('../src/store.js', () => ({ addTimeline, listHouseholds }));

const { setExaFetch, setWebLlm } = await import('../src/exa.js');
const w = await import('../src/waitlistWatcher.js');

const hh = (id: string, income: number, size = 1): Household => ({
  id, orgId: 'o', phone: '+12135550100', county: 'los_angeles', size, monthlyIncome: income,
  childrenUnder18: 0, pregnant: false, adultAge: 30, immigrationStatus: 'citizen', childrenAreCitizens: true,
} as Household);

const pageFetch = (text: string) =>
  (async () => new Response(JSON.stringify({ results: [{ title: 'p', url: 'https://hacla.org/p', text }] }), { status: 200 })) as typeof fetch;

beforeEach(() => { process.env.EXA_API_KEY = 'k'; w.clearWaitlistCache(); vi.clearAllMocks(); });
afterEach(() => { setExaFetch(); setWebLlm(); });

describe('classifier', () => {
  it('returns unknown when the model says unclear', async () => {
    setExaFetch(pageFetch('Welcome to our site. Housing programs available.'));
    setWebLlm({ text: async () => '', object: (async () => ({ status: 'unknown', evidence: '', sourceUrl: 'https://hacla.org/p' })) as never });
    const r = await w.checkSection8Waitlists({ force: true });
    expect(r.map((x) => x.status)).toEqual(['unknown', 'unknown']);
  });
  it('downgrades to unknown when the quoted evidence is not in the page', async () => {
    setExaFetch(pageFetch('Applications are under review.'));
    setWebLlm({ text: async () => '', object: (async () => ({ status: 'open', evidence: 'The list is open now', sourceUrl: 'https://hacla.org/p' })) as never });
    const r = await w.classifyWaitlist('HACLA', [{ title: 'p', url: 'https://hacla.org/p', text: 'Applications are under review.' }]);
    expect(r.status).toBe('unknown');
  });
  it('accepts a grounded closed verdict', async () => {
    setExaFetch(pageFetch('The HCV Waiting List is currently  closed.'));
    setWebLlm({ text: async () => '', object: (async () => ({ status: 'closed', evidence: 'HCV Waiting List is currently closed', sourceUrl: 'https://hacla.org/p' })) as never });
    const r = await w.checkSection8Waitlists({ force: true });
    expect(r[0]).toMatchObject({ authority: 'HACLA', status: 'closed', sourceUrl: 'https://hacla.org/p' });
    expect(w.latestWaitlistStatus()).toHaveLength(2);
  });
});

describe('applyWaitlistStatus', () => {
  const closed = { authority: 'HACLA' as const, status: 'closed' as const, checkedAt: 'now', sourceUrl: 'u', evidence: 'e' };
  it('logs only for section8-likely households', async () => {
    listHouseholds.mockResolvedValue([hh('low', 500), hh('rich', 20000)]);
    expect(await w.applyWaitlistStatus([closed])).toBe(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith('low', { type: 'WaitlistStatus', value: 'closed' });
    expect(addTimeline).toHaveBeenCalledWith('low', 'Section 8 waitlist (HACLA): closed, checked via Exa');
  });
  it('does nothing when every status is unknown', async () => {
    listHouseholds.mockResolvedValue([hh('low', 500)]);
    expect(await w.applyWaitlistStatus([{ ...closed, status: 'unknown' }])).toBe(0);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
