// Persistence for applicant accounts and workflows. Supabase in production; memory repo backs tests.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationDetails } from '../../shared/applicationDetails.js';
import type { ApplicationProgram } from '../../shared/chat.js';
import type { Evidence, StepKind, StepStatus, WorkflowStatus } from '../../shared/workflow.js';
import { admin } from '../supabase.js';
import { readAccountDetails } from './applicationDetailsDb.js';

export interface AccountRow {
  userId: string;
  householdId: string | null;
  phone: string | null;
  firstName: string | null;
  createdAt: string;
}

export interface WorkflowRow {
  id: string;
  userId: string;
  householdId: string;
  programs: ApplicationProgram[];
  status: WorkflowStatus;
  liveViewUrl: string | null;
  chatSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StepMeta = Record<string, unknown>;

export interface StepRow {
  id: string;
  workflowId: string;
  ord: number;
  kind: StepKind;
  program: ApplicationProgram | null;
  title: string;
  status: StepStatus;
  summary: string;
  meta: StepMeta;
  startedAt: string | null;
  finishedAt: string | null;
}

export type StoredEvidence = Evidence & { stepId: string };

export interface LoadedWorkflow {
  wf: WorkflowRow;
  steps: StepRow[];
  evidence: StoredEvidence[];
}

export type StepPatch = Partial<Pick<StepRow, 'status' | 'summary' | 'meta' | 'startedAt' | 'finishedAt'>>;
export type WorkflowPatch = Partial<Pick<WorkflowRow, 'status' | 'liveViewUrl'>>;

export interface WorkflowRepo {
  getAccount(userId: string): Promise<AccountRow | undefined>;
  saveAccount(a: AccountRow): Promise<void>;
  /** The applicant's saved application details (applicant_profiles.application_details); {} when none. */
  getApplicationDetails(userId: string): Promise<ApplicationDetails>;
  createWorkflow(wf: WorkflowRow, steps: StepRow[]): Promise<void>;
  getWorkflow(id: string): Promise<LoadedWorkflow | undefined>;
  /** Newest first. Evidence is left empty (summaries don't need it). */
  listWorkflows(userId: string): Promise<LoadedWorkflow[]>;
  updateWorkflow(id: string, patch: WorkflowPatch): Promise<void>;
  updateStep(id: string, patch: StepPatch): Promise<void>;
  addEvidence(e: StoredEvidence): Promise<void>;
  clearEvidence(stepId: string): Promise<void>;
}

type Row = Record<string, unknown>;
const iso = (v: unknown): string => new Date((v as string | null) ?? Date.now()).toISOString();
const isoOrNull = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

function fail(fn: string, error: { message: string }): never {
  throw new Error(`[workflowStore] ${fn}: ${error.message}`);
}

const wfFromRow = (r: Row): WorkflowRow => ({
  id: r.id as string,
  userId: r.user_id as string,
  householdId: r.household_id as string,
  programs: ((r.programs as string[] | null) ?? []) as ApplicationProgram[],
  status: r.status as WorkflowStatus,
  liveViewUrl: (r.live_view_url as string | null) ?? null,
  chatSessionId: (r.chat_session_id as string | null) ?? null,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

const stepFromRow = (r: Row): StepRow => ({
  id: r.id as string,
  workflowId: r.workflow_id as string,
  ord: r.ord as number,
  kind: r.kind as StepKind,
  program: (r.program as ApplicationProgram | null) ?? null,
  title: r.title as string,
  status: r.status as StepStatus,
  summary: (r.summary as string | null) ?? '',
  meta: (r.meta as StepMeta | null) ?? {},
  startedAt: isoOrNull(r.started_at),
  finishedAt: isoOrNull(r.finished_at),
});

const evFromRow = (r: Row): StoredEvidence => ({
  id: r.id as string,
  stepId: r.step_id as string,
  kind: r.kind as Evidence['kind'],
  title: r.title as string,
  url: (r.url as string | null) ?? null,
  detail: (r.detail as string | null) ?? null,
  source: (r.source as string | null) ?? null,
  at: iso(r.at),
});

const stepToRow = (s: StepRow): Row => ({
  id: s.id, workflow_id: s.workflowId, ord: s.ord, kind: s.kind, program: s.program, title: s.title,
  status: s.status, summary: s.summary, meta: s.meta, started_at: s.startedAt, finished_at: s.finishedAt,
});

const stepPatchToRow = (p: StepPatch): Row => {
  const out: Row = {};
  if (p.status !== undefined) out.status = p.status;
  if (p.summary !== undefined) out.summary = p.summary;
  if (p.meta !== undefined) out.meta = p.meta;
  if (p.startedAt !== undefined) out.started_at = p.startedAt;
  if (p.finishedAt !== undefined) out.finished_at = p.finishedAt;
  return out;
};

export function supabaseWorkflowRepo(client: () => SupabaseClient = admin): WorkflowRepo {
  async function loadSteps(ids: string[]): Promise<StepRow[]> {
    if (!ids.length) return [];
    const { data, error } = await client().from('workflow_steps').select('*').in('workflow_id', ids).order('ord');
    if (error) fail('loadSteps', error);
    return ((data ?? []) as Row[]).map(stepFromRow);
  }
  return {
    async getAccount(userId) {
      const { data, error } = await client().from('applicant_accounts').select('*').eq('user_id', userId).maybeSingle();
      if (error) fail('getAccount', error);
      if (!data) return undefined;
      const r = data as Row;
      return {
        userId: r.user_id as string, householdId: (r.household_id as string | null) ?? null,
        phone: (r.phone as string | null) ?? null, firstName: (r.first_name as string | null) ?? null,
        createdAt: iso(r.created_at),
      };
    },
    async saveAccount(a) {
      const { error } = await client().from('applicant_accounts').upsert({
        user_id: a.userId, household_id: a.householdId, phone: a.phone, first_name: a.firstName,
      }, { onConflict: 'user_id' });
      if (error) fail('saveAccount', error);
    },
    async getApplicationDetails(userId) {
      return readAccountDetails(client, userId);
    },
    async createWorkflow(wf, steps) {
      const { error } = await client().from('workflows').insert({
        id: wf.id, user_id: wf.userId, household_id: wf.householdId, programs: wf.programs, status: wf.status,
        live_view_url: wf.liveViewUrl, chat_session_id: wf.chatSessionId,
      });
      if (error) fail('createWorkflow', error);
      const ins = await client().from('workflow_steps').insert(steps.map(stepToRow));
      if (ins.error) fail('createWorkflow.steps', ins.error);
    },
    async getWorkflow(id) {
      const { data, error } = await client().from('workflows').select('*').eq('id', id).maybeSingle();
      if (error) fail('getWorkflow', error);
      if (!data) return undefined;
      const steps = await loadSteps([id]);
      const stepIds = steps.map(s => s.id);
      let evidence: StoredEvidence[] = [];
      if (stepIds.length) {
        const ev = await client().from('workflow_evidence').select('*').in('step_id', stepIds).order('at');
        if (ev.error) fail('getWorkflow.evidence', ev.error);
        evidence = ((ev.data ?? []) as Row[]).map(evFromRow);
      }
      return { wf: wfFromRow(data as Row), steps, evidence };
    },
    async listWorkflows(userId) {
      const { data, error } = await client().from('workflows').select('*').eq('user_id', userId)
        .order('updated_at', { ascending: false }).limit(50);
      if (error) fail('listWorkflows', error);
      const wfs = ((data ?? []) as Row[]).map(wfFromRow);
      const steps = await loadSteps(wfs.map(w => w.id));
      return wfs.map(wf => ({ wf, steps: steps.filter(s => s.workflowId === wf.id), evidence: [] }));
    },
    async updateWorkflow(id, patch) {
      const row: Row = { updated_at: new Date().toISOString() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.liveViewUrl !== undefined) row.live_view_url = patch.liveViewUrl;
      const { error } = await client().from('workflows').update(row).eq('id', id);
      if (error) fail('updateWorkflow', error);
    },
    async updateStep(id, patch) {
      const { error } = await client().from('workflow_steps').update(stepPatchToRow(patch)).eq('id', id);
      if (error) fail('updateStep', error);
    },
    async addEvidence(e) {
      const { error } = await client().from('workflow_evidence').insert({
        id: e.id, step_id: e.stepId, kind: e.kind, title: e.title, url: e.url, detail: e.detail, source: e.source, at: e.at,
      });
      if (error) fail('addEvidence', error);
    },
    async clearEvidence(stepId) {
      const { error } = await client().from('workflow_evidence').delete().eq('step_id', stepId);
      if (error) fail('clearEvidence', error);
    },
  };
}

export function memoryWorkflowRepo(): WorkflowRepo & {
  workflows: Map<string, WorkflowRow>; steps: Map<string, StepRow>; evidence: StoredEvidence[]; details: Map<string, ApplicationDetails>;
} {
  const accounts = new Map<string, AccountRow>();
  const details = new Map<string, ApplicationDetails>();
  const workflows = new Map<string, WorkflowRow>();
  const steps = new Map<string, StepRow>();
  let evidence: StoredEvidence[] = [];
  const stepsOf = (id: string) => [...steps.values()].filter(s => s.workflowId === id).sort((a, b) => a.ord - b.ord).map(s => structuredClone(s));
  return {
    workflows, steps, details,
    get evidence() { return evidence; },
    async getAccount(userId) { const a = accounts.get(userId); return a && { ...a }; },
    async saveAccount(a) { accounts.set(a.userId, { ...a }); },
    async getApplicationDetails(userId) { return structuredClone(details.get(userId) ?? {}); },
    async createWorkflow(wf, ss) {
      workflows.set(wf.id, structuredClone(wf));
      for (const s of ss) steps.set(s.id, structuredClone(s));
    },
    async getWorkflow(id) {
      const wf = workflows.get(id);
      if (!wf) return undefined;
      const st = stepsOf(id);
      const ids = new Set(st.map(s => s.id));
      return { wf: structuredClone(wf), steps: st, evidence: evidence.filter(e => ids.has(e.stepId)).map(e => ({ ...e })) };
    },
    async listWorkflows(userId) {
      return [...workflows.values()].filter(w => w.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(wf => ({ wf: structuredClone(wf), steps: stepsOf(wf.id), evidence: [] }));
    },
    async updateWorkflow(id, patch) {
      const wf = workflows.get(id);
      if (wf) workflows.set(id, { ...wf, ...patch, updatedAt: new Date().toISOString() });
    },
    async updateStep(id, patch) {
      const s = steps.get(id);
      if (s) steps.set(id, { ...s, ...structuredClone(patch) });
    },
    async addEvidence(e) { evidence = [...evidence, { ...e }]; },
    async clearEvidence(stepId) { evidence = evidence.filter(e => e.stepId !== stepId); },
  };
}
