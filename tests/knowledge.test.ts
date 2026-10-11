import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

const rpc = vi.fn();
vi.mock('../src/supabase.js', () => ({ admin: () => ({ rpc }), DEMO_ORG_ID: 'demo' }));
vi.mock('../src/llm.js', () => ({ embedTexts: undefined, generateWithFallback: undefined }));

const answerFromWeb = vi.fn();
vi.mock('../src/webKnowledge.js', () => ({ answerFromWeb, registerWebKnowledgeRoutes: () => {} }));

import { answerFromResearch, chunkMarkdown, extractUrls, registerKnowledgeRoutes } from '../src/knowledge.js';

const hit = (n: number, sim = 0.7) => ({
  id: n, source_file: `f${n}.md`, heading: `H${n} > Sub`, content: `content ${n}`, source_urls: [`https://x.gov/${n}`], similarity: sim,
});

let chat: string;
beforeEach(() => {
  process.env.NEON_AI_GATEWAY_BASE_URL = 'http://gw.test';
  process.env.NEON_AI_TOKEN_KNOWLEDGE = 'tok';
  chat = 'Bring your ID [2].';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/v1/embeddings')) return new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }));
    return new Response(JSON.stringify({ choices: [{ message: { content: [{ type: 'text', text: chat }] } }] }));
  }));
  rpc.mockReset();
  answerFromWeb.mockReset();
  answerFromWeb.mockRejectedValue(new Error('no web'));
});
afterEach(() => vi.unstubAllGlobals());

describe('chunking', () => {
  const md = '# WIC\nintro text that is long enough to keep\n## Bring\n- ID: see [site](https://wic.ca.gov/a). Also https://b.org/x, ok\n### Deep\nDeep body text goes here for a while.\n## Next\nfinal section body text is here';
  it('keeps the heading path', () => {
    const c = chunkMarkdown(md);
    expect(c.map((x) => x.heading)).toEqual(['WIC', 'WIC > Bring', 'WIC > Bring > Deep', 'WIC > Next']);
  });
  it('extracts URLs without trailing punctuation', () => {
    expect(extractUrls('see (https://wic.ca.gov/a). and https://b.org/x, ok')).toEqual(['https://wic.ca.gov/a', 'https://b.org/x']);
    expect(chunkMarkdown(md)[1]!.sourceUrls).toEqual(['https://wic.ca.gov/a', 'https://b.org/x']);
  });
  it('splits long sections with overlap, each chunk within target', () => {
    const body = Array.from({ length: 40 }, (_, i) => `line number ${i} with some filler text`).join('\n');
    const c = chunkMarkdown(`# T\n${body}`, 300, 60);
    expect(c.length).toBeGreaterThan(3);
    expect(c.every((x) => x.content.length <= 300 && x.heading === 'T')).toBe(true);
    expect(c[1]!.content.split('\n')[0]).toBe(c[0]!.content.split('\n').at(-1));
  });
  it('ignores headings inside code fences', () => {
    const c = chunkMarkdown('# A\n```\n# not heading\n```\nbody text of reasonable length');
    expect(c).toHaveLength(1);
  });
});

describe('answerFromResearch', () => {
  it('maps [n] citations back to the excerpts used', async () => {
    rpc.mockResolvedValue({ data: [hit(1), hit(2), hit(3)], error: null });
    const r = await answerFromResearch('what to bring?');
    expect(r.source).toBe('research');
    expect(r.citations).toEqual([{ file: 'f2.md', heading: 'H2 > Sub', urls: ['https://x.gov/2'] }]);
  });
  it('refuses with 211 when excerpts do not answer', async () => {
    rpc.mockResolvedValue({ data: [hit(1)], error: null });
    chat = 'NOT_COVERED: I could not find that. Call 211.';
    const r = await answerFromResearch('weather?');
    expect(r.answer).toBe('I could not find that. Call 211.');
    expect(r.citations).toEqual([]);
  });
  it('falls back to the web when excerpts do not answer', async () => {
    rpc.mockResolvedValue({ data: [hit(1)], error: null });
    chat = 'NOT_COVERED: nope';
    answerFromWeb.mockResolvedValue({ answer: 'From web [1]', citations: [{ file: 'web', heading: 't', urls: ['https://w.gov'] }] });
    const r = await answerFromResearch('new rule?');
    expect(r).toMatchObject({ source: 'web', answer: 'From web [1]' });
  });
  it('falls back to the web when similarity is low', async () => {
    rpc.mockResolvedValue({ data: [hit(1, 0.05)], error: null });
    answerFromWeb.mockResolvedValue({ answer: 'web', citations: [] });
    expect((await answerFromResearch('xyz')).source).toBe('web');
  });
  it('skips the model and refuses when similarity is low', async () => {
    rpc.mockResolvedValue({ data: [hit(1, 0.05)], error: null });
    const r = await answerFromResearch('xyz');
    expect(r.answer).toContain('211');
    expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]).includes('chat'))).toBe(false);
  });
});

describe('routes', () => {
  const app = new Hono();
  registerKnowledgeRoutes(app);
  const post = (body: unknown) => app.request('/api/knowledge/ask', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  it('rejects empty, oversize and non-JSON questions', async () => {
    expect((await post({ question: '' })).status).toBe(400);
    expect((await post({ question: 'x'.repeat(401) })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });
  it('answers a valid question', async () => {
    rpc.mockResolvedValue({ data: [hit(1), hit(2)], error: null });
    const res = await post({ question: 'what to bring?', county: 'Los Angeles' });
    expect(res.status).toBe(200);
    expect((await res.json() as { citations: unknown[] }).citations).toHaveLength(1);
  });
  it('requires staff auth for search', async () => {
    delete process.env.DEMO_MODE;
    expect((await app.request('/api/staff/knowledge/search?q=wic')).status).toBe(401);
  });
});
