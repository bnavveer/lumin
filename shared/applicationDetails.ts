// Browser-safe contract for the details a CalFresh / Medi-Cal / CalWORKs application
// needs beyond the screening answers (name, date of birth, address, household members,
// work and housing costs). Collected on the account page or by the chat agent, and
// handed to the BenefitsCal filler instead of placeholder values. No runtime imports.

export type Relationship = 'spouse' | 'child' | 'parent' | 'sibling' | 'other_relative' | 'unrelated';
export type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';

export interface HouseholdMember {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  relationship: Relationship;
}

export interface ApplicationDetails {
  legalFirstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  homeless?: boolean;
  street?: string;
  apt?: string;
  city?: string;
  zip?: string; // 5 digits
  members?: HouseholdMember[]; // everyone else who lives and eats with the applicant
  hasJob?: boolean;
  employerName?: string;
  payFrequency?: PayFrequency;
  grossPay?: number; // per pay period, before taxes
  hoursPerWeek?: number;
  rentAmount?: number; // per month; 0 if none
  paysUtilities?: boolean;
  interviewPreference?: 'phone' | 'in_person';
}

/** The screening answers readiness depends on (subset of the saved screening). */
export interface ReadinessScreening {
  county?: string;
  size?: number;
  monthlyIncome?: number;
}

export interface MissingItem {
  field: string; // ApplicationDetails key, a screening key, or `members.<i>.<key>`
  label: string; // plain-language name for the person
  source: 'details' | 'screening';
}

export interface ApplicationReadiness {
  complete: boolean;
  missing: MissingItem[];
  /** 0..1 share of required items answered, for a progress indicator. */
  progress: number;
}

// GET  /api/me/application-details -> ApplicationDetailsResponse
// POST /api/me/application-details  Partial<ApplicationDetails> (null clears a field) -> ApplicationDetailsResponse
export interface ApplicationDetailsResponse {
  details: ApplicationDetails;
  readiness: ApplicationReadiness;
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/**
 * What still has to be answered before an application can be filled out completely.
 * Pure and deterministic so the server (filler gate, chat agent) and the browser agree.
 */
export function applicationReadiness(d: ApplicationDetails, s: ReadinessScreening): ApplicationReadiness {
  const items: { field: string; label: string; source: MissingItem['source']; done: boolean }[] = []
  const need = (field: string, label: string, done: boolean, source: MissingItem['source'] = 'details') => items.push({ field, label, source, done })

  need('county', 'County', !blank(s.county), 'screening')
  need('size', 'How many people live with you', !blank(s.size), 'screening')
  need('monthlyIncome', 'Monthly household income', !blank(s.monthlyIncome), 'screening')
  need('legalFirstName', 'Legal first name', !blank(d.legalFirstName))
  need('lastName', 'Last name', !blank(d.lastName))
  need('dateOfBirth', 'Date of birth', !blank(d.dateOfBirth))
  need('homeless', 'Whether you have a home address', d.homeless !== undefined)
  if (d.homeless === false) {
    need('street', 'Street address', !blank(d.street))
    need('city', 'City', !blank(d.city))
    need('zip', 'ZIP code', !blank(d.zip))
  }
  const others = typeof s.size === 'number' ? Math.max(0, s.size - 1) : 0
  const members = d.members ?? []
  for (let i = 0; i < others; i++) {
    const m = members[i]
    const who = `Person ${i + 2} in your household`
    need(`members.${i}.firstName`, `${who}: name`, !!m && !blank(m.firstName) && !blank(m.lastName))
    need(`members.${i}.dateOfBirth`, `${who}: date of birth`, !!m && !blank(m.dateOfBirth))
    need(`members.${i}.relationship`, `${who}: relationship to you`, !!m && !blank(m.relationship))
  }
  need('hasJob', 'Whether anyone has a job', d.hasJob !== undefined)
  if (d.hasJob) {
    need('employerName', 'Employer', !blank(d.employerName))
    need('payFrequency', 'How often you’re paid', !blank(d.payFrequency))
    need('grossPay', 'Pay before taxes', !blank(d.grossPay))
  }
  need('rentAmount', 'Rent or mortgage per month', !blank(d.rentAmount))
  need('interviewPreference', 'Phone or in-person interview', !blank(d.interviewPreference))

  const missing = items.filter((i) => !i.done).map(({ field, label, source }) => ({ field, label, source }))
  return { complete: missing.length === 0, missing, progress: items.length ? (items.length - missing.length) / items.length : 1 }
}
