// Browser provider for the form-filler: Kernel hosted (live view + replay) or a local visible Chromium.
import { chromium, type Browser, type Page } from 'playwright';
import Kernel from '@onkernel/sdk';
import { env } from '../env.js';
import { kernelTimeoutSeconds } from './kernelSessions.js';

export type BrowserMode = 'kernel' | 'local';
export interface OpenBrowserOptions { mode: BrowserMode; headless?: boolean; slowMo?: number; timeoutSeconds?: number }
export interface OpenedBrowser {
  page: Page;
  liveViewUrl?: string;
  replayId?: string;
  /** Kernel browser session id (persisted in step meta so a fresh live view URL can be fetched later). */
  sessionId?: string;
  /** Replay page URL, known as soon as the replay starts. */
  replayViewUrl?: string;
  /** Closes the browser. For Kernel, stops the replay and deletes the session; returns the replay URL when known. */
  close(): Promise<{ replayViewUrl?: string }>;
  /** Disconnect Playwright but leave the Kernel browser (and its live view) running. Local: same as close. */
  detach(): Promise<void>;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const CREATE_ATTEMPTS = 2;

/** Create a Kernel browser, retrying once (transient API errors were one cause of "no live view"). */
async function createWithRetry(client: Kernel, timeoutSeconds: number) {
  let last: unknown;
  for (let i = 0; i < CREATE_ATTEMPTS; i++) {
    try {
      return await client.browsers.create({ headless: false, timeout_seconds: timeoutSeconds });
    } catch (e) {
      last = e;
      console.warn(`[browser] Kernel create attempt ${i + 1} failed: ${errMsg(e)}`);
    }
  }
  throw new Error(`[browser] Kernel browser could not be created: ${errMsg(last)}`);
}

async function connect(client: Kernel, sessionId: string, cdpUrl: string, liveViewUrl: string | undefined, startReplay: boolean): Promise<OpenedBrowser> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (e) {
    if (startReplay) await client.browsers.deleteByID(sessionId).catch(() => undefined);
    throw new Error(`[browser] could not connect to Kernel browser: ${errMsg(e)}`);
  }
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  let replayId: string | undefined;
  let replayViewUrl: string | undefined;
  if (startReplay) {
    try {
      const r = await client.browsers.replays.start(sessionId);
      replayId = r.replay_id;
      replayViewUrl = r.replay_view_url;
    } catch (e) {
      console.warn(`[browser] replay not started: ${errMsg(e)}`);
    }
  }

  return {
    page, liveViewUrl, replayId, sessionId, replayViewUrl,
    async close() {
      let url = replayViewUrl;
      try {
        if (replayId) {
          await client.browsers.replays.stop(replayId, { id_or_name: sessionId });
          const list = await client.browsers.replays.list(sessionId);
          url = list.find((r) => r.replay_id === replayId)?.replay_view_url ?? url;
        }
      } catch (e) {
        console.warn(`[browser] replay stop failed: ${errMsg(e)}`);
      }
      await browser?.close().catch(() => undefined);
      await client.browsers.deleteByID(sessionId).catch((e: unknown) => console.warn(`[browser] delete failed: ${errMsg(e)}`));
      return { replayViewUrl: url };
    },
    async detach() {
      // For a CDP-connected browser, close() only disconnects; the remote Kernel browser keeps running.
      await browser?.close().catch(() => undefined);
    },
  };
}

async function openKernel(timeoutSeconds: number): Promise<OpenedBrowser> {
  const client = new Kernel({ apiKey: env('KERNEL_API_KEY') });
  const kb = await createWithRetry(client, timeoutSeconds);
  return connect(client, kb.session_id, kb.cdp_ws_url, kb.browser_live_view_url, true);
}

/** Re-attach to a still-running Kernel browser (e.g. after the person signed in on the real site). */
export async function attachKernel(sessionId: string): Promise<OpenedBrowser> {
  const client = new Kernel({ apiKey: env('KERNEL_API_KEY') });
  const kb = await client.browsers.retrieve(sessionId);
  if (kb.deleted_at) throw new Error('[browser] that Kernel browser has ended');
  return connect(client, kb.session_id, kb.cdp_ws_url, kb.browser_live_view_url, false);
}

async function openLocal(headless: boolean, slowMo: number): Promise<OpenedBrowser> {
  const browser = await chromium.launch({ headless, slowMo });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const close = async () => { await browser.close().catch(() => undefined); };
  return {
    page,
    async close() { await close(); return {}; },
    detach: close,
  };
}

export async function openBrowser(opts: OpenBrowserOptions): Promise<OpenedBrowser> {
  if (opts.mode === 'kernel') return openKernel(opts.timeoutSeconds ?? kernelTimeoutSeconds());
  return openLocal(opts.headless ?? false, opts.slowMo ?? 150);
}
