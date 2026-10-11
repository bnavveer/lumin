// Scripted county calls: place (or simulate) the call, poll for the transcript, extract answers,
// save, log and text a summary. Calls ONLY ever go to deps.dial.officePhone() (env DEMO_OFFICE_PHONE).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CALLS_NOT_CONFIGURED, type CallAnswer, type CallPurposeKey, type CallsConfig, type CallScript, type CallTrigger,
} from '../../shared/calls.js';
import type { CallOutcomeKind, CallPurpose, CaseEvent, Household } from '../contracts.js';
import type { CallStatus } from '../workflow/deps.js';
import { COUNTY_NAME, programName } from '../workflow/programs.js';
import type { LoadedWorkflow, WorkflowRepo } from '../workflow/store.js';
import { defaultScript, scrubSensitive, type SuggestInput, buildInstruction } from './scripts.js';
import type { CallRepo, CallRow } from './store.js';

export const OUTCOMES = ['transferred', 'booked', 'waitlist_open', 'waitlist_closed', 'no_answer', 'info'] as const satisfies readonly CallOutcomeKind[];

export const ExtractOut = z.object({
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string().nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
  })),
  summary: z.string().max(600),
  outcome: z.enum(OUTCOMES),
});
export type Extraction = z.infer<typeof ExtractOut>;

export interface CallsDeps {
  repo: CallRepo;
  workflows: WorkflowRepo;
  households: { get(id: string): Promise<Household | undefined> };
  dial: {
    configured(): boolean;
    officePhone(): string | null;
    placeCall(o: { to: string; instruction: string; idempotencyKey: string; maxSeconds: number }): Promise<string>;
    getCall(id: string): Promise<CallStatus>;
    sendText(to: string, body: string): Promise<string>;
  };
  simulate(): boolean;
  autoCallOnEmail(): boolean;
  llm: {
    suggest(i: SuggestInput): Promise<{ goal: string; questions: string[] }>;
    extract(script: CallScript, transcript: string): Promise<Extraction>;
    simulateCounty(script: CallScript, firstName: string | null): Promise<string>;
  };
  /** Most recent workflow for a household, or undefined. */
  latestWorkflowFor(householdId: string): Promise<LoadedWorkflow | undefined>;
  log(householdId: string, e: CaseEvent): Promise<void>;
  timeline(householdId: string, label: string): Promise<void>;
  /** Push the workflow to SSE listeners (no-op when unavailable). */
  publish(workflowId: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  poll: { intervalMs: number; timeoutMs: number };
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const nowIso = () => new Date().toISOString();
const MAX_SECONDS = 300;

export function maskPhone(p: string | null): string | null {
  if (!p) return null;
  const last4 = p.replace(/\D/g, '').slice(-4);
  return last4.length === 4 ? `(•••) •••-${last4}` : null;
}

export function callsConfig(deps: Pick<CallsDeps, 'dial' | 'simulate'>): CallsConfig {
  const simulated = deps.simulate();
  const phone = deps.dial.officePhone();
  const real = deps.dial.configured() && Boolean(phone);
  const enabled = simulated || real;
  return { enabled, simulated, officePhoneMasked: maskPhone(phone), message: enabled ? null : CALLS_NOT_CONFIGURED };
}

/** Map an answer extraction onto the script's questions (one row per question, in order). */
export function alignAnswers(script: CallScript, ex: Pick<Extraction, 'answers'>): CallAnswer[] {
  return script.questions.map((q, i) => {
    const hit = ex.answers.find(a => a.question.trim().toLowerCase() === q.trim().toLowerCase()) ?? ex.answers[i];
    const answer = hit?.answer?.trim() ? scrubSensitive(hit.answer.trim()) : null;
    return { question: q, answer, confidence: answer ? hit!.confidence : 'low' };
  });
}

export async function extractAnswers(deps: Pick<CallsDeps, 'llm'>, script: CallScript, transcript: string): Promise<Extraction & { answers: CallAnswer[] }> {
  const ex = await deps.llm.extract(script, transcript);
  return { ...ex, summary: scrubSensitive(ex.summary), answers: alignAnswers(script, ex) };
}

const PURPOSE_TO_EVENT: Record<CallPurposeKey, CallPurpose> = {
  confirm_interview: 'status_check', reschedule_interview: 'reschedule_interview', ask_missing_docs: 'status_check',
  ask_denial_reason: 'status_check', check_status: 'status_check', waitlist: 'waitlist_check', custom: 'status_check',
};

export interface StartInput {
  householdId: string;
  workflowId?: string | null;
  script: CallScript;
  trigger: CallTrigger;
  purpose?: CallPurposeKey;
}

export function createCallsRuntime(deps: CallsDeps) {
  const background = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    const q = p.catch(err => console.error('[calls] background call failed:', errMsg(err)));
    background.add(q);
    void q.finally(() => background.delete(q));
  };

  const safeLog = async (hid: string, e: CaseEvent) => {
    try { await deps.log(hid, e); } catch (err) { console.error('[calls] keewano log failed:', errMsg(err)); }
  };

  async function patch(row: CallRow, p: Parameters<CallRepo['update']>[1]): Promise<CallRow> {
    const next = (await deps.repo.update(row.id, p)) ?? { ...row, ...p };
    if (row.workflowId) await deps.publish(row.workflowId).catch(() => undefined);
    return next;
  }

  async function finish(row: CallRow, transcript: string, finalStatus: 'completed' | 'simulated'): Promise<CallRow> {
    const clean = scrubSensitive(transcript).slice(0, 20_000);
    const ex = await extractAnswers(deps, row.script, clean);
    const done = await patch(row, { status: finalStatus, transcript: clean, answers: ex.answers, summary: ex.summary, outcome: ex.outcome });
    await safeLog(row.householdId, { type: 'CallOutcome', value: ex.outcome });
    const tag = finalStatus === 'simulated' ? ' (SIMULATED)' : '';
    await deps.timeline(row.householdId, `Call with the county${tag}: ${ex.summary.slice(0, 140)}`).catch(err => console.error('[calls] timeline failed:', errMsg(err)));
    const h = await deps.households.get(row.householdId);
    if (h?.phone?.startsWith('+') && deps.dial.configured()) {
      const body = `Aid${tag}: I called the county. ${ex.summary}`.slice(0, 300);
      await deps.dial.sendText(h.phone, body).catch(err => console.error('[calls] summary text failed:', errMsg(err)));
    }
    return done;
  }

  /** Runs a queued call to the end. Never throws: failures land on the row. */
  async function run(row: CallRow): Promise<CallRow> {
    try {
      const h = await deps.households.get(row.householdId);
      if (row.simulated) {
        row = await patch(row, { status: 'in_progress' });
        const transcript = await deps.llm.simulateCounty(row.script, h?.firstName ?? null);
        return await finish(row, transcript, 'simulated');
      }
      const to = deps.dial.officePhone();
      if (!to || !deps.dial.configured()) throw new Error(CALLS_NOT_CONFIGURED);
      const dialId = await deps.dial.placeCall({
        to, instruction: buildInstruction(row.script, { firstName: h?.firstName }), idempotencyKey: `aid-call-${row.id}`, maxSeconds: MAX_SECONDS,
      });
      row = await patch(row, { status: 'ringing', dialCallId: dialId });
      const deadline = Date.now() + deps.poll.timeoutMs;
      let st = await deps.dial.getCall(dialId);
      while (!st.done && Date.now() < deadline) {
        if (row.status !== 'in_progress') row = await patch(row, { status: 'in_progress' });
        await deps.sleep(deps.poll.intervalMs);
        st = await deps.dial.getCall(dialId);
      }
      if (!st.transcript.trim()) {
        await safeLog(row.householdId, { type: 'CallOutcome', value: 'no_answer' });
        return await patch(row, { status: 'failed', outcome: 'no_answer', error: 'The call ended without a transcript (no answer or still processing).' });
      }
      return await finish(row, st.transcript, 'completed');
    } catch (err) {
      console.error('[calls] call failed:', errMsg(err));
      return patch(row, { status: 'failed', error: errMsg(err).slice(0, 300) });
    }
  }

  async function create(input: StartInput): Promise<CallRow> {
    const cfg = callsConfig(deps);
    if (!cfg.enabled) throw new CallsError(503, CALLS_NOT_CONFIGURED);
    const now = nowIso();
    const row: CallRow = {
      id: randomUUID(), householdId: input.householdId, workflowId: input.workflowId ?? null, dialCallId: null,
      status: 'queued', simulated: cfg.simulated, script: input.script, transcript: null, answers: null, summary: null,
      outcome: null, error: null, trigger: input.trigger, createdAt: now, updatedAt: now,
    };
    await deps.repo.create(row);
    await safeLog(row.householdId, { type: 'CallPlaced', value: PURPOSE_TO_EVENT[input.purpose ?? 'custom'] });
    return row;
  }

  return {
    config: () => callsConfig(deps),
    /** Creates the call row and runs it in the background. Returns the queued row. */
    async startScriptedCall(input: StartInput): Promise<CallRow> {
      const row = await create(input);
      track(run(row));
      return row;
    },
    /** Creates the call and waits for the end (workflow call step). */
    async callAndWait(input: StartInput): Promise<CallRow> {
      return run(await create(input));
    },
    async suggest(lw: LoadedWorkflow | undefined, household: Household, purpose: CallPurposeKey, extraNotes: string[] = []): Promise<CallScript> {
      const notes = [
        ...(lw?.steps.filter(s => s.kind === 'research' && s.summary).map(s => `${s.program ? programName(s.program) : 'Research'}: ${s.summary}`) ?? []),
        ...(lw?.steps.filter(s => s.kind === 'documents' && s.summary).map(s => `Documents: ${s.summary}`) ?? []),
        ...extraNotes,
      ];
      const context = scrubSensitive(notes.join(' ').slice(0, 1200));
      try {
        const out = await deps.llm.suggest({
          purpose, programs: (lw?.wf.programs ?? []).map(programName), county: COUNTY_NAME[household.county] ?? 'California',
          firstName: household.firstName ?? null, notes,
        });
        return { goal: scrubSensitive(out.goal), questions: out.questions.map(scrubSensitive).slice(0, 6), context };
      } catch (err) {
        console.error('[calls] suggest failed, using default script:', errMsg(err));
        return defaultScript(purpose, context);
      }
    },
    /** Resolves when all background calls have settled (tests). */
    async idle(): Promise<void> {
      while (background.size) await Promise.allSettled([...background]);
    },
    deps,
  };
}

export class CallsError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 503, message: string) { super(message); }
}

export type CallsRuntime = ReturnType<typeof createCallsRuntime>;
