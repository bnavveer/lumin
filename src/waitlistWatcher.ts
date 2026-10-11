// Live Section 8 waitlist watcher: Exa finds the authority pages, a fast LLM decides ONLY from page text.
import { z } from 'zod';
import { checkEligibility } from './eligibility.js';
import { exaSearch, webLlm, type ExaResult } from './exa.js';
import { logEvent } from './keewano.js';
import { addTimeline, listHouseholds } from './store.js';

export type Authority = 'HACLA' | 'LACDA';
export interface WaitlistResult {
  authority: Authority;
  status: 'open' | 'closed' | 'unknown';
  checkedAt: string;
  sourceUrl: string;
  evidence: string;
}

const TTL_MS = 6 * 60 * 60_000;
const MAX_HOUSEHOLDS = 200;
const PAGE_CHARS = 5000;
const AUTHORITIES: Array<{ authority: Authority; domain: string; query: string }> = [
  { authority: 'HACLA', domain: 'hacla.org', query: 'HACLA Housing Choice Voucher Section 8 waiting list open or closed' },
  { authority: 'LACDA', domain: 'lacda.org', query: 'LACDA Section 8 Housing Choice Voucher waiting list open or closed' },
];

const verdictSchema = z.object({
  status: z.enum(['open', 'closed', 'unknown']),
  evidence: z.string().max(400),
  sourceUrl: z.string(),
});

export const CLASSIFY_SYSTEM =
  'You read housing-authority web page text. Decide ONLY from the page text provided; if unclear say unknown. ' +
  'Status "open" only if the text says the Section 8 / Housing Choice Voucher waiting list is currently accepting applications. ' +
  '"closed" only if it says the list is closed. Otherwise "unknown". ' +
  'evidence must be an exact quote of 200 characters or less copied from the text. sourceUrl must be one of the given URLs.';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

function unknown(authority: Authority, sourceUrl: string, evidence: string): WaitlistResult {
  return { authority, status: 'unknown', checkedAt: new Date().toISOString(), sourceUrl, evidence };
}

export async function classifyWaitlist(authority: Authority, pages: ExaResult[]): Promise<WaitlistResult> {
  const usable = pages.filter((p) => p.text);
  const fallbackUrl = pages[0]?.url ?? '';
  if (usable.length === 0) return unknown(authority, fallbackUrl, 'No page text found');
  const corpus = usable.map((p) => `URL: ${p.url}\n${(p.text ?? '').slice(0, PAGE_CHARS)}`).join('\n\n---\n\n');
  const v = await webLlm.object('fast', verdictSchema, `Authority: ${authority}\n\n${corpus}`, CLASSIFY_SYSTEM);
  const evidence = v.evidence.slice(0, 200);
  const sourceUrl = usable.find((p) => p.url === v.sourceUrl)?.url ?? usable[0]!.url;
  if (v.status === 'unknown') return unknown(authority, sourceUrl, evidence || 'Page text unclear');
  // Guard against hallucinated quotes: the evidence must literally appear in the retrieved text.
  const haystack = norm(corpus);
  if (!evidence || !haystack.includes(norm(evidence))) {
    return unknown(authority, sourceUrl, 'Model evidence not found in page text');
  }
  return { authority, status: v.status, checkedAt: new Date().toISOString(), sourceUrl, evidence };
}

let cached: { at: number; results: WaitlistResult[] } | undefined;
export function clearWaitlistCache(): void { cached = undefined; }

export const latestWaitlistStatus = (): WaitlistResult[] => cached?.results ?? [];

export async function checkSection8Waitlists(opts: { force?: boolean } = {}): Promise<WaitlistResult[]> {
  if (!opts.force && cached && Date.now() - cached.at < TTL_MS) return cached.results;
  const results = await Promise.all(AUTHORITIES.map(async ({ authority, domain, query }) => {
    try {
      const pages = await exaSearch(query, { numResults: 3, includeDomains: [domain], text: PAGE_CHARS });
      return await classifyWaitlist(authority, pages);
    } catch (err) {
      console.error(`[waitlist] ${authority} check failed:`, err instanceof Error ? err.message : err);
      return unknown(authority, '', 'Check failed');
    }
  }));
  // Only cache if at least one authority gave a real answer, so total outages retry soon.
  if (results.some((r) => r.status !== 'unknown')) cached = { at: Date.now(), results };
  return results;
}

/** Log WaitlistStatus (Keewano) + a timeline row for every section8-likely household. Returns how many were updated. */
export async function applyWaitlistStatus(results: WaitlistResult[]): Promise<number> {
  const known = results.filter((r) => r.status !== 'unknown');
  if (known.length === 0) return 0;
  const households = (await listHouseholds()).slice(0, MAX_HOUSEHOLDS);
  // One event per household: HACLA (City of LA) result preferred, else whichever is known.
  const primary = known.find((r) => r.authority === 'HACLA') ?? known[0]!;
  let n = 0;
  for (const h of households) {
    const s8 = checkEligibility(h).find((m) => m.program === 'section8');
    if (s8?.status !== 'likely') continue;
    try {
      await logEvent(h.id, { type: 'WaitlistStatus', value: primary.status as 'open' | 'closed' });
      await addTimeline(h.id, `Section 8 waitlist (${primary.authority}): ${primary.status}, checked via Exa`);
      n += 1;
    } catch (err) {
      console.error(`[waitlist] apply failed for ${h.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return n;
}
