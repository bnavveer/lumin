// Cross-provider fallback: try the task's primary model, then each fallback, on any error.
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { candidateIds, modelFor, type AiTask } from './routes.js';

type TextArgs = Omit<Parameters<typeof generateText>[0], 'model'> & { householdId?: string };
type ObjArgs = Omit<Parameters<typeof generateText>[0], 'model' | 'tools'> & { householdId?: string };

export interface LlmDeps {
  generateText: (a: Record<string, unknown>) => Promise<{ text: string }>;
  generateObject: (a: Record<string, unknown>) => Promise<{ object: unknown }>;
  getModel: typeof modelFor;
  logEvent: (householdId: string, e: { type: 'AgentToolCalled'; value: string }) => Promise<unknown>;
}
const real = (): LlmDeps => ({
  generateText: generateText as unknown as LlmDeps['generateText'],
  generateObject: generateObject as unknown as LlmDeps['generateObject'],
  getModel: modelFor,
  logEvent: async (h, e) => (await import('../keewano.js')).logEvent(h, e),
});
let deps: LlmDeps = real();
/** Test seam: inject fake generate functions / model factory; no args restores defaults. */
export function setLlmDeps(d?: Partial<LlmDeps>): void { deps = d ? { ...real(), ...d } : real(); }

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 160);

async function noteFallback(task: AiTask, from: string, to: string, hid?: string): Promise<void> {
  console.error(`[llm] ${task} fell back from ${from} to ${to}`);
  if (!hid) return;
  try { await deps.logEvent(hid, { type: 'AgentToolCalled', value: `llm_fallback:${task}` }); }
  catch (err) { console.error('[llm] keewano log failed:', msg(err)); }
}

async function firstSuccess<T>(task: AiTask, hid: string | undefined, run: (id: string) => Promise<T>): Promise<T & { modelId: string }> {
  const ids = candidateIds(task);
  let last: unknown;
  for (let i = 0; i < ids.length; i++) {
    try { return { ...(await run(ids[i]!)), modelId: ids[i]! }; }
    catch (err) {
      last = err;
      console.error(`[llm] ${task} ${ids[i]} failed: ${msg(err)}`);
      if (i + 1 < ids.length) await noteFallback(task, ids[i]!, ids[i + 1]!, hid);
    }
  }
  throw new Error(`[llm] ${task}: all models failed (${ids.join(', ')}): ${msg(last)}`);
}

export async function generateWithFallback(task: AiTask, args: TextArgs): Promise<{ text: string; modelId: string }> {
  const { householdId, ...rest } = args;
  return firstSuccess(task, householdId, async (id) => {
    const r = await deps.generateText({ ...rest, model: deps.getModel(task, id) });
    return { text: r.text };
  });
}

/** Parse the first JSON object out of free text (models sometimes add prose or fences). */
export function parseJsonObject(text: string): unknown {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('no JSON object in model output');
  return JSON.parse(text.slice(s, e + 1));
}

/** claude-opus-5-5 rejects forced tool_choice, so it goes through generateText + zod parse. */
const rejectsForcedTools = (id: string): boolean => id.startsWith('claude-opus-5');

export async function generateObjectWithFallback<S extends z.ZodType>(
  task: AiTask, schema: S, args: ObjArgs,
): Promise<{ object: z.infer<S>; modelId: string }> {
  const { householdId, ...rest } = args;
  return firstSuccess(task, householdId, async (id) => {
    const m = deps.getModel(task, id);
    if (!rejectsForcedTools(id)) {
      try { return { object: (await deps.generateObject({ ...rest, model: m, schema })).object as z.infer<S> }; }
      catch (err) { console.error(`[llm] generateObject failed on ${id}, retrying as JSON text: ${msg(err)}`); }
    }
    const jsonRule = `Respond with ONLY a JSON object (no prose, no code fences) matching this JSON schema: ${JSON.stringify(z.toJSONSchema(schema))}`;
    const withRule = rest.messages
      ? { messages: [...rest.messages, { role: 'user', content: jsonRule }] }
      : { prompt: `${rest.prompt ?? ''}\n\n${jsonRule}` };
    const { text } = await deps.generateText({ ...rest, ...withRule, model: m });
    return { object: schema.parse(parseJsonObject(text)) as z.infer<S> };
  });
}
