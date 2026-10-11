// Browser provider for the form-filler: Kernel hosted (live view + replay) or a local visible Chromium.
import { chromium, type Browser, type Page } from 'playwright';
import Kernel from '@onkernel/sdk';
import { env } from '../env.js';

export type BrowserMode = 'kernel' | 'local';
export interface OpenBrowserOptions { mode: BrowserMode; headless?: boolean; slowMo?: number; timeoutSeconds?: number }
export interface OpenedBrowser {
  page: Page;
  liveViewUrl?: string;
  replayId?: string;
  /** Closes the browser. For Kernel, stops the replay and deletes the session; returns the replay URL when known. */
  close(): Promise<{ replayViewUrl?: string }>;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function openKernel(timeoutSeconds: number): Promise<OpenedBrowser> {
  const client = new Kernel({ apiKey: env('KERNEL_API_KEY') });
  const kb = await client.browsers.create({ headless: false, timeout_seconds: timeoutSeconds });
  let browser: Browser | undefined;
  try {
    browser = await chromium.connectOverCDP(kb.cdp_ws_url);
  } catch (e) {
    await client.browsers.deleteByID(kb.session_id).catch(() => undefined);
    throw new Error(`[browser] could not connect to Kernel browser: ${errMsg(e)}`);
  }
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  let replayId: string | undefined;
  try {
    replayId = (await client.browsers.replays.start(kb.session_id)).replay_id;
  } catch (e) {
    console.warn(`[browser] replay not started: ${errMsg(e)}`);
  }

  return {
    page,
    liveViewUrl: kb.browser_live_view_url,
    replayId,
    async close() {
      let replayViewUrl: string | undefined;
      try {
        if (replayId) {
          await client.browsers.replays.stop(replayId, { id_or_name: kb.session_id });
          const list = await client.browsers.replays.list(kb.session_id);
          replayViewUrl = list.find((r) => r.replay_id === replayId)?.replay_view_url;
        }
      } catch (e) {
        console.warn(`[browser] replay stop failed: ${errMsg(e)}`);
      }
      await browser?.close().catch(() => undefined);
      await client.browsers.deleteByID(kb.session_id).catch((e: unknown) => console.warn(`[browser] delete failed: ${errMsg(e)}`));
      return { replayViewUrl };
    },
  };
}

async function openLocal(headless: boolean, slowMo: number): Promise<OpenedBrowser> {
  const browser = await chromium.launch({ headless, slowMo });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  return {
    page,
    async close() {
      await browser.close().catch(() => undefined);
      return {};
    },
  };
}

export async function openBrowser(opts: OpenBrowserOptions): Promise<OpenedBrowser> {
  if (opts.mode === 'kernel') return openKernel(opts.timeoutSeconds ?? 900);
  return openLocal(opts.headless ?? false, opts.slowMo ?? 150);
}
