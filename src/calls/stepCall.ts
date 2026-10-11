// The workflow's call step, after approval: run the (edited or suggested) script and attach the results.
import { CALL_PURPOSES, CALLS_NOT_CONFIGURED, type CallPurposeKey, type CallTrigger } from '../../shared/calls.js';
import { clip, type StepCtx, type StepOutcome } from '../workflow/steps/context.js';
import type { CallsRuntime } from './runtime.js';
import { ScriptSchema } from './scripts.js';

const isPurpose = (v: unknown): v is CallPurposeKey => typeof v === 'string' && (CALL_PURPOSES as readonly string[]).includes(v);

export async function runScriptedCallStep(rt: CallsRuntime, ctx: StepCtx): Promise<StepOutcome> {
  const cfg = rt.config();
  if (!cfg.enabled) return { status: 'skipped', summary: `${CALLS_NOT_CONFIGURED}. Aid did not call.` };
  const purpose: CallPurposeKey = isPurpose(ctx.step.meta.callPurpose)
    ? ctx.step.meta.callPurpose : ctx.wf.programs.includes('section8') ? 'waitlist' : 'confirm_interview';
  const saved = ScriptSchema.safeParse(ctx.step.meta.callScript);
  const script = saved.success ? saved.data : await rt.suggest({ wf: ctx.wf, steps: ctx.steps, evidence: [] }, ctx.household, purpose);
  const trigger: CallTrigger = ctx.step.meta.callTrigger === 'email' ? 'email' : 'manual';
  await ctx.progress(cfg.simulated ? 'SIMULATED call: Aid is role-playing the county office…' : 'Calling the county office…',
    { ...ctx.step.meta, callScript: script, callPurpose: purpose });
  const row = await rt.callAndWait({ householdId: ctx.household.id, workflowId: ctx.wf.id, script, trigger, purpose });
  const meta = { ...ctx.step.meta, callScript: script, callPurpose: purpose, scriptedCallId: row.id, asks: [] };
  if (row.status === 'failed') return { status: 'failed', summary: `The call did not finish: ${row.error ?? 'unknown error'}. Tap "Try again".`, meta: { ...meta, approved: false } };
  const tag = row.simulated ? 'SIMULATED ' : '';
  await ctx.evidence({
    kind: 'call_transcript', title: `${tag}Call with the county: ${(row.outcome ?? 'info').replace('_', ' ')}`, url: null,
    detail: clip(`${row.summary ?? ''}\n\n${row.transcript ?? ''}`, 1800), source: row.simulated ? 'simulated' : 'dial',
  });
  const lines = (row.answers ?? []).map(a => `${a.question} → ${a.answer ?? 'not answered'}`);
  return { status: 'done', summary: clip([`${tag}${row.summary ?? 'Call finished.'}`, ...lines].join('\n'), 1200), meta };
}
