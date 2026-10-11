// Single source of truth for the MOCK BenefitsCal site and the Playwright form-filler.
// Labels follow research/benefitscal-live-walkthrough.md where known; page ids reuse the real route codes.
import type { Household } from '../contracts.js';
import { checkEligibility } from '../eligibility.js';

export type FieldType = 'text' | 'select' | 'radio' | 'checkbox' | 'date' | 'number' | 'file';
export interface FieldOption { value: string; label: string }
export interface FieldSpec {
  name: string;            // stable snake_case key: input name AND data-field attribute
  label: string;
  type: FieldType;
  options?: FieldOption[];
  required?: boolean;
  maxLength?: number;
  help?: string;
}
export type PageKind = 'form' | 'upload' | 'review' | 'signature';
export interface PageSpec { id: string; title: string; prompt?: string; kind: PageKind; fields: FieldSpec[] }
export interface SectionSpec { id: string; title: string; pages: PageSpec[] }

const opts = (...pairs: Array<string | [string, string]>): FieldOption[] =>
  pairs.map((p) => (typeof p === 'string' ? { value: p.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: p } : { value: p[0], label: p[1] }));
const YES_NO = opts(['yes', 'Yes'], ['no', 'No']);
const FREQ = opts('Weekly', 'Biweekly', 'Semi-monthly', 'Monthly', 'Quarterly', 'Semi-annually', 'Annually', 'One-time');

export const SIGNATURE_PAGE_ID = 'ABPAP';
export const REVIEW_PAGE_ID = 'ABORS';

export const SECTIONS: SectionSpec[] = [
  {
    id: 'your_information', title: 'Your Information',
    pages: [
      { id: 'ABPRG', title: 'Programs', kind: 'form', prompt: 'Which benefits do you want to apply for?', fields: [
        { name: 'county', label: 'County', type: 'select', required: true, options: opts(['los_angeles', 'Los Angeles'], ['san_francisco', 'San Francisco'], ['fresno', 'Fresno']) },
        { name: 'apply_calfresh', label: 'CalFresh (food benefits)', type: 'checkbox' },
        { name: 'apply_calworks', label: 'CalWORKs (cash aid)', type: 'checkbox' },
        { name: 'apply_medi_cal', label: 'Medi-Cal (health coverage)', type: 'checkbox' },
      ] },
      { id: 'ABNMI', title: 'Name Information', kind: 'form', prompt: "What's your name?", fields: [
        { name: 'first_name', label: 'First Name', type: 'text', required: true },
        { name: 'middle_name', label: 'Middle Name', type: 'text' },
        { name: 'last_name', label: 'Last Name', type: 'text', required: true },
        { name: 'suffix', label: 'Suffix', type: 'select', options: opts('Jr', 'Sr', 'II', 'III') },
        { name: 'other_names', label: 'Other Names', type: 'text', help: 'Maiden, Nicknames, etc.' },
        { name: 'dob', label: 'Date of Birth', type: 'date', required: true },
      ] },
      { id: 'ABNHA', title: 'Home Address', kind: 'form', prompt: 'Tell us more about where you currently live.', fields: [
        { name: 'homeless', label: 'Are you experiencing homelessness?', type: 'radio', options: YES_NO },
        { name: 'street', label: 'Street Address', type: 'text', required: true },
        { name: 'apt', label: 'Apt/Unit', type: 'text' },
        { name: 'city', label: 'City', type: 'text', required: true },
        { name: 'zip', label: 'Zip Code', type: 'text', required: true, maxLength: 10 },
        { name: 'phone', label: 'Phone Number', type: 'text' },
        { name: 'email', label: 'Email Address', type: 'text' },
      ] },
    ],
  },
  {
    id: 'people', title: 'People',
    pages: [
      { id: 'ABHHS', title: 'Who lives with you', kind: 'form', prompt: 'Tell us who lives in your household.', fields: [
        { name: 'household_size', label: 'Number of people in your household', type: 'number', required: true },
        { name: 'children_under_18', label: 'Children under 18', type: 'number' },
        { name: 'pregnant', label: 'Is anyone in the household pregnant?', type: 'radio', options: YES_NO },
      ] },
      { id: 'ABPPL', title: 'Add a household member', kind: 'form', prompt: 'Add another person in your household.', fields: [
        { name: 'member_first_name', label: 'Member First Name', type: 'text' },
        { name: 'member_last_name', label: 'Member Last Name', type: 'text' },
        { name: 'member_dob', label: 'Member Date of Birth', type: 'date' },
        { name: 'member_relationship', label: 'Relationship to you', type: 'select', options: opts('Spouse', 'Child', 'Parent', 'Sibling', 'Other relative', 'Unrelated') },
      ] },
    ],
  },
  {
    id: 'household_details', title: 'Household Details',
    pages: [
      { id: 'ABHGW', title: 'Household situations', kind: 'form', prompt: 'Does any of the following apply to someone in your household?', fields: [
        { name: 'sit_student', label: 'Attending college or trade school', type: 'checkbox' },
        { name: 'sit_disabled', label: 'Has a disability', type: 'checkbox' },
        { name: 'sit_pregnant', label: 'Pregnant', type: 'checkbox' },
        { name: 'sit_caretaker', label: 'Primary caretaker of a child age 0-18', type: 'checkbox' },
      ] },
      { id: 'ABCIT', title: 'Citizenship and immigration', kind: 'form', prompt: 'Tell us about citizenship and immigration status.', fields: [
        { name: 'immigration_status', label: 'Immigration status', type: 'select', options: opts(['citizen', 'U.S. citizen'], ['green_card', 'Lawful permanent resident'], ['humanitarian', 'Refugee / asylee / humanitarian'], ['undocumented', 'Prefer not to say / other'], ['unknown', 'Not sure']) },
        { name: 'children_are_citizens', label: 'Are the children U.S. citizens?', type: 'radio', options: YES_NO },
        { name: 'files_taxes', label: 'Will you file taxes this year?', type: 'radio', options: YES_NO },
      ] },
    ],
  },
  {
    id: 'income', title: 'Income',
    pages: [
      { id: 'ABEIQ', title: 'Jobs', kind: 'form', prompt: 'Does anyone in the household have a job?', fields: [
        { name: 'has_job', label: 'Anyone in household has a job?', type: 'radio', options: YES_NO },
      ] },
      { id: 'ABEIC', title: 'Employer and pay', kind: 'form', prompt: 'Tell us about the job.', fields: [
        { name: 'employer_name', label: 'Employer name', type: 'text', maxLength: 20 },
        { name: 'pay_frequency', label: 'How often paid', type: 'select', options: FREQ },
        { name: 'gross_pay', label: 'Gross amount', type: 'number' },
        { name: 'hours_per_week', label: 'Average hours per week', type: 'number' },
        { name: 'job_continues', label: 'Does the job continue?', type: 'radio', options: YES_NO },
      ] },
    ],
  },
  {
    id: 'expenses', title: 'Expenses',
    pages: [
      { id: 'ABMHE', title: 'Housing costs', kind: 'form', prompt: 'Tell us about your housing costs.', fields: [
        { name: 'rent_amount', label: 'Rent/Mortgage amount', type: 'number' },
        { name: 'rent_frequency', label: 'Rent/Mortgage frequency', type: 'select', options: FREQ },
        { name: 'pays_utilities', label: 'Gas/Electric/Other Heating/Cooling paid separately', type: 'checkbox' },
        { name: 'utilities_amount', label: 'Utilities amount', type: 'number' },
        { name: 'phone_expense', label: 'Telephone/Mobile', type: 'checkbox' },
      ] },
    ],
  },
  {
    id: 'assets', title: 'Assets',
    pages: [
      { id: 'ABFIN', title: 'Financial assets', kind: 'form', prompt: 'Tell us about money in the bank.', fields: [
        { name: 'bank_balance', label: 'Checking/Savings balance', type: 'number' },
        { name: 'has_vehicle', label: 'Does anyone own a vehicle?', type: 'radio', options: YES_NO },
        { name: 'vehicle_value', label: 'Vehicle current value', type: 'number' },
      ] },
    ],
  },
  {
    id: 'other_situations', title: 'Other Situations',
    pages: [
      { id: 'ABICS', title: 'Emergency needs', kind: 'form', prompt: 'Do you have any urgent needs?', fields: [
        { name: 'need_food', label: 'Food runs out within three days', type: 'checkbox' },
        { name: 'need_utilities', label: 'Utilities are off or about to be shut off', type: 'checkbox' },
        { name: 'need_eviction', label: 'Eviction notice', type: 'checkbox' },
        { name: 'need_medical', label: 'Immediate medical need', type: 'checkbox' },
      ] },
      { id: 'ABIPR', title: 'Interview preference', kind: 'form', prompt: 'How would you like to do your interview?', fields: [
        { name: 'interview_type', label: 'Interview', type: 'radio', options: opts(['phone', 'Phone'], ['in_person', 'In Person']) },
        { name: 'voter_registration', label: 'Voter registration', type: 'radio', options: opts(['yes', 'Yes'], ['already', 'Already registered'], ['no', 'No']) },
      ] },
    ],
  },
  {
    id: 'document_upload', title: 'Document Upload',
    pages: [
      { id: 'APDMC', title: 'Upload documents', kind: 'upload', prompt: 'Each file must be under 8 MB and cannot be encrypted or password-protected. You can also upload later.', fields: [
        { name: 'file_id', label: 'Identity', type: 'file' },
        { name: 'file_paystub', label: 'Income/Employment', type: 'file' },
        { name: 'file_lease', label: 'Rent/Lease/Mortgage', type: 'file' },
        { name: 'file_other', label: 'Other document', type: 'file' },
      ] },
    ],
  },
  {
    id: 'review_submit', title: 'Review and Submit',
    pages: [
      { id: REVIEW_PAGE_ID, title: 'Review your application', kind: 'review', prompt: 'Check your answers before you sign.', fields: [] },
      { id: SIGNATURE_PAGE_ID, title: 'Sign your application', kind: 'signature', prompt: 'PLEASE SIGN BELOW', fields: [
        { name: 'sig_rights', label: 'I have read, understood and agree to the Rights and Medi-Cal text', type: 'checkbox', required: true },
        { name: 'sig_type', label: 'Individual Type', type: 'select', required: true, options: opts('Applicant', 'Caretaker Relative', 'Adult Household Member', 'Authorized Representative', 'Guardian') },
        { name: 'sig_first_name', label: 'First Name', type: 'text', required: true },
        { name: 'sig_last_name', label: 'Last Name', type: 'text', required: true },
        { name: 'sig_esign', label: 'Electronic signature is legally equivalent to a handwritten signature', type: 'checkbox', required: true },
      ] },
    ],
  },
];

export interface FlatPage extends PageSpec { sectionId: string; sectionTitle: string; sectionIndex: number; index: number }
export const PAGES: FlatPage[] = SECTIONS.flatMap((s, si) => s.pages.map((p) => ({ ...p, sectionId: s.id, sectionTitle: s.title, sectionIndex: si })))
  .map((p, index) => ({ ...p, index }));
export const pageById = (id: string): FlatPage | undefined => PAGES.find((p) => p.id === id);

/** Names of the legal-signature controls. The filler must never touch these. */
export const SIGNATURE_FIELD_NAMES: ReadonlySet<string> = new Set(
  (pageById(SIGNATURE_PAGE_ID)?.fields ?? []).map((f) => f.name),
);

export const MAX_UPLOAD_BYTES = Math.floor(7.99 * 1024 * 1024);
export const UPLOAD_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf',
};

export type Answers = Record<string, string | boolean>;
export type ExtraAnswers = Record<string, string | boolean | number | undefined>;

const yn = (b: boolean): string => (b ? 'yes' : 'no');
const fmtPhone = (p: string): string => {
  const d = p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
};

/** Map our Household (+ optional extra fields) to spec field names. Unknowns are '' (never invented). */
export function buildAnswers(h: Household, extra: ExtraAnswers = {}): Answers {
  let matches: string[] = [];
  try {
    matches = checkEligibility(h).filter((m) => m.status === 'likely').map((m) => m.program);
  } catch { /* invalid household: leave programs unchecked */ }
  const ex = (k: string): string | boolean => {
    const v = extra[k];
    return v === undefined || v === null ? '' : typeof v === 'number' ? String(v) : v;
  };
  const hasIncome = h.monthlyIncome > 0;
  const base: Answers = {
    county: h.county,
    apply_calfresh: matches.includes('calfresh'),
    apply_calworks: matches.includes('calworks'),
    apply_medi_cal: matches.includes('medi_cal'),
    first_name: h.firstName ?? '',
    middle_name: '', last_name: '', suffix: '', other_names: '',
    dob: '',
    homeless: '', street: '', apt: '', city: '', zip: '',
    phone: fmtPhone(h.phone),
    email: '',
    household_size: String(h.size),
    children_under_18: String(h.childrenUnder18),
    pregnant: yn(h.pregnant),
    member_first_name: '', member_last_name: '', member_dob: '', member_relationship: '',
    sit_student: '', sit_disabled: '', sit_pregnant: h.pregnant, sit_caretaker: h.childrenUnder18 > 0,
    immigration_status: h.immigrationStatus,
    children_are_citizens: h.childrenUnder18 > 0 ? yn(h.childrenAreCitizens) : '',
    files_taxes: '',
    has_job: yn(hasIncome),
    employer_name: '', pay_frequency: hasIncome ? 'monthly' : '', gross_pay: hasIncome ? String(h.monthlyIncome) : '',
    hours_per_week: '', job_continues: '',
    rent_amount: '', rent_frequency: '', pays_utilities: '', utilities_amount: '', phone_expense: '',
    bank_balance: '', has_vehicle: '', vehicle_value: '',
    need_food: '', need_utilities: '', need_eviction: '', need_medical: '',
    interview_type: '', voter_registration: '',
  };
  const out: Answers = { ...base };
  for (const k of Object.keys(base)) {
    const v = ex(k);
    if (v !== '') out[k] = v;
  }
  return out;
}
