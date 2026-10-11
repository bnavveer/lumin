// Human-in-the-loop approvals by text. Lumin PROPOSES consequential actions; only an explicit YES
// (from the person, or staff on the dashboard) executes them. Texting YES is never a legal signature:
// submit/renewal approvals send the signed packet link and the person signs there.
import type { ConversationDeps } from './deps.js';
import { bg } from './deps.js';
import type { Approval, ApprovalKind } from './state.js';

export interface ApprovalOutcome { approval: Approval; replies: string[] }

export const PROGRAM_LABEL: Record<string, string> = {
  calfresh: 'CalFresh', medi_cal: 'Medi-Cal', calworks: 'CalWORKs', general_relief: 'General Relief', cfap: 'CFAP', section8: 'Section 8',
};

export function describeAction(kind: ApprovalKind, payload: Record<string, unknown> = {}): string {
  const programs = Array.isArray(payload.programs) ? (payload.programs as string[]).map((p) => PROGRAM_LABEL[p] ?? p) : [];
  const progText = programs.length ? programs.join(' + ') : 'benefits';
  switch (kind) {
    case 'submit_application': return `I can help you review your ${progText} application steps and open the official filing site.`;
    case 'run_filler': return `I can prepare a review of your saved ${progText} answers. You will finish and sign on the official site.`;
    case 'call_office': return payload.purpose === 'reschedule_interview'
      ? 'I can call the county to reschedule your interview.'
      : 'I can call the county office for you.';
    case 'share_documents': return `I can reuse the documents you already sent for your ${progText} application.`;
    case 'start_renewal': return 'I can prepare your renewal paperwork for you to sign.';
  }
}

export function approvalText(kind: ApprovalKind, payload: Record<string, unknown> = {}, note?: string): string {
  const base = describeAction(kind, payload);
  const clean = (note ?? '').replace(/["“”\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return clean ? `${base} (Note: "${clean}")` : base;
}

export async function proposeAction(
  deps: ConversationDeps, hid: string, kind: ApprovalKind, payload: Record<string, unknown> = {}, description?: string,
): Promise<Approval> {
  const existing = await deps.repo.latestPendingApproval(hid);
  if (existing && existing.kind === kind) return existing; // don't stack duplicate asks
  // What the person approves is ALWAYS the deterministic text for `kind`; model text is only a quoted note.
  const a = await deps.repo.createApproval(hid, kind, approvalText(kind, payload, description), { ...payload, ...(description ? { note: description } : {}) });
  await deps.repo.addTimeline(hid, `Lumin asked to: ${a.description}`);
  return a;
}

async function execute(deps: ConversationDeps, a: Approval): Promise<string[]> {
  const hid = a.householdId;
  switch (a.kind) {
    case 'submit_application': {
      await deps.repo.addTimeline(hid, 'Approved by text: review application steps (not submitted)');
      return [`Review your saved answers and official filing links here: ${deps.packetUrl(hid)}. Finish and sign on the official site. No application has been submitted by Lumin.`];
    }
    case 'start_renewal': {
      await deps.repo.addTimeline(hid, 'Renewal started by text');
      return [`Review the information we have here: ${deps.packetUrl(hid)}. Complete your renewal and signature with the county. Lumin has not filed a renewal.`];
    }
    case 'run_filler': {
      await deps.repo.addTimeline(hid, 'Approved by text: prepare application review');
      return [`Your review and official application links are here: ${deps.packetUrl(hid)}. Lumin's automatic form filler is a demo only; finish your real application on the official site.`];
    }
    case 'call_office': {
      const purpose = typeof a.payload.purpose === 'string' ? a.payload.purpose : 'status_check';
      try {
        await deps.placeOfficeCall(hid, purpose);
        await deps.repo.addTimeline(hid, `Calling county office (${purpose.replace('_', ' ')})`);
        return ["Calling the county now. I'll text you as soon as I know more."];
      } catch {
        await deps.repo.addTimeline(hid, `County call could not be placed; assistance needed (${purpose.replace('_', ' ')})`);
        return ["I couldn't place that call. Please contact your county office, or ask your caseworker for help. No call has been made."];
      }
    }
    case 'share_documents': {
      await deps.repo.addTimeline(hid, 'Approved by text: reuse documents for another program');
      return ['Your permission to reuse documents is saved. No documents have been sent to an agency yet.'];
    }
  }
}

/** Resolve the household's latest pending approval. Returns undefined when nothing is pending. */
export async function resolveLatest(
  deps: ConversationDeps, hid: string, approve: boolean, by: string,
): Promise<ApprovalOutcome | undefined> {
  const pending = await deps.repo.latestPendingApproval(hid);
  if (!pending) return undefined;
  return resolveApprovalById(deps, pending.id, approve, by);
}

export async function resolveApprovalById(
  deps: ConversationDeps, id: string, approve: boolean, by: string,
): Promise<ApprovalOutcome | undefined> {
  const a = await deps.repo.resolveApproval(id, approve ? 'approved' : 'declined', by);
  if (!a) return undefined; // already resolved (race / duplicate YES)
  if (!approve) {
    await deps.repo.addTimeline(a.householdId, `Declined: ${a.description}`);
    return { approval: a, replies: [`No problem, I will hold off. Text me when you are ready.`] };
  }
  bg(deps.logEvent(a.householdId, { type: 'AgentToolCalled', value: `approved:${a.kind}` }), 'log approval');
  return { approval: a, replies: await execute(deps, a) };
}
