// Live Dial SMS round trip through src/dial.ts: text a phone, wait for its reply on the event stream, text back.
//   npx tsx scripts/sms-roundtrip.ts +1XXXXXXXXXX [minutesToWait]
import 'dotenv/config';
import { normalizePhone, sendText, startEventLoop } from '../src/dial.js';

const to = normalizePhone(process.argv[2] ?? '');
const waitMin = Number(process.argv[3] ?? 10);
const seen = new Set<string>();
const t0 = Date.now();

const timer = setTimeout(() => { console.log(`[roundtrip] FAIL: no reply from ${to} within ${waitMin} min`); process.exit(1); }, waitMin * 60_000);

void startEventLoop({
  firstSeen: async id => (seen.has(id) ? false : (seen.add(id), true)),
  onCallTranscribed: async () => {},
  async onMessage(m) {
    if (m.from !== to) return;
    console.log(`[roundtrip] reply received after ${Math.round((Date.now() - t0) / 1000)}s: ${JSON.stringify(m.body)} (message ${m.messageId})`);
    const id = await sendText(to, `Aid test: got your reply "${m.body.slice(0, 60)}". The text round trip works.`);
    console.log(`[roundtrip] PASS: answer sent (message ${id})`);
    clearTimeout(timer);
    setTimeout(() => process.exit(0), 1000);
  },
});

// Give the event stream a moment to subscribe before the first text goes out, so the reply can't be missed.
await new Promise(r => setTimeout(r, 3000));
const id = await sendText(to, 'Aid test: this is a test of the Aid benefits helper. Reply with any word to finish the round trip.');
console.log(`[roundtrip] sent first text to ${to} (message ${id}); waiting up to ${waitMin} min for a reply…`);
