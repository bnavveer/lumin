// Kernel browser session lifetime after a fill: keep the browser (and its live view link) alive for a hold
// window so the person can watch and sign, then close it from a scheduled cleanup or as soon as the
// workflow moves past signing. Also re-reads a FRESH live view URL for GET /api/workflows/:id/live.
import Kernel from '@onkernel/sdk';
import { optionalEnv } from '../env.js';

export const DEFAULT_HOLD_SECONDS = 600;
const MIN_KERNEL_TIMEOUT_SECONDS = 900;
const TIMEOUT_MARGIN_SECONDS = 300;

/** KERNEL_HOLD_SECONDS (default 600), clamped to 0..3600. */
export function holdSeconds(raw: string | undefined = process.env.KERNEL_HOLD_SECONDS): number {
  const n = Number(raw);
  if (raw === undefined || raw === '' || !Number.isFinite(n)) return DEFAULT_HOLD_SECONDS;
  return Math.min(3600, Math.max(0, Math.round(n)));
}

/** Kernel's own inactivity timeout must outlast fill time + the hold, or Kernel kills the browser first. */
export function kernelTimeoutSeconds(hold: number = holdSeconds()): number {
  return Math.max(MIN_KERNEL_TIMEOUT_SECONDS, hold + TIMEOUT_MARGIN_SECONDS);
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t; },
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
};

/** Pure scheduler: one pending cleanup per session id; `endNow` runs it early, at most once. */
export function createHoldScheduler(timers: Timers = realTimers) {
  const pending = new Map<string, { handle: unknown; run: () => Promise<void> }>();
  const fire = async (id: string): Promise<boolean> => {
    const p = pending.get(id);
    if (!p) return false;
    pending.delete(id);
    timers.clearTimeout(p.handle);
    await p.run().catch((e: unknown) => console.warn(`[kernel] cleanup of ${id} failed: ${e instanceof Error ? e.message : String(e)}`));
    return true;
  };
  return {
    schedule(id: string, ms: number, run: () => Promise<void>): void {
      const prev = pending.get(id);
      if (prev) timers.clearTimeout(prev.handle);
      const handle = timers.setTimeout(() => { void fire(id); }, Math.max(0, ms));
      pending.set(id, { handle, run });
    },
    endNow: fire,
    has: (id: string): boolean => pending.has(id),
    size: (): number => pending.size,
  };
}

const scheduler = createHoldScheduler();

/** Keep a Kernel browser alive for `ms`, then run `close` (stop replay + delete). */
export function scheduleKernelCleanup(sessionId: string, ms: number, close: () => Promise<void>): void {
  console.warn(`[kernel] holding browser ${sessionId} open for ${Math.round(ms / 1000)}s`);
  scheduler.schedule(sessionId, ms, close);
}

/** Close a held Kernel browser now (the workflow moved past signing). No-op for unknown ids. */
export function endKernelSession(sessionId: string | undefined | null): Promise<boolean> {
  if (!sessionId) return Promise.resolve(false);
  return scheduler.endNow(sessionId);
}

export interface LiveStatus { url: string | null; status: 'live' | 'ended'; replayUrl?: string }

/** Ask Kernel for the browser's CURRENT live view URL. Deleted or missing sessions are 'ended'. */
export async function kernelLiveStatus(sessionId: string, replayUrl?: string | null): Promise<LiveStatus> {
  const ended: LiveStatus = { url: null, status: 'ended', ...(replayUrl ? { replayUrl } : {}) };
  const key = optionalEnv('KERNEL_API_KEY');
  if (!key) return ended;
  try {
    const client = new Kernel({ apiKey: key });
    const b = await client.browsers.retrieve(sessionId);
    if (b.deleted_at || !b.browser_live_view_url) return ended;
    return { url: b.browser_live_view_url, status: 'live', ...(replayUrl ? { replayUrl } : {}) };
  } catch {
    return ended;
  }
}
