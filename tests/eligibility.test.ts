import { describe, it, expect } from 'vitest';
import { checkEligibility, annualFpl } from '../src/eligibility.js';
import type { Household, Program } from '../src/contracts.js';

const base: Household = { id: 'h', orgId: 'org', phone: '+12135550100', county: 'los_angeles', size: 1, monthlyIncome: 0,
  childrenUnder18: 0, pregnant: false, adultAge: 35, immigrationStatus: 'citizen', childrenAreCitizens: true };
const pick = (h: Household, p: Program) => checkEligibility(h).find(m => m.program === p)!;

describe('checkEligibility', () => {
  it('returns all six programs in order', () => {
    expect(checkEligibility(base).map(m => m.program))
      .toEqual(['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8']);
  });
  it('single adult with no income in LA: CalFresh max, Medi-Cal, GR $221, Section 8; no CalWORKs or CFAP', () => {
    expect(pick(base, 'calfresh')).toMatchObject({ status: 'likely', estMonthlyValue: 306 });
    expect(pick(base, 'medi_cal').status).toBe('likely');
    expect(pick(base, 'general_relief')).toMatchObject({ status: 'likely', estMonthlyValue: 221 });
    expect(pick(base, 'section8').status).toBe('likely');
    expect(pick(base, 'calworks').status).toBe('not_eligible');
    expect(pick(base, 'cfap').status).toBe('not_eligible');
  });
  it('family of 3 at $2,400/mo: CalWORKs likely at about $275; no GR', () => {
    const h = { ...base, size: 3, monthlyIncome: 2400, childrenUnder18: 2 };
    expect(pick(h, 'calworks')).toMatchObject({ status: 'likely', estMonthlyValue: 275 });
    expect(pick(h, 'general_relief').status).toBe('not_eligible');
    expect(pick(h, 'calfresh').status).toBe('likely');
  });
  it('single adult at $3,000/mo: over CalFresh and adult Medi-Cal, still under Section 8', () => {
    const h = { ...base, monthlyIncome: 3000 };
    expect(pick(h, 'calfresh').status).toBe('not_eligible');
    expect(pick(h, 'medi_cal').status).toBe('not_eligible');
    expect(pick(h, 'section8').status).toBe('likely');
  });
  it('green card holder: CFAP is the fallback for CalFresh', () => {
    const h = { ...base, monthlyIncome: 1000, immigrationStatus: 'green_card' as const };
    expect(pick(h, 'cfap').status).toBe('likely');
    expect(pick(h, 'calfresh').status).toBe('needs_info');
  });
  it('mixed-status family: citizen kids still eligible for Medi-Cal and CalFresh', () => {
    const h = { ...base, size: 3, monthlyIncome: 1500, childrenUnder18: 2, immigrationStatus: 'undocumented' as const };
    expect(pick(h, 'medi_cal').status).toBe('likely');
    expect(pick(h, 'medi_cal').reason).toMatch(/children/i);
    expect(pick(h, 'calfresh').reason).toMatch(/children/i);
    expect(pick(h, 'calworks').status).toBe('needs_info');
  });
  it('San Francisco GR and Section 8 are needs_info (unconfirmed limits)', () => {
    const h = { ...base, county: 'san_francisco' as const };
    expect(pick(h, 'general_relief').status).toBe('needs_info');
    expect(pick(h, 'section8').status).toBe('needs_info');
  });
  it('rejects invalid input instead of guessing', () => {
    expect(() => checkEligibility({ ...base, size: 0 })).toThrow(RangeError);
    expect(() => checkEligibility({ ...base, monthlyIncome: -5 })).toThrow(RangeError);
    expect(() => checkEligibility({ ...base, monthlyIncome: Number.NaN })).toThrow(RangeError);
  });
  it('FPL scales by household size', () => {
    expect(annualFpl(1)).toBe(15_960);
    expect(annualFpl(4)).toBe(33_000);
  });

  it('does not round income across the screening boundary', () => {
    expect(pick({ ...base, monthlyIncome: 2660 }, 'calfresh').status).toBe('likely');
    expect(pick({ ...base, monthlyIncome: 2660.01 }, 'calfresh').status).toBe('not_eligible');
  });

  it('treats unknown immigration status as missing information for food programs', () => {
    const h = { ...base, immigrationStatus: 'unknown' as const };
    expect(pick(h, 'calfresh').status).toBe('needs_info');
    expect(pick(h, 'cfap').status).toBe('needs_info');
  });
});
