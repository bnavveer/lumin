import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { exaSearch, setExaFetch, setWebLlm } from '../src/exa.js';
import { findLocalResources, groundPlaces, registerWebKnowledgeRoutes } from '../src/webKnowledge.js';

const okFetch = (results: unknown[]) =>
  vi.fn(async () => new Response(JSON.stringify({ results }), { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

beforeEach(() => { process.env.EXA_API_KEY = 'test-key'; });
afterEach(() => { setExaFetch(); setWebLlm(); vi.restoreAllMocks(); });

describe('exaSearch', () => {
  it('sends the documented request shape and maps results', async () => {
    const f = okFetch([{ title: 'T', url: 'https://hacla.org/x', publishedDate: '2026-01-01', text: 'body', highlights: ['h'], extra: 1 }]);
    setExaFetch(f);
    const out = await exaSearch('q', { numResults: 3, includeDomains: ['hacla.org'], text: 500, highlights: true, startPublishedDate: '2026-01-01' });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe('https://api.exa.ai/search');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'q', numResults: 3, type: 'auto', includeDomains: ['hacla.org'], startPublishedDate: '2026-01-01',
      contents: { text: { maxCharacters: 500 }, highlights: true },
    });
    expect(out).toEqual([{ title: 'T', url: 'https://hacla.org/x', publishedDate: '2026-01-01', text: 'body', highlights: ['h'] }]);
  });
  it('caches identical calls but not different options', async () => {
    const f = okFetch([]);
    setExaFetch(f);
    await exaSearch('q', { numResults: 2 });
    await exaSearch('q', { numResults: 2 });
    expect(f).toHaveBeenCalledTimes(1);
    await exaSearch('q', { numResults: 3 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('throws [exa] errors on HTTP failure and missing key', async () => {
    setExaFetch((async () => new Response('nope', { status: 500 })) as typeof fetch);
    await expect(exaSearch('q')).rejects.toThrow('[exa] search 500');
    delete process.env.EXA_API_KEY;
    await expect(exaSearch('q2')).rejects.toThrow('[exa]');
  });
});

describe('findLocalResources', () => {
  it('nulls phone/hours/address not present in the page text and drops invented places', async () => {
    setExaFetch(okFetch([{ title: 'Pantry', url: 'https://a.org/p', text: 'Hope Pantry, 12 Main St, Los Angeles. Call 213-555-0101.' }]));
    setWebLlm({
      text: async () => '',
      object: (async () => ({ places: [
        { name: 'Hope Pantry', address: '12 Main St', phone: '213-555-0101', hours: 'Mon-Fri 9-5', url: 'https://made.up', sourceUrl: 'https://a.org/p' },
        { name: 'Ghost Kitchen', address: '1 Fake St', phone: '213-555-9999', hours: null, url: null, sourceUrl: 'https://a.org/p' },
      ] })) as never,
    });
    const out = await findLocalResources({ need: 'food', zip: '90011', county: 'los_angeles' });
    expect(out).toEqual([{ name: 'Hope Pantry', address: '12 Main St', phone: '213-555-0101', hours: null, url: null, sourceUrl: 'https://a.org/p' }]);
  });
  it('groundPlaces caps at 5', () => {
    const names = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];
    const raw = names.map((name) => ({ name, address: null, phone: null, hours: null, url: null, sourceUrl: 'u' }));
    expect(groundPlaces(raw, [{ title: '', url: 'u', text: names.join(' ') }])).toHaveLength(5);
  });
});

describe('routes', () => {
  const app = () => { const a = new Hono(); registerWebKnowledgeRoutes(a); return a; };
  it('rejects bad questions and bad resource params', async () => {
    const a = app();
    const post = (body: unknown) => a.request('/api/knowledge/web', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
    expect((await post({ question: '' })).status).toBe(400);
    expect((await post({ question: 'x'.repeat(401) })).status).toBe(400);
    expect((await a.request('/api/resources?need=bogus&county=los_angeles')).status).toBe(400);
    expect((await a.request('/api/resources?need=food&county=los_angeles&zip=12')).status).toBe(400);
  });
  it('answers a valid question with citations', async () => {
    setExaFetch(okFetch([{ title: 'CalFresh', url: 'https://dpss.lacounty.gov/x', text: 'Interview within 30 days.' }]));
    setWebLlm({ object: (async () => ({})) as never, text: async () => 'Within 30 days [1].' });
    const r = await app().request('/api/knowledge/web', { method: 'POST', body: JSON.stringify({ question: 'interview?' }), headers: { 'content-type': 'application/json' } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ answer: 'Within 30 days [1].', citations: [{ n: 1, title: 'CalFresh', url: 'https://dpss.lacounty.gov/x' }] });
  });
  it('rate limits the public web endpoint at 10 per minute', async () => {
    const a = app();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await a.request('/api/knowledge/web', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status;
    expect(last).toBe(429);
  });
  it('requires staff for the waitlist check', async () => {
    delete process.env.DEMO_MODE;
    expect((await app().request('/api/staff/waitlists/check', { method: 'POST' })).status).toBe(401);
  });
});
