// Call scripts: what Aid asks the county on the phone. buildInstruction is pure (tested); suggest uses the LLM.
import { z } from 'zod';
import type { CallPurposeKey, CallScript } from '../../shared/calls.js';
import type { Household } from '../contracts.js';

export type { CallScript } from '../../shared/calls.js';

export const MAX_QUESTIONS = 8;

export const ScriptSchema = z.object({
  goal: z.string().trim().min(1).max(300),
  questions: z.array(z.string().trim().min(1).max(300)).min(1).max(MAX_QUESTIONS),
  context: z.string().trim().max(1500).default(''),
});

/** Removes anything that looks like an SSN, DOB-ish long digit run, or card number. */
export function scrubSensitive(s: string): string {
  return s
    .replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, '[redacted]')
    .replace(/\b\d{9,}\b/g, '[redacted]');
}

const PURPOSE_GOAL: Record<CallPurposeKey, string> = {
  confirm_interview: 'Confirm the date, time and format of the eligibility interview',
  reschedule_interview: 'Reschedule the eligibility interview to a better time',
  ask_missing_docs: 'Find out exactly which documents are still missing and how to send them',
  ask_denial_reason: 'Find out why the application was denied and how to appeal or reapply',
  check_status: 'Check the status of the application and what happens next',
  waitlist: 'Find out whether the housing waitlist is open and how to get on it',
  custom: 'Ask the county the questions below',
};

const PURPOSE_QUESTIONS: Record<CallPurposeKey, string[]> = {
  confirm_interview: ['What date and time is the eligibility interview?', 'Is the interview by phone or in person?', 'What documents should they have ready for the interview?'],
  reschedule_interview: ['What other interview times are available this week or next?', 'Can you move the interview to the earliest available slot?', 'Will a confirmation letter be sent for the new time?'],
  ask_missing_docs: ['Which documents are still missing from the application?', 'What is the deadline to send them?', 'Can they be uploaded on BenefitsCal, or do they need to be mailed or dropped off?'],
  ask_denial_reason: ['What was the reason for the denial?', 'What is the deadline to request a fair hearing?', 'Would sending any documents change the decision?'],
  check_status: ['What is the current status of the application?', 'Is anything still needed from the applicant?', 'When should they expect a decision?'],
  waitlist: ['Is the Section 8 housing choice voucher waitlist open right now?', 'How does someone get on the waitlist?', 'When is the next opening expected?'],
  custom: ['What is the current status of the application?'],
};

/** Deterministic fallback when the LLM is unavailable. */
export function defaultScript(purpose: CallPurposeKey, context = ''): CallScript {
  return { goal: PURPOSE_GOAL[purpose], questions: [...PURPOSE_QUESTIONS[purpose]], context: scrubSensitive(context) };
}

/**
 * The instruction for Dial's voice agent. It discloses up front that it is an automated assistant,
 * asks each question in order, confirms answers back, never shares SSNs, and never invents facts.
 */
export function buildInstruction(script: CallScript, household: Pick<Household, 'firstName'>): string {
  const name = (household.firstName ?? '').replace(/[^\p{L}\p{M}' -]/gu, '').trim().slice(0, 40) || 'the applicant';
  const qs = script.questions.map((q, i) => `${i + 1}. ${scrubSensitive(q.trim())}`).join('\n');
  return scrubSensitive([
    `You are Aid, an automated assistant calling the county benefits office on behalf of ${name}, with their permission.`,
    `Start the call by saying: "Hi, this is Aid, an automated assistant calling on behalf of ${name}, with their permission."`,
    `Goal of this call: ${script.goal.trim()}`,
    script.context.trim() ? `Background you may use (do not read it out unless asked): ${script.context.trim()}` : '',
    'Ask EACH of these questions in order, one at a time. After each question, wait for the full answer before moving on:',
    qs,
    'After each answer, briefly confirm it back ("Just to confirm, ...") so it is recorded correctly.',
    'If they ask for identifying information, you may give the first name only. Never share a Social Security number, date of birth or full address, and never make up facts, dates or case numbers. If you do not know something, say you will have the applicant follow up.',
    'When every question is answered (or they cannot help), thank them politely, say goodbye and end the call.',
  ].filter(Boolean).join('\n'));
}

export const SuggestOut = z.object({
  goal: z.string().min(1).max(300),
  questions: z.array(z.string().min(1).max(300)).min(3).max(6),
});

export interface SuggestInput {
  purpose: CallPurposeKey;
  programs: string[];
  county: string;
  firstName: string | null;
  /** Research step summaries / gaps and any email facts. */
  notes: string[];
}

export function suggestPrompt(i: SuggestInput): { system: string; prompt: string } {
  return {
    system: 'You write phone scripts for an automated assistant calling a California county benefits office for an applicant. Write 3 to 6 short, specific questions a county worker can answer on the phone, in the order they should be asked. Use the purpose and notes; mention specific programs and documents when known. Never ask for or include SSNs, dates of birth or case numbers you were not given. goal: one sentence.',
    prompt: scrubSensitive([
      `Purpose: ${i.purpose} (${PURPOSE_GOAL[i.purpose]})`,
      `Programs: ${i.programs.join(', ') || 'unknown'}`,
      `County: ${i.county}`,
      `Applicant first name: ${i.firstName ?? 'unknown'}`,
      `Notes:\n${i.notes.map(n => `- ${n.slice(0, 600)}`).join('\n') || '- none'}`,
    ].join('\n')),
  };
}
