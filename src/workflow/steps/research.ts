// Research one program: the indexed research notes plus live web (Exa) and, for Section 8, the waitlist watcher.
import type { ApplicationProgram } from '../../../shared/chat.js';
import type { ResearchAnswer, ResearchCitation } from '../deps.js';
import { COUNTY_NAME, programName } from '../programs.js';
import { clip, errMsg, httpUrl, type StepCtx, type StepOutcome } from './context.js';

const RESEARCH_TIMEOUT_MS = 90_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

function firstSentences(text: string, n: number): string {
  const clean = text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  return parts.slice(0, n).join(' ').trim();
}

export async function runResearch(ctx: StepCtx): Promise<StepOutcome> {
  const program = ctx.step.program as ApplicationProgram;
  const name = programName(program);
  const county = COUNTY_NAME[ctx.household.county] ?? 'California';
  const { research } = ctx.deps;
  await ctx.progress(`Researching ${name}: reading Aid's research notes and checking official sites…`);
  await ctx.log({ type: 'AgentToolCalled', value: 'workflow_research' });

  const q = `What documents, eligibility rules and steps are needed to apply for ${name} in California (${county})?`;
  const webQ = program === 'section8'
    ? `${county} Section 8 housing choice voucher waitlist status and how to apply`
    : `${name} ${county} how to apply, office hours, what to bring`;
  const [notes, web, waitlist] = await Promise.allSettled([
    withTimeout(research.fromResearch(q, county), RESEARCH_TIMEOUT_MS, 'research notes'),
    withTimeout(research.fromWeb(webQ), RESEARCH_TIMEOUT_MS, 'web search'),
    program === 'section8' ? withTimeout(research.section8(), RESEARCH_TIMEOUT_MS, 'waitlist check') : Promise.resolve([] as ResearchCitation[]),
  ]);

  const answers: ResearchAnswer[] = [];
  if (notes.status === 'fulfilled') answers.push(notes.value);
  if (web.status === 'fulfilled') answers.push(web.value);
  const waitlistCites = waitlist.status === 'fulfilled' ? waitlist.value : [];
  if (!answers.length && !waitlistCites.length) {
    const why = [notes, web].map(r => (r.status === 'rejected' ? errMsg(r.reason) : '')).filter(Boolean).join('; ');
    throw new Error(`could not research ${name} (${why || 'no sources'})`);
  }

  const seen = new Set<string>();
  for (const c of [...answers.flatMap(a => a.citations), ...waitlistCites]) {
    const key = `${c.source}|${c.url ?? c.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ctx.evidence({ kind: 'citation', title: clip(c.title, 200), url: httpUrl(c.url), detail: c.detail ? clip(c.detail, 400) : null, source: c.source });
  }

  const combined = answers.map(a => a.answer).join('\n\n');
  let summary: string;
  try {
    summary = (await withTimeout(research.summarize(name, combined), 45_000, 'summary')).trim();
  } catch {
    summary = firstSentences(combined, 3);
  }
  if (!summary) summary = `Aid found ${seen.size} sources on ${name}.`;
  return { status: 'done', summary: clip(summary, 700) };
}
