// Grounded Q&A over research/*.md: chunk -> embed -> pgvector search -> cited answer.
// Embeddings and answers go through the Neon AI Gateway ("knowledge" credential).
import { tool } from 'ai';
import { z } from 'zod';
import type { Context } from 'hono';
import type { Hono } from 'hono';
import { env, optionalEnv } from './env.js';
import { admin } from './supabase.js';
import { rateLimit } from './rateLimit.js';
import { requireStaff } from './auth.js';
import { clientIp } from './clientIp.js';

export interface Chunk {
  heading: string;
  content: string;
  sourceUrls: string[];
}
export interface KnowledgeHit {
  id: number;
  source_file: string;
  heading: string;
  content: string;
  source_urls: string[];
  similarity: number;
}
export interface Citation {
  file: string;
  heading: string;
  urls: string[];
}
export interface KnowledgeAnswer {
  answer: string;
  citations: Citation[];
  source: 'research' | 'web';
}

export const EMBED_MODEL = 'qwen3-embedding-0-6b';
export const EMBED_DIM = 1024;
export const CHUNK_TARGET = 1200;
export const CHUNK_OVERLAP = 150;
/** Below this best-match cosine similarity, research is treated as not covering the question. */
export const MIN_SIMILARITY = 0.3;
const NOT_COVERED = 'NOT_COVERED:';
const CALL_211 = 'I could not find that in our research. Please call 211 (free, any language) and they can help.';

// ---------- chunking (pure) ----------

const URL_RE = /https?:\/\/[^\s)\]>"'`<]+/g;

export function extractUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(URL_RE)) out.add(m[0].replace(/[.,;:*_!?]+$/, ''));
  return [...out];
}

/** Split an over-long block on line boundaries (hard-splitting very long lines). */
function packLines(lines: string[], target: number, overlap: number): string[] {
  const pieces: string[] = [];
  for (const l of lines) {
    if (l.length <= target) pieces.push(l);
    else for (let i = 0; i < l.length; i += target - overlap) pieces.push(l.slice(i, i + target));
  }
  const out: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of pieces) {
    if (len + p.length + 1 > target && cur.length) {
      out.push(cur.join('\n'));
      const tail: string[] = [];
      let t = 0;
      for (let i = cur.length - 1; i >= 0 && t + cur[i]!.length <= overlap; i--) {
        tail.unshift(cur[i]!);
        t += cur[i]!.length + 1;
      }
      cur = tail;
      len = t;
    }
    cur.push(p);
    len += p.length + 1;
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

export function chunkMarkdown(md: string, target = CHUNK_TARGET, overlap = CHUNK_OVERLAP): Chunk[] {
  const sections: Array<{ path: string; lines: string[] }> = [];
  const stack: string[] = [];
  let cur = { path: '', lines: [] as string[] };
  let fenced = false;
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const h = !fenced ? /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      sections.push(cur);
      const level = h[1]!.length;
      stack.length = level - 1;
      stack[level - 1] = h[2]!;
      cur = { path: stack.filter(Boolean).join(' > '), lines: [] };
    } else cur.lines.push(line);
  }
  sections.push(cur);

  const chunks: Chunk[] = [];
  for (const s of sections) {
    const body = s.lines.join('\n').trim();
    if (!body) continue;
    const sectionUrls = extractUrls(body);
    for (const piece of packLines(body.split("\n"), target, overlap)) {
      const content = piece.trim();
      if (content.length < 20) continue;
      const urls = extractUrls(content);
      chunks.push({ heading: s.path, content, sourceUrls: urls.length ? urls : sectionUrls });
    }
  }
  return chunks;
}

// ---------- gateway (llm.ts exports when present, else direct) ----------

interface LlmExports {
  embedTexts?: (texts: string[]) => Promise<number[][]>;
  generateWithFallback?: (
    task: 'knowledge',
    args: { system?: string; prompt: string; maxOutputTokens?: number },
  ) => Promise<{ text: string; modelId: string }>;
}
const llm = async (): Promise<LlmExports> => (await import('./llm.js')) as unknown as LlmExports;

function gateway(): { base: string; token: string } {
  return {
    base: env('NEON_AI_GATEWAY_BASE_URL'),
    token: optionalEnv('NEON_AI_TOKEN_KNOWLEDGE') ?? env('NEON_AI_GATEWAY_TOKEN'),
  };
}

export async function embed(texts: string[]): Promise<number[][]> {
  const mod = await llm();
  if (mod.embedTexts) return mod.embedTexts(texts);
  const { base, token } = gateway();
  const res = await fetch(`${base}/v1/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings failed: ${res.status}`);
  const json = (await res.json()) as { data: Array<{ index?: number; embedding: number[] }> };
  return [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding);
}

async function generate(system: string, prompt: string): Promise<string> {
  const mod = await llm();
  if (mod.generateWithFallback) return (await mod.generateWithFallback('knowledge', { system, prompt, maxOutputTokens: 500 })).text;
  const { base, token } = gateway();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);
  const json = (await res.json()) as { choices: Array<{ message: { content: string | Array<{ type?: string; text?: string }> } }> };
  const c = json.choices[0]?.message.content;
  if (typeof c === 'string') return c;
  return (c ?? []).map((b) => b.text ?? '').join('');
}

// ---------- search + answer ----------

export async function searchKnowledge(query: string, k = 6): Promise<KnowledgeHit[]> {
  const [vec] = await embed([query]);
  if (!vec) return [];
  const { data, error } = await admin().rpc('match_knowledge', { query_embedding: `[${vec.join(',')}]`, match_count: k });
  if (error) throw new Error(`knowledge search failed: ${error.message}`);
  return (data ?? []) as KnowledgeHit[];
}

export const KNOWLEDGE_SYSTEM = [
  'You answer questions for people applying for California benefits (CalFresh, Medi-Cal, WIC, Section 8, CARE, LifeLine and similar).',
  'Answer ONLY from the numbered excerpts provided. Never use outside knowledge.',
  `If the excerpts do not answer the question, begin your reply with exactly "${NOT_COVERED}" then say you could not find it and suggest calling 211.`,
  'Cite the excerpts you used like [1], [2] right after each fact.',
  'If an excerpt marks something UNCONFIRMED, say plainly that it is unconfirmed.',
  'Use plain 6th-grade language. Keep it under 120 words so it fits an SMS. Focus on California.',
].join('\n');

export function buildPrompt(question: string, hits: KnowledgeHit[], opts: { county?: string; lang?: string } = {}): string {
  const ex = hits.map((h, i) => `[${i + 1}] (${h.source_file} > ${h.heading || 'top'})\n${h.content}`).join('\n\n');
  return [
    `Excerpts:\n${ex}`,
    opts.county ? `The person lives in ${opts.county} County.` : '',
    `Reply in ${opts.lang ?? 'the same language as the question'}.`,
    `Question: ${question}`,
  ].filter(Boolean).join('\n\n');
}

async function webFallback(question: string): Promise<KnowledgeAnswer | null> {
  try {
    const mod = (await import('./webKnowledge.js' as string)) as {
      answerFromWeb?: (q: string) => Promise<{ answer: string; citations: unknown[] }>;
    };
    if (!mod.answerFromWeb) return null;
    const r = await mod.answerFromWeb(question);
    return { answer: r.answer, citations: r.citations as Citation[], source: 'web' };
  } catch {
    return null;
  }
}

export async function answerFromResearch(
  question: string,
  opts: { county?: string; lang?: string } = {},
): Promise<KnowledgeAnswer> {
  const hits = await searchKnowledge(question, 6);
  const best = hits[0]?.similarity ?? 0;
  const refusal = (): KnowledgeAnswer => ({ answer: CALL_211, citations: [], source: 'research' });
  if (hits.length === 0 || best < MIN_SIMILARITY) return (await webFallback(question)) ?? refusal();

  const raw = (await generate(KNOWLEDGE_SYSTEM, buildPrompt(question, hits, opts))).trim();
  if (raw.startsWith(NOT_COVERED)) {
    const web = await webFallback(question);
    if (web) return web;
    return { answer: raw.slice(NOT_COVERED.length).trim() || CALL_211, citations: [], source: 'research' };
  }
  const used = new Set<number>();
  for (const m of raw.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= hits.length) used.add(n);
  }
  const citations = [...used].sort((a, b) => a - b).map((n) => {
    const h = hits[n - 1]!;
    return { file: h.source_file, heading: h.heading, urls: h.source_urls };
  });
  return { answer: raw, citations, source: 'research' };
}

export const knowledgeTool = tool({
  description:
    'Look up how to apply, eligibility rules, documents to bring, or office info for California benefits in Aid\'s sourced research. Returns a short cited answer.',
  inputSchema: z.object({ question: z.string().min(1).max(400) }),
  execute: async ({ question }) => answerFromResearch(question),
});

// ---------- routes ----------

export const AskBody = z.object({
  question: z.string().trim().min(1).max(400),
  county: z.string().trim().max(60).optional(),
  lang: z.string().trim().max(30).optional(),
});

export function registerKnowledgeRoutes(app: Hono<any>): void {
  app.post('/api/knowledge/ask', rateLimit({ windowMs: 60_000, max: 20, key: (c) => `kask:${clientIp(c)}` }), async (c) => {
    const parsed = AskBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'question must be 1 to 400 characters' }, 400);
    try {
      const { question, ...opts } = parsed.data;
      return c.json(await answerFromResearch(question, opts));
    } catch (err) {
      console.error('[knowledge] ask failed:', err instanceof Error ? err.message : err);
      return c.json({ error: 'Knowledge search is unavailable right now, try again' }, 502);
    }
  });

  app.get('/api/staff/knowledge/search', requireStaff, async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 1 || q.length > 400) return c.json({ error: 'q must be 1 to 400 characters' }, 400);
    try {
      return c.json(await searchKnowledge(q, 6));
    } catch (err) {
      console.error('[knowledge] search failed:', err instanceof Error ? err.message : err);
      return c.json({ error: 'Knowledge search is unavailable right now, try again' }, 502);
    }
  });
}
