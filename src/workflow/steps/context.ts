import type { Evidence, StepStatus } from '../../../shared/workflow.js';
import type { CaseEvent, Household } from '../../contracts.js';
import type { WorkflowDeps } from '../deps.js';
import type { AccountRow, StepMeta, StepRow, WorkflowRow } from '../store.js';

export type NewEvidence = Omit<Evidence, 'id' | 'at'>;

export interface StepCtx {
  deps: WorkflowDeps;
  wf: WorkflowRow;
  step: StepRow;
  steps: StepRow[];
  household: Household;
  account: AccountRow | undefined;
  /** Persist an intermediate summary / meta and push an SSE update. */
  progress(summary: string, meta?: StepMeta): Promise<void>;
  evidence(e: NewEvidence): Promise<void>;
  setLiveView(url: string | null): Promise<void>;
  /** Keewano event; failures are logged, never thrown. */
  log(e: CaseEvent): Promise<void>;
}

export interface StepOutcome {
  status: StepStatus;
  summary: string;
  meta?: StepMeta;
}

export type StepFn = (ctx: StepCtx) => Promise<StepOutcome>;

export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const httpUrl = (u: string | null | undefined): string | null => (u && /^https?:\/\//i.test(u) ? u : null);
export const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
