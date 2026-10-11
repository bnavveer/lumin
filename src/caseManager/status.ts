// Deterministic case summary for STATUS / DOCS (no LLM).
import type { Household, Program } from '../contracts.js';
import { checkEligibility } from '../eligibility.js';
import { PROGRAM_LABEL } from './approvals.js';
import type { ConversationDeps } from './deps.js';

export function likelyPrograms(h: Household | undefined, screened: boolean): Program[] {
  if (!h || !screened) return [];
  return checkEligibility(h).filter((m) => m.status === 'likely').map((m) => m.program);
}

const fmtDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });

export async function statusText(deps: ConversationDeps, h: Household, screened: boolean): Promise<string> {
  const timeline = await deps.repo.getTimeline(h.id);
  const parts: string[] = [];
  const submitted = timeline.filter((t) => /submitted/i.test(t.label));
  if (submitted.length) parts.push(`Submitted: ${submitted.map((t) => t.label.replace(/^.*submitted:?\s*/i, '') || 'application').join(', ')}.`);
  const interview = [...timeline].reverse().find((t) => /interview/i.test(t.label));
  if (interview) parts.push(`Interview: ${interview.label} (${fmtDay(interview.at)}).`);
  const programs = likelyPrograms(h, screened);
  if (!submitted.length && programs.length) parts.push(`You likely qualify for ${programs.map((p) => PROGRAM_LABEL[p] ?? p).join(', ')}.`);
  if (!screened) parts.push('We still need a few answers to check what you qualify for.');
  try {
    if (programs.length) parts.push(await deps.vaultSummary(h.id, programs));
  } catch (err) {
    console.error('[conversation] vault summary failed:', err instanceof Error ? err.message : err);
  }
  const pending = await deps.repo.latestPendingApproval(h.id);
  if (pending) parts.push(`Waiting on your OK: ${pending.description} Reply YES or NO.`);
  return parts.length ? parts.join(' ') : 'Your case is open. Nothing new yet. I will text you when anything changes.';
}

export async function docsText(deps: ConversationDeps, h: Household, screened: boolean): Promise<string> {
  const programs = likelyPrograms(h, screened);
  const summary = await deps.vaultSummary(h.id, programs.length ? programs : undefined);
  return `${summary} Send a photo of any document right here.`;
}
