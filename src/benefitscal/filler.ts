// Deterministic Playwright form-filler for the mock BenefitsCal site.
// SAFETY: the run ALWAYS stops at the signature screen. That rule is plain code (shouldStopAt), never an LLM decision.
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Page } from 'playwright';
import type { DocType, DocumentRecord } from '../contracts.js';
import { signedUrl } from '../documents.js';
import { logEvent } from '../keewano.js';
import { addTimeline, getHousehold, listDocuments } from '../store.js';
import { openBrowser, type BrowserMode } from './browser.js';
import { scheduleKernelCleanup } from './kernelSessions.js';
import { MOCK_BASE } from './mockSite.js';
import {
  buildAnswers, pageById, SIGNATURE_FIELD_NAMES, SIGNATURE_PAGE_ID, type Answers, type ExtraAnswers, type FlatPage,
} from './spec.js';

export type FillStatus = 'stopped_for_signature' | 'needs_human' | 'error';
export interface FillResult {
  status: FillStatus;
  pagesCompleted: number;
  liveViewUrl?: string;
  screenshotPath?: string;
  missingFields: string[];
  replayViewUrl?: string;
  detail?: string;
  /** Kernel browser session id; set when the browser was left running for the signer (see keepAliveMs). */
  sessionId?: string;
  /** ISO time the held Kernel browser will be closed. */
  heldUntil?: string;
}
export interface FillEvent { at: string; step: string; message: string; pageId?: string }
export interface FillOptions {
  householdId: string;
  baseUrl: string;                       // e.g. http://localhost:3000 (must be publicly reachable for kernel mode)
  mode: BrowserMode;
  onEvent?: (e: FillEvent) => void;
  getVerificationCode?: (email: string) => Promise<string>;
  extra?: ExtraAnswers;                  // dob, address, employer... fields the Household lacks
  headless?: boolean;                    // local mode only
  holdMs?: number;                       // keep the browser open this long after finishing (live view for judges)
  /** Kernel only: on stop-at-signature, leave the browser running this long (scheduled cleanup) instead of closing. */
  keepAliveMs?: number;
}

const MAX_UPLOAD_TARGET = 7.5 * 1024 * 1024;
const STEP_LIMIT = 40;
const CODE_POLL_MS = 1000;
const CODE_TIMEOUT_MS = 180_000;
const KERNEL_PACE_MS = 250;

/** HARD RULE: the signature page is never filled, ticked or submitted by automation. */
export const shouldStopAt = (pageId: string | null | undefined): boolean => pageId === SIGNATURE_PAGE_ID;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function fieldForDocType(t: DocType): string {
  return t === 'id' ? 'file_id' : t === 'paystub' ? 'file_paystub' : t === 'lease' ? 'file_lease' : 'file_other';
}

/** Default code source: polls the mock's demo endpoint. A real deployment would be a human or AgentMail. */
export function pollMockCode(baseUrl: string): (email: string) => Promise<string> {
  return async (email) => {
    const deadline = Date.now() + CODE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${baseUrl}${MOCK_BASE}/_last-code`);
        if (res.ok) {
          const j = (await res.json()) as { email?: string; code?: string | null };
          if (j.code && j.email === email) return j.code;
        }
      } catch { /* server not reachable yet; keep polling */ }
      await sleep(CODE_POLL_MS);
    }
    throw new Error('timed out waiting for verification code');
  };
}

async function prepareDocument(rec: DocumentRecord, dir: string): Promise<{ path: string; note?: string } | null> {
  const res = await fetch(await signedUrl(rec.storagePath));
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  let buf: Buffer = Buffer.from(await res.arrayBuffer());
  const isPdf = rec.contentType.includes('pdf');
  let ext = isPdf ? 'pdf' : rec.contentType.includes('png') ? 'png' : 'jpg';
  let note: string | undefined;
  if (buf.byteLength > MAX_UPLOAD_TARGET) {
    if (isPdf) return null; // cannot safely shrink a PDF here
    let width = 3000;
    let quality = 80;
    while (buf.byteLength > MAX_UPLOAD_TARGET && width >= 800) {
      buf = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality }).toBuffer();
      ext = 'jpg';
      width = Math.floor(width * 0.75);
      quality = Math.max(55, quality - 5);
    }
    if (buf.byteLength > MAX_UPLOAD_TARGET) return null;
    note = 'compressed';
  }
  const path = join(dir, `${rec.docType}-${rec.id}.${ext}`);
  await writeFile(path, buf);
  return { path, note };
}

export async function fillApplication(opts: FillOptions): Promise<FillResult> {
  const { householdId, mode } = opts;
  const baseUrl = opts.baseUrl.replace(/\/+$/, '');
  const emit = (step: string, message: string, pageId?: string): void => {
    opts.onEvent?.({ at: new Date().toISOString(), step, message, ...(pageId ? { pageId } : {}) });
  };
  const safe = async (label: string, fn: () => Promise<unknown>): Promise<void> => {
    try { await fn(); } catch (e) { emit('warn', `${label} failed: ${errMsg(e)}`); }
  };
  const timeline = (label: string) => safe('timeline', () => addTimeline(householdId, label));

  const missingFields: string[] = [];
  let pagesCompleted = 0;
  let liveViewUrl: string | undefined;
  let screenshotPath: string | undefined;

  const household = await getHousehold(householdId).catch((e: unknown) => { emit('error', `household lookup failed: ${errMsg(e)}`); return undefined; });
  if (!household) return { status: 'error', pagesCompleted, missingFields, detail: 'household not found' };

  const docs = await listDocuments(householdId).catch((e: unknown) => { emit('warn', `could not list documents: ${errMsg(e)}`); return [] as DocumentRecord[]; });
  const answers: Answers = buildAnswers(household, opts.extra);
  const email = typeof answers.email === 'string' && answers.email ? answers.email : `${(household.firstName ?? 'applicant').toLowerCase().replace(/[^a-z0-9]/g, '')}@aid-demo.example`;

  const outDir = join(tmpdir(), 'aid-fill', `${householdId}-${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  emit('browser', `opening ${mode} browser`);
  const opened = await openBrowser({ mode, headless: opts.headless });
  liveViewUrl = opened.liveViewUrl;
  const page: Page = opened.page;
  page.setDefaultTimeout(mode === 'kernel' ? 45_000 : 10_000); // cloud browser over a tunnel is slower per page
  const pace = mode === 'kernel' ? KERNEL_PACE_MS : 0;
  let replayViewUrl: string | undefined;

  const finish = async (status: FillStatus, detail?: string): Promise<FillResult> => {
    const keep = opts.keepAliveMs ?? 0;
    if (status === 'stopped_for_signature' && mode === 'kernel' && keep > 0 && opened.sessionId) {
      // Root-cause fix: the browser used to be deleted ~10s after the stop, killing the live view link.
      const sessionId = opened.sessionId;
      await opened.detach();
      scheduleKernelCleanup(sessionId, keep, async () => { await opened.close(); });
      const heldUntil = new Date(Date.now() + keep).toISOString();
      emit('hold', `keeping the live browser open for ${Math.round(keep / 1000)}s so you can review and sign`);
      return { status, pagesCompleted, liveViewUrl, screenshotPath, missingFields, replayViewUrl: opened.replayViewUrl, detail, sessionId, heldUntil };
    }
    if (opts.holdMs) { emit('hold', `holding browser open for ${Math.round(opts.holdMs / 1000)}s`); await sleep(opts.holdMs); }
    const closed = await opened.close().catch(() => ({} as { replayViewUrl?: string }));
    replayViewUrl = closed.replayViewUrl;
    return { status, pagesCompleted, liveViewUrl, screenshotPath, missingFields, replayViewUrl, detail };
  };

  try {
    if (opened.sessionId) emit('kernel_session', opened.sessionId);
    if (opened.replayViewUrl) emit('replay', opened.replayViewUrl);
    if (liveViewUrl) emit('live_view', `live view: ${liveViewUrl}`);
    await safe('keewano', () => logEvent(householdId, { type: 'AgentToolCalled', value: 'browser_fill_start' }));

    // 1. sign in
    emit('sign_in', `signing in as ${email}`);
    await page.goto(`${baseUrl}${MOCK_BASE}/signin`, { waitUntil: 'domcontentloaded' });
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="password"]').fill('demo-password');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/verify$/);

    // 2. verification code
    emit('waiting_for_code', 'waiting for the one-time verification code', 'verify');
    await safe('keewano', () => logEvent(householdId, { type: 'AgentToolCalled', value: 'browser_paused_for_code' }));
    const code = await (opts.getVerificationCode ?? pollMockCode(baseUrl))(email);
    await page.locator('[name="code"]').fill(code);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
    emit('code_accepted', 'verification code accepted');

    // 3. pages
    for (let step = 0; step < STEP_LIMIT; step++) {
      const pageId = await currentPageId(page, emit);
      const sigDom = (await page.locator('[data-field="sig_esign"], [data-field="sig_rights"]').count()) > 0;
      if (shouldStopAt(pageId) || sigDom) {
        screenshotPath = join(outDir, 'signature-screen.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        emit('stopped_for_signature', `reached the signature screen; stopping. Screenshot: ${screenshotPath}`, pageId ?? undefined);
        await safe('keewano', () => logEvent(householdId, { type: 'AgentToolCalled', value: 'browser_stopped_for_signature' }));
        await timeline('Browser: stopped at signature screen, waiting for the signer');
        return await finish('stopped_for_signature');
      }

      const spec = pageId ? pageById(pageId) : undefined;
      if (!spec) {
        emit('needs_human', `unexpected page "${pageId}"`, pageId ?? undefined);
        return await finish('needs_human', `unexpected page ${pageId}`);
      }
      emit('page', `${spec.sectionTitle}: ${spec.title}`, spec.id);
      await fillPage(page, spec, answers, missingFields, pace, emit);
      if (spec.kind === 'upload') await uploadDocuments(page, docs, outDir, missingFields, emit);

      await advance(page, spec);
      const after = await currentPageId(page, emit);
      if (after === spec.id) {
        const errs = await page.locator('[data-error-for]').evaluateAll((els) => els.map((e) => e.getAttribute('data-error-for')));
        emit('needs_human', `could not advance past "${spec.title}"; fields needing attention: ${errs.join(', ') || 'unknown'}`, spec.id);
        await timeline(`Browser: needs a human on "${spec.title}"`);
        return await finish('needs_human', `blocked on ${spec.id}: ${errs.join(', ')}`);
      }
      pagesCompleted += 1;
      const next = after ? pageById(after) : undefined;
      if (next && next.sectionId !== spec.sectionId) {
        emit('section_done', `filled ${spec.sectionTitle} section`);
        await timeline(`Browser: filled ${spec.sectionTitle} section`);
      }
    }
    emit('needs_human', 'step limit reached before the signature screen');
    return await finish('needs_human', 'step limit reached');
  } catch (e) {
    emit('error', errMsg(e));
    try {
      screenshotPath ??= join(outDir, 'error.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch { /* page may be gone */ }
    return await finish('error', errMsg(e));
  }
}

const PAGE_RETRIES = 3;

/**
 * Read the mock page id; if the page is not a mock page (a quick-tunnel hiccup such as a Cloudflare 502/1033
 * error page), reload the same GET URL a few times before giving up. Reloading a GET is idempotent.
 */
async function currentPageId(page: Page, emit: (step: string, message: string, pageId?: string) => void): Promise<string | null> {
  for (let i = 0; ; i++) {
    const id = await page.locator('body').getAttribute('data-page-id', { timeout: 5_000 }).catch(() => null);
    if (id || i >= PAGE_RETRIES) return id;
    const title = await page.title().catch(() => '');
    emit('warn', `page did not load (${title || 'no title'}); reloading (${i + 1}/${PAGE_RETRIES})`);
    await sleep(2_000 * (i + 1));
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
  }
}

async function fillPage(
  page: Page, spec: FlatPage, answers: Answers, missing: string[], pace: number,
  emit: (step: string, message: string, pageId?: string) => void,
): Promise<void> {
  for (const f of spec.fields) {
    if (SIGNATURE_FIELD_NAMES.has(f.name) || f.type === 'file') continue; // never touch the signature controls
    const v = answers[f.name];
    if (v === undefined || v === '' || v === false) continue;
    const sel = f.type === 'radio' ? `[name="${f.name}"][value="${String(v)}"]` : `[name="${f.name}"]`;
    const loc = page.locator(sel);
    if ((await loc.count()) === 0) { missing.push(f.name); emit('missing_field', `selector not found: ${f.name}`, spec.id); continue; }
    try {
      if (f.type === 'select') await loc.selectOption(String(v));
      else if (f.type === 'radio' || f.type === 'checkbox') await loc.check();
      else await loc.fill(String(v));
    } catch (e) {
      missing.push(f.name);
      emit('missing_field', `could not fill ${f.name}: ${errMsg(e).split('\n')[0]}`, spec.id);
      continue;
    }
    if (pace) await sleep(pace);
  }
}

async function uploadDocuments(
  page: Page, docs: DocumentRecord[], dir: string, missing: string[],
  emit: (step: string, message: string, pageId?: string) => void,
): Promise<void> {
  const byField = new Map<string, string[]>();
  for (const d of docs) {
    try {
      const prepared = await prepareDocument(d, dir);
      if (!prepared) { emit('warn', `skipped ${d.docType} document (over the size limit)`); continue; }
      const field = fieldForDocType(d.docType);
      byField.set(field, [...(byField.get(field) ?? []), prepared.path]);
      if (prepared.note) emit('compress', `${d.docType} document compressed under 7.5 MB`);
    } catch (e) {
      emit('warn', `could not prepare ${d.docType} document: ${errMsg(e)}`);
    }
  }
  for (const [field, paths] of byField) {
    const loc = page.locator(`input[type="file"][name="${field}"]`);
    if ((await loc.count()) === 0) { missing.push(field); continue; }
    await loc.setInputFiles(paths);
    emit('upload', `uploaded ${paths.length} file(s) to ${field}`);
  }
}

async function advance(page: Page, spec: FlatPage): Promise<void> {
  if (shouldStopAt(spec.id) || spec.kind === 'signature') throw new Error('refusing to advance from the signature screen');
  const next = page.locator('button[data-action="next"]');
  if ((await next.count()) === 0) throw new Error(`no Next button on ${spec.id}`);
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  nav.catch(() => undefined); // if the click throws first, this rejection must not crash the process
  await next.first().click();
  await nav;
}
