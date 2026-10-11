// Workflow engine: builds the step list, runs steps in the background, persists every change and
// pushes it to SSE listeners. Every step catches its own errors; nothing runs twice concurrently.
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ApplicationProgram } from '../../shared/chat.js';
import type { FillTarget, StepKind, Workflow } from '../../shared/workflow.js';
import { endKernelSession } from '../benefitscal/kernelSessions.js';
import type { DocType } from '../contracts.js';
import type { WorkflowDeps } from './deps.js';
import { DONEISH, TERMINAL, deriveStatus, toWorkflow } from './nextSteps.js';
import { applicationUrl, isBenefitsCal, joinNames, programName } from './programs.js';
import type { LoadedWorkflow, StepMeta, StepPatch, StepRow, WorkflowRow } from './store.js';
import { errMsg, type StepCtx, type StepFn, type StepOutcome } from './steps/context.js';
import { runDocuments } from './steps/documents.js';
import { runFill } from './steps/fill.js';
import { runCall, runFollowUp, runNotify, runSign, runSubmit } from './steps/finish.js';
import { runResearch } from './steps/research.js';

const STEP_FNS: Record<StepKind, StepFn> = {
  research: runResearch, documents: runDocuments, fill: runFill, sign: runSign,
  submit: runSubmit, call: runCall, notify: runNotify, follow_up: runFollowUp,
};

export class WorkflowError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) { super(message); }
}

const nowIso = () => new Date().toISOString();

export function buildSteps(workflowId: string, programs: ApplicationProgram[], target: FillTarget = 'mock'): StepRow[] {
  const bc = programs.filter(isBenefitsCal);
  const others = programs.filter(p => !isBenefitsCal(p));
  const rows: Omit<StepRow, 'ord' | 'id' | 'workflowId' | 'startedAt' | 'finishedAt'>[] = [];
  const add = (kind: StepKind, title: string, program: ApplicationProgram | null = null, extra: Partial<StepRow> = {}) =>
    rows.push({ kind, title, program, status: 'pending', summary: '', meta: {}, ...extra });

  for (const p of programs) add('research', `Research what ${programName(p)} needs`, p);
  if (bc.length) add('documents', 'Gather your documents');
  else add('documents', 'Gather your documents', null, { status: 'skipped', summary: 'Aid is not filling a form for these programs, so no uploads are needed here.' });
  if (bc.length) add('fill', `Fill the BenefitsCal application (${joinNames(bc)})`, bc[0]!, { meta: { programs: bc, ...(target === 'real' ? { target } : {}) } });
  for (const p of others) {
    add('fill', `Apply for ${programName(p)}`, p, {
      status: 'skipped', summary: `Apply at ${applicationUrl(p)}`, meta: { applyUrl: applicationUrl(p) },
    });
  }
  const noBc = { status: 'skipped' as const, summary: 'Not needed: no BenefitsCal programs in this workflow.' };
  add('sign', 'Sign your application', null, bc.length ? {} : noBc);
  add('submit', 'Submit to the county', null, bc.length ? {} : noBc);
  add('call', 'Call the county to confirm your interview / check the waitlist');
  add('notify', 'Text you a status update');
  add('follow_up', 'Follow up on interviews and renewals');
  return rows.map((r, ord) => ({
    ...r, id: randomUUID(), workflowId, ord,
    startedAt: null, finishedAt: r.status === 'skipped' ? nowIso() : null,
  }));
}

export interface UploadInput { buffer: Buffer; contentType: string; docType: DocType }

export function createEngine(deps: WorkflowDeps) {
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  const running = new Set<string>();
  const advancing = new Map<string, { again: boolean }>();
  const background = new Set<Promise<unknown>>();

  const track = (p: Promise<unknown>) => {
    const q = p.catch(err => console.error('[workflow] background task failed:', errMsg(err)));
    background.add(q);
    void q.finally(() => background.delete(q));
  };

  async function load(id: string): Promise<LoadedWorkflow> {
    const lw = await deps.repo.getWorkflow(id);
    if (!lw) throw new WorkflowError(404, 'Workflow not found');
    return lw;
  }

  /** Persist the derived status and push the fresh Workflow to listeners. */
  async function publish(id: string): Promise<Workflow> {
    const lw = await load(id);
    const status = deriveStatus(lw.steps);
    await deps.repo.updateWorkflow(id, { status });
    const fresh = toWorkflow({ ...lw, wf: { ...lw.wf, status, updatedAt: nowIso() } });
    bus.emit(id, fresh);
    return fresh;
  }

  async function patchStep(wfId: string, stepId: string, patch: StepPatch): Promise<void> {
    await deps.repo.updateStep(stepId, patch);
    await publish(wfId);
  }

  async function makeCtx(lw: LoadedWorkflow, step: StepRow): Promise<StepCtx> {
    const household = await deps.households.get(lw.wf.householdId);
    if (!household) throw new Error('household record not found');
    const account = await deps.repo.getAccount(lw.wf.userId);
    let meta: StepMeta = step.meta;
    const ctx: StepCtx = {
      deps, wf: lw.wf, step, steps: lw.steps, household, account,
      async progress(summary, m) {
        if (m) { meta = m; ctx.step = { ...ctx.step, meta: m }; }
        await patchStep(lw.wf.id, step.id, { summary, ...(m ? { meta } : {}) });
      },
      async evidence(e) {
        await deps.repo.addEvidence({ ...e, id: randomUUID(), stepId: step.id, at: nowIso() });
        await publish(lw.wf.id);
      },
      async setLiveView(url) {
        await deps.repo.updateWorkflow(lw.wf.id, { liveViewUrl: url });
        await publish(lw.wf.id);
      },
      async log(e) {
        try { await deps.log(household.id, e); } catch (err) { console.error('[workflow] keewano log failed:', errMsg(err)); }
      },
    };
    return ctx;
  }

  /** Run one step now. No-op if it is already running. Errors become a failed step with a retry. */
  async function runStep(wfId: string, stepId: string): Promise<void> {
    if (running.has(stepId)) return;
    running.add(stepId);
    try {
      const lw = await load(wfId);
      const step = lw.steps.find(s => s.id === stepId);
      if (!step) return;
      await patchStep(wfId, stepId, { status: 'running', startedAt: step.startedAt ?? nowIso(), finishedAt: null });
      let out: StepOutcome;
      let ctx: StepCtx | undefined;
      try {
        ctx = await makeCtx(lw, { ...step, status: 'running' });
        out = await STEP_FNS[step.kind](ctx);
      } catch (err) {
        console.error(`[workflow] step ${step.kind} failed:`, errMsg(err));
        out = { status: 'failed', summary: `${step.title} did not finish: ${errMsg(err).slice(0, 200)}. Tap "Try again".` };
      }
      const meta = out.meta ?? ctx?.step.meta ?? step.meta;
      await patchStep(wfId, stepId, {
        status: out.status, summary: out.summary, meta,
        finishedAt: TERMINAL.has(out.status) ? nowIso() : null,
      });
      // Past signing: the held Kernel browser (kept alive for the signer) is no longer needed.
      if (step.kind === 'sign' && DONEISH.has(out.status)) {
        for (const f of lw.steps.filter(x => x.kind === 'fill')) {
          const sid = typeof f.meta.kernelSessionId === 'string' ? f.meta.kernelSessionId : null;
          if (sid) await endKernelSession(sid);
        }
      }
    } finally {
      running.delete(stepId);
    }
    track(advance(wfId));
  }

  /** Decide which steps can start now. Serialized per workflow; re-runs once if poked mid-flight. */
  async function advance(wfId: string): Promise<void> {
    const cur = advancing.get(wfId);
    if (cur) { cur.again = true; return; }
    const state = { again: true };
    advancing.set(wfId, state);
    try {
      while (state.again) {
        state.again = false;
        await advanceOnce(wfId);
      }
    } finally {
      advancing.delete(wfId);
    }
  }

  async function advanceOnce(wfId: string): Promise<void> {
    const lw = await load(wfId);
    const steps = lw.steps;
    // A step marked running that this process isn't running was orphaned by a restart.
    for (const s of steps) {
      if (s.status === 'running' && !running.has(s.id)) {
        await patchStep(wfId, s.id, { status: 'failed', summary: `${s.title} was interrupted. Tap "Try again".`, finishedAt: nowIso() });
        s.status = 'failed';
      }
    }
    const of = (k: StepKind) => steps.filter(s => s.kind === k);
    const start = (s: StepRow) => track(runStep(wfId, s.id));
    const allTerminal = (xs: StepRow[]) => xs.every(s => TERMINAL.has(s.status));
    const allDoneish = (xs: StepRow[]) => xs.every(s => DONEISH.has(s.status));

    of('research').filter(s => s.status === 'pending').forEach(start);
    of('documents').filter(s => s.status === 'pending').forEach(start);
    const researchDone = allTerminal(of('research'));
    const docsDone = allDoneish(of('documents'));
    const fills = of('fill').filter(s => s.status !== 'skipped');
    if (researchDone && docsDone) fills.filter(s => s.status === 'pending').forEach(start);
    const fillDone = fills.length > 0 && allDoneish(fills);
    if (fillDone) of('sign').filter(s => s.status === 'pending').forEach(start);
    if (allDoneish(of('sign'))) of('submit').filter(s => s.status === 'pending').forEach(start);
    const submitDone = allDoneish(of('submit'));
    if (submitDone && researchDone) {
      of('call').filter(s => s.status === 'pending').forEach(start);
      of('notify').filter(s => s.status === 'pending').forEach(start);
    }
    if (allTerminal(of('notify')) && submitDone) of('follow_up').filter(s => s.status === 'pending').forEach(start);
  }

  function stepOf(lw: LoadedWorkflow, stepId: string): StepRow {
    const s = lw.steps.find(x => x.id === stepId);
    if (!s) throw new WorkflowError(404, 'Step not found');
    return s;
  }

  return {
    bus,
    /** Resolves when all background work has settled (tests). */
    async idle(): Promise<void> {
      while (background.size) await Promise.allSettled([...background]);
    },

    async create(input: { userId: string; householdId: string; programs: ApplicationProgram[]; chatSessionId?: string | null; target?: FillTarget }): Promise<Workflow> {
      const id = randomUUID();
      const now = nowIso();
      const wf: WorkflowRow = {
        id, userId: input.userId, householdId: input.householdId, programs: input.programs, status: 'researching',
        liveViewUrl: null, chatSessionId: input.chatSessionId ?? null, createdAt: now, updatedAt: now,
      };
      await deps.repo.createWorkflow(wf, buildSteps(id, input.programs, input.target ?? 'mock'));
      track(advance(id));
      return toWorkflow(await load(id));
    },

    async get(id: string, userId: string): Promise<Workflow> {
      const lw = await deps.repo.getWorkflow(id);
      if (!lw || lw.wf.userId !== userId) throw new WorkflowError(404, 'Workflow not found');
      return toWorkflow(lw);
    },

    async assertOwner(id: string, userId: string): Promise<LoadedWorkflow> {
      const lw = await deps.repo.getWorkflow(id);
      if (!lw || lw.wf.userId !== userId) throw new WorkflowError(404, 'Workflow not found');
      return lw;
    },

    async approve(id: string, userId: string, stepId: string, decision: 'approve' | 'decline'): Promise<Workflow> {
      const lw = await this.assertOwner(id, userId);
      const s = stepOf(lw, stepId);
      if (s.status !== 'waiting_on_you') throw new WorkflowError(409, 'That step is not waiting on you');
      if (decision === 'decline') {
        if (s.kind === 'sign' || s.kind === 'documents') throw new WorkflowError(400, 'This step cannot be declined; upload or sign to continue');
        await patchStep(id, stepId, { status: 'skipped', summary: 'You chose to skip this.', finishedAt: nowIso(), meta: { ...s.meta, asks: [] } });
        track(advance(id));
        return toWorkflow(await load(id));
      }
      const flag = s.kind === 'sign' ? 'signed' : s.kind === 'documents' ? 'continueWithout' : 'approved';
      await deps.repo.updateStep(stepId, { status: 'pending', meta: { ...s.meta, [flag]: true, asks: [] } });
      track(runStep(id, stepId));
      return publish(id);
    },

    async run(id: string, userId: string, stepId: string): Promise<Workflow> {
      const lw = await this.assertOwner(id, userId);
      const s = stepOf(lw, stepId);
      if (running.has(stepId) || s.status === 'running') throw new WorkflowError(409, 'That step is already running');
      if (s.status === 'done' && s.kind !== 'research') throw new WorkflowError(409, 'That step is already done');
      if (s.status === 'skipped' && s.meta.applyUrl) throw new WorkflowError(400, 'Apply for this program on its own website');
      if (s.kind === 'research') await deps.repo.clearEvidence(stepId);
      await deps.repo.updateStep(stepId, { status: 'pending', finishedAt: null });
      track(runStep(id, stepId));
      return publish(id);
    },

    async upload(id: string, userId: string, file: UploadInput): Promise<Workflow> {
      const lw = await this.assertOwner(id, userId);
      const household = await deps.households.get(lw.wf.householdId);
      if (!household) throw new WorkflowError(404, 'Household not found');
      const doc = await deps.docs.store(household.id, household.orgId, file.buffer, file.contentType, file.docType);
      try { await deps.log(household.id, { type: 'DocReceived', value: file.docType }); }
      catch (err) { console.error('[workflow] keewano log failed:', errMsg(err)); }
      const docsStep = lw.steps.find(s => s.kind === 'documents');
      // Read the document in the background, then refresh the document evidence with what was read.
      track((async () => {
        const extracted = await deps.docs.extract(doc.id).catch(() => null);
        if (extracted && docsStep) {
          await deps.repo.addEvidence({
            id: randomUUID(), stepId: docsStep.id, kind: 'document', title: `Aid read your ${file.docType.replace('_', ' ')}`,
            url: null, detail: Object.entries(extracted).filter(([, v]) => v !== null && typeof v !== 'object').slice(0, 6)
              .map(([k, v]) => `${k}: ${String(v)}`).join(', ') || null, source: `vault:${doc.id}`, at: nowIso(),
          });
          await publish(id);
        }
      })());
      if (docsStep && (docsStep.status === 'waiting_on_you' || docsStep.status === 'pending' || docsStep.status === 'failed')) {
        await deps.repo.updateStep(docsStep.id, { status: 'pending' });
        await runStep(id, docsStep.id);
      }
      return publish(id);
    },

    advance,
    publish,
  };
}

export type Engine = ReturnType<typeof createEngine>;
