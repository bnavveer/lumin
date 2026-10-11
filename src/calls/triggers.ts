// Auto-call from county email: propose a call (default) or, with AUTO_CALL_ON_EMAIL=true, start it now.
// Calls still only go to DEMO_OFFICE_PHONE (enforced in runtime.ts).
import { PURPOSE_LABEL, type CallPurposeKey } from '../../shared/calls.js';
import type { Ask } from '../workflow/nextSteps.js';
import type { CallsRuntime } from './runtime.js';

export const EMAIL_PURPOSE: Record<string, CallPurposeKey | undefined> = {
  interview_scheduled: 'confirm_interview',
  documents_requested: 'ask_missing_docs',
  denied: 'ask_denial_reason',
  renewal_due: 'check_status',
};

export interface CountyEmailEvent {
  householdId: string;
  category: string;
  extracted: { atIso?: string; docs?: string[]; deadlineIso?: string; program?: string; reason?: string } | null | undefined;
}

export type TriggerResult =
  | { action: 'none' }
  | { action: 'proposed'; workflowId: string; stepId: string }
  | { action: 'started'; callId: string };

function emailNotes(e: CountyEmailEvent): string[] {
  const x = e.extracted ?? {};
  return [
    `A county email arrived: ${e.category.replace(/_/g, ' ')}.`,
    x.atIso ? `Date in the email: ${x.atIso}.` : '',
    x.docs?.length ? `Documents mentioned: ${x.docs.join(', ')}.` : '',
    x.deadlineIso ? `Deadline: ${x.deadlineIso}.` : '',
    x.program ? `Program: ${x.program}.` : '',
    x.reason ? `Reason given: ${x.reason}.` : '',
  ].filter(Boolean);
}

export async function onCountyEmail(rt: CallsRuntime, e: CountyEmailEvent): Promise<TriggerResult> {
  const purpose = EMAIL_PURPOSE[e.category];
  if (!purpose) return { action: 'none' };
  const { deps } = rt;
  const household = await deps.households.get(e.householdId);
  if (!household) return { action: 'none' };
  const lw = await deps.latestWorkflowFor(e.householdId);
  const script = await rt.suggest(lw, household, purpose, emailNotes(e));
  const what = PURPOSE_LABEL[purpose].toLowerCase();

  if (deps.autoCallOnEmail()) {
    const row = await rt.startScriptedCall({ householdId: e.householdId, workflowId: lw?.wf.id ?? null, script, trigger: 'email', purpose });
    await deps.log(e.householdId, { type: 'AgentToolCalled', value: 'auto_call_started' }).catch(() => undefined);
    return { action: 'started', callId: row.id };
  }

  const step = lw?.steps.find(s => s.kind === 'call');
  if (!lw || !step) return { action: 'none' };
  const asks: Ask[] = [{
    title: `Aid wants to call DPSS to ${what}. Approve?`,
    detail: `A county email came in. Aid drafted ${script.questions.length} questions. Edit them first if you like; nothing is called until you approve.`,
    action: { type: 'approve', label: 'Approve the call', url: null, stepId: step.id },
  }];
  const { approved: _a, callId: _c, scriptedCallId: _s, ...rest } = step.meta;
  await deps.workflows.updateStep(step.id, {
    status: 'waiting_on_you', finishedAt: null,
    summary: `Aid wants to call the county to ${what} (from a county email).`,
    meta: { ...rest, callScript: script, callPurpose: purpose, callTrigger: 'email', asks },
  });
  await deps.publish(lw.wf.id).catch(() => undefined);
  if (household.phone.startsWith('+') && deps.dial.configured()) {
    await deps.dial.sendText(household.phone, `Aid: A county email came in. I'd like to call DPSS to ${what}. Open your Aid dashboard to review the questions and approve.`)
      .catch(err => console.error('[calls] proposal text failed:', err instanceof Error ? err.message : err));
  }
  await deps.log(e.householdId, { type: 'AgentToolCalled', value: 'auto_call_proposed' }).catch(() => undefined);
  return { action: 'proposed', workflowId: lw.wf.id, stepId: step.id };
}
