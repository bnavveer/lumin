// Pure derivations: workflow status, next steps, and the wire shapes. No I/O.
import type {
  NextStep, StepStatus, Workflow, WorkflowStatus, WorkflowSummary,
} from '../../shared/workflow.js';
import type { LoadedWorkflow, StepRow } from './store.js';

export const TERMINAL: ReadonlySet<StepStatus> = new Set(['done', 'skipped', 'failed']);
export const DONEISH: ReadonlySet<StepStatus> = new Set(['done', 'skipped']);

/** A request for the person, stored on a waiting step (meta.asks). */
export interface Ask {
  title: string;
  detail: string;
  action: NonNullable<NextStep['action']>;
}

const kindOf = (steps: StepRow[], kind: StepRow['kind']) => steps.filter(s => s.kind === kind);
const any = (steps: StepRow[], st: StepStatus) => steps.some(s => s.status === st);

export function deriveStatus(steps: StepRow[]): WorkflowStatus {
  if (any(steps, 'failed')) return 'needs_attention';
  const research = kindOf(steps, 'research');
  const docs = kindOf(steps, 'documents');
  const fill = kindOf(steps, 'fill').filter(s => s.status !== 'skipped');
  const sign = kindOf(steps, 'sign');
  const submit = kindOf(steps, 'submit');
  const followUp = kindOf(steps, 'follow_up');

  if (submit.length && submit.every(s => TERMINAL.has(s.status))) {
    if (steps.every(s => TERMINAL.has(s.status))) return 'done';
    if (followUp.some(s => s.status === 'done')) return 'following_up';
    return submit.some(s => s.status === 'done') ? 'submitted' : 'following_up';
  }
  if (any(sign, 'waiting_on_you')) return 'awaiting_signature';
  if (any(fill, 'running')) return 'filling';
  if (any(docs, 'waiting_on_you')) return 'needs_documents';
  if (research.some(s => !TERMINAL.has(s.status))) return 'researching';
  if (docs.every(s => DONEISH.has(s.status)) && fill.some(s => s.status === 'pending')) return 'ready_to_fill';
  if (fill.some(s => s.status === 'done')) return 'awaiting_signature';
  return 'researching';
}

function asksOf(s: StepRow): Ask[] {
  const raw = s.meta.asks;
  return Array.isArray(raw) ? (raw as Ask[]) : [];
}

export function deriveNextSteps(lw: LoadedWorkflow): NextStep[] {
  const { steps, wf } = lw;
  const you: NextStep[] = [];
  const aid: NextStep[] = [];
  const county: NextStep[] = [];

  for (const s of steps) {
    if (s.status === 'waiting_on_you') {
      const asks = asksOf(s);
      if (asks.length) asks.forEach((a, i) => you.push({ id: `${s.id}:${i}`, actor: 'you', ...a }));
      else you.push({
        id: `${s.id}:0`, actor: 'you', title: s.title, detail: s.summary,
        action: { type: 'approve', label: 'Approve', url: null, stepId: s.id },
      });
    } else if (s.status === 'failed') {
      you.push({
        id: `${s.id}:retry`, actor: 'you', title: `Retry: ${s.title}`, detail: s.summary,
        action: { type: 'run', label: 'Try again', url: null, stepId: s.id },
      });
    }
  }
  for (const s of steps) {
    if (s.status === 'skipped' && typeof s.meta.applyUrl === 'string') {
      you.push({
        id: `${s.id}:apply`, actor: 'you', title: s.title, detail: s.summary,
        action: { type: 'open_url', label: 'Open application', url: s.meta.applyUrl, stepId: s.id },
      });
    }
  }
  for (const s of steps) {
    if (s.status !== 'running') continue;
    const live = s.kind === 'fill' && wf.liveViewUrl;
    aid.push({
      id: `${s.id}:running`, actor: 'aid', title: s.title, detail: lastLine(s.summary),
      action: live ? { type: 'open_url', label: 'Watch live', url: wf.liveViewUrl, stepId: s.id } : null,
    });
  }
  const submitted = steps.find(s => s.kind === 'submit' && s.status === 'done');
  if (submitted) {
    county.push({
      id: `${submitted.id}:county`, actor: 'county', title: 'County reviews your application',
      detail: 'The county usually calls for an interview within about 10 days. Lumin will remind you.',
      action: null,
    });
  }
  return [...you, ...aid, ...county];
}

const lastLine = (s: string): string => s.split('\n').filter(Boolean).at(-1) ?? '';

export function toWorkflow(lw: LoadedWorkflow): Workflow {
  const { wf, steps, evidence } = lw;
  return {
    id: wf.id,
    householdId: wf.householdId,
    programs: wf.programs,
    status: deriveStatus(steps),
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
    steps: steps.map(s => ({
      id: s.id, kind: s.kind, program: s.program, title: s.title, status: s.status, summary: s.summary,
      evidence: evidence.filter(e => e.stepId === s.id).map(({ stepId: _s, ...e }) => e),
      startedAt: s.startedAt, finishedAt: s.finishedAt,
    })),
    nextSteps: deriveNextSteps(lw),
    liveViewUrl: wf.liveViewUrl,
  };
}

export function toSummary(lw: LoadedWorkflow): WorkflowSummary {
  const counted = lw.steps.filter(s => s.status !== 'skipped');
  return {
    id: lw.wf.id,
    programs: lw.wf.programs,
    status: deriveStatus(lw.steps),
    updatedAt: lw.wf.updatedAt,
    progress: { done: counted.filter(s => s.status === 'done').length, total: counted.length },
    nextStep: deriveNextSteps(lw)[0] ?? null,
  };
}
