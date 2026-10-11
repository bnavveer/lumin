// Kernel browsers live in the cloud and can only reach a PUBLIC URL. This starts a cloudflared quick
// tunnel to a local server (shared by scripts/fill-demo.ts and the workflow engine), health-checks it
// THROUGH the tunnel before anyone hands it to Kernel, and restarts it when a later check fails.
import { spawn, type ChildProcess } from 'node:child_process';

const START_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 30_000;
const FIRST_PROBE_DELAY_MS = 3_000;
const PROBE_INTERVAL_MS = 1_500;
const PROBE_TIMEOUT_MS = 5_000;

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

export interface HealthDeps {
  fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean }>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const realDeps: HealthDeps = {
  fetch: (u, i) => fetch(u, i),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

export interface HealthOptions { path?: string; timeoutMs?: number; firstDelayMs?: number; intervalMs?: number }

/** Poll GET <url><path> until it answers 2xx or the deadline passes. Pure apart from the injected deps. */
export async function checkTunnelHealth(url: string, opts: HealthOptions = {}, deps: HealthDeps = realDeps): Promise<boolean> {
  const { path = '/api/health', timeoutMs = READY_TIMEOUT_MS, firstDelayMs = FIRST_PROBE_DELAY_MS, intervalMs = PROBE_INTERVAL_MS } = opts;
  const deadline = deps.now() + timeoutMs;
  // Probing before the quick-tunnel hostname exists can get NXDOMAIN cached by the OS resolver; give it a head start.
  if (firstDelayMs > 0) await deps.sleep(firstDelayMs);
  do {
    try {
      const res = await deps.fetch(`${url}${path}`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      if (res.ok) return true;
    } catch { /* not routed yet */ }
    if (deps.now() >= deadline) break;
    await deps.sleep(intervalMs);
  } while (deps.now() < deadline);
  return false;
}

/** Back-compat alias. */
export const waitForTunnel = (url: string, path = '/api/health', timeoutMs = READY_TIMEOUT_MS): Promise<boolean> =>
  checkTunnelHealth(url, { path, timeoutMs });

export interface TunnelManagerDeps {
  start: (local: string) => Promise<Tunnel>;
  health: (url: string, opts?: HealthOptions) => Promise<boolean>;
  log: (msg: string) => void;
}

const MAX_START_ATTEMPTS = 2;

/**
 * One healthy tunnel per process. `get()` re-checks the cached tunnel quickly and restarts it when the
 * check fails or cloudflared exited. Resolves null when no healthy tunnel can be had (callers fall back
 * to a local browser).
 */
export function createTunnelManager(local: string, deps: TunnelManagerDeps) {
  let current: Tunnel | null = null;
  let inflight: Promise<string | null> | null = null;

  const kill = () => { try { current?.proc.kill(); } catch { /* already gone */ } current = null; };

  async function fresh(): Promise<string | null> {
    for (let i = 0; i < MAX_START_ATTEMPTS; i++) {
      kill();
      try {
        const t = await deps.start(local);
        current = t;
        t.proc.on?.('exit', () => { if (current === t) current = null; });
        if (await deps.health(t.url)) { deps.log(`[tunnel] healthy public URL: ${t.url}`); return t.url; }
        deps.log(`[tunnel] ${t.url} never answered /api/health; restarting`);
      } catch (e) {
        deps.log(`[tunnel] could not start: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    kill();
    return null;
  }

  async function get(): Promise<string | null> {
    if (current && (await deps.health(current.url, { firstDelayMs: 0, timeoutMs: 5_000 }))) return current.url;
    if (current) deps.log(`[tunnel] health check failed for ${current.url}; restarting`);
    return fresh();
  }

  return {
    get(): Promise<string | null> {
      inflight ??= get().finally(() => { inflight = null; });
      return inflight;
    },
    stop: kill,
  };
}

let shared: ReturnType<typeof createTunnelManager> | undefined;

/** One healthy tunnel per process, reused across fills and restarted when it stops answering. */
export function sharedTunnel(local: string): Promise<string | null> {
  shared ??= createTunnelManager(local, {
    start: startTunnel,
    health: (u, o) => checkTunnelHealth(u, o),
    log: (m) => console.warn(m),
  });
  return shared.get();
}
