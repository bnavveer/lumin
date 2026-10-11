// Pure intake logic shared by every channel (text, phone call, web chat). No I/O.
import { v5 as uuidv5 } from 'uuid';
import type { County, Household, ImmigrationStatus } from './contracts.js';
import { ScreeningFieldsSchema, type ScreeningFields } from './applicationScreening.js';

import type { Channel, IntakeStatus } from '../shared/chat.js';
export type { Channel, IntakeStatus } from '../shared/chat.js';
export type IntakeFields = Partial<Omit<Household, 'id' | 'orgId' | 'phone'>> & ScreeningFields;

export interface Intake {
  id: string;                     // household id for sms/voice; 'web:<uuid>' for an unlinked web session
  channel: Channel;
  phone: string | null;
  householdId: string | null;     // set once the phone owner confirms
  fields: IntakeFields;
  status: IntakeStatus;
  confirmationRequestedAt: string | null;
  confirmedAt: string | null;
  updatedAt: string;
}

/** Same id the rest of the system uses (contracts.ts: also the Keewano installId). */
export const householdId = (phone: string): string => uuidv5(phone, uuidv5.URL);
export const webIntakeId = (sessionId: string): string => `web:${sessionId}`;
export const isWebIntake = (id: string): boolean => id.startsWith('web:');

// firstName is optional on Household; everything else is needed before eligibility can run.
export const REQUIRED: readonly (keyof IntakeFields)[] = [
  'county', 'size', 'monthlyIncome', 'childrenUnder18', 'pregnant', 'adultAge', 'immigrationStatus', 'childrenAreCitizens',
];

export function missingFields(f: IntakeFields): (keyof IntakeFields)[] {
  return REQUIRED.filter(k => f[k] === undefined || f[k] === null);
}

/** Later values win; undefined never erases an earlier answer. */
export function mergeFields(base: IntakeFields, update: IntakeFields): IntakeFields {
  const out: IntakeFields = { ...base };
  for (const [k, v] of Object.entries(update)) if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  return out;
}

export function fieldsFromHousehold(h: Household): IntakeFields {
  const { id: _id, orgId: _org, phone: _phone, ...fields } = h;
  return fields;
}

export function toHousehold(id: string, orgId: string, phone: string, f: IntakeFields): Household {
  const missing = missingFields(f);
  if (missing.length) throw new Error(`intake incomplete, missing: ${missing.join(', ')}`);
  return {
    id, orgId, phone,
    ...(f.firstName ? { firstName: f.firstName } : {}),
    county: f.county as County,
    size: f.size!,
    monthlyIncome: f.monthlyIncome!,
    childrenUnder18: f.childrenUnder18!,
    pregnant: f.pregnant!,
    adultAge: f.adultAge!,
    immigrationStatus: f.immigrationStatus as ImmigrationStatus,
    childrenAreCitizens: f.childrenAreCitizens!,
  };
}

const COUNTY_NAME: Record<County, string> = { los_angeles: 'Los Angeles', san_francisco: 'San Francisco' };
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const SCREENING_LABELS: Record<keyof ScreeningFields, string> = {
  californiaResident: 'Lives in California', childrenUnder5: 'Children under 5',
  breastfeedingInfantUnder12Months: 'Breastfeeding baby under 1', pregnancyEndedWithin6Months: 'Pregnancy ended within 6 months',
  wicFamilySize: 'WIC family size', wicMonthlyIncome: 'WIC family income per month', wicIncomeEligibleViaProgram: 'Current assistance for WIC income qualification',
  pgeCustomer: 'PG&E service', pgeElectricCustomer: 'PG&E electricity', pgeBillInName: 'Energy bill in your name',
  pgePrimaryResidence: 'Energy bill is for your home', claimedAsDependentByNonSpouse: 'Non-spouse can claim you as dependent',
  sharesMeterWithAnotherHome: 'Meter shared with another home', allResidentsCount: 'All people at utility address',
  allResidentsAnnualIncome: 'All residents income per year', careQualifyingProgram: 'Already receives CARE-qualifying assistance',
  lifelineHouseholdSize: 'LifeLine economic household size', lifelineAnnualIncome: 'LifeLine household income per year',
  lifelineQualifyingProgram: 'Already receives LifeLine-qualifying assistance', householdHasLifeline: 'Household already has LifeLine',
  needsEnergyBillHelp: 'Needs energy bill help', needsDailyLivingHelp: 'Needs help with daily activities', needsChildCare: 'Needs child care help',
};

/**
 * The text we send so the person can double-check what Lumin heard, whichever channel it came from.
 * Immigration status is deliberately left out: texts show up on lock screens and shared phones.
 */
export function confirmationText(f: IntakeFields, origin: Channel): string {
  const lines = [
    origin === 'web'
      ? 'Lumin: someone started a benefits application on our website with this number. Please check the info:'
      : origin === 'voice'
        ? 'Lumin: thanks for calling. Here is what I heard, please check it:'
        : 'Lumin: please check your info:',
    ...(f.firstName ? [`Name: ${f.firstName}`] : []),
    `County: ${f.county ? COUNTY_NAME[f.county] : '?'}`,
    `People in your home: ${f.size ?? '?'} (${f.childrenUnder18 ?? '?'} under 18)`,
    `Income before taxes: ${f.monthlyIncome !== undefined ? `${money(f.monthlyIncome)}/month` : '?'}`,
    `Your age: ${f.adultAge ?? '?'}`,
    `Pregnant: ${f.pregnant !== undefined ? yesNo(f.pregnant) : '?'}`,
    ...Object.entries(ScreeningFieldsSchema.parse(f)).filter(([, value]) => value !== undefined).map(([key, value]) =>
      `${SCREENING_LABELS[key as keyof ScreeningFields]}: ${typeof value === 'boolean' ? yesNo(value) : key.toLowerCase().includes('income') ? money(value as number) : value}`),
    '',
    origin === 'web'
      ? 'Reply YES if this is right. Reply NO if this wasn\'t you. To fix something, tell me here or in the web chat.'
      : 'Reply YES if this is right, or tell me what to fix.',
  ];
  return lines.join('\n');
}

// "ok" is left out on purpose: confirming on an ambiguous reply is worse than asking again.
const YES = /^\s*(yes|y|yeah|yep|yup|correct|confirm(ed)?|that'?s right|s[ií]|s[ií] es correcto)\s*[.!👍]*\s*$/iu;
const NO = /^\s*(no|n|nope|not me|wrong number|that wasn'?t me)\s*[.!]*\s*$/i;
const OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;

/** Deterministic: the model never decides whether someone confirmed. 'stop' = carrier opt-out keyword, never reply. */
export function parseConfirmationReply(text: string): 'yes' | 'no' | 'stop' | null {
  if (OPT_OUT.test(text)) return 'stop';
  if (YES.test(text)) return 'yes';
  if (NO.test(text)) return 'no';
  return null;
}

export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  throw new RangeError(`not a US phone number: ${raw}`);
}
