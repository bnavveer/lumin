// Shared contract between Lane A (Dial/agent/calls/submit) and Lane B (rules/Supabase/Keewano/dashboard).
// FROZEN: change only with agreement from both people. Append-only for event types.
//
// Storage split:
//   Supabase  = auth (clinic staff), relational records (households, messages, calls, documents, submissions),
//               private Storage bucket for document photos, realtime for the dashboard.
//   Keewano   = the agent's memory of what happened: small typed case + agent events. Every follow-up decision
//               (autopilot) and every analytics answer (staff Ask, metrics) comes from Keewano.

export type Program = 'calfresh' | 'medi_cal' | 'calworks' | 'general_relief' | 'cfap' | 'section8';
export type County = 'los_angeles' | 'san_francisco';
export type ImmigrationStatus = 'citizen' | 'green_card' | 'humanitarian' | 'undocumented' | 'unknown';

export interface Household {
  id: string;                 // uuidv5(phone, uuidv5.URL) — also the Keewano installId
  orgId: string;              // clinic that owns the case (Supabase RLS scope)
  phone: string;              // E.164, e.g. +12135550100
  firstName?: string;
  county: County;
  size: number;               // integer >= 1
  monthlyIncome: number;      // gross USD / month
  childrenUnder18: number;
  pregnant: boolean;
  adultAge: number;
  immigrationStatus: ImmigrationStatus;
  childrenAreCitizens: boolean;
}

export type MatchStatus = 'likely' | 'needs_info' | 'not_eligible';
export interface ProgramMatch {
  program: Program;
  status: MatchStatus;
  estMonthlyValue: number | null; // USD; null = non-cash or unknown
  reason: string;
  docs: string[];
  applyVia: string;
}

export type CallPurpose = 'apply_by_phone' | 'reschedule_interview' | 'waitlist_check' | 'status_check';
export type CallOutcomeKind = 'transferred' | 'booked' | 'waitlist_open' | 'waitlist_closed' | 'no_answer' | 'info';
export type ActionKind = 'interview_nudge' | 'docs_nudge' | 'submit' | 'waitlist_check' | 'renewal_start';
export type DocType = 'id' | 'paystub' | 'lease' | 'ssn_card' | 'birth_cert' | 'immigration' | 'other';

// ── Keewano events (ids = 2000 + position in keewano.ts DEFS; APPEND ONLY) ──
export type CaseEvent =
  | { type: 'County'; value: County }                    // 2000
  | { type: 'HouseholdSize'; value: number }             // 2001
  | { type: 'IncomePctFpl'; value: number }              // 2002
  | { type: 'Source'; value: 'aid' | 'baseline' }        // 2003
  | { type: 'Screened'; value: string }                  // 2004 csv of likely programs
  | { type: 'DocsRequested'; value: number }             // 2005
  | { type: 'DocReceived'; value: DocType }              // 2006
  | { type: 'PacketSigned' }                             // 2007
  | { type: 'ApplicationSubmitted'; value: Program }     // 2008
  | { type: 'InterviewScheduled'; at: number }           // 2009 unix seconds
  | { type: 'InterviewConfirmed' }                       // 2010
  | { type: 'CallPlaced'; value: CallPurpose }           // 2011
  | { type: 'CallOutcome'; value: CallOutcomeKind }      // 2012
  | { type: 'Approved'; value: Program }                 // 2013
  | { type: 'RenewalDue'; at: number }                   // 2014
  | { type: 'NudgeSent'; value: ActionKind }             // 2015
  | { type: 'UserReplied' }                              // 2016
  | { type: 'WaitlistStatus'; value: 'open' | 'closed' } // 2017
  // agent self-observation (self-improving loop)
  | { type: 'AgentToolCalled'; value: string }           // 2018 tool name
  | { type: 'AgentTurnMs'; value: number }               // 2019 latency of one agent turn
  | { type: 'EscalatedToHuman'; value: string }          // 2020 reason category
  | { type: 'NudgeVariant'; value: string };             // 2021 which message variant was sent (A/B)

export interface Action {
  householdId: string;
  kind: ActionKind;
  source: 'keewano';          // load-bearing: actions only come from Keewano queries
  detail: string;
}

export interface Message { role: 'user' | 'assistant'; content: string; at: string }   // at = ISO timestamp
export interface CallRecord { dialId: string; householdId: string; purpose: CallPurpose; outcome: CallOutcomeKind | null; transcript: string | null; at: string }
export interface DocumentRecord { id: string; householdId: string; docType: DocType; storagePath: string; contentType: string; at: string }
export interface Submission { householdId: string; kind: 'minimal' | 'full'; confirmation: string; at: string }
export interface TimelineEntry { label: string; at: string }

export interface PacketRoutes {
  renderPacket(householdId: string): Promise<string>;
  sign(householdId: string): Promise<void>;
}

// ── Lane B provides (ALL store functions are async — Supabase) ──
// src/env.ts         env(name): string (throws if missing); optionalEnv(name): string | undefined
// src/supabase.ts    admin(): SupabaseClient  (service-role, server only); DEMO_ORG_ID
// src/eligibility.ts checkEligibility(h): ProgramMatch[]; annualFpl(size); pctFpl(h)
// src/store.ts       upsertHousehold(h): Promise<void>; getHousehold(id): Promise<Household | undefined>;
//                    getHouseholdByPhone(phone): Promise<Household | undefined>; listHouseholds(orgId?): Promise<Household[]>;
//                    appendMessage(hid, role, content): Promise<void>; getMessages(hid, limit?): Promise<Message[]>;
//                    markProcessed(eventId): Promise<boolean>; claimAction(hid, kind, day): Promise<boolean>;
//                    saveCall(c): Promise<void>; getCallByDialId(id): Promise<CallRecord | undefined>; listCalls(hid): Promise<CallRecord[]>;
//                    saveSubmission(hid, kind, confirmation, payload): Promise<void>; listSubmissions(): Promise<Submission[]>;
//                    addTimeline(hid, label, atUnix?): Promise<void>; getTimeline(hid): Promise<TimelineEntry[]>
// src/documents.ts   storeDocumentFromUrl(hid, url, contentType, docType): Promise<DocumentRecord>; signedUrl(path): Promise<string>
// src/links.ts       packetToken(hid): string; verifyPacketToken(hid, token): boolean   (HMAC, links sent by SMS)
// src/keewano.ts     logEvent(hid, e, atUnix?): Promise<void>; logEvents(hid, es): Promise<void>; keewanoSql<T>(sql): Promise<T[]>
// src/autopilot.ts   findActions(): Promise<Action[]>
// src/staffAsk.ts    askStaffQuestion(q): Promise<string>
// src/insights.ts    nudgeVariantStats(): Promise<...>; pickNudgeVariant(kind): Promise<string>  (self-improving loop)
// src/devin.ts       runDevinTask<T>(prompt, schema): Promise<T>  (background research, minutes)
// src/server.ts      startServer(port, { packet: PacketRoutes }): void
// ── Lane A provides ──
// src/dial.ts        normalizePhone, sendText, placeCall, getCall, startEventLoop
// src/calls.ts       placeOfficeCall(hid, purpose), handleCallTranscribed(callId)
// src/submit.ts      packetRoutes: PacketRoutes; submitApplication(hid, 'minimal' | 'full')
// src/actions.ts     executeAction(a: Action)
