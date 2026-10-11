import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import type { Household } from '../src/contracts.js';
import { createHoldScheduler, holdSeconds, kernelTimeoutSeconds } from '../src/benefitscal/kernelSessions.js';
import {
  assertRealModeAllowed, isAllowedNav, isBlockedControl, isSeedHousehold, isSignedInApplicationPage, isStopPage,
  RealModeRefused, runRealSite, sanitizePlan, type PageField,
} from '../src/benefitscal/realSite.js';
import { checkTunnelHealth, createTunnelManager, type HealthDeps, type Tunnel } from '../src/benefitscal/tunnel.js';

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; } };
}

describe('tunnel health check', () => {
  it('retries until /api/health answers 200', async () => {
    const c = clock();
    const fetch = vi.fn().mockRejectedValueOnce(new Error('NXDOMAIN')).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    const deps: HealthDeps = { fetch, ...c };
    expect(await checkTunnelHealth('https://x.trycloudflare.com', { firstDelayMs: 0, intervalMs: 1000 }, deps)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0]![0]).toBe('https://x.trycloudflare.com/api/health');
  });

  it('gives up after the timeout (30s by default)', async () => {
    const c = clock();
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    expect(await checkTunnelHealth('https://x', { firstDelayMs: 0, intervalMs: 1500 }, { fetch, ...c })).toBe(false);
    expect(c.now()).toBeGreaterThanOrEqual(30_000);
    expect(c.now()).toBeLessThan(33_000);
  });

  it('reuses one healthy tunnel and restarts it when a health check fails', async () => {
    let n = 0;
    const killed: string[] = [];
    const start = vi.fn(async (): Promise<Tunnel> => {
      const url = `https://t${++n}.trycloudflare.com`;
      return { url, proc: { kill: () => { killed.push(url); return true; }, on: () => undefined } as unknown as Tunnel['proc'] };
    });
    const healthy = new Set(['https://t1.trycloudflare.com']);
    const m = createTunnelManager('http://localhost:3000', { start, health: async (u) => healthy.has(u), log: () => undefined });
    expect(await m.get()).toBe('https://t1.trycloudflare.com');
    expect(await m.get()).toBe('https://t1.trycloudflare.com');
    expect(start).toHaveBeenCalledTimes(1);
    healthy.clear();
    healthy.add('https://t2.trycloudflare.com');
    expect(await m.get()).toBe('https://t2.trycloudflare.com');
    expect(killed).toContain('https://t1.trycloudflare.com');
  });

  it('returns null when no tunnel ever becomes healthy', async () => {
    const start = vi.fn(async (): Promise<Tunnel> => ({ url: 'https://dead', proc: { kill: () => true, on: () => undefined } as unknown as Tunnel['proc'] }));
    const m = createTunnelManager('http://localhost:3000', { start, health: async () => false, log: () => undefined });
    expect(await m.get()).toBeNull();
    expect(start).toHaveBeenCalledTimes(2);
  });
});

describe('kernel hold + cleanup scheduling', () => {
  it('reads KERNEL_HOLD_SECONDS (default 600) and keeps the Kernel timeout above the hold', () => {
    expect(holdSeconds(undefined)).toBe(600);
    expect(holdSeconds('120')).toBe(120);
    expect(holdSeconds('nope')).toBe(600);
    expect(kernelTimeoutSeconds(600)).toBe(900);
    expect(kernelTimeoutSeconds(1200)).toBe(1500);
  });

  it('closes the browser when the hold expires, once', async () => {
    const timers: { fn: () => void; ms: number }[] = [];
    const s = createHoldScheduler({ setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => undefined });
    const close = vi.fn(async () => undefined);
    s.schedule('kb-1', 600_000, close);
    expect(timers[0]!.ms).toBe(600_000);
    expect(close).not.toHaveBeenCalled();
    timers[0]!.fn();
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);
    expect(await s.endNow('kb-1')).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ends early when the workflow moves past signing and cancels the timer', async () => {
    const cleared: unknown[] = [];
    const s = createHoldScheduler({ setTimeout: () => 'h1', clearTimeout: (h) => { cleared.push(h); } });
    const close = vi.fn(async () => undefined);
    s.schedule('kb-2', 600_000, close);
    expect(await s.endNow('kb-2')).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(cleared).toEqual(['h1']);
    expect(s.has('kb-2')).toBe(false);
  });
});

describe('real BenefitsCal guardrails', () => {
  it('blocks submit / sign / agree controls and allows only Next-style navigation', () => {
    for (const t of ['Submit', 'Sign', 'Signature', 'I agree', 'Certify', 'I declare under penalty of perjury', 'Send Application', 'Finish', 'Submit Application']) {
      expect(isBlockedControl(t)).toBe(true);
      expect(isAllowedNav(t)).toBe(false);
    }
    for (const t of ['Next', 'Continue', 'Save and Continue', ' next ']) expect(isAllowedNav(t)).toBe(true);
    expect(isAllowedNav('Back')).toBe(false);
    expect(isAllowedNav('Sign in')).toBe(false);
  });

  it('detects the signature and review screens and signed-in application pages', () => {
    expect(isStopPage('https://benefitscal.com/ApplyForBenefits/ABPAP')).toBe(true);
    expect(isStopPage('https://benefitscal.com/ApplyForBenefits/ABSID')).toBe(true);
    expect(isStopPage('https://benefitscal.com/ApplyForBenefits/ABORS')).toBe(true);
    expect(isStopPage('https://benefitscal.com/ApplyForBenefits/ABNMI', 'Name Information')).toBe(false);
    expect(isStopPage('https://benefitscal.com/ApplyForBenefits/ABXYZ', 'PLEASE SIGN BELOW')).toBe(true);
    expect(isStopPage('https://benefitscal.com/ApplyForBenefits/ABXYZ', 'Review and Submit')).toBe(true);
    expect(isSignedInApplicationPage('https://benefitscal.com/ApplyForBenefits/ABNMI')).toBe(true);
    expect(isSignedInApplicationPage('https://benefitscal.com/')).toBe(false);
    expect(isSignedInApplicationPage('https://evil.example/ApplyForBenefits/ABNMI')).toBe(false);
  });

  const seed: Household = { id: 'h', orgId: 'o', phone: '+12135550100', firstName: 'Lin', county: 'los_angeles', size: 2, monthlyIncome: 1800, childrenUnder18: 1, pregnant: false, adultAge: 30, immigrationStatus: 'citizen', childrenAreCitizens: true } as Household;
  const real: Household = { ...seed, phone: '+14155550123' };

  it('refuses to type a synthetic seed household; preview is fine', () => {
    for (const p of ['+12135550100', '+12135560100', '+12135570100', '+15555550100']) expect(isSeedHousehold({ phone: p })).toBe(true);
    expect(isSeedHousehold(real)).toBe(false);
    expect(() => assertRealModeAllowed(seed, true, true)).toThrow(RealModeRefused);
    expect(() => assertRealModeAllowed(seed, false, true)).not.toThrow();
    expect(() => assertRealModeAllowed(real, true, true)).not.toThrow();
    expect(() => assertRealModeAllowed(real, false, false)).toThrow(/disabled/);
  });

  it('drops invented values and protected fields from the LLM plan', () => {
    const fields: PageField[] = [
      { key: 'fn', label: 'First Name', name: 'fn', type: 'text', options: [], section: 'Name' },
      { key: 'ack', label: 'I have read my rights', name: 'ack', type: 'checkbox', options: [], section: 'Rights and Responsibilities' },
      { key: 'ssn', label: 'SSN', name: 'ssn', type: 'text', options: [], section: 'Name' },
    ];
    const plan = sanitizePlan([
      { key: 'fn', label: 'First Name', profileField: 'first_name', value: 'Bob', confidence: 0.9 },
      { key: 'ack', label: 'I have read my rights', profileField: 'first_name', value: 'yes', confidence: 0.9 },
      { key: 'ssn', label: 'SSN', profileField: null, value: '123-45-6789', confidence: 0.5 },
    ], fields, { first_name: 'Lin' });
    expect(plan).toEqual([{ key: 'fn', label: 'First Name', profileField: 'first_name', value: 'Lin', confidence: 0.9 }]);
  });

  it('dry run never types, clicks or navigates', async () => {
    process.env.ALLOW_REAL_BENEFITSCAL = 'true';
    const typed = vi.fn();
    const page = {
      url: () => 'https://benefitscal.com/ApplyForBenefits/ABNMI',
      evaluate: vi.fn(async () => [{ key: 'fn', label: 'First Name', name: 'fn', type: 'text', options: [], section: 'Name' }]),
      locator: vi.fn(() => ({ first: () => ({ textContent: async () => 'Name Information', fill: typed, selectOption: typed, click: typed }), count: async () => 1, nth: () => ({ click: typed }) })),
      waitForLoadState: typed,
      goto: typed,
    } as unknown as Page;
    const res = await runRealSite({
      page, household: seed, typing: false,
      planner: async () => [{ key: 'fn', label: 'First Name', profileField: 'first_name', value: 'Lin', confidence: 0.95 }],
    });
    expect(res.status).toBe('preview_done');
    expect(res.pages[0]!.plan).toHaveLength(1);
    expect(res.pages[0]!.typed).toEqual([]);
    expect(typed).not.toHaveBeenCalled();
    delete process.env.ALLOW_REAL_BENEFITSCAL;
  });
});
