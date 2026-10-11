// Canned data served when DEMO_MODE=true (or when Supabase/Keewano/Claude fail live). Pure: no network, no runtime imports.
import { checkEligibility } from './eligibility.js';
import type { Action, CallRecord, Household, Message, Submission, TimelineEntry } from './contracts.js';
import type { AutopilotState, CaseDetail, CaseSummary, TimeSavedMetrics } from '../web/src/lib/types.js';

const DEMO_ORG = '00000000-0000-4000-8000-00000000a1d0'; // mirrors DEMO_ORG_ID in supabase.ts (kept local so this module stays dependency-free)
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const isDemoMode = (): boolean => process.env.DEMO_MODE === 'true';

const ID = {
  maria: '5d0a1c10-0001-4a6e-9b11-a1d000000001', rosa: '5d0a1c10-0002-4a6e-9b11-a1d000000002',
  james: '5d0a1c10-0003-4a6e-9b11-a1d000000003', lin: '5d0a1c10-0004-4a6e-9b11-a1d000000004',
  marcus: '5d0a1c10-0005-4a6e-9b11-a1d000000005', aisha: '5d0a1c10-0006-4a6e-9b11-a1d000000006',
  carlos: '5d0a1c10-0007-4a6e-9b11-a1d000000007', priya: '5d0a1c10-0008-4a6e-9b11-a1d000000008',
};

const hh = (id: string, phone: string, firstName: string, size: number, monthlyIncome: number, childrenUnder18: number,
  extra: Partial<Household> = {}): Household => ({
  id, orgId: DEMO_ORG, phone, firstName, county: 'los_angeles', size, monthlyIncome, childrenUnder18, pregnant: false,
  adultAge: 34, immigrationStatus: 'citizen', childrenAreCitizens: true, ...extra,
});

const HOUSEHOLDS: Record<string, Household> = {
  [ID.maria]: hh(ID.maria, '+12135550141', 'Maria', 3, 1850, 2, { adultAge: 31, immigrationStatus: 'undocumented' }),
  [ID.rosa]: hh(ID.rosa, '+13235550142', 'Rosa', 4, 2100, 2, { adultAge: 38 }),
  [ID.james]: hh(ID.james, '+13105550143', 'James', 1, 0, 0, { adultAge: 52 }),
  [ID.lin]: hh(ID.lin, '+16265550144', 'Lin', 2, 1300, 1, { adultAge: 29, immigrationStatus: 'green_card' }),
  [ID.marcus]: hh(ID.marcus, '+13235550145', 'Marcus', 1, 900, 0, { adultAge: 44 }),
  [ID.aisha]: hh(ID.aisha, '+12135550146', 'Aisha', 5, 2600, 3, { adultAge: 36 }),
  [ID.carlos]: hh(ID.carlos, '+13235550147', 'Carlos', 2, 1100, 1, { adultAge: 27, pregnant: true, immigrationStatus: 'undocumented' }),
  [ID.priya]: hh(ID.priya, '+18185550148', 'Priya', 1, 1500, 0, { adultAge: 61 }),
};

const ACTIONS: Action[] = [
  { householdId: ID.rosa, kind: 'interview_nudge', source: 'keewano', detail: 'Interview scheduled, not confirmed' },
  { householdId: ID.james, kind: 'docs_nudge', source: 'keewano', detail: 'Documents requested 3 days ago, none received' },
  { householdId: ID.lin, kind: 'submit', source: 'keewano', detail: 'Packet signed, application not yet submitted' },
  { householdId: ID.marcus, kind: 'waitlist_check', source: 'keewano', detail: 'Section 8 waitlist last checked 14 days ago' },
];

const likely = (h: Household) => checkEligibility(h).filter(m => m.status === 'likely').map(m => m.program).join(',');

const TIMELINES: Record<string, TimelineEntry[]> = {
  [ID.maria]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.maria])}`, at: ago(26 * HOUR) },
    { label: 'DocsRequested: 3', at: ago(25 * HOUR) },
    { label: 'PacketSigned', at: ago(3 * HOUR) },
    { label: 'ApplicationSubmitted: calfresh', at: ago(2 * HOUR) },
  ],
  [ID.rosa]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.rosa])}`, at: ago(9 * DAY) },
    { label: 'ApplicationSubmitted: calfresh', at: ago(6 * DAY) },
    { label: 'InterviewScheduled', at: ago(2 * DAY) },
  ],
  [ID.james]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.james])}`, at: ago(4 * DAY) },
    { label: 'DocsRequested: 3', at: ago(3 * DAY) },
  ],
  [ID.lin]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.lin])}`, at: ago(3 * DAY) },
    { label: 'DocsRequested: 3', at: ago(3 * DAY) },
    { label: 'PacketSigned', at: ago(5 * HOUR) },
  ],
  [ID.marcus]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.marcus])}`, at: ago(20 * DAY) },
    { label: 'CallPlaced: waitlist_check', at: ago(14 * DAY) },
    { label: 'CallOutcome: waitlist_closed', at: ago(14 * DAY) },
  ],
  [ID.aisha]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.aisha])}`, at: ago(12 * DAY) },
    { label: 'ApplicationSubmitted: calfresh', at: ago(10 * DAY) },
    { label: 'Approved: calfresh', at: ago(1 * DAY) },
  ],
  [ID.carlos]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.carlos])}`, at: ago(2 * DAY) },
    { label: 'DocsRequested: 2', at: ago(2 * DAY) },
    { label: 'DocReceived: id', at: ago(30 * HOUR) },
  ],
  [ID.priya]: [
    { label: `Screened: ${likely(HOUSEHOLDS[ID.priya])}`, at: ago(7 * DAY) },
    { label: 'ApplicationSubmitted: medi_cal', at: ago(5 * DAY) },
  ],
};

const lastOf = (id: string) => TIMELINES[id][TIMELINES[id].length - 1];

export function demoCases(): CaseSummary[] {
  return Object.values(HOUSEHOLDS).map(h => {
    const last = lastOf(h.id);
    return {
      id: h.id, firstName: h.firstName ?? null, county: h.county, size: h.size, updatedAt: last.at,
      lastEvent: last, actions: ACTIONS.filter(a => a.householdId === h.id),
    };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const MARIA_SMS: Array<[Message['role'], string, number]> = [
  ['user', 'hi i heard you can help with food stamps', 26 * HOUR],
  ['assistant', 'Hi, I am Lumin. I help families find benefits like food, health coverage and cash aid. Which county do you live in?', 26 * HOUR - MIN],
  ['user', 'los angeles', 26 * HOUR - 2 * MIN],
  ['assistant', 'Thanks. How many people live in your home, and how many are under 18?', 26 * HOUR - 3 * MIN],
  ['user', 'me and my 2 kids so 3', 26 * HOUR - 4 * MIN],
  ['assistant', 'Got it. About how much does your household earn each month before taxes?', 26 * HOUR - 5 * MIN],
  ['user', 'around 1850. i get paid weekly cash', 26 * HOUR - 6 * MIN],
  ['assistant', 'Your children look eligible for CalFresh and Medi-Cal. I can send a short application for you to sign. I need a photo ID, a recent pay record and a rent receipt.', 26 * HOUR - 7 * MIN],
  ['user', 'ok sending the id now', 25 * HOUR],
];

const MARCUS_CALL: CallRecord = {
  dialId: 'demo-call-marcus-1', householdId: ID.marcus, purpose: 'waitlist_check', outcome: 'waitlist_closed', at: ago(14 * DAY),
  transcript: [
    'agent: Hello, I am calling for a client to ask whether the Section 8 waitlist is open.',
    'user: The Housing Choice Voucher waitlist is currently closed. We expect to reopen sometime next year.',
    'agent: Is there a way to be notified when it reopens?',
    'user: Check our website. We do not keep a call list.',
    'agent: Understood, thank you for your help.',
  ].join('\n'),
};

const MARIA_SUBMISSION: Submission = { householdId: ID.maria, kind: 'minimal', confirmation: 'LA-2026-418093', at: ago(2 * HOUR) };

export function demoCaseDetail(id: string): CaseDetail | undefined {
  const household = HOUSEHOLDS[id];
  if (!household) return undefined;
  return {
    household,
    eligibility: checkEligibility(household),
    messages: id === ID.maria ? MARIA_SMS.map(([role, content, age]) => ({ role, content, at: ago(age) })) : [],
    calls: id === ID.marcus ? [{ ...MARCUS_CALL, at: ago(14 * DAY) }] : [],
    documents: [],
    submissions: id === ID.maria ? [{ ...MARIA_SUBMISSION, at: ago(2 * HOUR) }] : [],
    timeline: TIMELINES[id].map(t => ({ ...t })),
  };
}

export function demoMetrics(): TimeSavedMetrics {
  return {
    baseline: { households: 60, submittedPct: 75, medianHoursToSubmit: 312, interviewMissedPct: 30 },
    aid: { households: 64, submittedPct: 100, medianHoursToSubmit: 1.4, interviewMissedPct: 3.1 },
    source: 'demo', asOf: new Date().toISOString(),
  };
}

export function demoAutopilot(): AutopilotState {
  return { actions: ACTIONS.map(a => ({ ...a })), lastRunAt: new Date().toISOString(), source: 'keewano' };
}

const TAG = ' (demo data)';
const ANSWERS: Array<[RegExp, string]> = [
  [/submit|time|baseline|fast|hours|how long/i,
    'Lumin households submitted in a median of 1.4 hours versus 312 hours for the baseline cohort, and 100% of 64 Lumin households submitted versus 75% of 60 baseline households. That is roughly 220 times faster.'],
  [/interview|missed|no.?show/i,
    'Only 3.1% of Lumin households missed their county interview, compared with 30% in the baseline cohort. Rosa is the one open interview right now, and Lumin is nudging her to confirm.'],
  [/doc|paper|id\b|paystub|stub/i,
    'James has had three documents outstanding for 3 days, and Carlos has sent his ID but still owes one more. Lumin sends a text reminder once a case sits idle for more than 48 hours.'],
  [/renew|recert/i,
    'No renewals are due in the next 30 days in this demo cohort. Lumin starts renewals 45 days before the certification period ends so the 30% baseline lapse rate does not repeat.'],
  [/wait|section ?8|housing|voucher/i,
    'Marcus is on the Section 8 watch: the LA County waitlist was closed when Lumin last called 14 days ago. Lumin rechecks every two weeks and will text him the moment it opens.'],
];
const DEFAULT_ANSWER =
  'Lumin is tracking 8 households in this demo, with 4 needing a follow-up today: an interview confirmation, a document reminder, one application ready to submit, and a waitlist check. Ask about submission time, interviews, documents, renewals or the waitlist for details.';

export function demoAnswer(q: string): string {
  const hit = ANSWERS.find(([re]) => re.test(q));
  return (hit ? hit[1] : DEFAULT_ANSWER) + TAG;
}
