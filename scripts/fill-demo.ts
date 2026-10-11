// Usage: npx tsx scripts/fill-demo.ts --household <id> --mode local|kernel [--base http://localhost:3000] [--headless] [--hold 60] [--tunnel]
// Kernel browsers live in the cloud, so they can only reach a PUBLIC base URL. With --mode kernel and a localhost
// base, a cloudflared quick tunnel is started automatically (or pass --base https://your-public-host).
import 'dotenv/config';
import type { ChildProcess } from 'node:child_process';
import { fillApplication, type FillEvent } from '../src/benefitscal/filler.js';
import { holdSeconds } from '../src/benefitscal/kernelSessions.js';
import { checkTunnelHealth, startTunnel } from '../src/benefitscal/tunnel.js';

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

async function main(): Promise<void> {
  const householdId = arg('household', LIN)!;
  const mode = arg('mode', 'local') === 'kernel' ? 'kernel' : 'local';
  let base = arg('base', 'http://localhost:3000')!;
  const headless = arg('headless') === 'true';
  const hold = Number(arg('hold', '0')) * 1000;
  let tunnel: ChildProcess | undefined;

  if (mode === 'kernel' && /localhost|127\.0\.0\.1/.test(base)) {
    console.log('kernel mode needs a public URL; starting a cloudflared tunnel...');
    const t = await startTunnel(base);
    tunnel = t.proc;
    base = t.url;
    console.log(`tunnel: ${base}`);
    // Health-check THROUGH the tunnel before handing it to Kernel (a dead quick tunnel = a blank live view).
    if (!(await checkTunnelHealth(base))) throw new Error(`tunnel ${base} never answered /api/health`);
    console.log('tunnel healthy');
  }

  const result = await fillApplication({
    householdId, baseUrl: base, mode, headless, holdMs: hold, extra: DEMO_EXTRA,
    // Kernel: leave the browser (and its live view) running after the stop-at-signature. It is closed by
    // Kernel's inactivity timeout once this script exits (or by the scheduled cleanup while it runs).
    keepAliveMs: mode === 'kernel' ? holdSeconds() * 1000 : 0,
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
