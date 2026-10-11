import { keewanoSql } from './keewano.js';
import { getTimeSavedMetrics } from './metrics.js';
import { getAutopilotState } from './autopilot.js';
import { createDevinSession, devinSessionUrl, getDevinSession } from './devin.js';

const MAX_Q = 500;
const MAX_SNAPSHOT_BYTES = 28_000;

export interface DeepDiveResult {
  status: string; done: boolean; answer?: string; evidence?: string[]; followUps?: string[]; url: string;
}

const COUNTED = ['Screened', 'DocsRequested', 'DocReceived', 'PacketSigned', 'ApplicationSubmitted', 'InterviewScheduled',
  'InterviewConfirmed', 'CallPlaced', 'Approved', 'NudgeSent', 'UserReplied', 'EscalatedToHuman'];
const QUERIES: Record<string, string> = {
  eventCountsBySource: `SELECT "Source" AS source, ${COUNTED.map(c => `count("${c}") AS "${c}"`).join(', ')}
    FROM events WHERE "Source" IS NOT NULL GROUP BY 1 LIMIT 20`,
  householdsBySource: `SELECT "Source" AS source, count(DISTINCT user_id) AS households
    FROM events WHERE "Source" IS NOT NULL GROUP BY 1 LIMIT 20`,
};

async function safe(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (err) {
    return { unavailable: err instanceof Error ? err.message.slice(0, 200) : 'error' };
  }
}

export async function buildSnapshot(): Promise<string> {
  const entries = await Promise.all([
    ...Object.entries(QUERIES).map(async ([k, sql]) => [k, await safe(() => keewanoSql(sql))] as const),
    safe(() => getTimeSavedMetrics()).then(v => ['timeSavedMetrics', v] as const),
    safe(() => getAutopilotState()).then(v => ['autopilot', v] as const),
  ]);
  let json = JSON.stringify(Object.fromEntries(entries), (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
  if (json.length > MAX_SNAPSHOT_BYTES) json = json.slice(0, MAX_SNAPSHOT_BYTES) + '…[truncated]';
  return json;
}

export function buildPrompt(question: string, snapshot: string): string {
  return [
    'You are a data analyst for Aid, an AI caseworker for benefits clinics.',
    'Analyze ONLY the DATA SNAPSHOT below to answer the staff question. Do not modify any repository, do not browse private systems, and do not ask for credentials: none are needed.',
    'When finished, set your structured output to exactly this JSON shape: {"answer": string (3-6 sentences, concrete numbers), "evidence": string[], "followUps": string[]}.',
    '',
    `QUESTION: ${question}`,
    '',
    `DATA SNAPSHOT (JSON):\n${snapshot}`,
  ].join('\n');
}

export async function startDeepDive(question: string, _orgId: string): Promise<{ id: string; url: string }> {
  const q = question.trim();
  if (q.length < 1 || q.length > MAX_Q) throw new RangeError(`question must be 1 to ${MAX_Q} characters`);
  return createDevinSession(buildPrompt(q, await buildSnapshot()), `Aid deep dive: ${q.slice(0, 60)}`);
}

const strings = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

export async function getDeepDive(id: string): Promise<DeepDiveResult> {
  const s = await getDevinSession(id);
  const out = s.structuredOutput && typeof s.structuredOutput === 'object' ? (s.structuredOutput as Record<string, unknown>) : {};
  return {
    status: s.status,
    done: s.done,
    answer: typeof out.answer === 'string' ? out.answer : undefined,
    evidence: strings(out.evidence),
    followUps: strings(out.followUps),
    url: s.url || devinSessionUrl(id),
  };
}
