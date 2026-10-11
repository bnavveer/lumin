import { z } from 'zod/v4';
import type { Household, MatchStatus } from './contracts.js';
import type { ApplicationProgram, ApplicationMatch, ApplicationScreening } from '../shared/chat.js';
export type { ApplicationProgram, ApplicationMatch, ApplicationScreening } from '../shared/chat.js';
import { checkEligibility } from './eligibility.js';

// Stored in the existing intake JSON, not the frozen Household/submission contract.
// Absent means unknown. These answers never authorize an application or signature.
export const ScreeningFieldsSchema = z.object({
  californiaResident: z.boolean(),
  childrenUnder5: z.number().int().min(0).max(20),
  breastfeedingInfantUnder12Months: z.boolean(),
  pregnancyEndedWithin6Months: z.boolean(),
  wicFamilySize: z.number().int().min(1).max(30),
  wicMonthlyIncome: z.number().min(0).max(1_000_000),
  wicIncomeEligibleViaProgram: z.boolean().describe('Applicant reports WIC income eligibility through current Medi-Cal, CalFresh, CalWORKs or FDPIR; ask local WIC to verify the person/family route. Pending applications do not count.'),
  pgeCustomer: z.boolean(),
  pgeElectricCustomer: z.boolean(),
  pgeBillInName: z.boolean().describe('PG&E bill, or landlord energy bill for submetered tenants, is in applicant name'),
  pgePrimaryResidence: z.boolean(),
  claimedAsDependentByNonSpouse: z.boolean(),
  sharesMeterWithAnotherHome: z.boolean(),
  allResidentsCount: z.number().int().min(1).max(40),
  allResidentsAnnualIncome: z.number().min(0).max(12_000_000),
  careQualifyingProgram: z.boolean().describe('Current household participation in LIHEAP, WIC, CalFresh/SNAP, CalWORKs/TANF/Tribal TANF, income-eligible Tribal Head Start, SSI, Medi-Cal/Medicaid (including Healthy Families A/B), NSLP or BIA General Assistance. Not a pending application or likely match. Leave unknown if unclear.'),
  lifelineHouseholdSize: z.number().int().min(1).max(30),
  lifelineAnnualIncome: z.number().min(0).max(12_000_000),
  lifelineQualifyingProgram: z.boolean().describe('Current economic-household participation in Medi-Cal/Medicaid, CalFresh/SNAP, SSI, Section 8/public housing, Tribal TANF, income-eligible Tribal Head Start, BIA General Assistance, FDPIR, Veterans/Survivors Pension, LIHEAP, qualifying free NSLP, WIC, CalWORKs/TANF/StanWORKs/WTW/GAIN. Not a pending application or likely match. Leave unknown if unclear.'),
  householdHasLifeline: z.boolean().describe('Another member of the same economic household already receives LifeLine'),
  needsEnergyBillHelp: z.boolean(),
  needsDailyLivingHelp: z.boolean(),
  needsChildCare: z.boolean(),
}).partial();
export type ScreeningFields = z.infer<typeof ScreeningFieldsSchema>;
const BaseScreeningSchema = z.object({
  county: z.enum(['los_angeles', 'san_francisco']), size: z.number().int().min(1).max(20),
  monthlyIncome: z.number().min(0).max(100_000), childrenUnder18: z.number().int().min(0).max(15),
  pregnant: z.boolean(), adultAge: z.number().int().min(14).max(120),
  immigrationStatus: z.enum(['citizen', 'green_card', 'humanitarian', 'undocumented', 'unknown']),
  childrenAreCitizens: z.boolean(),
}).partial();
export type ScreeningInput = Partial<Omit<Household, 'id' | 'orgId' | 'phone'>> & ScreeningFields;

const QUESTIONS: Record<string, string> = {
  californiaResident: 'Do you currently live in California?',
  county: 'Which California county do you live in?',
  size: 'How many people live and buy or prepare food together?',
  monthlyIncome: 'What is their total monthly income before taxes?',
  childrenUnder18: 'How many children under 18 are in the household?',
  pregnant: 'Is anyone in the household pregnant?',
  adultAge: 'How old is the adult applying?',
  immigrationStatus: 'Would you like to share your immigration category for program screening? You can skip this.',
  childrenAreCitizens: 'Are the children who need benefits US citizens? You can skip this.',
  childrenUnder5: 'How many children are under five?',
  breastfeedingInfantUnder12Months: 'Is anyone breastfeeding a baby under one year old?',
  pregnancyEndedWithin6Months: 'Has anyone given birth or had a pregnancy end within the past six months?',
  wicFamilySize: 'What family size should WIC consider? Expected births and foster children have special rules; a WIC office can help.',
  wicMonthlyIncome: 'What is that WIC family’s monthly income before taxes?',
  wicIncomeEligibleViaProgram: 'Does the applicant already receive Medi-Cal, CalFresh, CalWORKs or FDPIR that WIC can verify for income eligibility?',
  pgeCustomer: 'Does PG&E supply your home’s gas or electricity, including through a landlord?',
  pgeElectricCustomer: 'Does PG&E supply your home’s electricity?',
  pgeBillInName: 'Is the PG&E bill, or the landlord’s energy bill, in your name?',
  pgePrimaryResidence: 'Is this the home where you live?',
  claimedAsDependentByNonSpouse: 'Can someone other than your spouse claim you as a tax dependent?',
  sharesMeterWithAnotherHome: 'Does your utility meter serve another home as well?',
  allResidentsCount: 'How many people in total live at the address, including roommates?',
  allResidentsAnnualIncome: 'What is everyone at that address’s combined yearly income before taxes, including taxable and nontaxable sources?',
  careQualifyingProgram: 'Does anyone at the address currently receive a CARE qualifying program, such as CalFresh, Medi-Cal, WIC, SSI or LIHEAP?',
  lifelineHouseholdSize: 'How many people share income and living expenses in your LifeLine household?',
  lifelineAnnualIncome: 'What is that economic household’s total yearly income before taxes?',
  lifelineQualifyingProgram: 'Does anyone in that household currently receive a California LifeLine qualifying program, such as Medi-Cal, CalFresh, SSI or WIC?',
  householdHasLifeline: 'Does anyone in that same economic household already receive a LifeLine discount?',
  needsEnergyBillHelp: 'Do you need help paying a home energy bill?',
  needsDailyLivingHelp: 'Does anyone need help with daily activities to live safely at home?',
  needsChildCare: 'Do you need help paying for child care?',
};
const URLS = {
  benefitscal: 'https://benefitscal.com/',
  pge: 'https://www.pge.com/en/account/billing-and-assistance/financial-assistance/california-alternate-rates-for-energy-program.html',
  wic: 'https://myfamily.wic.ca.gov/Home/AmIEligible',
  lifeline: 'https://www.cpuc.ca.gov/lifeline',
  liheap: 'https://www.csd.ca.gov/Pages/LIHEAPProgram.aspx',
  ihss: 'https://www.cdss.ca.gov/in-home-supportive-services/contact-us',
  child_care: 'https://www.cdss.ca.gov/calworks-child-care',
};
const names: Record<ApplicationProgram, string> = {
  calfresh: 'CalFresh', medi_cal: 'Medi-Cal', calworks: 'CalWORKs', general_relief: 'General Relief',
  cfap: 'CFAP', section8: 'Section 8', pge_care: 'PG&E CARE', pge_fera: 'PG&E FERA',
  wic: 'WIC', california_lifeline: 'California LifeLine', liheap: 'LIHEAP / HEAP', ihss: 'IHSS', child_care: 'Subsidized child care',
};
const BASE_KEYS = ['county', 'size', 'monthlyIncome', 'childrenUnder18', 'pregnant', 'adultAge', 'immigrationStatus', 'childrenAreCitizens'] as const;

/** Pure, deterministic shortlist. A match is never an agency approval or permission to submit. */
export function screenApplications(input: ScreeningInput, now = new Date()): ApplicationScreening {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid screening date');
  const asOf = now.toISOString().slice(0, 10);
  ScreeningFieldsSchema.parse(input);
  BaseScreeningSchema.parse(input);
  for (const key of ['size', 'monthlyIncome', 'childrenUnder18', 'adultAge'] as const) {
    const v = input[key];
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || (key !== 'monthlyIncome' && !Number.isInteger(v)) || (key === 'size' && v < 1)))
      throw new RangeError(`Invalid ${key}`);
  }
  if (input.size !== undefined && input.childrenUnder18 !== undefined && input.childrenUnder18 > input.size)
    throw new RangeError('Child count cannot exceed household size');
  if (input.childrenUnder5 !== undefined && input.childrenUnder18 !== undefined && input.childrenUnder5 > input.childrenUnder18)
    throw new RangeError('Children under five cannot exceed children under eighteen');
  const missing = (keys: readonly (keyof ScreeningInput)[]) => keys.filter(k => input[k] === undefined || input[k] === null);
  function result(program: ApplicationProgram, status: MatchStatus, reason: string, keys: string[], url: string, until: string | null, nextStep: string, coverage: ApplicationMatch['coverage'] = 'screening'): ApplicationMatch {
    return { program, name: names[program], status, reason, missingFields: keys, followUpQuestions: keys.map(k => QUESTIONS[k] ?? k),
      applicationUrl: url, sourceUrl: url, rulesCheckedAt: '2026-10-11', rulesValidThrough: until, nextStep, coverage };
  }
  const inDate = (start: string, end: string) => asOf >= start && asOf <= end;
  const resident = input.californiaResident ?? (input.county === 'los_angeles' || input.county === 'san_francisco' ? true : undefined);
  const matches: ApplicationMatch[] = [];

  // Preserve the shared six-program contract. This caller-facing adapter does not
  // turn simplified legacy cash/AMI calculations into firm approval/denial advice.
  const absent = missing(BASE_KEYS);
  const core = absent.length === 0 ? checkEligibility({ ...input, id: 'screening', orgId: 'screening', phone: '' } as Household) : [];
  for (const program of ['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8'] as const) {
    const old = core.find(m => m.program === program);
    let status: MatchStatus = 'needs_info';
    let reason = 'More household information is needed before checking this program.';
    if (old) {
      status = old.status;
      reason = old.reason;
      if (status === 'likely') reason = `The stated income and applicant information suggest a possible ${names[program]} route. The county verifies eligible members and program rules.`;
      if (['calworks', 'general_relief', 'section8', 'cfap'].includes(program)) {
        status = 'needs_info';
        reason = 'The local agency must check current income rules, household details and program conditions. The available simplified estimate is not an eligibility determination.';
      } else if (old.status === 'not_eligible' || input.immigrationStatus === 'unknown') {
        status = 'needs_info';
        reason = 'The county should review this household’s income, applicable exceptions and each applicant’s circumstances. Missing or undisclosed information does not establish ineligibility.';
      }
    }
    if (!inDate('2026-10-01', '2026-12-31')) { status = 'needs_info'; reason = 'The saved screening rules need a date update before a match can be estimated.'; }
    if (resident === false) { status = 'not_eligible'; reason = 'This is the California application route. Look for the corresponding program in your state.'; }
    const url = program === 'section8' ? 'https://www.hud.gov/helping-americans/housing-choice-vouchers-tenants' : URLS.benefitscal;
    matches.push(result(program, status, reason, absent, url, '2026-12-31', program === 'section8' ? 'Contact your local housing authority for income limits and open waitlists.' : 'Review the household with BenefitsCal or the county office; approval and amounts come from the agency.'));
  }

  for (const program of ['pge_care', 'pge_fera'] as const) {
    const end = '2027-05-31';
    const next = 'Review PG&E’s shared CARE/FERA application; submetered tenants use the landlord/tenant paper form. No eligibility proof is normally attached at initial enrollment.';
    const add = (status: MatchStatus, reason: string, keys: string[] = []) => matches.push(result(program, status, reason, keys, URLS.pge, end, next));
    if (!inDate('2026-06-01', end)) { add('needs_info', 'PG&E’s saved income table is outside its effective dates. Check the current table.'); continue; }
    if (resident === false || input.pgeCustomer === false || (program === 'pge_fera' && input.pgeElectricCustomer === false)) {
      add('not_eligible', 'This PG&E route does not match the reported utility service. Check your own utility’s assistance programs.'); continue;
    }
    const gates = missing(['pgeCustomer', 'pgeBillInName', 'pgePrimaryResidence', 'claimedAsDependentByNonSpouse', 'sharesMeterWithAnotherHome', ...(program === 'pge_fera' ? ['pgeElectricCustomer' as const] : [])]);
    if (input.pgeBillInName === false || input.pgePrimaryResidence === false || input.claimedAsDependentByNonSpouse === true || input.sharesMeterWithAnotherHome === true) {
      add('needs_info', 'PG&E needs to review the account, residence, dependency or meter situation before this route can be recommended.', gates); continue;
    }
    const n = input.allResidentsCount;
    const income = input.allResidentsAnnualIncome;
    const low = n === undefined ? undefined : 43280 + Math.max(0, n - 2) * 11360;
    const high = n === undefined ? undefined : 54100 + Math.max(0, n - 2) * 14200;
    const care = input.careQualifyingProgram === true || (income !== undefined && low !== undefined && income <= low);
    if (program === 'pge_fera' && care) { add('not_eligible', 'Check CARE first: this household matches its income or assistance-program route. CARE and FERA cannot be received together.'); continue; }
    const incomeMissing = missing(['allResidentsCount', 'allResidentsAnnualIncome']);
    if (program === 'pge_care' && care) { add(gates.length ? 'needs_info' : 'likely', 'The stated income or current assistance participation matches a CARE qualification route; PG&E verifies the account and declaration.', gates); continue; }
    const needed = [...gates, ...incomeMissing, ...(input.careQualifyingProgram === undefined ? ['careQualifyingProgram'] : [])];
    if (needed.length) { add('needs_info', 'Confirm utility details and all-resident income or current qualifying-program participation.', needed); continue; }
    if (program === 'pge_fera' && income! > low! && income! <= high!) add('likely', 'The stated all-resident income is in the FERA band; PG&E makes the final determination.');
    else add('not_eligible', 'The stated all-resident income and assistance-program answers do not match this program’s checked route. Ask PG&E about other assistance.');
  }

  {
    const end = '2027-06-30';
    const next = 'Contact a local WIC office for verification, nutrition assessment and an appointment. A screening result is not enrollment.';
    const add = (s: MatchStatus, r: string, k: string[] = []) => matches.push(result('wic', s, r, k, URLS.wic, end, next));
    const category = input.pregnant === true || (input.childrenUnder5 ?? 0) > 0 || input.breastfeedingInfantUnder12Months === true || input.pregnancyEndedWithin6Months === true;
    const categoryMissing = missing(['pregnant', 'childrenUnder5', 'breastfeedingInfantUnder12Months', 'pregnancyEndedWithin6Months']);
    if (!inDate('2026-05-01', end)) add('needs_info', 'WIC’s income table needs updating for this screening date.');
    else if (resident === false) add('not_eligible', 'Use the WIC agency in your state of residence.');
    else if (!category && !categoryMissing.length) add('not_eligible', 'No pregnancy, recent pregnancy, breastfeeding-infant or child-under-five category was reported.');
    else {
      const needed = [...(resident === undefined ? ['californiaResident'] : []), ...(!category ? categoryMissing : [])];
      const incomeOk = input.wicIncomeEligibleViaProgram === true || (input.wicFamilySize !== undefined && input.wicMonthlyIncome !== undefined && input.wicMonthlyIncome <= Math.ceil((29526 + (input.wicFamilySize - 1) * 10508) / 12));
      if (!incomeOk) needed.push(...missing(['wicFamilySize', 'wicMonthlyIncome', 'wicIncomeEligibleViaProgram']));
      add(category && incomeOk && !needed.length ? 'likely' : 'needs_info', incomeOk ? 'A stated WIC category and income route may fit; the office verifies the participant/family and nutrition risk.' : 'WIC must check family size, income or current qualifying-program eligibility, including any exceptions.', needed);
    }
  }

  {
    const end = '2027-05-31';
    const next = 'Choose a participating provider to start the case. Complete the issued California LifeLine application with current proof; federal Lifeline is separate.';
    const add = (s: MatchStatus, r: string, k: string[] = []) => matches.push(result('california_lifeline', s, r, k, URLS.lifeline, end, next));
    const n = input.lifelineHouseholdSize;
    const limit = n === undefined ? undefined : n <= 4 ? [0, 24600, 33300, 42100, 50800][n] : 50800 + (n - 4) * 8700;
    const incomeOk = input.lifelineQualifyingProgram === true || (limit !== undefined && input.lifelineAnnualIncome !== undefined && input.lifelineAnnualIncome <= limit);
    if (!inDate('2026-06-01', end)) add('needs_info', 'LifeLine’s saved income table needs updating.');
    else if (resident === false) add('not_eligible', 'This route is for California residents; check your state’s Lifeline route.');
    else if (input.householdHasLifeline === true) add('needs_info', 'The household already has LifeLine. Ask the provider about transfers or applicable exceptions; do not start a duplicate discount.');
    else {
      const needed = [...(resident === undefined ? ['californiaResident'] : []), ...missing(['householdHasLifeline'])];
      if (!incomeOk) needed.push(...missing(['lifelineHouseholdSize', 'lifelineAnnualIncome', 'lifelineQualifyingProgram']));
      add(needed.length ? 'needs_info' : incomeOk ? 'likely' : 'not_eligible', incomeOk ? 'The stated economic-household income or current assistance participation matches a California LifeLine route, subject to provider verification.' : 'Check economic-household income and actual assistance participation against California LifeLine’s rules.', needed);
    }
  }

  // Newly proposed programs have referral coverage only; do not invent local rules.
  for (const [program, field, next] of [
    ['liheap', 'needsEnergyBillHelp', 'Find the local energy assistance provider; it checks income, bills, priorities and available funding.'],
    ['ihss', 'needsDailyLivingHelp', 'Ask the county IHSS office about SOC 295, health certification and assessment of care needs.'],
    ['child_care', 'needsChildCare', 'Contact the county CalWORKs child-care office or local Resource and Referral agency to identify the applicable route.'],
  ] as const) {
    matches.push(result(program, 'needs_info', input[field] === true ? 'This service may address the stated need. Local eligibility has not been evaluated.' : input[field] === false ? 'No current need for this service was reported; eligibility has not been evaluated.' : 'Ask whether this service is needed before collecting program-specific details.', missing([field]), URLS[program], null, next, 'referral'));
  }
  return { preliminary: true, asOf, notice: 'These are application screening suggestions, not approval decisions. Missing answers are not a denial. Each agency checks its own household rules, evidence and eligibility. No application has been submitted.', matches };
}
