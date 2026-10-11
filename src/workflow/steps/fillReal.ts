// Opt-in REAL BenefitsCal step (target: 'real'). See the guardrail comment in src/benefitscal/realSite.ts.
// Run 1: open benefitscal.com in Kernel, the person signs in themselves, Aid previews a fill plan, types nothing,
// and waits for approval. Run 2 (after approve): re-attach to the same browser and type the approved real data.
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachKernel, openBrowser, type OpenedBrowser } from '../../benefitscal/browser.js';
import { holdSeconds, scheduleKernelCleanup } from '../../benefitscal/kernelSessions.js';
import { REAL_HOME, RealModeRefused, assertRealModeAllowed, runRealSite } from '../../benefitscal/realSite.js';
import { applicationReadiness } from '../../../shared/applicationDetails.js';
import { detailsToExtra } from '../applicationDetails.js';
import { clip, errMsg, httpUrl, type StepCtx, type StepOutcome } from './context.js';

export const DETAILS_NEEDED_SUMMARY = 'Finish your application details before Lumin can fill the real application.';

export async function runRealFill(ctx: StepCtx): Promise<StepOutcome> {
  // A run approved while it was waiting on details still starts with a preview (nothing typed).
  const typing = ctx.step.meta.approved === true && ctx.step.meta.needsDetails !== true;
  try { assertRealModeAllowed(ctx.household, typing); }
  catch (e) { return { status: 'failed', summary: errMsg(e) }; }
  // The real application never gets placeholder values: every required detail must be the person's own.
  let details;
  try { details = await ctx.deps.repo.getApplicationDetails(ctx.wf.userId); }
  catch (e) { return { status: 'failed', summary: `Could not load your application details: ${clip(errMsg(e), 160)}. Try again.` }; }
  const email = await ctx.deps.auth.emailOf?.(ctx.wf.userId).catch(() => null)
  const readiness = applicationReadiness(details, { county: ctx.household.county, size: ctx.household.size, monthlyIncome: ctx.household.monthlyIncome });
  if (!readiness.complete) {
    const missing = readiness.missing.map(m => m.label);
    return {
      status: 'waiting_on_you', summary: DETAILS_NEEDED_SUMMARY,
      meta: {
        ...ctx.step.meta, target: 'real', approved: false, needsDetails: true, missingDetails: readiness.missing.map(m => m.field),
        asks: [
          { title: 'Finish your application details', detail: `Still needed: ${clip(missing.join(', '), 400)}.`, action: { type: 'open_url', label: 'Finish details', url: '/account/details', stepId: ctx.step.id } },
          { title: 'Then check again', detail: 'When your details are complete, Lumin opens BenefitsCal and previews the fill first. Nothing is typed until you approve.', action: { type: 'run', label: 'Check again', url: null, stepId: ctx.step.id } },
        ],
      },
    };
  }
  const { needsDetails: _n, missingDetails: _m, ...readyMeta } = ctx.step.meta;
  ctx.step = { ...ctx.step, meta: { ...readyMeta, approved: typing } };
  if (!ctx.deps.fill.kernelAvailable()) return { status: 'failed', summary: 'Real BenefitsCal mode needs a Kernel cloud browser (KERNEL_API_KEY).' };

  const prevSession = typeof ctx.step.meta.kernelSessionId === 'string' ? ctx.step.meta.kernelSessionId : null;
  let opened: OpenedBrowser;
  try {
    opened = typing && prevSession ? await attachKernel(prevSession) : await openBrowser({ mode: 'kernel' });
  } catch (e) {
    return { status: 'failed', summary: `Could not open the cloud browser: ${clip(errMsg(e), 160)}` };
  }
  const sessionId = opened.sessionId ?? prevSession;
  const live = httpUrl(opened.liveViewUrl);
  const meta = { ...ctx.step.meta, target: 'real', kernelSessionId: sessionId, ...(opened.replayViewUrl ? { replayUrl: opened.replayViewUrl } : {}) };
  await ctx.progress('Opening benefitscal.com. Sign in yourself in the live browser; Lumin never sees your password.', meta);
  if (live) {
    await ctx.setLiveView(live);
    if (!typing) await ctx.evidence({ kind: 'live_view', title: 'Sign in to BenefitsCal here (real site)', url: live, detail: 'Kernel cloud browser. You type your own password and code.', source: 'kernel' });
  }
  if (!typing) await opened.page.goto(REAL_HOME, { waitUntil: 'domcontentloaded' }).catch(() => undefined);

  const dir = join(tmpdir(), 'aid-real', `${ctx.household.id}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    const result = await runRealSite({
      page: opened.page, household: ctx.household, details: { ...detailsToExtra(details), ...(email ? { email } : {}) }, typing,
      onEvent: (e) => { void ctx.progress(clip(e.message, 200), meta).catch(() => undefined); },
      screenshot: async (name) => {
        const p = join(dir, `${name}.png`);
        await opened.page.screenshot({ path: p }).catch(() => undefined);
        return p;
      },
    });
    for (const pg of result.pages) {
      if (pg.plan.length) {
        await ctx.evidence({
          kind: 'message', title: `Proposed fill plan for ${pg.screen ?? 'this page'}${typing ? ' (typed)' : ' (preview)'}`, url: null,
          detail: pg.plan.map((p) => `${p.label}: ${p.value} (${Math.round(p.confidence * 100)}%)`).join('\n').slice(0, 1500), source: 'real-benefitscal',
        });
      }
      const shot = pg.screenshot ? await ctx.deps.docs.storeScreenshot(ctx.household.id, ctx.household.orgId, pg.screenshot).catch(() => null) : null;
      if (shot) await ctx.evidence({ kind: 'screenshot', title: `BenefitsCal ${pg.screen ?? 'page'}`, url: shot, detail: null, source: 'real-benefitscal' });
    }
    await ctx.evidence({ kind: 'message', title: 'Stopped before signing', url: null, detail: result.note, source: 'real-benefitscal' });
    await opened.detach();
    if (sessionId) scheduleKernelCleanup(sessionId, holdSeconds() * 1000, async () => { await opened.close(); });
    if (result.status === 'preview_done') {
      return { status: 'waiting_on_you', meta: { ...meta, asks: [] }, summary: 'Preview ready: review the proposed values, then approve to let Lumin type them. Nothing was typed.' };
    }
    return { status: result.status === 'stopped_before_signing' ? 'done' : 'failed', meta, summary: result.note };
  } catch (e) {
    await opened.close().catch(() => undefined);
    return { status: 'failed', meta, summary: e instanceof RealModeRefused ? e.message : `Real BenefitsCal run stopped: ${clip(errMsg(e), 200)}` };
  }
}
