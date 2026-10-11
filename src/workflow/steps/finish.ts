// sign → submit → call (approval) → notify → follow_up.
import type { ApplicationProgram } from '../../../shared/chat.js';
import type { Ask } from '../nextSteps.js';
import { asCaseProgram, COUNTY_NAME, isBenefitsCal, joinNames, programName } from '../programs.js';
import { clip, type StepCtx, type StepOutcome } from './context.js';

const bcPrograms = (ctx: StepCtx): ApplicationProgram[] => ctx.wf.programs.filter(isBenefitsCal);

export async function runSign(ctx: StepCtx): Promise<StepOutcome> {
  if (ctx.step.meta.signed === true) {
    await ctx.log({ type: 'PacketSigned' });
    return { status: 'done', summary: 'You confirmed you signed the application.' };
  }
  const fillStep = ctx.steps.find(s => s.kind === 'fill' && s.status === 'done' && typeof s.meta.signUrl === 'string');
  const url = (fillStep?.meta.signUrl as string | undefined) ?? null;
  const asks: Ask[] = [{
    title: 'Review and sign your application',
    detail: 'Aid filled everything up to the signature. Only you can sign. Open the signature page, check it, sign, then tap "I signed".',
    action: { type: 'sign', label: 'I signed', url, stepId: ctx.step.id },
  }];
  return { status: 'waiting_on_you', summary: 'Waiting for your signature. Aid never signs for you.', meta: { ...ctx.step.meta, asks } };
}

export async function runSubmit(ctx: StepCtx): Promise<StepOutcome> {
  if (typeof ctx.step.meta.confirmation === 'string') {
    return { status: 'done', summary: `Submitted. Confirmation ${ctx.step.meta.confirmation}.` };
  }
  const programs = bcPrograms(ctx);
  await ctx.progress('Submitting your signed application to the county…');
  const confirmation = await ctx.deps.county.submit(ctx.household.id, { workflowId: ctx.wf.id, programs, source: 'aid-workflow' });
  await ctx.evidence({
    kind: 'confirmation', title: `County confirmation ${confirmation}`, url: null,
    detail: `${joinNames(programs)} application received by the county (demo county endpoint).`, source: 'county',
  });
  for (const p of programs) {
    const cp = asCaseProgram(p);
    if (cp) await ctx.log({ type: 'ApplicationSubmitted', value: cp });
  }
  return { status: 'done', summary: `Submitted ${joinNames(programs)}. Confirmation ${confirmation}.`, meta: { ...ctx.step.meta, confirmation } };
}

export function confirmationOf(ctx: StepCtx): string | null {
  const s = ctx.steps.find(x => x.kind === 'submit');
  return typeof s?.meta.confirmation === 'string' ? s.meta.confirmation : null;
}

function callInstruction(ctx: StepCtx): string {
  const name = ctx.household.firstName ?? 'the applicant';
  const county = COUNTY_NAME[ctx.household.county];
  const conf = confirmationOf(ctx);
  const waitlist = ctx.wf.programs.includes('section8');
  return [
    `You are Aid, an assistant calling the ${county} benefits office on behalf of ${name}, who gave permission for this call.`,
    conf ? `Their ${joinNames(bcPrograms(ctx))} application was submitted with confirmation number ${conf}.` : '',
    'Ask when the eligibility interview will be scheduled and whether any documents are still needed.',
    waitlist ? 'Also ask whether the Section 8 housing choice voucher waitlist is open right now.' : '',
    'Be polite and brief. Never share a Social Security number or date of birth. Thank them and end the call.',
  ].filter(Boolean).join(' ');
}

export async function runCall(ctx: StepCtx): Promise<StepOutcome> {
  if (ctx.step.meta.approved !== true) {
    const asks: Ask[] = [{
      title: 'Let Aid call the county for you?',
      detail: 'Aid will call the county office to confirm your interview and ask what is still needed. Nothing is called until you approve.',
      action: { type: 'approve', label: 'Approve the call', url: null, stepId: ctx.step.id },
    }];
    return { status: 'waiting_on_you', summary: 'Waiting for your OK before Aid makes a phone call.', meta: { ...ctx.step.meta, asks } };
  }
  if (ctx.deps.calls) return ctx.deps.calls.runStep(ctx);
  const { dial } = ctx.deps;
  const to = dial.officePhone();
  if (!dial.configured() || !to) {
    return { status: 'skipped', summary: 'Calling is not set up on this server (no Dial account or demo office number), so Aid did not call.' };
  }
  await ctx.progress('Calling the county office…');
  const callId = typeof ctx.step.meta.callId === 'string'
    ? ctx.step.meta.callId
    : await dial.placeCall({ to, instruction: callInstruction(ctx), idempotencyKey: `wf-call-${ctx.step.id}`, maxSeconds: 180 });
  await ctx.progress('On the phone with the county office…', { ...ctx.step.meta, callId });
  await ctx.log({ type: 'CallPlaced', value: ctx.wf.programs.includes('section8') ? 'waitlist_check' : 'status_check' });

  const deadline = Date.now() + ctx.deps.callPoll.timeoutMs;
  let status = await dial.getCall(callId);
  while (!status.done && Date.now() < deadline) {
    await ctx.deps.sleep(ctx.deps.callPoll.intervalMs);
    status = await dial.getCall(callId);
  }
  if (!status.transcript.trim()) {
    await ctx.log({ type: 'CallOutcome', value: 'no_answer' });
    return { status: 'done', summary: 'The call ended without a transcript (no answer or still processing).', meta: { ...ctx.step.meta, callId } };
  }
  const { outcome, details } = await ctx.deps.summarizeCall(status.transcript);
  await ctx.evidence({ kind: 'call_transcript', title: `Call with the county: ${outcome.replace('_', ' ')}`, url: null, detail: clip(status.transcript, 1500), source: 'dial' });
  await ctx.log({ type: 'CallOutcome', value: outcome });
  return { status: 'done', summary: clip(details, 500), meta: { ...ctx.step.meta, callId, outcome } };
}

export function statusText(ctx: StepCtx): string {
  const conf = confirmationOf(ctx);
  const bc = bcPrograms(ctx);
  const others = ctx.wf.programs.filter(p => !isBenefitsCal(p));
  const parts = ['Aid:'];
  if (conf && bc.length) parts.push(`Your ${joinNames(bc)} application is submitted, confirmation ${conf}; the county usually calls for an interview within 10 days.`);
  if (others.length) parts.push(`Next for ${others.map(programName).join(', ')}: see your Aid dashboard for the link and what to bring.`);
  return parts.join(' ');
}

export async function runNotify(ctx: StepCtx): Promise<StepOutcome> {
  const phone = ctx.account?.phone ?? null;
  if (!phone) return { status: 'skipped', summary: 'No phone number on your account, so Aid did not text you. Add one in your profile.' };
  if (!ctx.deps.dial.configured()) return { status: 'skipped', summary: 'Texting is not set up on this server (no Dial account), so Aid did not text you.' };
  const body = statusText(ctx);
  await ctx.deps.dial.sendText(phone, body);
  await ctx.evidence({ kind: 'message', title: `Text sent to ${phone.slice(0, -4).replace(/\d/g, '•')}${phone.slice(-4)}`, url: null, detail: body, source: 'dial' });
  await ctx.log({ type: 'AgentToolCalled', value: 'workflow_notify' });
  return { status: 'done', summary: 'Texted you a status update.' };
}

export async function runFollowUp(ctx: StepCtx): Promise<StepOutcome> {
  await ctx.log({ type: 'AgentToolCalled', value: 'workflow_follow_up' });
  await ctx.evidence({
    kind: 'keewano_event', title: 'Case events logged for autopilot', url: null,
    detail: 'Screened, documents, signature and submission events are on your case. The Keewano autopilot uses them to schedule reminders.',
    source: 'keewano',
  });
  return { status: 'done', summary: 'Aid will remind you about interviews and renewals (Keewano autopilot watches your case).' };
}
