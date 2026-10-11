// Fill the shared BenefitsCal application in a browser (Kernel when a public URL exists, else local).
// The filler itself always stops at the signature screen (hard rule in benefitscal/filler.ts).
import type { ApplicationProgram } from '../../../shared/chat.js';
import type { BrowserMode } from '../../benefitscal/browser.js';
import type { FillEvent, FillResult } from '../../benefitscal/filler.js';
import { pollMockCode } from '../../benefitscal/filler.js';
import { holdSeconds } from '../../benefitscal/kernelSessions.js';
import { MOCK_BASE } from '../../benefitscal/mockSite.js';
import { SIGNATURE_PAGE_ID } from '../../benefitscal/spec.js';
import { joinNames } from '../programs.js';
import { runRealFill } from './fillReal.js';
import { clip, httpUrl, type StepCtx, type StepOutcome } from './context.js';

const MAX_LINES = 8;
const TOTAL_CAP_MS = 5 * 60_000;
const KERNEL_CAP_MS = 3 * 60_000;

/** Never let a browser run hang the workflow: resolve as an error after `ms`. */
function capped(p: Promise<FillResult>, ms: number): Promise<FillResult> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ status: 'error', pagesCompleted: 0, missingFields: [], detail: `timed out after ${Math.round(ms / 1000)}s` }), ms);
    p.then((r) => { clearTimeout(t); resolve(r); }, (e: unknown) => { clearTimeout(t); resolve({ status: 'error', pagesCompleted: 0, missingFields: [], detail: e instanceof Error ? e.message : String(e) }); });
  });
}

/** Synthetic values for fields the household record does not hold. Clearly fake on purpose. */
function demoExtra(hid: string): Record<string, string> {
  return {
    last_name: 'Demo', dob: '1990-01-01', street: '123 Demo Street', city: 'Los Angeles', zip: '90012',
    email: `applicant-${hid.slice(0, 8)}@aid-demo.example`, employer_name: 'Demo Employer', hours_per_week: '30',
    job_continues: 'yes', rent_amount: '1400', rent_frequency: 'monthly', bank_balance: '250', has_vehicle: 'no',
    homeless: 'no', interview_type: 'phone', voter_registration: 'no', files_taxes: 'no',
  };
}

export const signatureUrl = (base: string): string => `${base.replace(/\/+$/, '')}${MOCK_BASE}/p/${SIGNATURE_PAGE_ID}`;

export async function runFill(ctx: StepCtx): Promise<StepOutcome> {
  if (ctx.step.meta.target === 'real') return runRealFill(ctx);
  const { fill } = ctx.deps;
  const programs = (ctx.step.meta.programs as ApplicationProgram[] | undefined) ?? [];
  const lines: string[] = [];
  const say = async (line: string) => {
    lines.push(line);
    await ctx.progress(lines.slice(-MAX_LINES).join('\n'));
  };

  const started = Date.now();
  const remaining = () => TOTAL_CAP_MS - (Date.now() - started);
  let base = fill.localBase();
  let mode: BrowserMode = 'local';
  let pub: string | null = null;
  if (fill.kernelAvailable()) {
    await say('Opening a secure tunnel so the cloud browser can reach the application site…');
    pub = await fill.publicBase().catch(() => null);
    if (!pub) await say('No public URL available; filling in a local browser instead.');
  }

  let liveShown = false;
  let kernelSessionId: string | undefined;
  let replayUrl: string | undefined;
  const queue: Promise<unknown>[] = [];
  const onEvent = (e: FillEvent) => {
    queue.push((async () => {
      if (e.step === 'kernel_session' || e.step === 'replay') {
        // Persist the Kernel session id right away so GET /api/workflows/:id/live can mint a fresh link mid-fill.
        if (e.step === 'kernel_session') kernelSessionId = e.message;
        else replayUrl = httpUrl(e.message) ?? undefined;
        await ctx.progress(lines.slice(-MAX_LINES).join('\n'), { ...ctx.step.meta, kernelSessionId, ...(replayUrl ? { replayUrl } : {}) });
        return;
      }
      if (e.step === 'live_view' && !liveShown) {
        const url = httpUrl(e.message.replace(/^live view:\s*/, ''));
        if (url) {
          liveShown = true;
          await ctx.setLiveView(url);
          await ctx.evidence({ kind: 'live_view', title: 'Watch Aid fill your application live', url, detail: 'Kernel cloud browser', source: 'kernel' });
        }
        return;
      }
      if (['page', 'section_done', 'sign_in', 'code_accepted', 'upload', 'stopped_for_signature', 'needs_human', 'error', 'browser'].includes(e.step)) {
        await say(clip(e.message, 160));
      }
    })().catch(() => undefined));
  };
  const attempt = (m: BrowserMode, b: string, capMs: number): Promise<FillResult> => capped(fill.run({
    householdId: ctx.household.id, baseUrl: b, mode: m, onEvent, extra: demoExtra(ctx.household.id),
    headless: true, holdMs: 0, keepAliveMs: m === 'kernel' ? holdSeconds() * 1000 : 0,
    getVerificationCode: pollMockCode(fill.localBase()),
  }), capMs);

  let result: FillResult;
  if (pub) {
    mode = 'kernel';
    base = pub;
    await say(`Starting Kernel cloud browser for ${joinNames(programs) || 'BenefitsCal'}…`);
    result = await attempt('kernel', pub, KERNEL_CAP_MS);
    if (result.status !== 'stopped_for_signature' && remaining() > 60_000) {
      await say(`Cloud browser stopped (${clip(result.detail ?? result.status, 80)}); finishing in a local browser instead.`);
      await ctx.setLiveView(null);
      mode = 'local';
      base = fill.localBase();
      result = await attempt('local', base, remaining());
    }
  } else {
    await say(`Starting local browser for ${joinNames(programs) || 'BenefitsCal'}…`);
    result = await attempt('local', base, remaining());
  }
  await Promise.all(queue);
  const held = mode === 'kernel' && Boolean(result.sessionId);
  // Keep the live view up while the browser is held for the signer; the UI re-fetches a fresh URL via /live.
  await ctx.setLiveView(held ? httpUrl(result.liveViewUrl) : null);

  if (result.liveViewUrl && !liveShown) {
    const url = httpUrl(result.liveViewUrl);
    if (url) await ctx.evidence({ kind: 'live_view', title: 'Kernel live view (session ended)', url, detail: null, source: 'kernel' });
  }
  if (result.screenshotPath) {
    const shot = await ctx.deps.docs.storeScreenshot(ctx.household.id, ctx.household.orgId, result.screenshotPath).catch(() => null);
    if (shot) {
      await ctx.evidence({
        kind: 'screenshot', title: result.status === 'stopped_for_signature' ? 'Signature page, ready for you' : 'Where the browser stopped',
        url: shot, detail: `${result.pagesCompleted} pages filled`, source: mode === 'kernel' ? 'kernel' : 'local-browser',
      });
    }
  }
  const replay = httpUrl(result.replayViewUrl) ?? (replayUrl ?? null);
  if (replay) await ctx.evidence({ kind: 'replay', title: 'Replay of the browser session', url: replay, detail: null, source: 'kernel' });

  const meta = {
    ...ctx.step.meta, signUrl: signatureUrl(base), mode, pagesCompleted: result.pagesCompleted,
    kernelSessionId: held ? result.sessionId : null, replayUrl: replay, heldUntil: held ? result.heldUntil ?? null : null,
  };
  if (result.status === 'stopped_for_signature') {
    const missing = result.missingFields.length ? ` ${result.missingFields.length} field(s) left blank for you to check.` : '';
    return {
      status: 'done', meta,
      summary: `Filled ${result.pagesCompleted} pages of the BenefitsCal application in a ${mode === 'kernel' ? 'Kernel cloud' : 'local'} browser and stopped at the signature page.${missing}${held ? ` The live browser stays open for ${Math.round(holdSeconds() / 60)} minutes.` : ''}`,
    };
  }
  return {
    status: 'failed', meta,
    summary: `Needs a human: the ${mode} browser stopped before the signature page (${result.status}${result.detail ? `: ${clip(result.detail, 200)}` : ''}). Try again, or finish it yourself.${liveShown ? ' The live view link is in the evidence.' : ''}`,
  };
}
