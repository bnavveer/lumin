import { randomUUID } from 'node:crypto';
import type { ApplicationProgram, ApplicationScreening } from '../../shared/chat.js';
import type { Workflow, WorkflowStep, WorkflowSummary, NextStep } from '../../shared/workflow.js';
import type { DocType } from '../contracts.js';

export const PROGRAMS: ApplicationProgram[] = ['calfresh', 'medi_cal', 'calworks', 'general_relief', 'cfap', 'section8', 'pge_care', 'pge_fera', 'wic', 'california_lifeline', 'liheap', 'ihss', 'child_care'];
export const DOC_TYPES: DocType[] = ['id', 'paystub', 'lease', 'ssn_card', 'birth_cert', 'immigration', 'other'];
export interface ApplicantDocument {
  id: string; workflowId: string | null; docType: DocType; fileName: string; contentType: string;
  sizeBytes: number; status: 'received'; createdAt: string;
}
export interface StoredDocument extends ApplicantDocument { userId: string; storagePath: string }
export interface StoredWorkflow { userId: string; workflow: Workflow; version: number }

export function summary(w: Workflow): WorkflowSummary {
  return { id: w.id, programs: w.programs, status: w.status, updatedAt: w.updatedAt,
    progress: { done: w.steps.filter(s => s.status === 'done').length, total: w.steps.length }, nextStep: w.nextSteps[0] ?? null };
}

export function newWorkflow(householdId: string | null, programs: ApplicationProgram[], screening: ApplicationScreening, at: string): Workflow {
  const step = (kind: WorkflowStep['kind'], title: string, text: string, program: ApplicationProgram | null = null): WorkflowStep => ({
    id: randomUUID(), kind, program, title, summary: text, status: 'pending', evidence: [], startedAt: null, finishedAt: null,
  });
  const w: Workflow = { id: randomUUID(), householdId, programs, status: 'researching', createdAt: at, updatedAt: at, liveViewUrl: null,
    steps: [step('research', 'Check your program options', 'Preliminary screening from your answers.'),
      step('documents', 'Gather documents for your application', 'Saved files have not been verified or sent to an agency.'),
      step('fill', 'Review the official application route', 'Lumin can organize your information. Automated agency form filling is not available.'),
      ...programs.flatMap(p => [step('sign', 'Sign with the agency', 'Only the applicant can complete the agency’s required signature and declarations.', p),
        step('submit', 'Submit on the official site', 'Lumin has not submitted an application and cannot verify a receipt from this site.', p)])], nextSteps: [] };
  applyResearch(w, screening, at);
  return w;
}

export function applyResearch(w: Workflow, screening: ApplicationScreening, at: string): void {
  const s = w.steps.find(s => s.kind === 'research')!;
  const matches = screening.matches.filter(m => w.programs.includes(m.program));
  s.startedAt = at;
  s.evidence = matches.map(m => ({ id: randomUUID(), kind: 'citation', title: m.name, url: m.sourceUrl,
    detail: `${m.reason} Checked rules: ${m.rulesCheckedAt}.`, source: 'Lumin preliminary application screening', at }));
  const unknown = matches.filter(m => m.status === 'needs_info' && m.missingFields.length > 0);
  if (unknown.length) {
    s.status = 'waiting_on_you'; s.finishedAt = null;
    s.summary = [...new Set(unknown.flatMap(m => m.followUpQuestions))].join(' ');
    w.status = 'needs_attention';
    w.nextSteps = [{ id: s.id, title: 'Complete your household answers', detail: 'Missing information prevents a useful screening. Confirm your chat by text and verify your account phone to link it, or save your own screening answers.', actor: 'you', action: { type: 'chat', label: 'Continue chat', url: null, stepId: s.id } }];
  } else {
    s.status = 'done'; s.finishedAt = at;
    s.summary = 'Program routes checked against your stated answers. Each agency decides eligibility; no application has been submitted.';
    w.status = 'needs_documents';
    w.nextSteps = [{ id: w.steps.find(s => s.kind === 'documents')!.id, title: 'Gather your documents', detail: 'Save documents you want to keep for your application. Follow the agency’s checklist.', actor: 'you', action: { type: 'upload', label: 'Upload a document', url: null, stepId: w.steps.find(s => s.kind === 'documents')!.id, docType: 'id' } }];
  }
  w.updatedAt = at;
}

export function requiredDocuments(programs: ApplicationProgram[]): DocType[] {
  const required: Partial<Record<ApplicationProgram, DocType[]>> = {
    calfresh: ['id', 'paystub', 'lease'], medi_cal: ['id', 'paystub'], calworks: ['id', 'paystub', 'birth_cert'],
  };
  return [...new Set(programs.flatMap(p => required[p] ?? []))];
}

export function applyDocuments(w: Workflow, docs: ApplicantDocument[], at: string): void {
  const step = w.steps.find(s => s.kind === 'documents')!;
  // A vault upload is evidence of possession only. It does not establish correctness or agency acceptance.
  step.evidence = docs.map(d => ({ id: d.id, kind: 'document', title: d.fileName, url: null,
    detail: `${d.docType}: stored privately; not verified or submitted.`, source: 'Applicant document vault', at: d.createdAt }));
  if (w.steps.find(s => s.kind === 'research')!.status !== 'done') return;
  const missing = requiredDocuments(w.programs).filter(t => !docs.some(d => d.docType === t));
  step.startedAt ??= at;
  if (missing.length) {
    step.status = 'waiting_on_you'; step.finishedAt = null;
    step.summary = `Preparation checklist: ${missing.join(', ')}. Agencies may request different evidence; you can start an application with the agency before providing every document.`;
    w.status = 'needs_documents';
    w.nextSteps = missing.map(t => ({ id: `${step.id}:${t}`, title: `Save ${t.replaceAll('_', ' ')}`, detail: 'Keep a private copy for your application; the agency reviews it.', actor: 'you', action: { type: 'upload', label: 'Upload document', url: null, stepId: step.id, docType: t } }));
  } else {
    step.status = 'done'; step.finishedAt = at;
    step.summary = 'Your preparation checklist is available. Documents have not been verified or transmitted; consult the official application for current requirements.';
    w.status = 'ready_to_fill';
    const review = w.steps.find(s => s.kind === 'fill')!;
    review.status = 'waiting_on_you';
    w.nextSteps = [{ id: review.id, title: 'Review the agency application route', detail: 'Review your answers and documents. You will complete, sign and submit the application on the official site.', actor: 'you', action: { type: 'approve', label: 'Review application route', url: null, stepId: review.id } }];
  }
  w.updatedAt = at;
}

export function officialHandoff(w: Workflow, screening: ApplicationScreening, at: string): void {
  const review = w.steps.find(s => s.kind === 'fill')!;
  review.status = 'done'; review.startedAt ??= at; review.finishedAt = at;
  review.summary = 'You approved the official application handoff. Lumin has not filled, signed or submitted an agency application. Complete these actions on the official site.';
  w.status = 'awaiting_signature';
  w.nextSteps = w.programs.map((p): NextStep => {
    const m = screening.matches.find(m => m.program === p)!;
    const sign = w.steps.find(s => s.kind === 'sign' && s.program === p)!;
    sign.status = 'waiting_on_you';
    return { id: sign.id, title: `Continue ${m.name} with the agency`, detail: m.nextStep + ' Complete any required signature there. Lumin cannot verify submission or approval.', actor: 'you', action: { type: 'open_url', label: 'Open official application', url: m.applicationUrl, stepId: sign.id } };
  });
  w.updatedAt = at;
}
