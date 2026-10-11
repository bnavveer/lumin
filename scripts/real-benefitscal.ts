// Opt-in REAL BenefitsCal run in a Kernel cloud browser. Read src/benefitscal/realSite.ts (guardrails) first.
// Usage:
//   ALLOW_REAL_BENEFITSCAL=true npx tsx scripts/real-benefitscal.ts --household <id>            # preview (types nothing)
//   ALLOW_REAL_BENEFITSCAL=true npx tsx scripts/real-benefitscal.ts --household <id> --type     # types approved real data
//   ALLOW_REAL_BENEFITSCAL=true npx tsx scripts/real-benefitscal.ts --landing-only              # read-only: open the public landing page
// You sign in yourself in the printed live view link. Aid never sees or types credentials, never signs or submits.
import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBrowser } from '../src/benefitscal/browser.js';
import { REAL_HOME, assertRealModeAllowed, realModeAllowed, runRealSite } from '../src/benefitscal/realSite.js';
import { getHousehold } from '../src/store.js';

const has = (f: string) => process.argv.includes(`--${f}`);
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

async function main(): Promise<void> {
  if (!realModeAllowed()) throw new Error('Set ALLOW_REAL_BENEFITSCAL=true to use real BenefitsCal mode.');
  const typing = has('type');
  const landingOnly = has('landing-only');
  const householdId = arg('household');
  const household = householdId ? await getHousehold(householdId) : undefined;
  if (!landingOnly) {
    if (!household) throw new Error('--household <id> is required (and must exist).');
    assertRealModeAllowed(household, typing);
  }

  const opened = await openBrowser({ mode: 'kernel' });
  console.log(`\nLIVE VIEW (open this, then sign in yourself): ${opened.liveViewUrl ?? '(none)'}`);
  if (opened.replayViewUrl) console.log(`replay: ${opened.replayViewUrl}`);
  const dir = join(tmpdir(), 'aid-real', `${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    await opened.page.goto(REAL_HOME, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (landingOnly) {
      const title = await opened.page.title();
      const heading = (await opened.page.locator('h1, h2').first().textContent({ timeout: 10_000 }).catch(() => '')) ?? '';
      const links = await opened.page.locator('a, button').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 25));
      const shot = join(dir, 'landing.png');
      await opened.page.screenshot({ path: shot });
      console.log(JSON.stringify({ url: opened.page.url(), title, heading: heading.trim(), links, screenshot: shot }, null, 2));
      const hold = Number(arg('hold') ?? '20');
      console.log(`keeping the live view open ${hold}s (read-only; nothing is typed)`);
      await new Promise((r) => setTimeout(r, hold * 1000));
      return;
    }
    const result = await runRealSite({
      page: opened.page, household: household!, typing,
      onEvent: (e) => console.log(`[${e.step}] ${e.message}${e.data ? `\n${JSON.stringify(e.data, null, 2)}` : ''}`),
      screenshot: async (name) => { const p = join(dir, `${name}.png`); await opened.page.screenshot({ path: p }).catch(() => undefined); return p; },
    });
    console.log('\nRESULT', JSON.stringify(result, null, 2));
  } finally {
    const { replayViewUrl } = await opened.close();
    if (replayViewUrl) console.log(`replay: ${replayViewUrl}`);
  }
}

main().catch((e: unknown) => {
  console.error('real-benefitscal failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
