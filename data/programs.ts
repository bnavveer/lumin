// All numbers from research/*.md (researched 2026-10-11). DERIVED = computed, not from an official table.
export const FPL_BASE = 15_960;          // 1 person, 2026 (README)
export const FPL_PER_PERSON = 5_680;
export const CALFRESH_GROSS_PCT = 200;   // CA broad-based categorical eligibility (README)
export const SNAP_MAX: Record<number, number> = { 1: 306, 2: 562, 4: 1023 }; // research/federal-food-cash-health.md:11
export const SNAP_SIZE_RATIO: Record<number, number> = { 3: 0.786, 5: 1.188, 6: 1.425, 7: 1.575, 8: 1.8 }; // DERIVED vs 4-person
export const SNAP_MIN = 25;              // research/federal-food-cash-health.md:11
export const SNAP_STD_DEDUCTION = 209;   // DERIVED approximation; CalFresh amounts are estimates
export const MEDICAL_ADULT_PCT = 138, MEDICAL_CHILD_PCT = 266, MEDICAL_PREG_PCT = 213; // research/ca-health.md
export const CALWORKS_MAP = 1_175;       // Region 1 non-exempt, family of 3 (research/ca-food-cash.md:46); screening cap for all sizes
export const CALWORKS_EARNED_DISREGARD = 600;
export const GR_MAX: Record<string, Record<number, number>> = { los_angeles: { 1: 221, 2: 375 } }; // research/ca-food-cash.md:78
export const VLI_1P: Record<string, number> = { los_angeles: 58_300 }; // 50% AMI, research/ca-housing-utilities-other.md:24
export const HUD_SIZE_ADJ: Record<number, number> = { 1: 0.7, 2: 0.8, 3: 0.9, 4: 1, 5: 1.08, 6: 1.16, 7: 1.24, 8: 1.32 }; // HUD standard factors; DERIVED limits

export const DOCS = {
  calfresh: ['Photo ID', 'Social Security numbers', 'Pay stubs from the last 30 days', 'Rent and utility bills'],
  medi_cal: ['Photo ID', 'Proof of income', 'Proof of address'],
  calworks: ['ID', 'SSNs and birth certificates for everyone', "Kids' shot records", 'Proof of income and rent'],
  general_relief: ['ID', 'Proof you live in the county', 'Income proof or a statement that you have none'],
  cfap: ['Same papers as CalFresh', 'Immigration documents'],
  section8: ['ID', 'SSNs and birth certificates for everyone', 'Income and bank statements'],
} as const;

export const APPLY_VIA = {
  calfresh: 'BenefitsCal (benefitscal.com) or your county office. Aid can file for you.',
  medi_cal: 'BenefitsCal (same application as CalFresh)',
  calworks: 'BenefitsCal or county office; ask about Immediate Need if in crisis',
  general_relief: 'County social services office (LA County: DPSS)',
  cfap: 'Same as CalFresh. The county checks CFAP automatically.',
  section8: 'Local housing authority waitlist (LACDA / HACLA). Lists are often closed; Aid watches them.',
} as const;
