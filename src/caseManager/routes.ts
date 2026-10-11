// HTTP routes: DEMO_MODE text simulator + staff approval endpoints.
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { isDemoMode, requireStaff } from '../auth.js';
import { rateLimit } from '../rateLimit.js';
import { resolveApprovalById } from './approvals.js';
import { getDeps } from './deps.js';
import { handleIncomingMessage, normalizeFrom } from './engine.js';

// Simulator may only act as reserved fictional numbers, never a real person's phone.
export const SIM_PHONE = /^\+1555\d{7}$/;

const SimBody = z.object({
  from: z.string().trim().regex(SIM_PHONE, 'sim numbers must be +1555xxxxxxx'),
  text: z.string().max(2000).default(''),
  mediaUrls: z.array(z.url()).max(5).optional(),
});
const ResolveBody = z.object({ decision: z.enum(['approve', 'decline']) });

const CT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
export const guessContentType = (url: string): string =>
  CT[(/\.([a-z0-9]+)(?:\?|#|$)/i.exec(url)?.[1] ?? '').toLowerCase()] ?? 'image/jpeg';

const demoOnly = (c: Context): Response | undefined => {
  let on = false;
  try { on = isDemoMode(); } catch { on = false; }
  return on ? undefined : c.json({ error: 'Not found' }, 404);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerConversationRoutes(app: Hono<any>): void {
  app.post('/api/dev/sim/message', requireStaff, rateLimit({ windowMs: 60_000, max: 60, key: () => 'sim' }), async (c) => {
    const blocked = demoOnly(c);
    if (blocked) return blocked;
    const parsed = SimBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'from must be a +1555xxxxxxx sim number; text is required' }, 400);
    const { from, text, mediaUrls } = parsed.data;
    const started = Date.now();
    const replies = await handleIncomingMessage({
      channel: 'sim', from, text,
      ...(mediaUrls?.length ? { media: mediaUrls.map((url) => ({ url, contentType: guessContentType(url) })) } : {}),
    });
    return c.json({ replies, ms: Date.now() - started });
  });

  app.get('/api/dev/sim/thread', requireStaff, async (c) => {
    const blocked = demoOnly(c);
    if (blocked) return blocked;
    const from = c.req.query('from');
    if (!from || !SIM_PHONE.test(from.trim())) return c.json({ error: 'from must be a +1555xxxxxxx sim number' }, 400);
    const deps = await getDeps();
    const h = await deps.repo.getHouseholdByPhone(normalizeFrom(from, 'sim'));
    if (!h) return c.json({ householdId: null, messages: [], state: null });
    const [messages, state, approvals] = await Promise.all([
      deps.repo.getMessages(h.id, 200), deps.repo.getState(h.id), deps.repo.listApprovals(h.id),
    ]);
    return c.json({ householdId: h.id, messages, state, approvals });
  });

  const ownCase = async (c: Context, id: string): Promise<boolean> => {
    const deps = await getDeps();
    const h = await deps.repo.getHousehold(id);
    return Boolean(h && h.orgId === c.get('orgId'));
  };

  app.get('/api/staff/cases/:id/approvals', requireStaff, async (c) => {
    const id = c.req.param('id');
    if (!z.uuid().safeParse(id).success || !(await ownCase(c, id))) return c.json({ error: 'Not found' }, 404);
    return c.json(await (await getDeps()).repo.listApprovals(id));
  });

  app.post('/api/staff/cases/:id/approvals/:approvalId/resolve', requireStaff, async (c) => {
    const id = c.req.param('id');
    const approvalId = c.req.param('approvalId');
    if (!z.uuid().safeParse(id).success || !(await ownCase(c, id))) return c.json({ error: 'Not found' }, 404);
    const parsed = ResolveBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'decision must be approve or decline' }, 400);
    const deps = await getDeps();
    const a = await deps.repo.getApproval(approvalId);
    if (!a || a.householdId !== id) return c.json({ error: 'Not found' }, 404);
    const out = await resolveApprovalById(deps, approvalId, parsed.data.decision === 'approve', `staff:${c.get('userId')}`);
    if (!out) return c.json({ error: 'Already resolved' }, 409);
    const h = await deps.repo.getHousehold(id);
    for (const r of out.replies) await deps.repo.appendMessage(id, 'assistant', r);
    // Outgoing texts for the caller (Dial loop / dashboard) to deliver.
    return c.json({ approval: out.approval, messages: out.replies.map((text) => ({ to: h?.phone ?? '', text })) });
  });
}
