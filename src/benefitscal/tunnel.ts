// Kernel browsers live in the cloud and can only reach a PUBLIC URL. This starts a cloudflared quick
// tunnel to a local server (shared by scripts/fill-demo.ts and the workflow engine).
import { spawn, type ChildProcess } from 'node:child_process';

const START_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 30_000;
const FIRST_PROBE_DELAY_MS = 6_000;

export interface Tunnel { url: string; proc: ChildProcess }

export function startTunnel(local: string): Promise<Tunnel> {
  return new Promise((resolve, reject) => {
    const proc = spawn('cloudflared', ['tunnel', '--url', local, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('cloudflared tunnel did not start in 30s')); }, START_TIMEOUT_MS);
    const onData = (b: Buffer) => {
      const m = b.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { clearTimeout(timer); resolve({ url: m[0], proc }); }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

/** Wait until the tunnel actually routes to the local server (quick tunnels take a few seconds). */
export async function waitForTunnel(url: string, path = '/api/health', timeoutMs = READY_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  // Probing before the quick-tunnel hostname exists can get NXDOMAIN cached by the OS resolver; give it a head start.
  await new Promise((r) => setTimeout(r, FIRST_PROBE_DELAY_MS));
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch { /* not routed yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

let shared: Promise<string | null> | undefined;

/**
 * One tunnel per process, reused across fills. Resolves null if cloudflared is missing or the tunnel
 * never becomes reachable (callers then fall back to a local browser). Restarts if the process dies.
 */
export function sharedTunnel(local: string): Promise<string | null> {
  shared ??= (async () => {
    try {
      const t = await startTunnel(local);
      t.proc.on('exit', () => { shared = undefined; });
      // The cloud browser resolves DNS on its own, so a failed local probe is only a warning.
      if (!(await waitForTunnel(t.url))) console.warn('[tunnel] local probe never reached the tunnel; using it anyway');
      return t.url;
    } catch (e) {
      console.error('[tunnel] could not start:', e instanceof Error ? e.message : e);
      shared = undefined;
      return null;
    }
  })();
  return shared;
}
