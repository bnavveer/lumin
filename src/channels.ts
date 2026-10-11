// Wires the conversation service to the real Dial, Claude, Supabase and Keewano clients.
import { createConversation, type Conversation } from './conversation.js';
import { extractFromCall, runAgentTurn } from './agent.js';
import { getCall, sendText, startEventLoop, transcriptText, type EventHandlers, type InboundMessage } from './dial.js';
import { DialClient } from '@getdial/sdk';
import { memoryIntakeRepo, supabaseIntakeRepo } from './intakeStore.js';
import { logEvents } from './keewano.js';
import * as store from './store.js';
import { admin, DEMO_ORG_ID } from './supabase.js';
import { env, optionalEnv } from './env.js';
import { householdId, normalizePhone } from './intake.js';
import { getDeps as getCaseDeps } from './caseManager/deps.js';
import { handleIncomingMessage, type IncomingMessage, type OutgoingMessage } from './caseManager/engine.js';
import { normalize as normalizeIntent, parseIntent } from './caseManager/intents.js';
import { T } from './caseManager/prompts.js';
import type { ConversationState } from './caseManager/state.js';

const OK_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const OK_DOCUMENTS = new Set([...OK_IMAGES, 'application/pdf']);

export interface MessagingDeps {
  isOptedOut(phone: string): Promise<boolean>;
  setOptedOut(phone: string, optedOut: boolean, reply: string): Promise<void>;
  getCaseDeps: typeof getCaseDeps;
  handleCaseMessage: typeof handleIncomingMessage;
  sendText: typeof sendText;
}

/** Phone preferences also cover people who have not confirmed an intake yet. */
export async function isPhoneOptedOut(phone: string): Promise<boolean> {
  const { data, error } = await admin().from('phone_messaging_preferences').select('opted_out')
    .eq('phone', normalizePhone(phone)).maybeSingle();
  if (error) throw new Error(`[channels] messaging preference: ${error.message}`);
  return data?.opted_out === true;
}

async function setPhoneOptedOut(phone: string, optedOut: boolean, reply: string): Promise<void> {
  const { error } = await admin().from('phone_messaging_preferences').upsert({
    phone: normalizePhone(phone), opted_out: optedOut, last_reply: reply, updated_at: new Date().toISOString(),
  }, { onConflict: 'phone' });
  if (error) throw new Error(`[channels] save messaging preference: ${error.message}`);
}

const liveMessagingDeps: MessagingDeps = {
  isOptedOut: isPhoneOptedOut, setOptedOut: setPhoneOptedOut, getCaseDeps,
  handleCaseMessage: handleIncomingMessage, sendText,
};

/** Intake replies are requested by the person; STOP still suppresses every channel's SMS. */
async function messagingPaused(phone: string, d: MessagingDeps): Promise<boolean> {
  if (await d.isOptedOut(phone)) return true;
  const deps = await d.getCaseDeps();
  return (await deps.repo.getState(householdId(normalizePhone(phone))))?.stage === 'opted_out';
}

export function createIntakeTextSender(overrides: Partial<Pick<MessagingDeps, 'isOptedOut' | 'sendText' | 'getCaseDeps'>> = {}) {
  const d = { ...liveMessagingDeps, ...overrides };
  return async (to: string, body: string): Promise<string> => {
    if (await messagingPaused(to, d)) throw new Error('Texts are paused. Text START to Lumin to receive texts again.');
    return d.sendText(to, body);
  };
}
export const sendIntakeText = createIntakeTextSender();

function quietHours(state: ConversationState, now: Date): boolean {
  const { start, end, tz } = state.quietHours;
  const hm = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  return start > end ? hm >= start || hm < end : hm >= start && hm < end;
}

/** Outbox adapter: a fallback nudge must never bypass consent, STOP, or quiet hours. */
export async function sendProactiveText(
  householdId: string, phone: string, text: string, overrides: Partial<MessagingDeps> = {},
): Promise<void> {
  const d = { ...liveMessagingDeps, ...overrides };
  const deps = await d.getCaseDeps();
  const [h, state, optedOut] = await Promise.all([
    deps.repo.getHousehold(householdId), deps.repo.getState(householdId), d.isOptedOut(phone),
  ]);
  if (!h || h.phone !== normalizePhone(phone) || !state || optedOut ||
      !['active', 'screening'].includes(state.stage) || quietHours(state, deps.now()))
    throw new Error('Proactive text suppressed: consent, phone preference, or quiet hours');
  await d.sendText(phone, text);
}

// A correction belongs to the working intake and gets reconfirmed before changing the household.
const CORRECTION = /\b(actually|correction|correct my|fix my|change my|update my|(?:my|our) (?:income|age|county|household|children|immigration)|(?:i|we) (?:earn|make)\b|income (?:is|changed)|moved|new address|household (?:is|changed)|(?:income|age|county|household size|rent) (?:is now|should be)|(?:i am|i'm) (?:now |no longer )?pregnant|(?:my|our) child (?:is|turned)|(?:mi|nuestro) (?:ingreso|edad|hogar|familia)|(?:gano|ganamos|me mude|estoy embarazada|corregir|cambiar mis datos))\b/i;
const CASE_COMMANDS = new Set(['status', 'docs', 'human', 'renew', 'lang', 'join']);

/** Shared SMS dispatcher; no SDK/network calls are needed when dependencies are injected. */
export function createSmsDispatcher(conv: Conversation, overrides: Partial<MessagingDeps> = {}) {
  const d = { ...liveMessagingDeps, ...overrides };
  async function recordedReply(phone: string, body: string, replies: OutgoingMessage[], caseRecorded = false) {
    await conv.recordChannelMessage(phone, 'user', body, { mirror: !caseRecorded });
    for (const r of replies) {
      await conv.recordChannelMessage(phone, 'assistant', r.text, { mirror: !caseRecorded });
      await d.sendText(r.to, r.text);
    }
  }
  return async (m: Omit<InboundMessage, 'to'>): Promise<void> => {
    const phone = normalizePhone(m.from);
    const intent = parseIntent(m.body);
    const context = await conv.smsContext(phone);
    const optedOut = await messagingPaused(phone, d);
    // Save the preference before any reply or agent work, including pre-intake STOP.
    if (intent.kind === 'stop' || intent.kind === 'start')
      await d.setOptedOut(phone, intent.kind === 'stop', m.body);

    if (!context.hasConfirmedRecord) {
      if (intent.kind === 'stop' || intent.kind === 'start' || (intent.kind === 'help' && !optedOut)) {
        await recordedReply(phone, m.body, [{ to: phone, text: intent.kind === 'stop' ? T.optOut()
          : intent.kind === 'start' ? T.optIn() : T.help() }]);
        return;
      }
      if (optedOut) { await conv.recordChannelMessage(phone, 'user', m.body || '[photo]'); return; }
    } else {
      const deps = await d.getCaseDeps();
      const h = await deps.repo.getHouseholdByPhone(phone);
      const state = h ? await deps.repo.getState(h.id) : undefined;
      const consented = state?.stage === 'active' || state?.stage === 'screening';
      const caseSetupReply = state?.stage === 'awaiting_consent' && ['yes', 'no'].includes(intent.kind);
      const approvalReply = consented && ['yes', 'no'].includes(intent.kind) &&
        Boolean(h && await deps.repo.latestPendingApproval(h.id));
      const nudgeReply = consented && intent.kind === 'digit' && state?.lastNudgeKind === 'interview_nudge';
      const routeCase = intent.kind === 'stop' || intent.kind === 'start' || intent.kind === 'help' ||
        state?.stage === 'opted_out' || CASE_COMMANDS.has(intent.kind) ||
        (!context.awaitingConfirmation && (m.media.length > 0 || caseSetupReply || approvalReply || nudgeReply ||
          (consented && context.confirmed && !CORRECTION.test(normalizeIntent(m.body)))));
      if (optedOut && intent.kind !== 'start' && intent.kind !== 'stop') {
        await conv.recordChannelMessage(phone, 'user', m.body || '[photo]');
        return;
      }
      if (routeCase) {
        const incoming: IncomingMessage = { channel: 'sms', from: phone, text: m.body,
          messageId: m.messageId, media: m.media.filter(x => OK_DOCUMENTS.has(x.contentType)) };
        const replies = await d.handleCaseMessage(incoming);
        await recordedReply(phone, m.body || (m.media.length ? '[photo]' : ''), replies, true);
        return;
      }
    }
    const images = m.media.filter(x => OK_IMAGES.has(x.contentType)).map(x => x.url);
    if (m.media.length && !images.length && !m.body.trim()) {
      await recordedReply(phone, '[attachment]', [{ to: phone,
        text: 'I couldn’t open that file. Could you send it as a regular photo (JPEG) instead?' }]);
      return;
    }
    await conv.handleSms(phone, m.body, images);
  };
}

export function liveConversation(): Conversation {
  // INTAKE_STORE=memory lets you try text + chat without Supabase (households still need Supabase on YES).
  const repo = optionalEnv('INTAKE_STORE') === 'memory' ? memoryIntakeRepo() : supabaseIntakeRepo();
  return createConversation({
    repo,
    orgId: DEMO_ORG_ID,
    sendText: sendIntakeText,
    runAgent: runAgentTurn,
    extractFromCall,
    getHousehold: store.getHousehold,
    upsertHousehold: store.upsertHousehold,
    logEvents,
    mirrorMessage: store.appendMessage,
    addTimeline: (hid, label) => store.addTimeline(hid, label),
  });
}

export interface DialChannelDeps extends MessagingDeps {
  firstSeen: EventHandlers['firstSeen'];
  getCall: typeof getCall;
  /** Resolve a configured id/nickname to E.164 before comparing SDK call.to. */
  ourNumber(): Promise<string>;
  startEventLoop: typeof startEventLoop;
}

async function configuredNumber(): Promise<string> {
  const configured = optionalEnv('DIAL_FROM_NUMBER') ?? env('DIAL_FROM_NUMBER_ID');
  if (configured.startsWith('+')) return configured;
  const numbers = await new DialClient({ apiKey: env('DIAL_API_KEY'), userAgent: 'aid/0.1' }).listNumbers();
  const line = numbers.find(n => n.id === configured || n.number === configured || n.nickname === configured);
  if (!line) throw new Error(`Configured Dial line ${configured} is not on this account`);
  return line.number;
}

const liveDialDeps: DialChannelDeps = {
  ...liveMessagingDeps, firstSeen: store.markProcessed, getCall, ourNumber: configuredNumber, startEventLoop,
};

/** Export the real adapters' handlers so tests can dispatch SDK events without opening a stream. */
export function createDialChannelHandlers(
  conv: Conversation,
  onOutboundCall?: (callId: string) => Promise<void>,
  overrides: Partial<DialChannelDeps> = {},
): EventHandlers {
  const d = { ...liveDialDeps, ...overrides };
  const dispatchSms = createSmsDispatcher(conv, d);
  // Successful resolutions are cached; a failed lookup may be retried on the next event.
  let line: Promise<string> | undefined;
  const ourNumber = () => line ??= d.ourNumber().catch(err => { line = undefined; throw err; });
  return {
    firstSeen: d.firstSeen,
    async onMessage(m: InboundMessage) {
      if (m.to !== await ourNumber()) return;
      await dispatchSms(m);
    },
    async onCallTranscribed(callId) {
      const call = await d.getCall(callId);
      if (call.direction === 'inbound') {
        if (call.to !== await ourNumber()) return;
        if (await messagingPaused(normalizePhone(call.from), d)) return;
        await conv.handleInboundCall(call.from, transcriptText(call));
      }
      else if (onOutboundCall) await onOutboundCall(callId);
    },
  };
}

/** Dial event stream → conversation. Outbound office calls retain their separate hook. */
export function startDialChannels(
  conv: Conversation,
  onOutboundCall?: (callId: string) => Promise<void>,
  overrides: Partial<DialChannelDeps> = {},
): Promise<never> {
  const d = { ...liveDialDeps, ...overrides };
  return d.startEventLoop(createDialChannelHandlers(conv, onOutboundCall, d));
}
