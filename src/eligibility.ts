import * as P from '../data/programs.js';
import type { Household, ProgramMatch, Program } from './contracts.js';

export function annualFpl(size: number): number {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('household size must be an integer >= 1');
  return P.FPL_BASE + P.FPL_PER_PERSON * (size - 1);
}
export const pctFpl = (h: Household) => Math.round(((h.monthlyIncome * 12) / annualFpl(h.size)) * 100);

function snapMax(size: number): number {
  if (P.SNAP_MAX[size]) return P.SNAP_MAX[size];
  const extra = size > 8 ? (size - 8) * 230 : 0;
  return Math.round(P.SNAP_MAX[4] * P.SNAP_SIZE_RATIO[Math.min(size, 8)]) + extra;
}
function calfreshEstimate(h: Household): number {
  const net = Math.max(0, h.monthlyIncome * 0.8 - P.SNAP_STD_DEDUCTION);
  return Math.max(P.SNAP_MIN, Math.round(snapMax(h.size) - 0.3 * net));
}
const match = (program: Program, status: ProgramMatch['status'], estMonthlyValue: number | null, reason: string): ProgramMatch =>
  ({ program, status, estMonthlyValue, reason, docs: [...P.DOCS[program]], applyVia: P.APPLY_VIA[program] });

function validate(h: Household) {
  annualFpl(h.size);
  if (!Number.isFinite(h.monthlyIncome) || h.monthlyIncome < 0) throw new RangeError('monthlyIncome must be a finite number >= 0');
}

function calfresh(h: Household, pct: number): ProgramMatch {
  if (pct > P.CALFRESH_GROSS_PCT) return match('calfresh', 'not_eligible', null, `Income is ${pct}% of the poverty line; CalFresh allows up to 200%.`);
  const est = calfreshEstimate(h);
  switch (h.immigrationStatus) {
    case 'citizen': return match('calfresh', 'likely', est, `About $${est}/mo for food (estimate).`);
    case 'green_card': return match('calfresh', 'needs_info', est, 'Many green card holders wait 5 years for CalFresh; if so, CFAP pays the same.');
    case 'humanitarian': return match('calfresh', 'needs_info', null, 'Refugees and asylees lost federal eligibility in April 2026; the county will check.');
    case 'unknown': return match('calfresh', 'needs_info', est, 'The county can check each applicant’s circumstances; undisclosed immigration status does not establish ineligibility.');
    default:
      return h.childrenUnder18 > 0 && h.childrenAreCitizens
        ? match('calfresh', 'likely', null, 'Your citizen children can get CalFresh even if you can’t.')
        : match('calfresh', 'not_eligible', null, 'CalFresh requires an eligible immigration status.');
  }
}

function mediCal(h: Household, pct: number): ProgramMatch {
  const kidsOk = h.childrenUnder18 > 0 && pct <= P.MEDICAL_CHILD_PCT;
  const pregOk = h.pregnant && pct <= P.MEDICAL_PREG_PCT;
  const adultStatusOk = h.immigrationStatus !== 'undocumented'; // new UIS adult enrollment frozen since Jan 1 2026
  if (pct <= P.MEDICAL_ADULT_PCT && adultStatusOk)
    return match('medi_cal', 'likely', null, kidsOk ? 'Free health coverage for you and your children.' : 'Free health coverage for you.');
  if (pregOk) return match('medi_cal', 'likely', null, 'Free pregnancy coverage (pregnant people are exempt from the 2026 freeze).');
  if (kidsOk) return match('medi_cal', 'likely', null, adultStatusOk ? 'Free coverage for your children.' : 'Free coverage for your children (new adult enrollment is frozen for your status).');
  return match('medi_cal', 'not_eligible', null, adultStatusOk
    ? `Income is ${pct}% of the poverty line; adults qualify up to 138%.`
    : 'New adult enrollment is frozen for your status since Jan 2026.');
}

function calworks(h: Household): ProgramMatch {
  if (h.childrenUnder18 === 0 && !h.pregnant) return match('calworks', 'not_eligible', null, 'CalWORKs is for families with children or pregnant people.');
  const countable = Math.max(0, h.monthlyIncome - P.CALWORKS_EARNED_DISREGARD) * 0.5;
  if (countable >= P.CALWORKS_MAP) return match('calworks', 'not_eligible', null, 'Income is above the CalWORKs limit.');
  if (h.immigrationStatus === 'undocumented' || h.immigrationStatus === 'unknown')
    return match('calworks', 'needs_info', null, 'Your citizen children may get a child-only CalWORKs grant.');
  const est = Math.round(P.CALWORKS_MAP - countable);
  return match('calworks', 'likely', est, `Up to about $${est}/mo in cash (estimate).`);
}

function generalRelief(h: Household): ProgramMatch {
  if (h.childrenUnder18 > 0) return match('general_relief', 'not_eligible', null, 'Families with children use CalWORKs instead.');
  const max = P.GR_MAX[h.county]?.[Math.min(h.size, 2)];
  if (max === undefined) return match('general_relief', 'needs_info', null, 'Your county runs its own program; the county office will check.');
  if (h.monthlyIncome >= max) return match('general_relief', 'not_eligible', null, `General Relief is for income under $${max}/mo.`);
  if (h.immigrationStatus === 'undocumented') return match('general_relief', 'needs_info', null, 'The county checks immigration rules for General Relief.');
  return match('general_relief', 'likely', max - h.monthlyIncome, `Up to $${max - h.monthlyIncome}/mo in county cash aid.`);
}

function cfap(h: Household, pct: number): ProgramMatch {
  if (pct > P.CALFRESH_GROSS_PCT) return match('cfap', 'not_eligible', null, 'Income is above the CFAP limit.');
  if (h.immigrationStatus === 'unknown') return match('cfap', 'needs_info', null, 'The county needs to check whether a CalFresh or CFAP route applies.');
  if (h.immigrationStatus === 'green_card') return match('cfap', 'likely', calfreshEstimate(h), 'State food aid if you are still in the 5-year wait for CalFresh.');
  if (h.immigrationStatus === 'humanitarian') return match('cfap', 'needs_info', null, 'No state backfill is confirmed yet for refugees and asylees; the county will check.');
  if (h.immigrationStatus === 'undocumented') return match('cfap', 'not_eligible', null, 'CFAP expands to undocumented adults 55+ in Oct 2027.');
  return match('cfap', 'not_eligible', null, 'Citizens use CalFresh instead.');
}

function section8(h: Household): ProgramMatch {
  const onePerson = P.VLI_1P[h.county];
  if (onePerson === undefined) return match('section8', 'needs_info', null, 'We are confirming this county’s income limit.');
  const limit = Math.round((onePerson / P.HUD_SIZE_ADJ[1]) * P.HUD_SIZE_ADJ[Math.min(h.size, 8)]);
  if (h.monthlyIncome * 12 > limit) return match('section8', 'not_eligible', null, `Section 8 is for income under about $${limit.toLocaleString()}/yr.`);
  return match('section8', 'likely', null, 'You are under the income limit. Waitlists are often closed; Aid will watch them and call for you.');
}

export function checkEligibility(h: Household): ProgramMatch[] {
  validate(h);
  // Display rounding must not move an applicant across an income boundary.
  const pct = ((h.monthlyIncome * 12) / annualFpl(h.size)) * 100;
  return [calfresh(h, pct), mediCal(h, pct), calworks(h), generalRelief(h), cfap(h, pct), section8(h)];
}
