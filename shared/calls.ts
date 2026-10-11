// Browser-safe wire contract for scripted county calls. Server: src/calls/routes.ts. Client: web/src/account/CallPanel.tsx.
//
// GET  /api/calls/config                     -> CallsConfig
// GET  /api/workflows/:id/calls              -> ScriptedCall[]   (newest first)
// POST /api/workflows/:id/calls/suggest      { purpose } -> CallScript
// POST /api/workflows/:id/calls/script       { script, purpose? } -> { ok: true }  (saved on the call step; used on approve)
// POST /api/workflows/:id/calls              { script, purpose? } -> ScriptedCall   (starts now)
// GET  /api/calls/:callId                    -> ScriptedCall
// Calls only ever go to the server's DEMO_OFFICE_PHONE (the demo "county office").

export const CALL_PURPOSES = [
  'confirm_interview', 'reschedule_interview', 'ask_missing_docs', 'ask_denial_reason', 'check_status', 'waitlist', 'custom',
] as const;
export type CallPurposeKey = typeof CALL_PURPOSES[number];

export const PURPOSE_LABEL: Record<CallPurposeKey, string> = {
  confirm_interview: 'Confirm the interview',
  reschedule_interview: 'Reschedule the interview',
  ask_missing_docs: 'Ask which documents are missing',
  ask_denial_reason: 'Ask why it was denied',
  check_status: 'Check application status',
  waitlist: 'Check the waitlist',
  custom: 'Custom questions',
};

export interface CallScript { goal: string; questions: string[]; context: string }

export type ScriptedCallStatus = 'queued' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'simulated';
export type CallTrigger = 'manual' | 'email' | 'sms';

export interface CallAnswer { question: string; answer: string | null; confidence: 'high' | 'medium' | 'low' }

export interface ScriptedCall {
  id: string;
  householdId: string;
  workflowId: string | null;
  status: ScriptedCallStatus;
  simulated: boolean;
  script: CallScript;
  transcript: string | null;
  answers: CallAnswer[] | null;
  summary: string | null;
  outcome: string | null;
  error: string | null;
  trigger: CallTrigger;
  createdAt: string;
  updatedAt: string;
}

export interface CallsConfig {
  enabled: boolean;
  simulated: boolean;
  officePhoneMasked: string | null;
  /** Present when calling is not available. */
  message: string | null;
}

export const CALLS_NOT_CONFIGURED = "Calling isn't configured: add DIAL_API_KEY, DIAL_FROM_NUMBER_ID and DEMO_OFFICE_PHONE";
