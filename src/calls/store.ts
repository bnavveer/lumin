// Persistence for scripted calls (table scripted_calls). Supabase in production; memory repo backs tests.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallAnswer, CallScript, CallTrigger, ScriptedCall, ScriptedCallStatus } from '../../shared/calls.js';
import { admin } from '../supabase.js';

export type CallRow = ScriptedCall & { dialCallId: string | null };
export type CallPatch = Partial<Pick<CallRow, 'status' | 'dialCallId' | 'transcript' | 'answers' | 'summary' | 'outcome' | 'error'>>;

export interface CallRepo {
  create(row: CallRow): Promise<void>;
  update(id: string, patch: CallPatch): Promise<CallRow | undefined>;
  get(id: string): Promise<CallRow | undefined>;
  listByWorkflow(workflowId: string): Promise<CallRow[]>;
}

type Row = Record<string, unknown>;

const fromRow = (r: Row): CallRow => ({
  id: r.id as string,
  householdId: r.household_id as string,
  workflowId: (r.workflow_id as string | null) ?? null,
  dialCallId: (r.dial_call_id as string | null) ?? null,
  status: r.status as ScriptedCallStatus,
  simulated: Boolean(r.simulated),
  script: r.script as CallScript,
  transcript: (r.transcript as string | null) ?? null,
  answers: (r.answers as CallAnswer[] | null) ?? null,
  summary: (r.summary as string | null) ?? null,
  outcome: (r.outcome as string | null) ?? null,
  error: (r.error as string | null) ?? null,
  trigger: (r.trigger as CallTrigger) ?? 'manual',
  createdAt: new Date(r.created_at as string).toISOString(),
  updatedAt: new Date(r.updated_at as string).toISOString(),
});

const patchToRow = (p: CallPatch): Row => {
  const out: Row = { updated_at: new Date().toISOString() };
  if (p.status !== undefined) out.status = p.status;
  if (p.dialCallId !== undefined) out.dial_call_id = p.dialCallId;
  if (p.transcript !== undefined) out.transcript = p.transcript;
  if (p.answers !== undefined) out.answers = p.answers;
  if (p.summary !== undefined) out.summary = p.summary;
  if (p.outcome !== undefined) out.outcome = p.outcome;
  if (p.error !== undefined) out.error = p.error;
  return out;
};

function fail(fn: string, error: { message: string }): never {
  throw new Error(`[callStore] ${fn}: ${error.message}`);
}

export function supabaseCallRepo(client: () => SupabaseClient = admin): CallRepo {
  return {
    async create(c) {
      const { error } = await client().from('scripted_calls').insert({
        id: c.id, household_id: c.householdId, workflow_id: c.workflowId, dial_call_id: c.dialCallId, status: c.status,
        simulated: c.simulated, script: c.script, transcript: c.transcript, answers: c.answers, summary: c.summary,
        outcome: c.outcome, error: c.error, trigger: c.trigger, created_at: c.createdAt, updated_at: c.updatedAt,
      });
      if (error) fail('create', error);
    },
    async update(id, patch) {
      const { data, error } = await client().from('scripted_calls').update(patchToRow(patch)).eq('id', id).select('*').maybeSingle();
      if (error) fail('update', error);
      return data ? fromRow(data as Row) : undefined;
    },
    async get(id) {
      const { data, error } = await client().from('scripted_calls').select('*').eq('id', id).maybeSingle();
      if (error) fail('get', error);
      return data ? fromRow(data as Row) : undefined;
    },
    async listByWorkflow(workflowId) {
      const { data, error } = await client().from('scripted_calls').select('*').eq('workflow_id', workflowId)
        .order('created_at', { ascending: false }).limit(50);
      if (error) fail('listByWorkflow', error);
      return ((data ?? []) as Row[]).map(fromRow);
    },
  };
}

export function memoryCallRepo(): CallRepo & { rows: Map<string, CallRow> } {
  const rows = new Map<string, CallRow>();
  return {
    rows,
    async create(c) { rows.set(c.id, structuredClone(c)); },
    async update(id, patch) {
      const cur = rows.get(id);
      if (!cur) return undefined;
      const next = { ...cur, ...structuredClone(patch), updatedAt: new Date().toISOString() };
      rows.set(id, next);
      return structuredClone(next);
    },
    async get(id) { const r = rows.get(id); return r && structuredClone(r); },
    async listByWorkflow(wid) {
      return [...rows.values()].filter(r => r.workflowId === wid)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(r => structuredClone(r));
    },
  };
}

/** Wire shape: never expose the Dial call id. */
export const toWire = ({ dialCallId: _d, ...c }: CallRow): ScriptedCall => c;
