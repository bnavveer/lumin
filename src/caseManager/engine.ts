// Channel-agnostic conversation engine: after setup, a person manages their whole case by text.
// The caller (Dial SMS loop, email, simulator) delivers replies; this module never sends anything itself.
import type { ModelMessage } from 'ai';
import { v5 as uuidv5 } from 'uuid';
import type { DocType, Household } from '../contracts.js';
import { DEMO_ORG_ID } from '../supabase.js';
import { proposeAction, resolveLatest } from './approvals.js';
import { recordConsent, recordOptIn, recordOptOut } from './consent.js';
import { bg, getDeps, type ConversationDeps } from './deps.js';
import { isLang, parseIntent, type Intent } from './intents.js';
import { spanishSeeds, splitSms, systemPrompt, T } from './prompts.js';
import { defaultState, type ConversationState, type Lang, type Org } from './state.js';
import { docsText, likelyPrograms, statusText } from './status.js';
import { buildTools, escalate, screened as isScreened, type TurnContext } from './tools.js';

export type Channel = 'sms' | 'imessage' | 'email' | 'sim';
export interface IncomingMessage {
  channel: Channel;
  from: string;
  text: string;
  media?: Array<{ url: string; contentType: string }>;
  messageId?: string;
}
export interface OutgoingMessage { to: string; text: string; mediaUrls?: string[] }
export type ProactiveKind = 'interview_nudge' | 'docs_nudge' | 'renewal_start' | 'submit' | 'waitlist_check';

const DEFAULT_CLINIC: Org = { id: DEMO_ORG_ID, name: 'your clinic' };
const LANG_SET_TEXT: Record<Lang, string> = {
  en: 'Okay! I will text you in English from now on.',
  es: '¡Listo! Desde ahora le escribiré en español.',
  zh: '好的！从现在起我会用中文给您发短信。',
  vi: 'Được rồi! Từ giờ tôi sẽ nhắn tin cho bạn bằng tiếng Việt.',
  tl: 'Sige! Magte-text ako sa iyo sa Tagalog mula ngayon.',
};
const MAX_HISTORY = 16;
const SPANISH_HINT = /[¿¡ñáéíóú]|\b(hola|quiero|necesito|cuando|cuándo|ayuda|tengo|gracias|por favor|mi|es|que)\b/i;

export function householdIdFor(phone: string): string {
  return uuidv5(phone, uuidv5.URL);
}

export function normalizeFrom(from: string, channel: Channel): string {
  if (channel === 'email') return from.trim().toLowerCase();
  const digits = from.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits || from.trim();
}

// ── template translation (cached in memory) ─────────────────────────────────
const translationCache = new Map<string, string>();
async function localize(deps: ConversationDeps, text: string, lang: Lang): Promise<string> {
  if (lang === 'en') return text;
  const key = `${lang}\u0000${text}`;
  const hit = translationCache.get(key);
  if (hit) return hit;
  try {
    const out = await deps.translate(text, lang);
    translationCache.set(key, out);
    return out;
  } catch (err) {
    console.error('[conversation] translate failed, sending English:', err instanceof Error ? err.message : err);
    return text;
  }
}
export const clearTranslationCache = (): void => translationCache.clear();

// ── household bootstrap ─────────────────────────────────────────────────────
async function loadOrCreate(
  deps: ConversationDeps, phone: string, intent: Intent,
): Promise<{ household: Household; state: ConversationState; org: Org; isNew: boolean }> {
  const repo = deps.repo;
  let household = await repo.getHouseholdByPhone(phone);
  let isNew = false;
  let org: Org | undefined;
  if (!household) {
    if (intent.kind === 'join' && intent.code) org = await repo.orgByCode(intent.code);
    org ??= (await repo.orgByCode('AID')) ?? DEFAULT_CLINIC;
    household = {
      id: householdIdFor(phone), orgId: org.id, phone,
      county: org.county === 'san_francisco' ? 'san_francisco' : 'los_angeles',
      size: 1, monthlyIncome: 0, childrenUnder18: 0, pregnant: false, adultAge: 30,
      immigrationStatus: 'unknown', childrenAreCitizens: true,
    };
    await repo.upsertHousehold(household);
    await repo.addTimeline(household.id, 'Started texting Aid');
    isNew = true;
  }
  const [stored, owner] = await Promise.all([repo.getState(household.id), org ? Promise.resolve(org) : repo.orgById(household.orgId)]);
  let state = stored;
  org = owner ?? DEFAULT_CLINIC;
  if (!state) {
    // A household the clinic already screened (web intake) skips screening after consent.
    state = { ...defaultState(household.id), pendingContext: { screened: !isNew } };
  }
  return { household, state, org, isNew };
}

function guessDocType(text: string): DocType | undefined {
  const t = text.toLowerCase();
  if (/pay ?stub|paycheck|talon|cheque|pago/.test(t)) return 'paystub';
  if (/\bid\b|license|licencia|identificaci|passport|pasaporte/.test(t)) return 'id';
  if (/lease|rent|renta|alquiler|contrato/.test(t)) return 'lease';
  if (/birth|nacimiento/.test(t)) return 'birth_cert';
  if (/green card|immigra|inmigra|visa/.test(t)) return 'immigration';
  return undefined;
}

// ── turn handlers ───────────────────────────────────────────────────────────
async function handlePhotos(
  deps: ConversationDeps, msg: IncomingMessage, h: Household, state: ConversationState, scr: boolean,
): Promise<{ texts: string[]; state: ConversationState }> {
  let docType = guessDocType(msg.text);
  if (!docType) {
    const programs = likelyPrograms(h, scr);
    try { docType = programs.length ? (await deps.missingDocs(h.id, programs))[0] : undefined; } catch { docType = undefined; }
  }
  const ids: string[] = [];
  for (const m of msg.media ?? []) {
    try {
      const doc = await deps.storeDocument(h.id, m.url, m.contentType, docType ?? 'other');
      ids.push(doc.id);
      bg(deps.logEvent(h.id, { type: 'DocReceived', value: docType ?? 'other' }), 'log doc');
      bg(deps.startExtraction(doc.id), 'start extraction');
    } catch (err) {
      console.error('[conversation] store photo failed:', err instanceof Error ? err.message : err);
    }
  }
  if (!ids.length) return { texts: [T.photoFailed()], state };
  await deps.repo.addTimeline(h.id, `Sent ${ids.length} document photo${ids.length > 1 ? 's' : ''} by text`);
  const extractions = [...(state.pendingContext.extractions ?? []), ...ids];
  return { texts: [T.photoGot()], state: { ...state, pendingContext: { ...state.pendingContext, extractions } } };
}

const DOC_LABEL: Record<string, string> = { id: 'ID', paystub: 'pay stub', lease: 'lease', birth_cert: 'birth certificate', immigration: 'immigration papers', other: 'document' };

/** Report documents whose reading finished since the last turn. */
async function extractionReport(
  deps: ConversationDeps, h: Household, state: ConversationState, scr: boolean,
): Promise<{ texts: string[]; state: ConversationState }> {
  const ids = state.pendingContext.extractions ?? [];
  if (!ids.length) return { texts: [], state };
  const still: string[] = [];
  const done: string[] = [];
  for (const id of ids) {
    try {
      const r = await deps.pollExtraction(id);
      if (r.status === 'reading' || r.status === 'received') still.push(id);
      else done.push(DOC_LABEL[r.docType ?? 'other'] ?? 'document');
    } catch { still.push(id); }
  }
  const next = { ...state, pendingContext: { ...state.pendingContext, extractions: still } };
  if (!done.length) return { texts: [], state: next };
  let tail = '';
  try { tail = ` ${await docsText(deps, h, scr)}`; } catch { tail = ''; }
  return { texts: [`I finished reading your ${done.join(' and ')}.${tail}`], state: next };
}

async function maybeDetectLanguage(deps: ConversationDeps, state: ConversationState, text: string): Promise<ConversationState> {
  if (state.languageLocked || text.trim().length < 8) return state;
  const looksForeign = /[^\x00-\x7F]/.test(text) || SPANISH_HINT.test(text);
  if (!looksForeign && state.language === 'en') return state;
  try {
    const code = await deps.detectLanguage(text);
    return isLang(code) && code !== state.language ? { ...state, language: code } : state;
  } catch { return state; }
}

async function agentTurn(deps: ConversationDeps, ctx: TurnContext): Promise<string[]> {
  const started = Date.now();
  const history = await deps.repo.getMessages(ctx.household.id, MAX_HISTORY);
  const messages: ModelMessage[] = history.map((m) => ({ role: m.role, content: m.content }));
  const today = deps.now().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
  let text: string;
  try {
    text = await deps.runAgent({
      householdId: ctx.household.id,
      system: systemPrompt({ clinic: ctx.clinic, state: ctx.state, household: ctx.household, screened: isScreened(ctx), today }),
      messages,
      tools: buildTools(ctx),
    });
  } catch (err) {
    console.error('[conversation] agent failed:', err instanceof Error ? err.message : err);
    text = await localize(deps, T.fallback(), ctx.state.language);
  }
  bg(deps.logEvent(ctx.household.id, { type: 'AgentTurnMs', value: Date.now() - started }), 'log turn ms');
  const out = splitSms(text);
  // The YES/NO question always comes from the deterministic approval text, never from the model.
  if (ctx.proposed.length) {
    out.push(await localize(deps, T.approvalAsk(ctx.proposed[ctx.proposed.length - 1]!.description), ctx.state.language));
  }
  return out.length ? out : [await localize(deps, T.fallback(), ctx.state.language)];
}

/** Main entry point. Returns the replies for the caller to deliver (possibly none). */
export async function handleIncomingMessage(msg: IncomingMessage): Promise<OutgoingMessage[]> {
  const deps = await getDeps();
  const repo = deps.repo;
  if (msg.messageId && !(await repo.markProcessed(`conv:${msg.messageId}`))) return [];

  const phone = normalizeFrom(msg.from, msg.channel);
  const text = (msg.text ?? '').slice(0, 2000);
  const intent = parseIntent(text);
  const loaded = await loadOrCreate(deps, phone, intent);
  const org = loaded.org;
  let h = loaded.household;
  let state: ConversationState = { ...loaded.state, channel: msg.channel };
  const hasMedia = (msg.media?.length ?? 0) > 0;

  await repo.appendMessage(h.id, 'user', hasMedia ? `${text}${text ? ' ' : ''}[${msg.media!.length} photo]`.trim() : text);
  bg(deps.logEvent(h.id, { type: 'UserReplied' }), 'log reply');

  if (state.language === 'es') for (const [en, es] of spanishSeeds(org.name)) translationCache.set(`es\u0000${en}`, es);
  const replies: string[] = [];
  const say = async (t: string): Promise<void> => { replies.push(await localize(deps, t, state.language)); };

  // 1) Opted out: only START (or a repeated STOP) gets any reply.
  if (state.stage === 'opted_out') {
    if (intent.kind === 'start') {
      await recordOptIn(deps, h.id, text, msg.channel);
      state = { ...state, stage: state.pendingContext.stageBeforeOptOut ?? 'awaiting_consent', pendingContext: { ...state.pendingContext, stageBeforeOptOut: undefined } };
      await say(state.stage === 'awaiting_consent' ? `${T.optIn()} ${T.consentAsk(org.name)}` : T.optIn());
    } else if (intent.kind === 'stop') {
      await say(T.optOut());
    }
    return finish(deps, h, state, replies);
  }

  // 2) Compliance keywords work at every other stage.
  if (intent.kind === 'stop') {
    await recordOptOut(deps, h.id, text, msg.channel);
    state = { ...state, stage: 'opted_out', pendingContext: { ...state.pendingContext, stageBeforeOptOut: state.stage === 'new' ? 'awaiting_consent' : state.stage } };
    await say(T.optOut());
    return finish(deps, h, state, replies);
  }
  if (intent.kind === 'help') { await say(T.help()); return finish(deps, h, state, replies); }
  if (intent.kind === 'lang') {
    state = { ...state, language: intent.lang, languageLocked: true };
    replies.push(LANG_SET_TEXT[intent.lang]);
    return finish(deps, h, state, replies);
  }

  // 3) Setup: first contact / JOIN -> consent gate. Nothing else happens until YES.
  if (state.stage === 'new' || (intent.kind === 'join' && state.stage === 'awaiting_consent')) {
    if (intent.kind === 'join' && intent.code) {
      const joined = await repo.orgByCode(intent.code);
      if (joined && joined.id !== h.orgId) { h = { ...h, orgId: joined.id }; await repo.upsertHousehold(h); }
    }
    state = await maybeDetectLanguage(deps, { ...state, stage: 'awaiting_consent' }, text);
    const clinic = intent.kind === 'join' && intent.code ? ((await repo.orgByCode(intent.code)) ?? org) : org;
    await say(T.consentAsk(clinic.name));
    return finish(deps, h, state, replies);
  }
  if (state.stage === 'awaiting_consent') {
    if (intent.kind === 'yes') {
      await recordConsent(deps, h.id, org.name, text, msg.channel);
      const scr = state.pendingContext.screened === true;
      const spanishYes = /^(S[IÍ]|CLARO|DALE|VALE)$/i.test(text.trim().replace(/[.!¡]/g, ''));
      state = { ...state, stage: scr ? 'active' : 'screening', ...(spanishYes && !state.languageLocked ? { language: 'es' as const } : {}) };
      if (state.language === 'es') for (const [en, es] of spanishSeeds(org.name)) translationCache.set(`es\u0000${en}`, es);
      await say(scr ? T.consentThanksScreened() : T.consentThanks());
    } else if (intent.kind === 'human') {
      await escalate({ deps, household: h, escalated: false }, 'requested');
      await say(T.human(org.name));
    } else {
      await say(T.consentStillNeeded());
    }
    return finish(deps, h, state, replies);
  }

  // 4) Consented (screening / active).
  const scr = state.pendingContext.screened === true || state.stage === 'active';
  const report = await extractionReport(deps, h, state, scr);
  state = report.state;
  for (const r of report.texts) await say(r);

  if (hasMedia) {
    const p = await handlePhotos(deps, msg, h, state, scr);
    state = p.state;
    for (const t of p.texts) await say(t);
    return finish(deps, h, state, replies);
  }

  switch (intent.kind) {
    case 'human':
      await escalate({ deps, household: h, escalated: false }, 'requested');
      await say(T.human(org.name));
      return finish(deps, h, state, replies);
    case 'status':
      await say(await statusText(deps, h, scr));
      return finish(deps, h, state, replies);
    case 'docs':
      await say(await docsText(deps, h, scr));
      return finish(deps, h, state, replies);
    case 'renew': {
      await proposeAction(deps, h.id, 'start_renewal');
      await say(T.renewAsk());
      return finish(deps, h, state, replies);
    }
    case 'digit':
      if (state.lastNudgeKind === 'interview_nudge') {
        state = { ...state, lastNudgeKind: null };
        if (intent.value === '1') {
          bg(deps.logEvent(h.id, { type: 'InterviewConfirmed' }), 'log interview confirmed');
          await repo.addTimeline(h.id, 'Interview confirmed by text');
          await say(T.interviewConfirmed());
        } else {
          await proposeAction(deps, h.id, 'call_office', { purpose: 'reschedule_interview' });
          await say(T.rescheduleAsk());
        }
        return finish(deps, h, state, replies);
      }
      break;
    case 'yes':
    case 'no': {
      const outcome = await resolveLatest(deps, h.id, intent.kind === 'yes', 'person');
      if (outcome) {
        for (const r of outcome.replies) await say(r);
        return finish(deps, h, state, replies);
      }
      break; // nothing pending: probably answering a screening question -> agent
    }
    default:
      break;
  }

  // 5) LLM layer.
  state = await maybeDetectLanguage(deps, state, text);
  const ctx: TurnContext = { deps, household: h, state, clinic: org.name, proposed: [], escalated: false };
  const out = await agentTurn(deps, ctx);
  replies.push(...out);
  return finish(deps, ctx.household, ctx.state, replies);
}

async function finish(deps: ConversationDeps, h: Household, state: ConversationState, replies: string[]): Promise<OutgoingMessage[]> {
  await deps.repo.saveState(state);
  for (const r of replies) await deps.repo.appendMessage(h.id, 'assistant', r);
  return replies.map((text) => ({ to: h.phone, text }));
}

// ── proactive (autopilot) messages ──────────────────────────────────────────
function inQuietHours(state: ConversationState, now: Date): boolean {
  const { start, end, tz } = state.quietHours;
  const hm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  return start > end ? hm >= start || hm < end : hm >= start && hm < end;
}

/**
 * Build outgoing autopilot nudges for a household (Lane A's actions.ts calls this, then sends).
 * Returns [] when the person has not consented, opted out, or it is quiet hours.
 */
export async function proactiveMessage(
  householdId: string, kind: ProactiveKind, opts: { ignoreQuietHours?: boolean } = {},
): Promise<OutgoingMessage[]> {
  const deps = await getDeps();
  const h = await deps.repo.getHousehold(householdId);
  if (!h) return [];
  const state = (await deps.repo.getState(h.id)) ?? defaultState(h.id);
  if (state.stage !== 'active' && state.stage !== 'screening') return [];
  if (!opts.ignoreQuietHours && inQuietHours(state, deps.now())) return [];
  const name = h.firstName ?? 'there';
  let text: string;
  let next: ConversationState = state;
  if (kind === 'submit') {
    const programs = likelyPrograms(h, true);
    const a = await proposeAction(deps, h.id, 'submit_application', { programs });
    text = await localize(deps, T.approvalAsk(a.description), state.language);
  } else if (kind === 'waitlist_check') {
    return [];
  } else {
    const nudge = await deps.nudgeText(kind, name);
    if (kind === 'renewal_start') await proposeAction(deps, h.id, 'start_renewal');
    bg(deps.logEvent(h.id, { type: 'NudgeSent', value: kind }), 'log nudge');
    bg(deps.logEvent(h.id, { type: 'NudgeVariant', value: nudge.variantId }), 'log variant');
    text = await localize(deps, nudge.text, state.language);
    next = { ...state, lastNudgeKind: kind };
  }
  return finish(deps, h, next, [text]);
}
