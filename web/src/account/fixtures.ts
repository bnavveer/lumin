import type { ApplicationScreening } from '../../../shared/chat'
import type { Evidence, Workflow, WorkflowSummary } from '../../../shared/workflow'
import type { Api } from './api'

// Sample data for `?fixtures=1` (see fixtureFlag.ts). Used only for demos and
// screenshots when the backend is not running.

const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString()

const ev = (e: Partial<Evidence> & Pick<Evidence, 'id' | 'kind' | 'title'>, minAgo: number): Evidence => ({
  url: null, detail: null, source: null, at: at(minAgo), ...e,
})

export const fixtureWorkflow: Workflow = {
  id: 'x',
  householdId: 'h1',
  programs: ['calfresh', 'medi_cal', 'pge_care'],
  status: 'filling',
  createdAt: at(52),
  updatedAt: at(1),
  liveViewUrl: 'https://example.com/live',
  steps: [
    {
      id: 's1', kind: 'research', program: 'calfresh', title: 'Research CalFresh rules', status: 'done',
      summary: 'Your household of 3 is under the 200% income limit. Apply through Los Angeles County.',
      evidence: [
        ev({ id: 'e1', kind: 'citation', title: 'CalFresh income limits', source: 'cdss.ca.gov', url: 'https://www.cdss.ca.gov/calfresh', detail: 'Gross monthly income must be at or below 200% of the federal poverty level for most households.' }, 48),
        ev({ id: 'e2', kind: 'citation', title: 'How to apply in Los Angeles County', source: 'exa:dpss.lacounty.gov', url: 'https://dpss.lacounty.gov', detail: 'Applications can be submitted online, by phone, or in person at any DPSS office.' }, 47),
      ],
      startedAt: at(50), finishedAt: at(46),
    },
    {
      id: 's2', kind: 'research', program: 'medi_cal', title: 'Research Medi-Cal rules', status: 'done',
      summary: 'Adults qualify up to 138% of the poverty line. Children qualify at higher incomes.',
      evidence: [ev({ id: 'e3', kind: 'citation', title: 'Medi-Cal eligibility', source: 'dhcs.ca.gov', url: 'https://www.dhcs.ca.gov/services/medi-cal', detail: 'Income limits depend on household size and the age of each member.' }, 44)],
      startedAt: at(50), finishedAt: at(44),
    },
    {
      id: 's3', kind: 'documents', program: null, title: 'Collect your documents', status: 'done',
      summary: 'Photo ID and a recent pay stub received.',
      evidence: [
        ev({ id: 'e4', kind: 'document', title: 'Driver license', detail: 'Name: Maria Lopez. Expires 2029.', source: 'upload' }, 30),
        ev({ id: 'e5', kind: 'document', title: 'Pay stub, May', detail: 'Gross monthly pay: $2,140.', source: 'upload' }, 29),
      ],
      startedAt: at(40), finishedAt: at(28),
    },
    {
      id: 's4', kind: 'fill', program: 'calfresh', title: 'Fill out the CalFresh application', status: 'running',
      summary: 'Entering household members\nEntering income and expenses\nAnswering the interview questions',
      evidence: [ev({ id: 'e6', kind: 'live_view', title: 'Live browser', url: 'https://example.com/live', detail: 'Aid is filling the BenefitsCal form in a private browser.', source: 'kernel' }, 3)],
      startedAt: at(6), finishedAt: null,
    },
    { id: 's5', kind: 'sign', program: 'calfresh', title: 'Sign the application', status: 'waiting_on_you', summary: 'Review and sign so the county accepts it.', evidence: [], startedAt: null, finishedAt: null },
    { id: 's6', kind: 'submit', program: 'calfresh', title: 'Submit to the county', status: 'pending', summary: '', evidence: [], startedAt: null, finishedAt: null },
    {
      id: 's7', kind: 'call', program: 'medi_cal', title: 'Call the county to schedule your interview', status: 'pending', summary: '',
      evidence: [ev({ id: 'e7', kind: 'call_transcript', title: 'Call with DPSS', detail: 'Aid: Hello, I am calling on behalf of Maria Lopez about her CalFresh application.\nDPSS: One moment, let me pull that up.\nDPSS: I can offer Thursday at 10:30.', source: 'dial' }, 1)],
      startedAt: null, finishedAt: null,
    },
    {
      id: 's8', kind: 'notify', program: null, title: 'Text you updates', status: 'pending', summary: '',
      evidence: [
        ev({ id: 'e8', kind: 'message', title: 'Text to you', detail: 'Hi Maria, your CalFresh application is filled out. Please review and sign when you have a minute.', source: 'sms' }, 2),
        ev({ id: 'e9', kind: 'keewano_event', title: 'application_filled', source: 'keewano' }, 2),
      ],
      startedAt: null, finishedAt: null,
    },
    {
      id: 's9', kind: 'follow_up', program: null, title: 'Follow up until a decision', status: 'pending', summary: '',
      evidence: [ev({ id: 'e10', kind: 'confirmation', title: 'Confirmation number', detail: 'CF-2026-004817', source: 'benefitscal.com' }, 0)],
      startedAt: null, finishedAt: null,
    },
  ],
  nextSteps: [
    { id: 'n1', title: 'Sign your CalFresh application', detail: 'Aid filled it out. Read it over, then sign with your finger or mouse.', actor: 'you', action: { type: 'sign', label: 'Open to sign', url: 'https://example.com/sign', stepId: 's5' } },
    { id: 'n2', title: 'Upload proof of your address', detail: 'A lease or a utility bill from the last 60 days works.', actor: 'you', action: { type: 'upload', label: 'Upload a document', url: null, stepId: 's3', docType: 'lease' } },
    { id: 'n3', title: 'Aid is filling out the form', detail: 'Watch it happen in the live browser below.', actor: 'aid', action: null },
    { id: 'n4', title: 'County reviews your application', detail: 'Expect an interview call within 7 to 14 days.', actor: 'county', action: null },
  ],
}

const second: WorkflowSummary = {
  id: 'y', programs: ['pge_care', 'california_lifeline'], status: 'researching', updatedAt: at(180),
  progress: { done: 1, total: 6 },
  nextStep: { id: 'n9', title: 'Aid is checking the PG&E rules', detail: '', actor: 'aid', action: null },
}

export const fixtureSummaries: WorkflowSummary[] = [
  { id: 'x', programs: fixtureWorkflow.programs, status: fixtureWorkflow.status, updatedAt: fixtureWorkflow.updatedAt, progress: { done: 3, total: 9 }, nextStep: fixtureWorkflow.nextSteps[0] },
  second,
]

export const fixtureScreening: ApplicationScreening = {
  preliminary: true, asOf: at(0), notice: 'Suggestions, not approval decisions.',
  matches: [
    { program: 'calfresh', name: 'CalFresh', status: 'likely', reason: 'Your income is under the limit for a household of 3.', missingFields: [], followUpQuestions: [], applicationUrl: 'https://benefitscal.com', nextStep: 'Aid fills out the county application for you.', sourceUrl: 'https://www.cdss.ca.gov/calfresh', rulesCheckedAt: at(0), rulesValidThrough: null, coverage: 'screening' },
    { program: 'medi_cal', name: 'Medi-Cal', status: 'likely', reason: 'Children in your home qualify at higher incomes.', missingFields: [], followUpQuestions: [], applicationUrl: 'https://benefitscal.com', nextStep: 'Aid applies together with CalFresh.', sourceUrl: 'https://www.dhcs.ca.gov', rulesCheckedAt: at(0), rulesValidThrough: null, coverage: 'screening' },
    { program: 'pge_care', name: 'PG&E CARE', status: 'needs_info', reason: 'We need your utility account holder name.', missingFields: ['utility'], followUpQuestions: ['Whose name is on the PG&E bill?'], applicationUrl: 'https://www.pge.com/care', nextStep: 'Tell Aid whose name is on the bill.', sourceUrl: 'https://www.pge.com/care', rulesCheckedAt: at(0), rulesValidThrough: null, coverage: 'screening' },
    { program: 'section8', name: 'Section 8 housing', status: 'not_eligible', reason: 'The waitlist is closed in your county right now.', missingFields: [], followUpQuestions: [], applicationUrl: 'https://www.hacla.org', nextStep: 'Aid can check again when it reopens.', sourceUrl: 'https://www.hacla.org', rulesCheckedAt: at(0), rulesValidThrough: null, coverage: 'referral' },
  ],
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 250))

export const fixtureApi: Api = {
  me: () => delay({ userId: 'fixture-user', email: 'maria@example.com', householdId: 'h1', phone: '+13105550142', firstName: 'Maria' }),
  updateProfile: (p) => delay({ userId: 'fixture-user', email: 'maria@example.com', householdId: 'h1', phone: p.phone ?? '+13105550142', firstName: p.firstName ?? 'Maria' }),
  suggestions: () => delay(fixtureScreening),
  listWorkflows: () => delay(fixtureSummaries),
  createWorkflow: () => delay(fixtureWorkflow),
  getWorkflow: () => delay(fixtureWorkflow),
  uploadDocument: () => delay(fixtureWorkflow),
  approve: () => delay(fixtureWorkflow),
  run: () => delay(fixtureWorkflow),
}
