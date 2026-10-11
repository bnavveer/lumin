// Wires the conversation service to the real Dial, Claude, Supabase and Keewano clients.
import { createConversation, type Conversation } from './conversation.js';
import { extractFromCall, runAgentTurn } from './agent.js';
import { getCall, sendText, startEventLoop, transcriptText, type EventHandlers, type InboundMessage } from './dial.js';
import { DialClient } from '@getdial/sdk';
import { memoryIntakeRepo, supabaseIntakeRepo } from './intakeStore.js';
import { logEvents } from './keewano.js';
import * as store from './store.js';
import { DEMO_ORG_ID } from './supabase.js';
import { env, optionalEnv } from './env.js';

const OK_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function liveConversation(): Conversation {
  // INTAKE_STORE=memory lets you try text + chat without Supabase (households still need Supabase on YES).
  const repo = optionalEnv('INTAKE_STORE') === 'memory' ? memoryIntakeRepo() : supabaseIntakeRepo();
  return createConversation({
    repo,
    orgId: DEMO_ORG_ID,
    sendText,
    runAgent: runAgentTurn,
    extractFromCall,
    getHousehold: store.getHousehold,
    upsertHousehold: store.upsertHousehold,
    logEvents,
    mirrorMessage: store.appendMessage,
    addTimeline: (hid, label) => store.addTimeline(hid, label),
  });
}

export interface DialChannelDeps {
  firstSeen: EventHandlers['firstSeen'];
  getCall: typeof getCall;
  sendText: typeof sendText;
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
  firstSeen: store.markProcessed, getCall, sendText, ourNumber: configuredNumber, startEventLoop,
};

/** Export the real adapters' handlers so tests can dispatch SDK events without opening a stream. */
export function createDialChannelHandlers(
  conv: Conversation,
  onOutboundCall?: (callId: string) => Promise<void>,
  overrides: Partial<DialChannelDeps> = {},
): EventHandlers {
  const d = { ...liveDialDeps, ...overrides };
  // Successful resolutions are cached; a failed lookup may be retried on the next event.
  let line: Promise<string> | undefined;
  const ourNumber = () => line ??= d.ourNumber().catch(err => { line = undefined; throw err; });
  return {
    firstSeen: d.firstSeen,
    async onMessage(m: InboundMessage) {
      if (m.to !== await ourNumber()) return;
      const images = m.media.filter(x => OK_IMAGES.has(x.contentType)).map(x => x.url);
      if (m.media.length && !images.length && !m.body.trim()) {
        await d.sendText(m.from, 'I couldn’t open that file. Could you send it as a regular photo (JPEG) instead?');
        return;
      }
      await conv.handleSms(m.from, m.body, images);
    },
    async onCallTranscribed(callId) {
      const call = await d.getCall(callId);
      if (call.direction === 'inbound') {
        if (call.to !== await ourNumber()) return;
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
