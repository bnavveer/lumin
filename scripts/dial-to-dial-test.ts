// Live Dial-to-Dial round trip. A second Dial number on the same account plays "the person", so no 10DLC needed.
//   npx tsx scripts/dial-to-dial-test.ts +1TESTNUMBER
// Phase 1: person texts Aid → Aid's dial.ts event handling picks it up → Aid texts back → person receives it.
// Phase 2: the real conversation service over real Dial: answers → summary text → person replies YES →
//          household saved → follow-up text with the rules engine's likely programs. Only Claude is scripted.
import 'dotenv/config';
import { DialClient, type DialEvent } from '@getdial/sdk';
import { dispatchEvent, normalizePhone, sendText, type EventHandlers } from '../src/dial.js';
import { createConversation } from '../src/conversation.js';
import { memoryIntakeRepo } from '../src/intakeStore.js';
import type { Household } from '../src/contracts.js';

const AID = normalizePhone(process.env.DIAL_FROM_NUMBER ?? '');
const PERSON = normalizePhone(process.argv[2] ?? '');
const client = new DialClient({ apiKey: process.env.DIAL_API_KEY ?? '' });
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
const fail = (s: string) => { log(`FAIL: ${s}`); process.exit(1); };
setTimeout(() => fail('timed out after 5 minutes'), 5 * 60_000).unref();

// ── the person's phone (test number) ──
const inbox: { body: string }[] = [];
let waiter: { match: (b: string) => boolean; resolve: (b: string) => void } | undefined;
const personSends = (body: string) => client.sendMessage({ to: AID, fromNumber: PERSON, body });
function personReceives(match: (b: string) => boolean, what: string, ms = 90_000): Promise<string> {
  const hit = inbox.find(m => match(m.body));
  if (hit) { inbox.splice(inbox.indexOf(hit), 1); return Promise.resolve(hit.body); }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`person never received ${what}`)), ms);
    waiter = { match, resolve: b => { clearTimeout(timer); resolve(b); } };
  });
}

// ── Aid (the real conversation service; Claude replaced by a script, households kept in memory) ──
const households = new Map<string, Household>();
const conv = createConversation({
  repo: memoryIntakeRepo(), orgId: 'dial-to-dial-test', sendText,
  async runAgent(t) {
    if (households.size) {
      const raw = await t.tools.checkEligibility();
      let likely = '';
      try {
        const parsed = JSON.parse(raw) as { matches?: { program: string; status: string }[] } | { program: string; status: string }[];
        likely = (Array.isArray(parsed) ? parsed : parsed.matches ?? []).filter(m => m.status === 'likely').map(m => m.program).join(', ');
      } catch { /* not JSON */ }
      return `Thanks, Maria, your info is confirmed. You likely qualify for: ${likely || '(see caseworker)'}. The county makes the final decision.`;
    }
    await t.tools.saveAnswers({ firstName: 'Maria', county: 'los_angeles', size: 3, monthlyIncome: 1850, childrenUnder18: 2,
      pregnant: false, adultAge: 31, immigrationStatus: 'citizen', childrenAreCitizens: true });
    log(`  agent tool: ${await t.tools.sendConfirmationText()}`);
    return 'I just texted you a summary. Reply YES if it is right.';
  },
  extractFromCall: async () => ({ fields: {}, notes: '' }),
  getHousehold: async id => households.get(id),
  upsertHousehold: async h => { households.set(h.id, h); log(`  household saved: ${h.firstName}, ${h.size} people, $${h.monthlyIncome}/mo`); },
  logEvents: async () => {}, mirrorMessage: async () => {}, addTimeline: async () => {},
});

let phase: 1 | 2 = 1;
const seen = new Set<string>();
const aid: EventHandlers = {
  firstSeen: async id => (seen.has(id) ? false : (seen.add(id), true)),
  onCallTranscribed: async () => {},
  async onMessage(m) {
    if (m.from !== PERSON) return;
    log(`Aid received from person: ${JSON.stringify(m.body)}`);
    if (phase === 1) await sendText(PERSON, `Aid echo: got "${m.body}"`);
    else await conv.handleSms(m.from, m.body);
  },
};

const conn = await client.newEventsConnection();
void (async () => {
  for await (const e of conn as AsyncIterable<DialEvent>) {
    if (e.type === 'message.received' && e.data.to === PERSON && e.data.from === AID) {
      log(`person received: ${JSON.stringify(e.data.body)}`);
      if (waiter?.match(e.data.body)) { const w = waiter; waiter = undefined; w.resolve(e.data.body); }
      else inbox.push({ body: e.data.body });
    } else if (e.type === 'message.status_changed' && e.data.changed === 'delivery' && e.data.deliveryError) {
      log(`delivery problem ${e.data.from} → ${e.data.to}: ${e.data.deliveryError}`);
    }
    await dispatchEvent(e, aid, AID).catch(err => log(`Aid handler error: ${err}`));
  }
})();
await new Promise(r => setTimeout(r, 3000)); // let the subscription settle before the first send
log(`Aid = ${AID}, person = ${PERSON}`);

try {
  log('── Phase 1: plain round trip ──');
  await personSends('hi, testing Aid');
  await personReceives(b => b.startsWith('Aid echo'), 'the echo');
  log('PASS phase 1');

  phase = 2;
  log('── Phase 2: answers → summary text → YES → confirmed ──');
  await personSends('Hi, I need help with food for my family');
  const summary = await personReceives(b => b.startsWith('Aid: please check your info'), 'the confirmation summary');
  if (/immigration|citizen/i.test(summary)) fail('summary text leaked immigration status');
  await personReceives(b => b.startsWith('I just texted you a summary'), 'the agent reply');
  await personSends('YES');
  const done = await personReceives(b => b.startsWith('Thanks, Maria, your info is confirmed'), 'the confirmed reply');
  if (households.size !== 1) fail('household was not saved after YES');
  if (!/calfresh/.test(done)) fail('confirmed reply did not include the rules engine result');
  log(`PASS phase 2: ${done}`);
} catch (err) {
  fail(String(err instanceof Error ? err.message : err));
}
await conn.close();
process.exit(0);
