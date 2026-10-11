// Scheduled county calls: "call the county tomorrow at 10am and ask X". Rows live in scheduled_calls; a 15s
// loop (scheduleLive.ts) starts due ones through the calls runtime, which only ever dials DEMO_OFFICE_PHONE.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { CallScript, CallTrigger, ScheduledCall, ScheduledCallStatus, ScheduleSource } from '../../shared/calls.js';
import type { CaseEvent } from '../contracts.js';
import { admin } from '../supabase.js';
import type { StartInput } from './runtime.js';
import { scrubSensitive } from './scripts.js';
import type { CallRow } from './store.js';
import { DEFAULT_TZ, formatLocal, parseWhen, WhenError, type WhenLlm } from './when.js';

export const IMMEDIATE_MS = 60_000;
export const MAX_SCHEDULED_QUESTIONS = 6;

export const ScheduleCallInput = z.object({
  when: z.string().trim().min(1).max(120),
  questions: z.array(z.string().trim().min(3).max(300)).min(1).max(MAX_SCHEDULED_QUESTIONS),
  purpose: z.string().trim().max(200).optional(),
});
export type ScheduleCallInputT = z.infer<typeof ScheduleCallInput>;

export type ScheduledPatch = Partial<Pick<ScheduledCall, 'status' | 'callId' | 'error'>>;

export interface ScheduledRepo {
  create(row: ScheduledCall): Promise<void>;
  get(id: string): Promise<ScheduledCall | undefined>;
  update(id: string, patch: ScheduledPatch): Promise<ScheduledCall | undefined>;
  /** Atomically move ONE row from `from` to `to`. Returns the row only if this caller won. */
  transition(id: string, from: ScheduledCallStatus, to: ScheduledCallStatus): Promise<ScheduledCall | undefined>;
  dueIds(nowIso: string, limit: number): Promise<string[]>;
  listByWorkflow(workflowId: string): Promise<ScheduledCall[]>;
}

export interface ScheduleDeps {
  repo: ScheduledRepo;
  callsEnabled(): boolean;
  startCall(input: StartInput, onDone: (final: CallRow) => Promise<void>): Promise<CallRow>;
  latestWorkflowId(householdId: string): Promise<string | null>;
  log(householdId: string, e: CaseEvent): Promise<void>;
  timeline(householdId: string, label: string): Promise<void>;
  /** Post an assistant message to the household's conversation (chat + dashboard). */
  notifyChat(householdId: string, text: string): Promise<void>;
  publish(workflowId: string): Promise<void>;
  now(): Date;
  tz?: string;
  llmWhen?: WhenLlm;
}

export class ScheduleError extends Error {
  constructor(public readonly status: 400 | 404 | 409 | 503, message: string) { super(message); }
}

export interface ScheduleRequest {
  householdId: string;
  workflowId?: string | null;
  when: string | Date;
  questions: string[];
  purpose?: string;
  source: ScheduleSource;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const quiet = (what: string) => (err: unknown) => console.error(`[schedule] ${what} failed:`, errMsg(err));

export function resultMessage(row: ScheduledCall, call: CallRow): string {
  if (call.status !== 'completed' && call.status !== 'simulated') {
    return `I tried calling the county office but couldn't get answers${call.error ? ` (${call.error.slice(0, 120)})` : ''}. Want me to try again later?`;
  }
  const answers = (call.answers ?? []).map(a => `- ${a.question} ${a.answer ?? 'Not answered.'}`).join('\n');
  const tag = call.simulated ? ' (simulated)' : '';
  return [`I called the county office${tag} as you asked. Here's what they said:`, answers, call.summary ?? ''].filter(Boolean).join('\n').slice(0, 1500)
    || `I called the county office${tag} for: ${row.script.questions.join(' ')}`;
}

export function createScheduler(d: ScheduleDeps) {
  const tz = d.tz ?? DEFAULT_TZ;
  let ticking = false;

  async function onCallDone(row: ScheduledCall, call: CallRow): Promise<void> {
    const ok = call.status === 'completed' || call.status === 'simulated';
    await d.repo.update(row.id, { status: ok ? 'done' : 'failed', callId: call.id, error: ok ? null : call.error }).catch(quiet('update'));
    await d.notifyChat(row.householdId, resultMessage(row, call)).catch(quiet('notifyChat'));
    if (row.workflowId) await d.publish(row.workflowId).catch(() => undefined);
  }

  /** Starts a row that this caller already moved to 'running'. Never throws. */
  async function launch(row: ScheduledCall): Promise<ScheduledCall> {
    try {
      const call = await d.startCall({
        householdId: row.householdId, workflowId: row.workflowId, script: row.script,
        trigger: (row.source === 'sms' ? 'sms' : 'manual') satisfies CallTrigger, purpose: 'custom',
      }, final => onCallDone(row, final));
      const linked = await d.repo.update(row.id, { callId: call.id });
      // A fast (simulated) call may already have finished; don't overwrite its final status.
      return linked ?? { ...row, callId: call.id };
    } catch (err) {
      const failed = await d.repo.update(row.id, { status: 'failed', error: errMsg(err).slice(0, 300) }).catch(() => undefined);
      await d.notifyChat(row.householdId, `I couldn't start the call to the county office: ${errMsg(err).slice(0, 160)}`).catch(quiet('notifyChat'));
      return failed ?? { ...row, status: 'failed', error: errMsg(err) };
    } finally {
      if (row.workflowId) await d.publish(row.workflowId).catch(() => undefined);
    }
  }

  async function scheduleCall(req: ScheduleRequest): Promise<{ row: ScheduledCall; immediate: boolean; localTime: string }> {
    const questions = req.questions.map(q => scrubSensitive(q.trim())).filter(Boolean);
    if (!questions.length || questions.length > MAX_SCHEDULED_QUESTIONS) throw new ScheduleError(400, 'Give 1 to 6 questions to ask.');
    if (questions.some(q => q.length > 300)) throw new ScheduleError(400, 'Keep each question under 300 characters.');
    if (!d.callsEnabled()) throw new ScheduleError(503, 'Calling is not set up right now.');
    const now = d.now();
    let runAt: Date;
    try {
      runAt = await parseWhen(req.when instanceof Date ? req.when.toISOString() : req.when, now, tz, d.llmWhen);
    } catch (err) {
      if (err instanceof WhenError) throw new ScheduleError(400, err.message);
      throw err;
    }
    const purpose = req.purpose?.trim();
    const script: CallScript = {
      goal: scrubSensitive(purpose ? purpose.slice(0, 300) : 'Ask the county office the questions below'),
      questions, context: '',
    };
    const workflowId = req.workflowId !== undefined ? req.workflowId : await d.latestWorkflowId(req.householdId).catch(() => null);
    const row: ScheduledCall = {
      id: randomUUID(), householdId: req.householdId, workflowId, runAt: runAt.toISOString(), script,
      status: 'scheduled', callId: null, source: req.source, error: null, createdAt: now.toISOString(),
    };
    await d.repo.create(row);
    const localTime = formatLocal(runAt, tz);
    await d.log(req.householdId, { type: 'AgentToolCalled', value: 'call_scheduled' }).catch(quiet('log'));
    await d.timeline(req.householdId, `Call scheduled for ${localTime}: ${questions.join(' ')}`.slice(0, 300)).catch(quiet('timeline'));
    const immediate = runAt.getTime() - now.getTime() <= IMMEDIATE_MS;
    if (immediate) {
      const claimed = await d.repo.transition(row.id, 'scheduled', 'running');
      if (claimed) return { row: await launch(claimed), immediate, localTime };
    }
    if (workflowId) await d.publish(workflowId).catch(() => undefined);
    return { row, immediate, localTime };
  }

  /** Starts every due row once. Safe to call concurrently and from several processes. */
  async function runDueScheduledCalls(limit = 5): Promise<ScheduledCall[]> {
    if (ticking) return [];
    ticking = true;
    try {
      const ids = await d.repo.dueIds(d.now().toISOString(), limit);
      const started: ScheduledCall[] = [];
      for (const id of ids) {
        const claimed = await d.repo.transition(id, 'scheduled', 'running');
        if (claimed) started.push(await launch(claimed));
      }
      return started;
    } finally { ticking = false; }
  }

  async function cancel(id: string): Promise<ScheduledCall> {
    const row = await d.repo.transition(id, 'scheduled', 'canceled');
    if (!row) throw new ScheduleError(409, 'That call already started or was canceled.');
    await d.timeline(row.householdId, `Canceled the call scheduled for ${formatLocal(new Date(row.runAt), tz)}`).catch(quiet('timeline'));
    if (row.workflowId) await d.publish(row.workflowId).catch(() => undefined);
    return row;
  }

  /** What the chat agents get back: a sentence to confirm, or why it didn't work. */
  async function scheduleFromChat(householdId: string, input: unknown, source: ScheduleSource): Promise<string> {
    const parsed = ScheduleCallInput.safeParse(input);
    if (!parsed.success) return 'Not scheduled: give a time and 1 to 6 short questions to ask.';
    try {
      const { row, immediate, localTime } = await scheduleCall({ householdId, ...parsed.data, source });
      const qs = row.script.questions.map((q, i) => `${i + 1}) ${q}`).join(' ');
      if (row.status === 'failed') return `Could not start the call: ${row.error ?? 'unknown error'}. Tell them and offer to try later.`;
      return immediate
        ? `Calling the county office now. Questions: ${qs}. Answers will be posted here and texted when the call ends (usually a few minutes). Confirm this to the person.`
        : `Scheduled for ${localTime}. Questions: ${qs}. Aid will call the county office then and post the answers here and by text. Confirm the local time and the questions to the person; they can cancel from their dashboard.`;
    } catch (err) {
      if (err instanceof ScheduleError) return `Not scheduled: ${err.message}`;
      console.error('[schedule] chat schedule failed:', errMsg(err));
      return 'Not scheduled: something went wrong. Tell them to try again in a minute.';
    }
  }

  return { scheduleCall, runDueScheduledCalls, cancel, scheduleFromChat, deps: d };
}

export type Scheduler = ReturnType<typeof createScheduler>;

// ── Persistence ──

type Row = Record<string, unknown>;
const fromRow = (r: Row): ScheduledCall => ({
  id: r.id as string,
  householdId: r.household_id as string,
  workflowId: (r.workflow_id as string | null) ?? null,
  runAt: new Date(r.run_at as string).toISOString(),
  script: r.script as CallScript,
  status: r.status as ScheduledCallStatus,
  callId: (r.call_id as string | null) ?? null,
  source: r.source as ScheduleSource,
  error: (r.error as string | null) ?? null,
  createdAt: new Date(r.created_at as string).toISOString(),
});

function fail(fn: string, error: { message: string }): never {
  throw new Error(`[scheduledCalls] ${fn}: ${error.message}`);
}

export function supabaseScheduledRepo(client: () => SupabaseClient = admin): ScheduledRepo {
  const t = () => client().from('scheduled_calls');
  return {
    async create(c) {
      const { error } = await t().insert({
        id: c.id, household_id: c.householdId, workflow_id: c.workflowId, run_at: c.runAt, script: c.script,
        status: c.status, call_id: c.callId, source: c.source, error: c.error, created_at: c.createdAt,
      });
      if (error) fail('create', error);
    },
    async get(id) {
      const { data, error } = await t().select('*').eq('id', id).maybeSingle();
      if (error) fail('get', error);
      return data ? fromRow(data as Row) : undefined;
    },
    async update(id, p) {
      const out: Row = {};
      if (p.status !== undefined) out.status = p.status;
      if (p.callId !== undefined) out.call_id = p.callId;
      if (p.error !== undefined) out.error = p.error;
      const { data, error } = await t().update(out).eq('id', id).select('*').maybeSingle();
      if (error) fail('update', error);
      return data ? fromRow(data as Row) : undefined;
    },
    async transition(id, from, to) {
      const { data, error } = await t().update({ status: to }).eq('id', id).eq('status', from).select('*').maybeSingle();
      if (error) fail('transition', error);
      return data ? fromRow(data as Row) : undefined;
    },
    async dueIds(nowIso, limit) {
      const { data, error } = await t().select('id').eq('status', 'scheduled').lte('run_at', nowIso).order('run_at').limit(limit);
      if (error) fail('dueIds', error);
      return ((data ?? []) as Row[]).map(r => r.id as string);
    },
    async listByWorkflow(wid) {
      const { data, error } = await t().select('*').eq('workflow_id', wid).order('run_at', { ascending: false }).limit(50);
      if (error) fail('listByWorkflow', error);
      return ((data ?? []) as Row[]).map(fromRow);
    },
  };
}

export function memoryScheduledRepo(): ScheduledRepo & { rows: Map<string, ScheduledCall> } {
  const rows = new Map<string, ScheduledCall>();
  const copy = (r: ScheduledCall | undefined) => r && structuredClone(r);
  return {
    rows,
    async create(c) { rows.set(c.id, structuredClone(c)); },
    async get(id) { return copy(rows.get(id)); },
    async update(id, p) {
      const cur = rows.get(id);
      if (!cur) return undefined;
      const next = { ...cur, ...structuredClone(p) };
      rows.set(id, next);
      return copy(next);
    },
    async transition(id, from, to) {
      const cur = rows.get(id);
      if (!cur || cur.status !== from) return undefined;
      const next = { ...cur, status: to };
      rows.set(id, next);
      return copy(next);
    },
    async dueIds(nowIso, limit) {
      return [...rows.values()].filter(r => r.status === 'scheduled' && r.runAt <= nowIso)
        .sort((a, b) => a.runAt.localeCompare(b.runAt)).slice(0, limit).map(r => r.id);
    },
    async listByWorkflow(wid) {
      return [...rows.values()].filter(r => r.workflowId === wid).sort((a, b) => b.runAt.localeCompare(a.runAt)).map(r => structuredClone(r));
    },
  };
}
