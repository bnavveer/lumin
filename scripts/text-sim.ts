// Chat with Aid's text engine in the terminal, in-process (no Dial, no HTTP).
//   npx tsx scripts/text-sim.ts +15555550123
// Commands: /photo <https-url> [caption]  send a document photo;  /thread  show transcript;  /quit
import '../src/env.js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { handleIncomingMessage } from '../src/caseManager/engine.js';
import { guessContentType } from '../src/caseManager/routes.js';
import { getDeps } from '../src/caseManager/deps.js';

const from = process.argv[2] ?? '+15555550123';
const rl = createInterface({ input: stdin, output: stdout });
stdout.write(`Aid text simulator as ${from}. Try: hi, YES, STATUS, DOCS, HELP, LANG ES, HUMAN, STOP. /quit to exit.\n`);

for (;;) {
  let line: string;
  try { line = (await rl.question('you> ')).trim(); } catch { break; } // stdin closed
  if (!line) continue;
  if (line === '/quit' || line === '/exit') break;
  if (line === '/thread') {
    const deps = await getDeps();
    const h = await deps.repo.getHouseholdByPhone(from);
    for (const m of h ? await deps.repo.getMessages(h.id, 100) : []) stdout.write(`${m.role === 'user' ? 'you' : 'aid'}: ${m.content}\n`);
    continue;
  }
  const photo = /^\/photo\s+(\S+)\s*(.*)$/.exec(line);
  const started = Date.now();
  try {
    const replies = await handleIncomingMessage(photo
      ? { channel: 'sim', from, text: photo[2] ?? '', media: [{ url: photo[1]!, contentType: guessContentType(photo[1]!) }] }
      : { channel: 'sim', from, text: line });
    if (!replies.length) stdout.write('aid> (no reply)\n');
    for (const r of replies) stdout.write(`aid> ${r.text}\n`);
    stdout.write(`     (${Date.now() - started} ms)\n`);
  } catch (err) {
    stdout.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
rl.close();
process.exit(0);
