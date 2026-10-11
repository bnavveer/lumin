// Live web knowledge for Aid: local resources near a ZIP and cited web answers, via Exa + a small LLM.
import { tool } from 'ai';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { County } from './contracts.js';
import { requireStaff } from './auth.js';
import { exaSearch, webLlm, type ExaResult } from './exa.js';
import { rateLimit } from './rateLimit.js';
import { applyWaitlistStatus, checkSection8Waitlists } from './waitlistWatcher.js';
import { clientIp } from './clientIp.js';

export const NEEDS = ['food', 'wic', 'county_office', 'legal_aid', 'housing'] as const;
export type Need = (typeof NEEDS)[number];
export interface LocalResource {
  name: string; address: string | null; phone: string | null; hours: string | null; url: string | null; sourceUrl: string;
}
export interface WebAnswer { answer: string; citations: Array<{ n: number; title: string; url: string }> }

const MAX_PLACES = 5;
const PAGE_CHARS = 3500;
const COUNTY_NAME: Record<County, string> = { los_angeles: 'Los Angeles County', san_francisco: 'San Francisco' };
const NEED_QUERY: Record<Need, string> = {
  food: 'food bank free food pantry',
  wic: 'WIC office Women Infants Children clinic',
  county_office: 'county DPSS social services benefits office hours',
  legal_aid: 'free legal aid services office',
  housing: 'housing assistance rental help office',
};
export const OFFICIAL_DOMAINS = ['*.ca.gov', '*.gov', 'cdss.ca.gov', 'dhcs.ca.gov', 'benefitscal.com', 'hacla.org', 'lacda.org', '211la.org'];

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
const digits = (s: string): string => s.replace(/\D/g, '');

const placesSchema = z.object({
  places: z.array(z.object({
    name: z.string().min(1),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    hours: z.string().nullable(),
    url: z.string().nullable(),
    sourceUrl: z.string(),
  })).max(10),
});

const EXTRACT_SYSTEM =
  'Extract real service locations from the web page text. Use ONLY facts written in the text. ' +
  'If an address, phone, hours or url is not in the text, use null. Never guess or invent. sourceUrl must be one of the given URLs.';

/** Keep a field only if it literally appears in the retrieved text. */
export function groundPlaces(
  raw: z.infer<typeof placesSchema>['places'], pages: ExaResult[],
): LocalResource[] {
  const corpus = pages.map((p) => `${p.title}\n${p.text ?? ''}`).join('\n');
  const hay = norm(corpus);
  const hayDigits = digits(corpus);
  const urls = new Set(pages.map((p) => p.url));
  const out: LocalResource[] = [];
  for (const p of raw) {
    if (!hay.includes(norm(p.name))) continue; // invented place
    const phoneDigits = p.phone ? digits(p.phone) : '';
    out.push({
      name: p.name,
      address: p.address && hay.includes(norm(p.address)) ? p.address : null,
      phone: phoneDigits.length >= 10 && hayDigits.includes(phoneDigits.slice(-10)) ? p.phone : null,
      hours: p.hours && hay.includes(norm(p.hours)) ? p.hours : null,
      url: p.url && urls.has(p.url) ? p.url : null,
      sourceUrl: urls.has(p.sourceUrl) ? p.sourceUrl : (pages[0]?.url ?? ''),
    });
    if (out.length >= MAX_PLACES) break;
  }
  return out;
}

export async function findLocalResources(
  args: { need: Need; zip?: string; county: County },
): Promise<LocalResource[]> {
  const where = args.zip ? `ZIP ${args.zip}, ${COUNTY_NAME[args.county]}, CA` : `${COUNTY_NAME[args.county]}, CA`;
  const pages = await exaSearch(`${NEED_QUERY[args.need]} near ${where} address phone hours`, {
    numResults: 6, text: PAGE_CHARS,
  });
  const usable = pages.filter((p) => p.text);
  if (usable.length === 0) return [];
  const corpus = usable.map((p) => `URL: ${p.url}\nTITLE: ${p.title}\n${(p.text ?? '').slice(0, PAGE_CHARS)}`).join('\n\n---\n\n');
  const prompt = `Need: ${args.need}. Area: ${where}. List up to ${MAX_PLACES} places that serve this area.\n\n${corpus}`;
  const { places } = await webLlm.object('fast', placesSchema, prompt, EXTRACT_SYSTEM);
  return groundPlaces(places, usable);
}

const ANSWER_SYSTEM =
  'Answer ONLY from the numbered sources. Cite with [1], [2]. Use 6th-grade language, under 120 words. ' +
  'If the sources do not answer it, say you could not find it and suggest calling 211 or the county office. Never invent facts.';

export async function answerFromWeb(question: string): Promise<WebAnswer> {
  const q = question.trim();
  let pages = await exaSearch(q, { numResults: 5, includeDomains: OFFICIAL_DOMAINS, text: 2500 });
  if (pages.filter((p) => p.text).length === 0) pages = await exaSearch(q, { numResults: 5, text: 2500 });
  const usable = pages.filter((p) => p.text).slice(0, 5);
  if (usable.length === 0) {
    return { answer: 'I could not find a reliable answer online. Please call 211 or your county benefits office.', citations: [] };
  }
  const sources = usable.map((p, i) => `[${i + 1}] ${p.title} (${p.url})\n${(p.text ?? '').slice(0, 2500)}`).join('\n\n');
  const answer = (await webLlm.text('knowledge', `Question: ${q}\n\nSources:\n${sources}`, ANSWER_SYSTEM)).trim();
  return { answer, citations: usable.map((p, i) => ({ n: i + 1, title: p.title, url: p.url })) };
}

const questionSchema = z.object({ question: z.string().trim().min(1).max(400) });
const resourcesSchema = z.object({
  need: z.enum(NEEDS),
  zip: z.string().regex(/^\d{5}$/).optional(),
  county: z.enum(['los_angeles', 'san_francisco']),
});

/** ai@5 tools for Lane A's SMS agent. */
export const webTools = {
  findLocalResources: tool({
    description: 'Find up to 5 real local places (food banks, WIC, county offices, legal aid, housing help) near a ZIP, from live web pages.',
    inputSchema: z.object({
      need: z.enum(NEEDS), zip: z.string().regex(/^\d{5}$/).optional(), county: z.enum(['los_angeles', 'san_francisco']),
    }),
    execute: async (a) => findLocalResources(a),
  }),
  answerFromWeb: tool({
    description: 'Answer a benefits question from live official web pages, with numbered citations. Use when the knowledge base does not cover it.',
    inputSchema: z.object({ question: z.string().min(1).max(400) }),
    execute: async ({ question }) => answerFromWeb(question),
  }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerWebKnowledgeRoutes(app: Hono<any>): void {
  const limit = (name: string) => rateLimit({ windowMs: 60_000, max: 10, key: (c) => `${name}:${clientIp(c)}` });

  app.post('/api/knowledge/web', limit('webk'), async (c) => {
    const body = questionSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'question must be 1-400 characters' }, 400);
    try {
      return c.json(await answerFromWeb(body.data.question));
    } catch (err) {
      console.error('[webKnowledge] answer failed:', err instanceof Error ? err.message : err);
      return c.json({ error: 'Web lookup is unavailable right now' }, 502);
    }
  });

  app.get('/api/resources', limit('res'), async (c) => {
    const parsed = resourcesSchema.safeParse({
      need: c.req.query('need'), zip: c.req.query('zip') || undefined, county: c.req.query('county'),
    });
    if (!parsed.success) return c.json({ error: 'need, county (and optional 5-digit zip) are required' }, 400);
    try {
      return c.json({ resources: await findLocalResources(parsed.data) });
    } catch (err) {
      console.error('[webKnowledge] resources failed:', err instanceof Error ? err.message : err);
      return c.json({ error: 'Resource lookup is unavailable right now' }, 502);
    }
  });

  app.post('/api/staff/waitlists/check', requireStaff, async (c) => {
    try {
      const results = await checkSection8Waitlists({ force: true });
      const updated = await applyWaitlistStatus(results);
      return c.json({ results, householdsUpdated: updated });
    } catch (err) {
      console.error('[webKnowledge] waitlist check failed:', err instanceof Error ? err.message : err);
      return c.json({ error: 'Waitlist check failed' }, 502);
    }
  });
}
