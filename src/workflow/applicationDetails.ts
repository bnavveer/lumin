// Server-side rules for the application details (shared/applicationDetails.ts): validation for the
// account route and the chat tool, patch/merge semantics, and the mapping onto BenefitsCal spec fields.
// Pure: no I/O.
import { z } from 'zod/v4';
import type { ApplicationDetails, HouseholdMember, PayFrequency, Relationship } from '../../shared/applicationDetails.js';
import { PAGES, type ExtraAnswers } from '../benefitscal/spec.js';

export const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'other_relative', 'unrelated'] as const satisfies readonly Relationship[];
export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semi_monthly', 'monthly'] as const satisfies readonly PayFrequency[];
export const MAX_MEMBERS = 19;
export const LIMITS = { grossPay: 100_000, hoursPerWeek: 168, rentAmount: 50_000, savingsTotal: 10_000_000, vehicleValue: 1_000_000 } as const;
export const VOTER = ['yes', 'already', 'no'] as const;
const DETAIL_KEYS = [
  'legalFirstName', 'middleName', 'lastName', 'dateOfBirth', 'homeless', 'street', 'apt', 'city', 'zip', 'members',
  'hasJob', 'employerName', 'payFrequency', 'grossPay', 'hoursPerWeek', 'jobContinues', 'rentAmount', 'paysUtilities', 'interviewPreference',
  'savingsTotal', 'hasVehicle', 'vehicleValue', 'filesTaxes', 'voterRegistration',
] as const satisfies readonly (keyof ApplicationDetails)[];
export type DetailKey = typeof DETAIL_KEYS[number];

/** Calendar-valid YYYY-MM-DD, not before 1900 and not after `now` (UTC date). */
export function validPastDate(v: string, now: Date): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== v) return false; // rejects 2026-02-30
  return v >= '1900-01-01' && v <= now.toISOString().slice(0, 10);
}

// ── Account route: strict patch; null (or an empty string) clears a key ──

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const text = (max: number) => z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional());

export function detailsPatchSchema(now: () => Date) {
  const date = z.preprocess(blankToNull, z.string().trim().refine(v => validPastDate(v, now()), 'date').nullable().optional());
  const member = z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    dateOfBirth: z.string().trim().refine(v => validPastDate(v, now()), 'date'),
    relationship: z.enum(RELATIONSHIPS),
  }).strict();
  return z.object({
    legalFirstName: text(80), middleName: text(80), lastName: text(80),
    dateOfBirth: date,
    homeless: z.boolean().nullable().optional(),
    street: text(120), apt: text(20), city: text(80),
    zip: z.preprocess(blankToNull, z.string().trim().regex(/^\d{5}$/).nullable().optional()),
    members: z.array(member).max(MAX_MEMBERS).nullable().optional(),
    hasJob: z.boolean().nullable().optional(),
    employerName: text(100),
    payFrequency: z.enum(PAY_FREQUENCIES).nullable().optional(),
    grossPay: z.number().finite().min(0).max(LIMITS.grossPay).nullable().optional(),
    hoursPerWeek: z.number().finite().min(0).max(LIMITS.hoursPerWeek).nullable().optional(),
    rentAmount: z.number().finite().min(0).max(LIMITS.rentAmount).nullable().optional(),
    paysUtilities: z.boolean().nullable().optional(),
    interviewPreference: z.enum(['phone', 'in_person']).nullable().optional(),
    jobContinues: z.boolean().nullable().optional(),
    savingsTotal: z.number().finite().min(0).max(LIMITS.savingsTotal).nullable().optional(),
    hasVehicle: z.boolean().nullable().optional(),
    vehicleValue: z.number().finite().min(0).max(LIMITS.vehicleValue).nullable().optional(),
    filesTaxes: z.boolean().nullable().optional(),
    voterRegistration: z.enum(VOTER).nullable().optional(),
  }).strict();
}
export type DetailsPatch = { [K in keyof ApplicationDetails]?: ApplicationDetails[K] | null };

const FIELD_ERRORS: Partial<Record<DetailKey, string>> = {
  legalFirstName: 'Enter your legal first name (1–80 characters).',
  middleName: 'Enter a middle name of 1–80 characters, or leave it empty.',
  lastName: 'Enter your last name (1–80 characters).',
  dateOfBirth: 'Enter a real date of birth as YYYY-MM-DD. It cannot be in the future.',
  street: 'Enter a street address of up to 120 characters.',
  apt: 'Enter an apartment or unit of up to 20 characters.',
  city: 'Enter a city of up to 80 characters.',
  zip: 'Enter a 5-digit ZIP code.',
  members: 'Give each other household member a first and last name, a date of birth (YYYY-MM-DD, not in the future) and a relationship. Up to 19 people.',
  employerName: 'Enter an employer name of up to 100 characters.',
  payFrequency: 'Choose how often you are paid: weekly, every two weeks, twice a month or monthly.',
  grossPay: `Enter pay before taxes as a number from 0 to ${LIMITS.grossPay.toLocaleString('en-US')}.`,
  hoursPerWeek: 'Enter hours per week as a number from 0 to 168.',
  rentAmount: `Enter monthly rent as a number from 0 to ${LIMITS.rentAmount.toLocaleString('en-US')}. Use 0 if you pay none.`,
  interviewPreference: 'Choose a phone or in-person interview.',
  savingsTotal: `Enter the total in checking and savings as a number from 0 to ${LIMITS.savingsTotal.toLocaleString('en-US')}. Use 0 if none.`,
  vehicleValue: `Enter what the car is worth as a number from 0 to ${LIMITS.vehicleValue.toLocaleString('en-US')}.`,
  voterRegistration: 'Choose yes, already registered, or no for voter registration.',
};

/** A plain-language message for the first problem in a failed parse of the patch. */
export function detailsError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue?.code === 'unrecognized_keys') return 'One of those application details is not something Lumin collects.';
  const key = issue?.path[0];
  if (typeof key === 'string' && key in FIELD_ERRORS) return FIELD_ERRORS[key as DetailKey]!;
  if (typeof key === 'string' && DETAIL_KEYS.includes(key as DetailKey)) return 'Answer yes or no for that question.';
  return 'Send application details as a JSON object.';
}

/** Apply a patch: undefined leaves a key alone, null removes it. Returns a new object. */
export function applyDetailsPatch(current: ApplicationDetails, patch: DetailsPatch): ApplicationDetails {
  const out: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete out[k]; else out[k] = v;
  }
  return out as ApplicationDetails;
}

/** Keys of `incoming` the account does not have yet. The account's own answers always win. */
export function fillMissing(account: ApplicationDetails, incoming: ApplicationDetails): DetailsPatch {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined || v === null) continue;
    if ((account as Record<string, unknown>)[k] === undefined) out[k] = v;
  }
  return out as DetailsPatch;
}

/** Drop anything stored that is not a known key (defensive read of jsonb). */
export function cleanDetails(raw: unknown): ApplicationDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const k of DETAIL_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as ApplicationDetails;
}

export const hasDetails = (d: ApplicationDetails | undefined): d is ApplicationDetails => Boolean(d && Object.keys(cleanDetails(d)).length);

// ── Chat tool: every field optional, JSON-schema friendly (no transforms) ──

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const AgentDetailsSchema = z.object({
  legalFirstName: z.string().min(1).max(80).describe('Legal first name as on their ID'),
  middleName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80).describe('Legal last name'),
  dateOfBirth: z.string().regex(ISO_DATE).describe('Their date of birth, YYYY-MM-DD'),
  homeless: z.boolean().describe('True if they have no home address right now'),
  street: z.string().min(1).max(120), apt: z.string().min(1).max(20), city: z.string().min(1).max(80),
  zip: z.string().regex(/^\d{5}$/),
  householdMember: z.object({
    personNumber: z.number().int().min(2).max(MAX_MEMBERS + 1).describe('Their place in the household: the applicant is person 1, so the first other person is 2, the next is 3, ...'),
    firstName: z.string().min(1).max(80), lastName: z.string().min(1).max(80),
    dateOfBirth: z.string().regex(ISO_DATE).describe('YYYY-MM-DD'),
    relationship: z.enum(RELATIONSHIPS).describe('How this person is related to the applicant'),
  }).describe('One other household member. Save only once you know their name, date of birth and relationship.'),
  hasJob: z.boolean().describe('Does anyone in the household have a job'),
  employerName: z.string().min(1).max(100),
  payFrequency: z.enum(PAY_FREQUENCIES).describe('biweekly = every two weeks; semi_monthly = twice a month'),
  grossPay: z.number().min(0).max(LIMITS.grossPay).describe('Pay per pay period, before taxes, USD'),
  hoursPerWeek: z.number().min(0).max(LIMITS.hoursPerWeek),
  rentAmount: z.number().min(0).max(LIMITS.rentAmount).describe('Rent or mortgage per MONTH, USD; 0 if none'),
  paysUtilities: z.boolean().describe('Pays gas/electric/heating/cooling separately from rent'),
  interviewPreference: z.enum(['phone', 'in_person']),
  jobContinues: z.boolean().describe('The job is ongoing (not ending soon)'),
  savingsTotal: z.number().min(0).max(LIMITS.savingsTotal).describe('Rough total of money they have saved or on hand, USD; just the amount, never account numbers; 0 if none'),
  hasVehicle: z.boolean().describe('Does anyone in the household own a car or other vehicle'),
  vehicleValue: z.number().min(0).max(LIMITS.vehicleValue).describe('Current value of the vehicle, USD (rough is fine)'),
  filesTaxes: z.boolean().describe('Will they file taxes this year'),
  voterRegistration: z.enum(VOTER).describe('Register to vote with this application: yes, already (already registered), or no'),
}).partial();
export type AgentDetailsInput = z.infer<typeof AgentDetailsSchema>;

/**
 * Turn the chat tool's input into a patch against `current`. Returns an error string for the model
 * when something is not a usable answer (future date, gap in the member list).
 */
export function agentPatch(current: ApplicationDetails, input: AgentDetailsInput, now: Date): DetailsPatch | string {
  const { householdMember, ...rest } = input;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined) continue;
    patch[k] = typeof v === 'string' ? v.trim() : v;
    if (typeof v === 'string' && !v.trim()) return `Not saved: ${k} was empty.`;
  }
  if (typeof patch.dateOfBirth === 'string' && !validPastDate(patch.dateOfBirth, now)) return 'Not saved: that date of birth is not a real past date. Ask again (month, day and year).';
  if (householdMember) {
    const members: HouseholdMember[] = [...(current.members ?? [])];
    const i = householdMember.personNumber - 2;
    if (i < 0) return 'Not saved: person 1 is the applicant; save their own name with legalFirstName/lastName.';
    if (i > members.length) return `Not saved: save person ${members.length + 2} in the household first.`;
    if (!validPastDate(householdMember.dateOfBirth, now)) return 'Not saved: that household member\'s date of birth is not a real past date. Ask again.';
    const m = { firstName: householdMember.firstName.trim(), lastName: householdMember.lastName.trim(), dateOfBirth: householdMember.dateOfBirth, relationship: householdMember.relationship };
    if (!m.firstName || !m.lastName) return 'Not saved: the household member needs a first and last name.';
    members[i] = m;
    patch.members = members;
  }
  return patch as DetailsPatch;
}

// ── Filler: details -> BenefitsCal spec field names (src/benefitscal/spec.ts) ──

const MAX_LENGTH = new Map(PAGES.flatMap(p => p.fields).filter(f => f.maxLength).map(f => [f.name, f.maxLength!]));
const yn = (b: boolean) => (b ? 'yes' : 'no');

/**
 * Only values the person actually gave. PayFrequency and Relationship values are already the
 * spec's option values (FREQ: weekly | biweekly | semi_monthly | monthly; member_relationship).
 */
export function detailsToExtra(d: ApplicationDetails): ExtraAnswers {
  const out: ExtraAnswers = {};
  const put = (k: string, v: string | boolean | number | undefined) => {
    if (v === undefined || (typeof v === 'string' && !v.trim())) return;
    const max = MAX_LENGTH.get(k);
    out[k] = typeof v === 'string' && max ? v.slice(0, max) : v;
  };
  put('first_name', d.legalFirstName);
  put('middle_name', d.middleName);
  put('last_name', d.lastName);
  put('dob', d.dateOfBirth);
  if (d.homeless !== undefined) put('homeless', yn(d.homeless));
  put('street', d.street); put('apt', d.apt); put('city', d.city); put('zip', d.zip);
  const m = d.members?.[0];
  if (m) {
    put('member_first_name', m.firstName); put('member_last_name', m.lastName);
    put('member_dob', m.dateOfBirth); put('member_relationship', m.relationship);
  }
  if (d.hasJob !== undefined) put('has_job', yn(d.hasJob));
  if (d.hasJob !== false) {
    put('employer_name', d.employerName);
    put('pay_frequency', d.payFrequency);
    if (d.grossPay !== undefined) put('gross_pay', String(d.grossPay));
    if (d.hoursPerWeek !== undefined) put('hours_per_week', String(d.hoursPerWeek));
    if (d.jobContinues !== undefined) put('job_continues', yn(d.jobContinues));
  }
  if (d.rentAmount !== undefined) { put('rent_amount', String(d.rentAmount)); put('rent_frequency', 'monthly'); }
  if (d.paysUtilities !== undefined) put('pays_utilities', d.paysUtilities); // checkbox: boolean
  put('interview_type', d.interviewPreference);
  if (d.savingsTotal !== undefined) put('bank_balance', String(d.savingsTotal));
  if (d.hasVehicle !== undefined) put('has_vehicle', yn(d.hasVehicle));
  if (d.hasVehicle && d.vehicleValue !== undefined) put('vehicle_value', String(d.vehicleValue));
  if (d.filesTaxes !== undefined) put('files_taxes', yn(d.filesTaxes));
  put('voter_registration', d.voterRegistration);
  return out;
}
