// Usage: npx tsx scripts/fill-demo.ts --household <id> --mode local|kernel [--base http://localhost:3000] [--headless] [--hold 60] [--tunnel]
// Kernel browsers live in the cloud, so they can only reach a PUBLIC base URL. With --mode kernel and a localhost
// base, a cloudflared quick tunnel is started automatically (or pass --base https://your-public-host).
import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { fillApplication, type FillEvent } from '../src/benefitscal/filler.js';

const LIN = '377f71de-5cef-5c6d-8fb4-55c846de892f';
// Synthetic demo values for fields the Household record does not hold.
const DEMO_EXTRA = {
  last_name: 'Demo', dob: '1997-04-12', street: '123 Demo Street', city: 'Los Angeles', zip: '90012',
  email: 'lin.demo@aid-demo.example', employer_name: 'Demo Cafe', hours_per_week: '30', job_continues: 'yes',
  rent_amount: '1400', rent_frequency: 'monthly', bank_balance: '250', has_vehicle: 'no', homeless: 'no',
  interview_type: 'phone', voter_registration: 'no', files_taxes: 'no',
};

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

function startTunnel(local: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('cloudflared', ['tunnel', '--url', local, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('cloudflared tunnel did not start in 30s')), 30_000);
    const onData = (b: Buffer) => {
      const m = b.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { clearTimeout(timer); resolve({ url: m[0], proc }); }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function main(): Promise<void> {
  const householdId = arg('household', LIN)!;
  const mode = arg('mode', 'local') === 'kernel' ? 'kernel' : 'local';
  let base = arg('base', 'http://localhost:3000')!;
  const headless = arg('headless') === 'true';
  const hold = Number(arg('hold', mode === 'kernel' ? '45' : '0')) * 1000;
  let tunnel: ChildProcess | undefined;

  if (mode === 'kernel' && /localhost|127\.0\.0\.1/.test(base)) {
    console.log('kernel mode needs a public URL; starting a cloudflared tunnel...');
    const t = await startTunnel(base);
    tunnel = t.proc;
    base = t.url;
    console.log(`tunnel: ${base}`);
    await new Promise((r) => setTimeout(r, 4000)); // let the tunnel route settle
  }

  const result = await fillApplication({
    householdId, baseUrl: base, mode, headless, holdMs: hold, extra: DEMO_EXTRA,
    onEvent: (e: FillEvent) => {
      console.log(`[${e.at.slice(11, 19)}] ${e.step.padEnd(20)} ${e.message}`);
    },
  }).finally(() => tunnel?.kill());

  console.log('\nRESULT', JSON.stringify(result, null, 2));
  process.exit(result.status === 'stopped_for_signature' ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error('fill-demo failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
