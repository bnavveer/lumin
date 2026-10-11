// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// REAL BENEFITSCAL MODE (opt-in, preview by default)
//
// This module automates a real California government website (https://benefitscal.com) on the
// APPLICANT'S OWN ACCOUNT, AT THEIR DIRECTION. It is intended for authorized assistance only.
//   • The human signs in themselves in the live view. This code never receives, types or stores credentials.
//   • It must NEVER submit, sign, certify or agree to anything. Those guards are plain code below
//     (isBlockedControl / isStopPage), never an LLM decision.
//   • Default is a dry-run PREVIEW: it reads the form and proposes a fill plan; it types nothing.
//     Typing needs an explicit opt-in (--type / an approve step) and only types real, user-entered data.
//   • Documents are never uploaded in real mode.
//   • Check BenefitsCal's terms of use before using this. Enabled only with ALLOW_REAL_BENEFITSCAL=true.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import type { Page } from 'playwright';
import type { Household } from '../contracts.js';

export const REAL_HOME = 'https://benefitscal.com';
export const SIGNIN_TIMEOUT_MS = 10 * 60_000;
const SIGNIN_POLL_MS = 3_000;
const PAGE_LIMIT = 30;

export const realModeAllowed = (v: string | undefined = process.env.ALLOW_REAL_BENEFITSCAL): boolean => v === 'true';

// ── Hard stops (deterministic) ──
/** Buttons/links the agent must never click, whatever the mode. */
export const BLOCKED_CONTROL = /submit|sign|signature|agree|certify|i declare|penalty of perjury|send application|finish/i;
/** The ONLY navigation the agent may click (and only in typing mode). */
export const ALLOWED_NAV = /^\s*(next|continue|save and continue|save & continue)\s*$/i;
/** Review-and-submit and signature screens (BenefitsCal screen codes) — the run stops entirely here. */
export const STOP_SCREENS = ['ABORS', 'ABSID', 'ABPAP'] as const;
const STOP_HEADING = /review and submit|please sign|sign(ature)? (your|the) application|^\s*sign\b/i;
/** Sections whose checkboxes are never ticked. */
export const PROTECTED_SECTION = /rights|responsibilit|signature|sign below|declar|certif|perjury|penalt|acknowledg/i;

export const isBlockedControl = (text: string): boolean => BLOCKED_CONTROL.test(text);
export const isAllowedNav = (text: string): boolean => ALLOWED_NAV.test(text) && !isBlockedControl(text);

export function screenCode(url: string): string | null {
  return /\/(?:ApplyForBenefits|Dashboard)\/([A-Z]{4,6})\b/.exec(url)?.[1] ?? null;
}

export function isStopPage(url: string, heading = ''): boolean {
  const code = screenCode(url);
  if (code && (STOP_SCREENS as readonly string[]).includes(code)) return true;
  return STOP_HEADING.test(heading);
}

/** A signed-in application page: the ApplyForBenefits flow on benefitscal.com. */
export function isSignedInApplicationPage(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)benefitscal\.com$/i.test(u.hostname) && /^\/ApplyForBenefits\/[A-Z]{4,6}\b/.test(u.pathname);
  } catch { return false; }
}

// ── Data guard ──
const SEED_PHONE = /^\+1(213555|213556|213557|555)/;
export const isSeedHousehold = (h: Pick<Household, 'phone'>): boolean => SEED_PHONE.test(h.phone.replace(/[^\d+]/g, ''));

export class RealModeRefused extends Error {}

/** Typing on the real site needs the env flag AND a non-synthetic household. Preview only needs the flag. */
export function assertRealModeAllowed(h: Pick<Household, 'phone'>, typing: boolean, allowed = realModeAllowed()): void {
  if (!allowed) throw new RealModeRefused('Real BenefitsCal mode is disabled (set ALLOW_REAL_BENEFITSCAL=true).');
  if (typing && isSeedHousehold(h)) throw new RealModeRefused('Refusing to type a synthetic seed household into the real BenefitsCal. Preview only.');
}

/** Only real, user-entered profile values. Undefined/empty values are dropped: never invent data. */
export function realProfile(h: Household): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && String(v).trim() !== '') out[k] = String(v); };
  put('first_name', h.firstName);
  put('phone', h.phone.replace(/^\+1/, ''));
  put('county', h.county);
  put('household_size', h.size);
  put('monthly_income', h.monthlyIncome);
  put('children_under_18', h.childrenUnder18);
  put('pregnant', h.pregnant ? 'yes' : 'no');
  return out;
}

// ── Page reading ──
export interface PageField { key: string; label: string; name: string; type: string; options: string[]; section: string }

/** Read visible inputs (label, name, type, options) from the DOM. Read-only. */
export async function readFields(page: Page): Promise<PageField[]> {
  return page.evaluate(() => {
    const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const labelOf = (el: HTMLElement): string => {
      const id = el.getAttribute('id');
      const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null;
      return (byFor ?? el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? el.getAttribute('placeholder') ?? '').trim().replace(/\s+/g, ' ').slice(0, 160);
    };
    const els = Array.from(document.querySelectorAll('input, select, textarea')) as HTMLInputElement[];
    return els.filter((el) => vis(el) && !['hidden', 'submit', 'button', 'password', 'file'].includes(el.type)).map((el, i) => {
      const section = (el.closest('fieldset, section, [role="group"]')?.querySelector('legend, h2, h3')?.textContent ?? '').trim().slice(0, 120);
      const options = el.tagName === 'SELECT' ? Array.from((el as unknown as HTMLSelectElement).options).map((o) => o.text.trim()).filter(Boolean).slice(0, 40) : [];
      return { key: el.id || el.name || `field_${i}`, label: labelOf(el), name: el.name, type: el.tagName === 'SELECT' ? 'select' : el.type || 'text', options, section };
    });
  });
}

// ── Plan ──
export const PlanSchema = z.object({
  items: z.array(z.object({
    key: z.string(), label: z.string(), profileField: z.string().nullable(), value: z.string().nullable(), confidence: z.number().min(0).max(1),
  })),
});
export type FillPlan = z.infer<typeof PlanSchema>['items'];
export type Planner = (fields: PageField[], profile: Record<string, string>) => Promise<FillPlan>;

/** Drop anything the LLM proposed that is not a verbatim profile value, or that targets a protected field. */
export function sanitizePlan(plan: FillPlan, fields: PageField[], profile: Record<string, string>): FillPlan {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return plan.flatMap((p) => {
    const f = byKey.get(p.key);
    if (!f || !p.profileField || !(p.profileField in profile)) return [];
    if (PROTECTED_SECTION.test(`${f.section} ${f.label}`) || isBlockedControl(f.label)) return [];
    return [{ ...p, value: profile[p.profileField]! }];
  });
}

export async function llmPlanner(fields: PageField[], profile: Record<string, string>): Promise<FillPlan> {
  const { generateObjectWithFallback } = await import('../llm.js');
  const { object } = await generateObjectWithFallback('fast', PlanSchema, {
    system: 'Map an applicant profile onto form fields. For each form field that clearly matches a profile key, return {key, label, profileField, value, confidence}. value must be the profile value verbatim. If no profile key matches, omit the field. Never invent values. Never map signature, agreement or certification fields.',
    prompt: `Profile keys and values:\n${JSON.stringify(profile)}\n\nForm fields:\n${JSON.stringify(fields.map(({ key, label, type, options }) => ({ key, label, type, options })))}`,
  });
  return object.items;
}

// ── Run ──
export interface RealEvent { step: string; message: string; data?: unknown }
export interface RealRunOptions {
  page: Page;
  household: Household;
  typing: boolean;
  planner?: Planner;
  onEvent?: (e: RealEvent) => void;
  screenshot?: (name: string) => Promise<string | undefined>;
  signInTimeoutMs?: number;
  pollMs?: number;
}
export interface RealPageReport { url: string; screen: string | null; plan: FillPlan; typed: string[]; screenshot?: string }
export interface RealRunResult { status: 'stopped_before_signing' | 'preview_done' | 'signin_timeout' | 'needs_human'; pages: RealPageReport[]; note: string }

/** Wait until the person has signed in and is on an application page. Never touches the login form. */
export async function waitForSignedIn(page: Page, timeoutMs = SIGNIN_TIMEOUT_MS, pollMs = SIGNIN_POLL_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isSignedInApplicationPage(page.url())) return true;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}

async function heading(page: Page): Promise<string> {
  return (await page.locator('h1, h2').first().textContent({ timeout: 2_000 }).catch(() => '')) ?? '';
}

/** Type the approved plan. Text/select only; checkboxes in protected sections are never touched. */
async function typePlan(page: Page, plan: FillPlan, fields: PageField[]): Promise<string[]> {
  const typed: string[] = [];
  for (const p of plan) {
    const f = fields.find((x) => x.key === p.key);
    if (!f || !p.value || f.type === 'checkbox' || f.type === 'radio') continue;
    const loc = page.locator(`[id="${p.key}"], [name="${p.key}"]`).first();
    try {
      if (f.type === 'select') await loc.selectOption({ label: p.value });
      else await loc.fill(p.value);
      typed.push(p.label);
    } catch { /* skip fields that do not accept the value */ }
  }
  return typed;
}

/** Click ONLY an allowed Next/Continue control, after re-checking it against the block list. */
async function clickNext(page: Page): Promise<boolean> {
  const buttons = page.locator('button, input[type="button"], input[type="submit"], a[role="button"]');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const text = `${(await b.textContent().catch(() => '')) ?? ''} ${(await b.getAttribute('aria-label').catch(() => '')) ?? ''} ${(await b.getAttribute('value').catch(() => '')) ?? ''}`.trim();
    if (!isAllowedNav(text.replace(/\s+/g, ' ')) || !(await b.isVisible().catch(() => false))) continue;
    await b.click();
    await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    return true;
  }
  return false;
}

export async function runRealSite(o: RealRunOptions): Promise<RealRunResult> {
  assertRealModeAllowed(o.household, o.typing);
  const emit = (step: string, message: string, data?: unknown) => o.onEvent?.({ step, message, data });
  const planner = o.planner ?? llmPlanner;
  const profile = realProfile(o.household);
  const pages: RealPageReport[] = [];

  if (!isSignedInApplicationPage(o.page.url())) {
    emit('waiting_for_signin', 'Sign in to BenefitsCal yourself in the live view and open your application. Aid never sees your password.');
    if (!(await waitForSignedIn(o.page, o.signInTimeoutMs, o.pollMs))) {
      return { status: 'signin_timeout', pages, note: 'Nobody signed in within 10 minutes; nothing was typed.' };
    }
  }

  for (let i = 0; i < PAGE_LIMIT; i++) {
    const url = o.page.url();
    if (isStopPage(url, await heading(o.page))) {
      const shot = await o.screenshot?.('stopped-before-signing');
      pages.push({ url, screen: screenCode(url), plan: [], typed: [], screenshot: shot });
      emit('stopped_before_signing', `Stopped before signing at ${screenCode(url) ?? url}. You review, sign and submit yourself.`);
      return { status: 'stopped_before_signing', pages, note: 'Stopped before signing. Aid never signs, agrees or submits.' };
    }
    const fields = await readFields(o.page);
    const plan = sanitizePlan(fields.length ? await planner(fields, profile) : [], fields, profile);
    const typed = o.typing ? await typePlan(o.page, plan, fields) : [];
    const shot = await o.screenshot?.(`page-${i + 1}-${screenCode(url) ?? 'page'}`);
    pages.push({ url, screen: screenCode(url), plan, typed, screenshot: shot });
    emit('plan', `${screenCode(url) ?? url}: ${plan.length} field(s) proposed${o.typing ? `, ${typed.length} typed` : ' (preview, nothing typed)'}`, plan);
    if (!o.typing) return { status: 'preview_done', pages, note: 'Preview only: nothing was typed. Approve the plan to let Aid type it.' };
    if (!(await clickNext(o.page))) return { status: 'needs_human', pages, note: 'No safe Next/Continue button found; handing back to you.' };
  }
  return { status: 'needs_human', pages, note: 'Page limit reached.' };
}
