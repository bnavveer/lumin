// Live end-to-end test of the web chat against a running server (npx tsx src/main.ts).
//   npx tsx scripts/chat-e2e.ts http://localhost:3001 +1TESTDIALNUMBER
// A Claude "persona" answers the Aid agent in the web chat and gives the test Dial number as her mobile.
// The test number then receives the confirmation text over Dial, replies YES, and we check the chat got linked.
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { DialClient, type DialEvent } from '@getdial/sdk';
import { normalizePhone } from '../src/dial.js';
import type { WebView } from '../src/conversation.js';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const PERSON = normalizePhone(process.argv[3] ?? '');
const AID = normalizePhone(process.env.DIAL_FROM_NUMBER ?? '');
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const fail = (s: string): never => { log(`FAIL: ${s}`); process.exit(1); };
setTimeout(() => fail('timed out after 8 minutes'), 8 * 60_000).unref();

const claude = new Anthropic({ apiKey: process.env.NEON_AI_GATEWAY_TOKEN, baseURL: `${process.env.NEON_AI_GATEWAY_BASE_URL}/anthropic` });
const PERSONA = `You are Maria Lopez, 31, chatting on a benefits website. Facts: you live in Los Angeles County, California. Your household is you and your 2 kids (ages 4 and 7), both U.S. citizens; you are a U.S. citizen too. You earn $1,850 a month before taxes from a part-time job. Nobody is pregnant or breastfeeding. Your mobile is ${PERSON}. You rent; you are a PG&E customer? No (LA uses LADWP/SoCal Edison). Answer only what is asked, briefly and casually, like a real person typing on a phone. If asked something you don't know, say you're not sure.`;

async function personaSays(history: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
  const r = await claude.messages.create({ model: 'claude-opus-5-5', max_tokens: 2000, output_config: { effort: 'low' }, system: PERSONA,
    messages: history.length ? history : [{ role: 'user', content: '(Start the chat: say you need help paying for food.)' }] });
  return r.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join(' ').trim();
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/chat${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json() as T & { error?: string };
  if (!res.ok) fail(`${method} ${path} → ${res.status} ${json.error}`);
  return json;
}

// ── the test phone: watch for texts from Aid ──
const dial = new DialClient({ apiKey: process.env.DIAL_API_KEY ?? '' });
const received: string[] = [];
const conn = await dial.newEventsConnection();
void (async () => {
  for await (const e of conn as AsyncIterable<DialEvent>) {
    if (e.type === 'message.received' && e.data.to === PERSON && e.data.from === AID) {
      received.push(e.data.body);
      log(`📱 test phone got: ${JSON.stringify(e.data.body)}`);
    }
  }
})();
const until = async (cond: () => boolean | Promise<boolean>, what: string, ms = 120_000) => {
  const end = Date.now() + ms;
  while (!(await cond())) { if (Date.now() > end) fail(`never saw ${what}`); await new Promise(r => setTimeout(r, 1500)); }
};

// ── 1. web chat until Aid asks the person to confirm by text ──
const { sessionId } = await api<{ sessionId: string }>('POST', '/sessions');
log(`chat session ${sessionId}`);
const convo: { role: 'user' | 'assistant'; content: string }[] = []; // from the persona's point of view
let view: WebView | undefined;
for (let turn = 1; turn <= 12 && view?.status !== 'awaiting_confirmation'; turn++) {
  const text = await personaSays(convo);
  log(`👩 Maria: ${text}`);
  const r = await api<{ reply: string; view: WebView }>('POST', `/sessions/${sessionId}/messages`, { text });
  log(`🤖 Aid:   ${r.reply}`);
  view = r.view;
  convo.push({ role: 'assistant', content: text }, { role: 'user', content: r.reply });
}
if (view?.status !== 'awaiting_confirmation') fail(`chat never reached confirmation (status ${view?.status}, missing ${view?.missing.join(', ')})`);
log(`✅ chat collected everything; status = ${view!.status}, linked = ${view!.linked}`);

// ── 2. the confirmation text arrives on the phone; reply YES by text ──
await until(() => received.some(b => b.includes('Reply YES')), 'the confirmation text');
const summary = received.find(b => b.includes('Reply YES'))!;
if (/immigration|citizen/i.test(summary)) fail('confirmation text leaked immigration status');
await dial.sendMessage({ to: AID, fromNumber: PERSON, body: 'YES' });
log('📱 test phone replied: YES');

// ── 3. the server confirms, links the chat, and answers by text ──
await until(async () => (view = await api<WebView>('GET', `/sessions/${sessionId}`)).linked, 'the chat get linked to the case');
log(`✅ chat linked to the case; status = ${view!.status}`);
await until(async () => (view = await api<WebView>('GET', `/sessions/${sessionId}`)).messages.some(m => m.channel === 'sms' && m.role === 'assistant' && !m.content.includes('Reply YES')),
  'the post-confirmation reply in the chat');
const after = view!.messages.filter(m => m.channel === 'sms' && m.role === 'assistant').at(-1)!;
log(`✅ chat now shows the text reply: ${JSON.stringify(after.content)}`);
await until(() => received.length >= 2, 'the post-confirmation text on the phone');
log('PASS: web chat → text confirmation → YES → linked case, visible from both channels');
await conn.close();
process.exit(0);
