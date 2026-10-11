// HTTP API for scripted county calls. Contract: shared/calls.ts. Owner-scoped via the workflow (or household).
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { CALL_PURPOSES } from '../../shared/calls.js';
import { rateLimit } from '../rateLimit.js';
import { requireApplicant, type ApplicantVars } from '../workflow/auth.js';
import type { WorkflowDeps } from '../workflow/deps.js';
import type { LoadedWorkflow } from '../workflow/store.js';
import { CallsError, type CallsRuntime } from './runtime.js';
import { ScriptSchema } from './scripts.js';
import { toWire } from './store.js';

type Env = { Variables: ApplicantVars };

const Id = z.uuid();
const Purpose = z.enum(CALL_PURPOSES);
const SuggestBody = z.object({ purpose: Purpose });
const ScriptBody = z.object({ script: ScriptSchema, purpose: Purpose.optional() });

const notFound = (c: Context) => c.json({ error: 'Not found' }, 404);

function fail(c: Context, err: unknown) {
  if (err instanceof CallsError) return c.json({ error: err.message }, err.status);
  console.error('[calls] request failed:', err instanceof Error ? err.message : String(err));
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
}

export function callsApp(auth: WorkflowDeps['auth'], rt: CallsRuntime): Hono<Env> {
  const app = new Hono<Env>();
  const requireUser = requireApplicant({ auth } as WorkflowDeps);
  const { deps } = rt;

  async function ownedWorkflow(c: Context<Env>): Promise<LoadedWorkflow | undefined> {
    const id = Id.safeParse(c.req.param('id'));
    if (!id.success) return undefined;
    const lw = await deps.workflows.getWorkflow(id.data);
    return lw && lw.wf.userId === c.var.userId ? lw : undefined;
  }

  app.get('/api/calls/config', requireUser, c => c.json(rt.config()));

  app.get('/api/calls/:callId', requireUser, async c => {
    const id = Id.safeParse(c.req.param('callId'));
    if (!id.success) return notFound(c);
    try {
      const row = await deps.repo.get(id.data);
      if (!row) return notFound(c);
      if (row.workflowId) {
        const lw = await deps.workflows.getWorkflow(row.workflowId);
        if (!lw || lw.wf.userId !== c.var.userId) return notFound(c);
      } else {
        const acct = await deps.workflows.getAccount(c.var.userId);
        if (!acct || acct.householdId !== row.householdId) return notFound(c);
      }
      return c.json(toWire(row));
    } catch (err) { return fail(c, err); }
  });

  app.get('/api/workflows/:id/calls', requireUser, async c => {
    try {
      const lw = await ownedWorkflow(c);
      if (!lw) return notFound(c);
      return c.json((await deps.repo.listByWorkflow(lw.wf.id)).map(toWire));
    } catch (err) { return fail(c, err); }
  });

  app.post('/api/workflows/:id/calls/suggest', requireUser, rateLimit({ windowMs: 60_000, max: 20, key: c => `callsuggest:${(c as Context<Env>).var.userId}` }), async c => {
    const parsed = SuggestBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Pick a purpose for the call.' }, 400);
    try {
      const lw = await ownedWorkflow(c);
      if (!lw) return notFound(c);
      const h = await deps.households.get(lw.wf.householdId);
      if (!h) return notFound(c);
      return c.json(await rt.suggest(lw, h, parsed.data.purpose));
    } catch (err) { return fail(c, err); }
  });

  app.get('/api/workflows/:id/calls/script', requireUser, async c => {
    try {
      const lw = await ownedWorkflow(c);
      if (!lw) return notFound(c);
      const step = lw.steps.find(s => s.kind === 'call');
      const saved = ScriptSchema.safeParse(step?.meta.callScript);
      const purpose = Purpose.safeParse(step?.meta.callPurpose);
      return c.json({ script: saved.success ? saved.data : null, purpose: purpose.success ? purpose.data : null });
    } catch (err) { return fail(c, err); }
  });

  app.post('/api/workflows/:id/calls/script', requireUser, async c => {
    const parsed = ScriptBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Add a goal and 1 to 8 questions.' }, 400);
    try {
      const lw = await ownedWorkflow(c);
      if (!lw) return notFound(c);
      const step = lw.steps.find(s => s.kind === 'call');
      if (!step) return notFound(c);
      await deps.workflows.updateStep(step.id, {
        meta: { ...step.meta, callScript: parsed.data.script, ...(parsed.data.purpose ? { callPurpose: parsed.data.purpose } : {}) },
      });
      await deps.publish(lw.wf.id).catch(() => undefined);
      return c.json({ ok: true });
    } catch (err) { return fail(c, err); }
  });

  app.post('/api/workflows/:id/calls', requireUser, rateLimit({ windowMs: 60_000, max: 5, key: c => `callstart:${(c as Context<Env>).var.userId}` }), async c => {
    const parsed = ScriptBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Add a goal and 1 to 8 questions.' }, 400);
    try {
      const lw = await ownedWorkflow(c);
      if (!lw) return notFound(c);
      const row = await rt.startScriptedCall({
        householdId: lw.wf.householdId, workflowId: lw.wf.id, script: parsed.data.script, trigger: 'manual', purpose: parsed.data.purpose,
      });
      return c.json(toWire(row), 201);
    } catch (err) { return fail(c, err); }
  });

  return app;
}
