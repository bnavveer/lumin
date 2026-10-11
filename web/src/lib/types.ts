// HTTP API contract between the Hono server (src/server.ts) and this React app.
// Mirrors src/contracts.ts. Keep both in sync; times are ISO 8601 strings, money is USD numbers.

export type Program = 'calfresh' | 'medi_cal' | 'calworks' | 'general_relief' | 'cfap' | 'section8';
export type County = 'los_angeles' | 'san_francisco';
export type ImmigrationStatus = 'citizen' | 'green_card' | 'humanitarian' | 'undocumented' | 'unknown';
export type MatchStatus = 'likely' | 'needs_info' | 'not_eligible';
export type ActionKind = 'interview_nudge' | 'docs_nudge' | 'submit' | 'waitlist_check' | 'renewal_start';
export type CallPurpose = 'apply_by_phone' | 'reschedule_interview' | 'waitlist_check' | 'status_check';
export type CallOutcomeKind = 'transferred' | 'booked' | 'waitlist_open' | 'waitlist_closed' | 'no_answer' | 'info';
export type DocType = 'id' | 'paystub' | 'lease' | 'ssn_card' | 'birth_cert' | 'immigration' | 'other';

export interface Household {
  id: string; orgId: string; phone: string; firstName?: string; county: County; size: number;
  monthlyIncome: number; childrenUnder18: number; pregnant: boolean; adultAge: number;
  immigrationStatus: ImmigrationStatus; childrenAreCitizens: boolean;
}
export interface ProgramMatch { program: Program; status: MatchStatus; estMonthlyValue: number | null; reason: string; docs: string[]; applyVia: string }
export interface Action { householdId: string; kind: ActionKind; source: 'keewano'; detail: string }
export interface Message { role: 'user' | 'assistant'; content: string; at: string }
export interface CallRecord { dialId: string; householdId: string; purpose: CallPurpose; outcome: CallOutcomeKind | null; transcript: string | null; at: string }
export interface DocumentWithUrl { id: string; householdId: string; docType: DocType; storagePath: string; contentType: string; at: string; url: string }
export interface Submission { householdId: string; kind: 'minimal' | 'full'; confirmation: string; at: string }
export interface TimelineEntry { label: string; at: string }

// GET /api/public-config (no auth)
export interface PublicConfig { supabaseUrl: string; supabasePublishableKey: string; demoMode: boolean }

// GET /api/staff/cases (Bearer auth)
export interface CaseSummary {
  id: string; firstName: string | null; county: County; size: number; updatedAt: string;
  lastEvent: TimelineEntry | null; actions: Action[];
}
// GET /api/staff/cases/:id
export interface CaseDetail {
  household: Household; eligibility: ProgramMatch[]; messages: Message[]; calls: CallRecord[];
  documents: DocumentWithUrl[]; submissions: Submission[]; timeline: TimelineEntry[];
}
// GET /api/staff/autopilot
export interface AutopilotState { actions: Action[]; lastRunAt: string | null; source: 'keewano' }
// POST /api/staff/ask {q} -> AskResponse
export interface AskResponse { answer: string }
// GET /api/staff/metrics
export interface CohortMetrics { households: number; submittedPct: number; medianHoursToSubmit: number | null; interviewMissedPct: number }
export interface TimeSavedMetrics { baseline: CohortMetrics; aid: CohortMetrics; source: 'keewano' | 'demo'; asOf: string }
// POST /api/screen (no auth) body: ScreenRequest -> ProgramMatch[]
export type ScreenRequest = Omit<Household, 'id' | 'orgId' | 'phone'>;
// GET /api/county/applications (no auth, demo mock)
export type CountyApplications = Submission[];
// Errors: non-2xx responses have body { error: string }
export interface ApiError { error: string }
