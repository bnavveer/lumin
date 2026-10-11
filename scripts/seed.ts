import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { generateSeed, type SeedHousehold } from '../src/seedData.js';
import { ingest } from '../src/keewano.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const keewanoOnly = args.has('--keewano-only');
const supabaseOnly = args.has('--supabase-only');
const CONCURRENCY = 5;

const seeds = generateSeed({ nowSec: Math.floor(Date.now() / 1000), demoPhone: process.env.DEMO_PERSON_B_PHONE || undefined });

function summarize(list: SeedHousehold[]): void {
  const by = (t: string) => list.filter(s => s.tag === t).length;
  const events = list.reduce((n, s) => n + s.events.length, 0);
  console.log(`households=${list.length} baseline=${by('baseline')} aid=${by('aid')} demo=${by('demo')} events=${events}`);
  for (const s of list.filter(x => x.tag === 'demo')) {
    console.log(`  demo ${s.pattern}: ${s.household.firstName} ${s.household.id} events=${s.events.length} messages=${s.messages.length}`);
  }
}

async function seedOne(s: SeedHousehold, store: typeof import('../src/store.js') | undefined): Promise<void> {
  const hid = s.household.id;
  if (store) {
    await store.upsertHousehold(s.household);
    for (const x of s.events) await store.addTimeline(hid, x.event.type, x.at);
    for (const m of s.messages) await store.appendMessage(hid, m.role, m.content);
  }
  if (!supabaseOnly) await ingest(hid, s.events, randomUUID());
}

async function main(): Promise<void> {
  summarize(seeds);
  const allow = seeds.filter(s => ['interview_unconfirmed', 'signed_not_submitted', 'waitlist_closed'].includes(s.pattern ?? ''))
    .map(s => s.household.id);
  if (dryRun) {
    console.log('dry run: nothing written');
    console.log(`AUTOPILOT_ALLOW=${allow.join(',')}`);
    return;
  }
  const store = keewanoOnly ? undefined : await import('../src/store.js');
  const queue = [...seeds];
  const failures: string[] = [];
  let done = 0;
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try { await seedOne(s, store); done++; }
      catch (err) { failures.push(`${s.household.phone}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`seeded ${done}/${seeds.length}, failures=${failures.length}`);
  for (const f of failures.slice(0, 10)) console.error('  ', f);
  console.log(`AUTOPILOT_ALLOW=${allow.join(',')}`);
}

await main();
