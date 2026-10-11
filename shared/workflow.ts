// Browser-safe wire contract for applicant accounts + application workflows. No runtime imports.
// Server: src/workflow/routes.ts. Client: web/src/account/*.
import type { ApplicationProgram, ApplicationScreening } from './chat.js';

export type WorkflowStatus =
  | 'researching' | 'needs_documents' | 'ready_to_fill' | 'filling' | 'awaiting_signature'
  | 'submitted' | 'following_up' | 'done' | 'needs_attention';
export type StepKind = 'research' | 'documents' | 'fill' | 'sign' | 'submit' | 'call' | 'notify' | 'follow_up';
export type StepStatus = 'pending' | 'running' | 'waiting_on_you' | 'done' | 'failed' | 'skipped';
export type EvidenceKind =
  | 'citation' | 'document' | 'live_view' | 'replay' | 'screenshot' | 'call_transcript'
  | 'message' | 'confirmation' | 'keewano_event';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  title: string;
  url: string | null;      // only http(s); never secrets
  detail: string | null;   // short excerpt / summary
  source: string | null;   // e.g. "research/apply-food-cash-tax.md", "exa:hacla.org", "kernel", "dial"
  at: string;              // ISO
}

export interface WorkflowStep {
  id: string;
  kind: StepKind;
  program: ApplicationProgram | null;
  title: string;
  status: StepStatus;
  summary: string;
  evidence: Evidence[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NextStep {
  id: string;
  title: string;
  detail: string;
  actor: 'you' | 'aid' | 'county';
  action: null | {
    type: 'upload' | 'sign' | 'approve' | 'open_url' | 'chat' | 'run';
    label: string;
    url: string | null;
    stepId: string | null;
    docType?: string | null;
  };
}

export interface Workflow {
  id: string;
  householdId: string | null;
  programs: ApplicationProgram[];
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
  nextSteps: NextStep[];
  liveViewUrl: string | null;
}

export interface WorkflowSummary {
  id: string;
  programs: ApplicationProgram[];
  status: WorkflowStatus;
  updatedAt: string;
  progress: { done: number; total: number };
  nextStep: NextStep | null;
}

export interface Me {
  userId: string;
  email: string;
  householdId: string | null;
  phone: string | null;
  firstName: string | null;
}

// ── HTTP API (all /api/me/* and /api/workflows/* require `Authorization: Bearer <supabase access token>`) ──
// POST /api/auth/signup            { email, password, firstName?, phone? } -> { ok: true, confirmationRequired: boolean }
//                                    (public, rate-limited; honor email confirmation before password sign-in)
// GET  /api/me                     -> Me
// POST /api/me/profile             { firstName?, phone?, screeningAnswers? } -> Me (contact fields never prove ownership)
// POST /api/me/link-chat           { chatSessionId } -> Me (household links only after that chat's phone confirmation)
// GET  /api/me/screening           -> saved screening answers
// GET/POST /api/me/documents       -> private vault list / upload
// GET /api/me/documents/:id/download -> { url, expiresIn }
// DELETE /api/me/documents/:id     -> { ok: true }
// GET  /api/me/suggestions?chatSessionId=  -> ApplicationScreening  (from a web chat session or the household)
// GET  /api/workflows              -> WorkflowSummary[]
// POST /api/workflows              { programs: ApplicationProgram[], chatSessionId?: string } -> Workflow
// GET  /api/workflows/:id          -> Workflow
// GET  /api/workflows/:id/events   -> text/event-stream; each `event: update` carries a Workflow JSON
// POST /api/workflows/:id/documents  multipart { file, docType } -> Workflow
// POST /api/workflows/:id/approve  { stepId, decision: 'approve' | 'decline' } -> Workflow
// POST /api/workflows/:id/run      { stepId } -> Workflow   (start/retry a step)
// GET  /api/workflows/:id/live     -> LiveViewResponse  (a FRESH Kernel live view URL, or 'ended' + replay)
// POST /api/workflows/:id/receipt  { program, confirmation, submittedAt? } -> Workflow (applicant-reported, unverified)
// GET /api/staff/cases/:id/workflows -> WorkflowSummary[] (staff token and household organization required)
// Errors: non-2xx with { error: string }.
/** 'real' = the opt-in real-BenefitsCal preview mode (server needs ALLOW_REAL_BENEFITSCAL=true). Default 'mock'. */
export type FillTarget = 'mock' | 'real';
export type CreateWorkflowRequest = { programs: ApplicationProgram[]; chatSessionId?: string; target?: FillTarget };
export interface LiveViewResponse {
  url: string | null;            // fresh live view URL (only when status is 'live')
  status: 'live' | 'ended';
  replayUrl?: string;            // recording of the session, when one exists
  embeddable?: boolean;          // false: open in a new tab; the iframe is only a best-effort preview
}
export type SuggestionsResponse = ApplicationScreening;
