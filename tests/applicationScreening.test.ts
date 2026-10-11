import { describe, expect, it } from 'vitest';
import { screenApplications, type ScreeningInput, type ApplicationProgram } from '../src/applicationScreening.js';
import { confirmationText, type IntakeFields } from '../src/intake.js';
import { FieldsSchema } from '../src/agent.js';

const date = new Date('2026-10-11T12:00:00Z');
const pick = (f: ScreeningInput, p: ApplicationProgram, at = date) => screenApplications(f, at).matches.find(m => m.program === p)!;
const base: IntakeFields = { county: 'los_angeles', size: 3, monthlyIncome: 1800, childrenUnder18: 2,
  pregnant: false, adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true };
const pge: ScreeningInput = { pgeCustomer: true, pgeElectricCustomer: true, pgeBillInName: true,
  pgePrimaryResidence: true, claimedAsDependentByNonSpouse: false, sharesMeterWithAnotherHome: false,
  allResidentsCount: 1, careQualifyingProgram: false };

describe('application screening', () => {
  it('returns 13 applications with reasons, official routes and no decisions from an empty profile', () => {
    const r = screenApplications({}, date);
    expect(r.preliminary).toBe(true);
    expect(r.matches).toHaveLength(13);
    expect(r.matches.every(m => m.status === 'needs_info')).toBe(true);
    expect(r.matches.every(m => m.reason && m.applicationUrl.startsWith('https://') && m.nextStep)).toBe(true);
    expect(pick({}, 'wic').missingFields).toContain('childrenUnder5');
  });

  it('does not assume a food household is a utility or economic household', () => {
    expect(pick(base, 'pge_care').status).toBe('needs_info');
    expect(pick(base, 'pge_care').missingFields).toContain('allResidentsAnnualIncome');
    expect(pick(base, 'california_lifeline').missingFields).toContain('lifelineHouseholdSize');
    expect(pick(base, 'wic').missingFields).toContain('childrenUnder5');
  });

  it('allows CARE by current program participation without inferring it from CalFresh screening', () => {
    expect(pick({ ...pge, careQualifyingProgram: true }, 'pge_care').status).toBe('likely');
    expect(pick(base, 'calfresh').status).toBe('likely');
    expect(pick(base, 'pge_care').status).toBe('needs_info');
  });

  it('checks CARE/FERA boundaries inclusively and never recommends both', () => {
    for (const [income, care, fera] of [[43280, 'likely', 'not_eligible'], [43281, 'not_eligible', 'likely'], [54100, 'not_eligible', 'likely'], [54101, 'not_eligible', 'not_eligible']] as const) {
      const f = { ...pge, allResidentsAnnualIncome: income };
      expect(pick(f, 'pge_care').status).toBe(care);
      expect(pick(f, 'pge_fera').status).toBe(fera);
    }
    expect(pick({ ...pge, allResidentsCount: 3, allResidentsAnnualIncome: 54640 }, 'pge_care').status).toBe('likely');
  });

  it('does not recommend PG&E for another utility or FERA for gas only', () => {
    expect(pick({ ...pge, pgeCustomer: false }, 'pge_care').status).toBe('not_eligible');
    expect(pick({ ...pge, pgeElectricCustomer: false, allResidentsAnnualIncome: 50000 }, 'pge_fera').status).toBe('not_eligible');
    expect(pick({ ...pge, sharesMeterWithAnotherHome: true, careQualifyingProgram: true }, 'pge_care').status).toBe('needs_info');
  });

  it('matches WIC with a qualifying category and its own income, not any child under 18', () => {
    expect(pick({ ...base, childrenUnder5: 1, wicFamilySize: 3, wicMonthlyIncome: 2000 }, 'wic').status).toBe('likely');
    const f = { californiaResident: true, pregnant: false, childrenUnder5: 0, breastfeedingInfantUnder12Months: false, pregnancyEndedWithin6Months: false };
    expect(pick(f, 'wic').status).toBe('not_eligible');
    expect(pick({ ...f, breastfeedingInfantUnder12Months: true, wicIncomeEligibleViaProgram: true }, 'wic').status).toBe('likely');
  });

  it('uses the monthly WIC ceiling and preserves over-income exception review', () => {
    const f = { californiaResident: true, pregnant: true, wicFamilySize: 1 };
    expect(pick({ ...f, wicMonthlyIncome: 2461 }, 'wic').status).toBe('likely');
    expect(pick({ ...f, wicMonthlyIncome: 2461.01, wicIncomeEligibleViaProgram: false }, 'wic').status).toBe('needs_info');
  });

  it('requires LifeLine economic-household and existing-benefit checks', () => {
    const f = { californiaResident: true, lifelineHouseholdSize: 1, lifelineAnnualIncome: 24600, householdHasLifeline: false };
    expect(pick(f, 'california_lifeline').status).toBe('likely');
    expect(pick({ ...f, lifelineAnnualIncome: 24600.01 }, 'california_lifeline').status).toBe('needs_info');
    expect(pick({ ...f, lifelineAnnualIncome: 24600.01, lifelineQualifyingProgram: false }, 'california_lifeline').status).toBe('not_eligible');
    expect(pick({ ...f, householdHasLifeline: true }, 'california_lifeline').status).toBe('needs_info');
    expect(pick({ ...f, lifelineAnnualIncome: 100000, lifelineQualifyingProgram: true }, 'california_lifeline').status).toBe('likely');
    expect(pick({ ...f, lifelineHouseholdSize: 5, lifelineAnnualIncome: 59500 }, 'california_lifeline').status).toBe('likely');
  });

  it('does not turn unknown immigration status or rough cash calculations into denials', () => {
    expect(pick({ ...base, immigrationStatus: 'unknown' }, 'calfresh').status).toBe('needs_info');
    expect(pick({ ...base, immigrationStatus: 'unknown' }, 'cfap').status).toBe('needs_info');
    for (const p of ['calworks', 'general_relief', 'section8'] as const) expect(pick(base, p).status).toBe('needs_info');
  });

  it('routes nonresidents away from California forms and keeps new referrals distinct', () => {
    for (const p of ['calfresh', 'wic', 'pge_care', 'california_lifeline'] as const)
      expect(pick({ ...base, californiaResident: false }, p).status).toBe('not_eligible');
    expect(pick({ needsDailyLivingHelp: true }, 'ihss')).toMatchObject({ coverage: 'referral', status: 'needs_info' });
  });

  it('expires rules instead of continuing to promise matches', () => {
    const f = { ...pge, careQualifyingProgram: true };
    expect(pick(f, 'pge_care', new Date('2027-05-31T23:00:00Z')).status).toBe('likely');
    expect(pick(f, 'pge_care', new Date('2027-06-01T00:00:00Z')).status).toBe('needs_info');
    expect(pick({ californiaResident: true, pregnant: true, wicIncomeEligibleViaProgram: true }, 'wic', new Date('2027-07-01')).status).toBe('needs_info');
    expect(pick(base, 'calfresh', new Date('2027-01-01')).status).toBe('needs_info');
  });

  it('rejects invalid values rather than assuming zeros or false', () => {
    for (const f of [{ monthlyIncome: -1 }, { size: 0 }, { size: 1, childrenUnder18: 2 }, { childrenUnder18: 1, childrenUnder5: 2 }, { allResidentsAnnualIncome: NaN }])
      expect(() => screenApplications(f, date)).toThrow();
    expect(() => screenApplications({ pregnant: 'no' } as never, date)).toThrow();
  });

  it('saves and includes supplemental answers in the confirmation summary', () => {
    const f = FieldsSchema.parse({ ...base, ...pge, needsChildCare: true, allResidentsAnnualIncome: 30000 });
    expect(f.needsChildCare).toBe(true);
    const summary = confirmationText(f, 'sms');
    expect(summary).toContain('All residents income per year: $30,000');
    expect(summary).toContain('Needs child care help: Yes');
    expect(summary).not.toContain('citizen');
  });
});
