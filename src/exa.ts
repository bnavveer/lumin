// Exa live-web search (https://api.exa.ai/search) plus a tiny LLM seam shared by the web-knowledge modules.
// Verified fields: query, numResults, type, includeDomains, startPublishedDate, contents{text,highlights,summary}.
import type { z } from 'zod';
import { optionalEnv } from './env.js';

const EXA_URL = 'https://api.exa.ai/search';
const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 200;

export interface ExaOptions {
  numResults?: number;
  includeDomains?: string[];
  startPublishedDate?: string;
  /** true = full text, number = max characters. */
  text?: boolean | number;
  highlights?: boolean;
}
export interface ExaResult { title: string; url: string; publishedDate?: string; text?: string; highlights?: string[] }

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (...a) => fetch(...a);
export function setExaFetch(f?: FetchFn): void {
  fetchImpl = f ?? ((...a) => fetch(...a));
  cache.clear();
}

const cache = new Map<string, { at: number; results: ExaResult[] }>();

export function buildExaBody(query: string, opts: ExaOptions): Record<string, unknown> {
  const contents: Record<string, unknown> = {};
  if (opts.text) contents.text = typeof opts.text === 'number' ? { maxCharacters: opts.text } : true;
  if (opts.highlights) contents.highlights = true;
  return {
    query,
    numResults: opts.numResults ?? 5,
    type: 'auto',
    ...(opts.includeDomains?.length ? { includeDomains: opts.includeDomains } : {}),
    ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
    ...(Object.keys(contents).length ? { contents } : {}),
  };
}

export async function exaSearch(query: string, opts: ExaOptions = {}): Promise<ExaResult[]> {
  const key = optionalEnv('EXA_API_KEY');
  if (!key) throw new Error('[exa] EXA_API_KEY is not set');
  const body = buildExaBody(query, opts);
  const ck = JSON.stringify(body);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  let res: Response;
  try {
    res = await fetchImpl(EXA_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`[exa] request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new Error(`[exa] search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
  const results: ExaResult[] = (json.results ?? []).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    ...(typeof r.publishedDate === 'string' ? { publishedDate: r.publishedDate } : {}),
    ...(typeof r.text === 'string' ? { text: r.text } : {}),
    ...(Array.isArray(r.highlights) ? { highlights: r.highlights.map(String) } : {}),
  }));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(ck, { at: Date.now(), results });
  return results;
}

// ---- LLM seam: prefers src/llm.ts exports, falls back to the Neon gateway directly. ----
export type LlmTask = 'fast' | 'knowledge';
export interface WebLlm {
  object<T>(task: LlmTask, schema: z.ZodType<T>, prompt: string, system?: string): Promise<T>;
  text(task: LlmTask, prompt: string, system?: string): Promise<string>;
}

async function gatewayChat(task: LlmTask, prompt: string, system?: string): Promise<string> {
  const base = optionalEnv('NEON_AI_GATEWAY_BASE_URL');
  const token = task === 'fast' ? optionalEnv('NEON_AI_TOKEN_FAST') : optionalEnv('NEON_AI_TOKEN_KNOWLEDGE') ?? optionalEnv('NEON_AI_TOKEN_FAST');
  if (!base || !token) throw new Error('[exa] LLM gateway env not set');
  const res = await fetchImpl(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: task === 'fast' ? 'gemini-3-5-flash-lite' : 'claude-sonnet-5',
      max_tokens: 800,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`[exa] llm ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return j.choices?.[0]?.message?.content ?? '';
}

type LlmMod = {
  generateWithFallback?: (t: LlmTask, o: { system?: string; prompt: string; maxOutputTokens?: number }) => Promise<{ text: string }>;
  generateObjectWithFallback?: (t: LlmTask, s: unknown, o: { system?: string; prompt: string }) => Promise<{ object: unknown }>;
};

const defaultLlm: WebLlm = {
  async object(task, schema, prompt, system) {
    const mod = (await import('./llm.js')) as LlmMod;
    if (mod.generateObjectWithFallback) {
      return schema.parse((await mod.generateObjectWithFallback(task, schema, { system, prompt })).object);
    }
    const raw = await gatewayChat(task, `${prompt}\n\nReply with ONLY a JSON object, no prose, no code fences.`, system);
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) throw new Error('[exa] llm returned no JSON');
    return schema.parse(JSON.parse(m[0]));
  },
  async text(task, prompt, system) {
    const mod = (await import('./llm.js')) as LlmMod;
    if (mod.generateWithFallback) return (await mod.generateWithFallback(task, { system, prompt, maxOutputTokens: 400 })).text;
    return gatewayChat(task, prompt, system);
  },
};

let llm: WebLlm = defaultLlm;
export function setWebLlm(l?: WebLlm): void { llm = l ?? defaultLlm; }
export const webLlm: WebLlm = {
  object: (t, s, p, sys) => llm.object(t, s, p, sys),
  text: (t, p, sys) => llm.text(t, p, sys),
};
