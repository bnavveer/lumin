// HTTP API for applicant accounts and workflows. Contract: shared/workflow.ts.
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { ApplicationProgram } from '../../shared/chat.js';
import type { Workflow } from '../../shared/workflow.js';
import { screenApplications } from '../applicationScreening.js';
import { clientIp } from '../clientIp.js';
import type { DocType } from '../contracts.js';
import { fieldsFromHousehold } from '../intake.js';
import { rateLimit } from '../rateLimit.js';
import {
  cleanPhone, ensureHousehold, getOrCreateAccount, ProfileBody, requireApplicant, SignupBody, toMe, type ApplicantVars,
} from './auth.js';
import type { WorkflowDeps } from './deps.js';
import { createEngine, WorkflowError, type Engine } from './engine.js';
import { toSummary } from './nextSteps.js';
import { ALL_PROGRAMS } from './programs.js';
import { DOC_TYPES } from './steps/documents.js';

type Env = { Variables: ApplicantVars };

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const HEARTBEAT_MS = 15_000;

const ProgramEnum = z.enum(ALL_PROGRAMS as [ApplicationProgram, ...ApplicationProgram[]]);
const CreateBody = z.object({
  programs: z.array(ProgramEnum).min(1).max(13).transform(ps => [...new Set(ps)]),
  chatSessionId: z.uuid().optional(),
});
const StepBody = z.object({ stepId: z.uuid() });
const ApproveBody = StepBody.extend({ decision: z.enum(['approve', 'decline']) });
const SessionId = z.uuid();

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function fail(c: Context, err: unknown) {
  if (err instanceof WorkflowError) return c.json({ error: err.message }, err.status);
  console.error('[workflow] request failed:', errorText(err));
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
}

export function workflowApp(deps: WorkflowDeps, engine: Engine = createEngine(deps)): Hono<Env> {
  const app = new Hono<Env>();
  const auth = requireApplicant(deps);

  // ── Accounts ──
  app.post('/api/auth/signup', rateLimit({ windowMs: 60_000, max: 5, key: c => `signup:${clientIp(c)}` }), async c => {
    const parsed = SignupBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? '');
      const msg = field === 'password' ? 'Password must be at least 8 characters.' : field === 'email' ? 'Enter a valid email address.' : 'Check the form and try again.';
      return c.json({ error: msg }, 400);
    }
    const { email, password, firstName } = parsed.data;
    let phone: string | null | undefined;
    try { phone = cleanPhone(parsed.data.phone); } catch { return c.json({ error: 'Enter a 10-digit US phone number.' }, 400); }
    try {
      const meta: Record<string, string> = { role: 'applicant', ...(firstName ? { first_name: firstName } : {}) };
      const created = await deps.auth.createUser(email.toLowerCase(), password, meta);
      if (created === 'exists') return c.json({ error: 'An account with this email already exists. Sign in instead.' }, 409);
      const account = { userId: created.userId, householdId: null, phone: phone ?? null, firstName: firstName ?? null, createdAt: new Date().toISOString() };
      await deps.repo.saveAccount(account);
      if (phone) await ensureHousehold(deps, account).catch(err => console.error('[workflow] signup household link failed:', errorText(err)));
      return c.json({ ok: true }, 201);
    } catch (err) { return fail(c, err); }
  });

  app.get('/api/me', auth, async c => {
    try { return c.json(toMe(await getOrCreateAccount(deps, c.var.userId), c.var.email)); }
    catch (err) { return fail(c, err); }
  });

  app.post('/api/me/profile', auth, async c => {
    const parsed = ProfileBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Check your name and phone number.' }, 400);
    let phone: string | null | undefined;
    try { phone = cleanPhone(parsed.data.phone); } catch { return c.json({ error: 'Enter a 10-digit US phone number.' }, 400); }
    try {
      const cur = await getOrCreateAccount(deps, c.var.userId);
      const next = {
        ...cur,
        ...(parsed.data.firstName !== undefined ? { firstName: parsed.data.firstName } : {}),
        ...(phone !== undefined ? { phone } : {}),
      };
      await deps.repo.saveAccount(next);
      const { account } = await ensureHousehold(deps, next, parsed.data.firstName ? { firstName: parsed.data.firstName } : {});
      return c.json(toMe(account, c.var.email));
    } catch (err) { return fail(c, err); }
  });

  app.get('/api/me/suggestions', auth, async c => {
    try {
      const sid = c.req.query('chatSessionId');
      if (sid) {
        const id = SessionId.safeParse(sid);
        if (!id.success) return c.json({ error: 'Bad chat session id' }, 400);
        return c.json(screenApplications((await deps.chatFields(id.data)) ?? {}));
      }
      const account = await getOrCreateAccount(deps, c.var.userId);
      const h = account.householdId ? await deps.households.get(account.householdId) : undefined;
      return c.json(screenApplications(h ? fieldsFromHousehold(h) : {}));
    } catch (err) { return fail(c, err); }
  });

  // ── Workflows ──
  app.get('/api/workflows', auth, async c => {
    try { return c.json((await deps.repo.listWorkflows(c.var.userId)).map(toSummary)); }
    catch (err) { return fail(c, err); }
  });

  app.post('/api/workflows', auth, rateLimit({ windowMs: 60_000, max: 10, key: c => `wf:${(c as Context<Env>).var.userId}` }), async c => {
    const parsed = CreateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Pick at least one program to apply for.' }, 400);
    try {
      const account = await getOrCreateAccount(deps, c.var.userId);
      const fields = parsed.data.chatSessionId ? (await deps.chatFields(parsed.data.chatSessionId)) ?? {} : {};
      const { household } = await ensureHousehold(deps, account, fields);
      const wf = await engine.create({
        userId: c.var.userId, householdId: household.id, programs: parsed.data.programs, chatSessionId: parsed.data.chatSessionId ?? null,
      });
      return c.json(wf, 201);
    } catch (err) { return fail(c, err); }
  });

  app.get('/api/workflows/:id', auth, async c => {
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Workflow not found' }, 404);
    try { return c.json(await engine.get(id.data, c.var.userId)); }
    catch (err) { return fail(c, err); }
  });

  app.get('/api/workflows/:id/events', requireApplicant(deps, { allowQueryToken: true }), async c => {
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Workflow not found' }, 404);
    let first: Workflow;
    try { first = await engine.get(id.data, c.var.userId); }
    catch (err) { return fail(c, err); }
    return streamSSE(c, async stream => {
      let closed = false;
      const pending: Workflow[] = [];
      let wake: (() => void) | undefined;
      const onUpdate = (wf: Workflow) => { pending.push(wf); wake?.(); };
      engine.bus.on(id.data, onUpdate);
      stream.onAbort(() => { closed = true; wake?.(); });
      try {
        await stream.writeSSE({ event: 'update', data: JSON.stringify(first) });
        while (!closed) {
          const timer = new Promise<'beat'>(r => {
            const t = setTimeout(() => r('beat'), HEARTBEAT_MS);
            wake = () => { clearTimeout(t); r('beat'); };
          });
          await timer;
          wake = undefined;
          if (closed) break;
          if (pending.length) {
            const latest = pending.splice(0).at(-1)!;
            await stream.writeSSE({ event: 'update', data: JSON.stringify(latest) });
          } else {
            await stream.writeSSE({ event: 'heartbeat', data: '{}' });
          }
        }
      } finally {
        engine.bus.off(id.data, onUpdate);
      }
    });
  });

  app.post('/api/workflows/:id/documents', auth, bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: c => c.json({ error: 'File is too large (10 MB max).' }, 413) }), async c => {
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Workflow not found' }, 404);
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    const docType = typeof body?.docType === 'string' ? body.docType : '';
    if (!(file instanceof File)) return c.json({ error: 'Attach a file.' }, 400);
    if (!DOC_TYPES.includes(docType as DocType)) return c.json({ error: 'Unknown document type.' }, 400);
    const contentType = (file.type || '').split(';')[0]!.trim().toLowerCase();
    if (!UPLOAD_TYPES.has(contentType)) return c.json({ error: 'Upload a JPEG, PNG, WebP or PDF.' }, 400);
    if (file.size === 0) return c.json({ error: 'That file is empty.' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: 'File is too large (10 MB max).' }, 413);
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      return c.json(await engine.upload(id.data, c.var.userId, { buffer, contentType, docType: docType as DocType }));
    } catch (err) { return fail(c, err); }
  });

  app.post('/api/workflows/:id/approve', auth, async c => {
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Workflow not found' }, 404);
    const parsed = ApproveBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'stepId and decision are required' }, 400);
    try { return c.json(await engine.approve(id.data, c.var.userId, parsed.data.stepId, parsed.data.decision)); }
    catch (err) { return fail(c, err); }
  });

  app.post('/api/workflows/:id/run', auth, async c => {
    const id = SessionId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'Workflow not found' }, 404);
    const parsed = StepBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'stepId is required' }, 400);
    try { return c.json(await engine.run(id.data, c.var.userId, parsed.data.stepId)); }
    catch (err) { return fail(c, err); }
  });

  return app;
}
