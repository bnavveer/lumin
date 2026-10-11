import { randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { z } from 'zod';
import type { PacketRoutes } from './contracts.js';
import type { CaseDetail, CaseSummary, PublicConfig } from '../web/src/lib/types.js';
import { optionalEnv } from './env.js';
import { rateLimit } from './rateLimit.js';
import { getHousehold, getMessages, listCalls, listDocuments, listHouseholds, listSubmissions, getTimeline, saveSubmission } from './store.js';
import { checkEligibility } from './eligibility.js';
import { getAutopilotState } from './autopilot.js';
import { askStaffQuestion } from './staffAsk.js';
import { startDeepDive, getDeepDive } from './deepDive.js';
import { getTimeSavedMetrics } from './metrics.js';
import { signedUrl } from './documents.js';
import { requireStaff, isDemoMode } from './auth.js';
import { verifyPacketToken } from './links.js';
import { registerOnboardingRoutes } from './onboardingRoutes.js';
import { registerMockBenefitscal } from './benefitscal/mockSite.js';
import { registerInboxRoutes } from './inbox.js';
import { registerKnowledgeRoutes } from './knowledge.js';
import { registerWebKnowledgeRoutes } from './webKnowledge.js';
import { createApp as createConversationApp } from './app.js';
import { liveConversation } from './channels.js';
import { registerVaultRoutes } from './vaultRoutes.js';
import { registerConversationRoutes } from './caseManager/routes.js';
import { demoAutopilot, demoCaseDetail, demoCases, demoMetrics } from './demo.js';
import { clientIp } from './clientIp.js';
import { registerWorkflowRoutes } from './workflow/index.js';
import { registerCallRoutes } from './calls/index.js';

type Env = { Variables: { orgId: string; userId: string; role: string } };

const MAX_CASES = 60;
const WEB_DIST = resolve(process.cwd(), 'web/dist');

const ScreenRequest = z.object({
  firstName: z.string().max(80).optional(),
  county: z.enum(['los_angeles', 'san_francisco']),
  size: z.number().int().min(1).max(20),
  monthlyIncome: z.number().min(0).max(100000),
  childrenUnder18: z.number().int().min(0).max(20),
  pregnant: z.boolean(),
  adultAge: z.number().int().min(15).max(120),
  immigrationStatus: z.enum(['citizen', 'green_card', 'humanitarian', 'undocumented', 'unknown']),
  childrenAreCitizens: z.boolean(),
});

const AskRequest = z.object({ q: z.string().trim().min(1).max(500) });

const CountyApplication = z.object({
  householdId: z.uuid(),
  kind: z.enum(['minimal', 'full']),
  payload: z.unknown(),
});

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<style>body{font:18px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.25rem;color:#1a1a1a}</style></head><body><h1>${title}</h1><p>${body}</p></body></html>`;

const EXPIRED = page('Link expired', 'This link has expired. Text Aid for a new one.');
const PACKET_ERROR = page('Something went wrong', 'We could not load your packet right now. Please try again in a minute or text Aid for help.');

export function createApp(opts: { packet: PacketRoutes }): Hono<Env> {
  const app = new Hono<Env>();
  const demo = (): boolean => {
    try { return isDemoMode(); } catch { return false; }
  };

  if (!process.env.VITEST) app.use('*', logger());
  app.use('*', secureHeaders());
  app.use('/api/*', cors({ origin: 'http://localhost:5173' }));

  app.onError((err, c) => {
    console.error('[server] unhandled', err instanceof Error ? err.message : err);
    return c.json({ error: 'Internal server error' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/public-config', (c) => {
    const body: PublicConfig = {
      supabaseUrl: optionalEnv('SUPABASE_URL') ?? '',
      supabasePublishableKey: optionalEnv('SUPABASE_PUBLISHABLE_KEY') ?? '',
      demoMode: demo(),
    };
    return c.json(body);
  });

  // ── Staff API ──
  const staff = new Hono<Env>();
  staff.use('*', requireStaff);

  // In DEMO_MODE a failing backend falls back to the canned demo data.
  async function withDemo<T>(live: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
    try {
      return await live();
    } catch (err) {
      if (!demo()) throw err;
      console.warn('[server] backend failed, serving demo data:', err instanceof Error ? err.message : err);
      return await fallback();
    }
  }

  staff.get('/cases', async (c) => {
    const orgId = c.var.orgId;
    const out = await withDemo<CaseSummary[]>(async () => {
      const [households, state] = await Promise.all([listHouseholds(orgId), getAutopilotState()]);
      return Promise.all(
        households.slice(0, MAX_CASES).map(async (h) => {
          const timeline = await getTimeline(h.id);
          const lastEvent = timeline.at(-1) ?? null;
          return {
            id: h.id,
            firstName: h.firstName ?? null,
            county: h.county,
            size: h.size,
            updatedAt: lastEvent?.at ?? new Date().toISOString(),
            lastEvent,
            actions: state.actions.filter((a) => a.householdId === h.id),
          };
        }),
      );
    }, () => demoCases());
    return c.json(out);
  });

  staff.get('/cases/:id', async (c) => {
    const id = c.req.param('id');
    const orgId = c.var.orgId;
    const detail = await withDemo<CaseDetail | undefined>(async () => {
      const household = await getHousehold(id);
      if (!household || household.orgId !== orgId) return undefined;
      const [messages, calls, documents, submissions, timeline] = await Promise.all([
        getMessages(id), listCalls(id), listDocuments(id), listSubmissions(id), getTimeline(id),
      ]);
      return {
        household,
        eligibility: checkEligibility(household),
        messages,
        calls,
        documents: await Promise.all(documents.map(async (d) => ({ ...d, url: await signedUrl(d.storagePath) }))),
        submissions,
        timeline,
      };
    }, () => demoCaseDetail(id));
    if (!detail) return c.json({ error: 'Case not found' }, 404);
    return c.json(detail);
  });

  staff.get('/autopilot', async (c) => {
    const orgId = c.var.orgId;
    return c.json(await withDemo(async () => {
      const [households, state] = await Promise.all([listHouseholds(orgId), getAutopilotState()]);
      const mine = new Set(households.map((h) => h.id));
      return { ...state, actions: state.actions.filter((a) => mine.has(a.householdId)) };
    }, () => demoAutopilot()));
  });

  staff.post(
    '/ask',
    rateLimit({ windowMs: 60_000, max: 10, key: (c) => `ask:${(c as Context<Env>).var.userId ?? clientIp(c)}` }),
    async (c) => {
      const parsed = AskRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'q must be 1 to 500 characters' }, 400);
      try {
        return c.json({ answer: await askStaffQuestion(parsed.data.q) });
      } catch (err) {
        console.error('[server] ask failed:', err instanceof Error ? err.message : err);
        return c.json({ error: 'Keewano is unavailable right now, try again' }, 502);
      }
    },
  );

  staff.post(
    '/ask/deep',
    rateLimit({ windowMs: 60_000, max: 3, key: (c) => `askdeep:${(c as Context<Env>).var.userId ?? clientIp(c)}` }),
    async (c) => {
      const parsed = AskRequest.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'q must be 1 to 500 characters' }, 400);
      try {
        return c.json(await startDeepDive(parsed.data.q, c.var.orgId));
      } catch (err) {
        console.error('[server] deep dive failed:', err instanceof Error ? err.message : err);
        return c.json({ error: 'Devin is unavailable right now, try again' }, 502);
      }
    },
  );

  staff.get('/ask/deep/:id', async (c) => {
    try {
      return c.json(await getDeepDive(c.req.param('id')));
    } catch (err) {
      console.error('[server] deep dive status failed:', err instanceof Error ? err.message : err);
      return c.json({ error: 'Could not reach Devin, try again' }, 502);
    }
  });

  staff.get('/metrics', async (c) => c.json(await withDemo(() => getTimeSavedMetrics(), () => demoMetrics())));

  app.route('/api/staff', staff);

  // ── Public screener ──
  app.post('/api/screen', rateLimit({ windowMs: 60_000, max: 30, key: (c) => `screen:${clientIp(c)}` }), async (c) => {
    const parsed = ScreenRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid screening request' }, 400);
    return c.json(checkEligibility({ ...parsed.data, id: 'screen', orgId: 'public', phone: '' }));
  });

  // ── Signed packet links (SMS) ──
  app.get('/p/:id', async (c) => {
    const id = c.req.param('id');
    const t = c.req.query('t') ?? '';
    if (!verifyPacketToken(id, t)) return c.html(EXPIRED, 403);
    try {
      return c.html(await opts.packet.renderPacket(id));
    } catch (err) {
      console.error('[server] renderPacket failed:', err instanceof Error ? err.message : err);
      return c.html(PACKET_ERROR, 500);
    }
  });

  app.post('/p/:id/sign', async (c) => {
    const id = c.req.param('id');
    const t = c.req.query('t') ?? '';
    if (!verifyPacketToken(id, t)) return c.html(EXPIRED, 403);
    try {
      await opts.packet.sign(id);
      return c.redirect(`/p/${encodeURIComponent(id)}?t=${encodeURIComponent(t)}&signed=1`, 303);
    } catch (err) {
      console.error('[server] sign failed:', err instanceof Error ? err.message : err);
      return c.html(PACKET_ERROR, 500);
    }
  });

  // ── County mock (demo) ──
  app.post('/county/api/applications', async (c) => {
    const parsed = CountyApplication.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid application' }, 400);
    const { householdId, kind, payload } = parsed.data;
    if (!(await getHousehold(householdId))) return c.json({ error: 'Unknown household' }, 400);
    const confirmation = `LA-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
    await saveSubmission(householdId, kind, confirmation, payload);
    return c.json({ confirmation });
  });

  app.get('/api/county/applications', async (c) => c.json(await listSubmissions()));

  // ── Self-serve clinic setup ──
  registerOnboardingRoutes(app);
  registerMockBenefitscal(app);
  registerInboxRoutes(app);
  registerKnowledgeRoutes(app);
  registerWebKnowledgeRoutes(app);
  registerVaultRoutes(app);
  registerConversationRoutes(app);
  registerWorkflowRoutes(app);
  registerCallRoutes(app);
  app.route('/', createConversationApp(liveConversation(), {
    phone: process.env.PUBLIC_DIAL_NUMBER ?? process.env.DIAL_FROM_NUMBER,
    apiNotFound: false, // Keep later dev/staff routes reachable on the parent app.
  }));

  // ── Static SPA ──
  if (existsSync(resolve(WEB_DIST, 'index.html'))) {
    const indexHtml = readFileSync(resolve(WEB_DIST, 'index.html'), 'utf8');
    app.use('*', serveStatic({ root: './web/dist' }));
    app.get('*', (c) => {
      const p = c.req.path;
      if (p.startsWith('/api/') || p.startsWith('/p/') || p.startsWith('/county/')) return c.json({ error: 'Not found' }, 404);
      return c.html(indexHtml);
    });
  } else {
    app.get('/', (c) => c.text('Aid API is running. Start the dashboard with: cd web && npm run dev (http://localhost:5173)'));
  }

  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  return app;
}

export function startServer(port: number, opts: { packet: PacketRoutes }): void {
  serve({ fetch: createApp(opts).fetch, port }, (info) => console.log(`[server] listening on :${info.port}`));
}
