// The only module that touches the Dial SDK. Texts out, calls out, and the account event stream in.
import { DialClient, type Call, type DialEvent } from '@getdial/sdk';
import { env } from './env.js';
export { normalizePhone } from './intake.js';

let client: DialClient | undefined;
const dial = () => (client ??= new DialClient({ apiKey: env('DIAL_API_KEY'), userAgent: 'aid/0.1' }));
/** Our Dial line: E.164, number id or nickname all work (SDK `fromNumber`). */
const FROM = () => process.env.DIAL_FROM_NUMBER || env('DIAL_FROM_NUMBER_ID');

export type InboundMessage = { messageId: string; from: string; to: string; body: string; media: { url: string; contentType: string }[] };

// Sending is NOT idempotent on Dial's side: never retry blindly.
export async function sendText(to: string, body: string): Promise<string> {
  const m = await dial().sendMessage({ to, fromNumber: FROM(), body });
  return m.id;
}

export async function placeCall(o: { to: string; instruction: string; transferTo?: string; idempotencyKey?: string; maxSeconds?: number }): Promise<string> {
  const call = await dial().makeCall({
    to: o.to, fromNumber: FROM(), outboundInstruction: o.instruction, language: 'en-US',
    ...(o.transferTo ? { transferTo: o.transferTo } : {}),
    ...(o.idempotencyKey ? { idempotencyKey: o.idempotencyKey } : {}),
    ...(o.maxSeconds ? { maxCallDurationSeconds: o.maxSeconds } : {}),
  });
  return call.id;
}

export const getCall = (callId: string): Promise<Call> => dial().getCall(callId);

export function transcriptText(call: Pick<Call, 'transcript' | 'transcriptTurns'>): string {
  if (call.transcript) return call.transcript;
  return (call.transcriptTurns ?? []).map(t => `${t.speaker}: ${t.text}`).join('\n');
}

/** Sets the prompt Dial's own voice agent uses when someone calls our number. */
export async function setInboundInstruction(instruction: string): Promise<void> {
  const numbers = await dial().listNumbers();
  const from = FROM();
  const line = numbers.find(n => n.id === from || n.number === from || n.nickname === from);
  if (!line) throw new Error(`Dial number ${from} is not on this account`);
  const updated = await dial().setNumberProperties(line.id, { inboundInstruction: instruction });
  if (updated.inboundInstruction !== instruction) throw new Error('Dial did not return the expected inbound instruction');
}

export type EventHandlers = {
  /** True only the first time an event id is seen (Dial delivers at least once). */
  firstSeen(eventId: string): Promise<boolean>;
  onMessage(m: InboundMessage): Promise<void>;
  onCallTranscribed(callId: string): Promise<void>;
};

/** Pure routing, split out so it can be tested without a live stream. */
export async function dispatchEvent(e: DialEvent, h: EventHandlers, ourNumber?: string): Promise<void> {
  if (e.type !== 'message.received' && e.type !== 'call.transcribed') return;
  if (!(await h.firstSeen(e.id))) return;
  if (e.type === 'message.received') {
    const d = e.data;
    if (ourNumber?.startsWith('+') && d.to !== ourNumber) return; // another line on the same Dial account
    await h.onMessage({ messageId: d.messageId, from: d.from, to: d.to, body: d.body ?? '',
      media: (d.media ?? []).map(m => ({ url: m.url, contentType: m.contentType })) });
  } else {
    await h.onCallTranscribed(e.data.callId);
  }
}

export async function startEventLoop(h: EventHandlers): Promise<never> {
  for (;;) { // reconnect forever; Dial replays missed events only if we're back within ~2 minutes
    try {
      const conn = await dial().newEventsConnection();
      console.log('[dial] listening for texts and calls on', FROM());
      for await (const e of conn) {
        try { await dispatchEvent(e, h, FROM()); }
        catch (err) { console.error('[dial] handler error', e.type, e.id, err); } // one bad event never kills the loop
      }
    } catch (err) { console.error('[dial] event stream dropped, reconnecting', err); }
    await new Promise(r => setTimeout(r, 2000));
  }
}
