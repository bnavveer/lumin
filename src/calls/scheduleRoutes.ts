// HTTP API for scheduled county calls. Contract: shared/calls.ts. Owner-scoped via the workflow (or household).
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../rateLimit.js';
import { requireApplicant, type ApplicantVars } from '../workflow/auth.js';
import type { WorkflowDeps } from '../workflow/deps.js';
import type { WorkflowRepo } from '../workflow/store.js';
import { ScheduleCallInput, ScheduleError, type Scheduler } from './schedule.js';

type Env = { Variables: ApplicantVars };
const Id = z.uuid();
const notFound = (c: Context) => c.json({ error: 'Not found' }, 404);

function fail(c: Context, err: unknown) {
  if (err instanceof ScheduleError) return c.json({ error: err.message }, err.status);
  console.error('[schedule] request failed:', err instanceof Error ? err.message : String(err));
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
}

export function scheduledCallsApp(auth: WorkflowDeps['auth'], workflows: WorkflowRepo, s: Scheduler): Hono<Env> {
  const app = new Hono<Env>();
  const requireUser = requireApplicant({ auth } as WorkflowDeps);
  const { repo } = s.deps;

  async function ownedWorkflow(c: Context<Env>) {
    const id = Id.safeParse(c.req.param('id'));
    if (!id.success) return undefined;
    const lw = await workflows.getWorkflow(id.data);
    return lw && lw.wf.userId === c.var.userId ? lw : undefined;
  }

  app.get('/api/workflows/:id/scheduled-calls', requireUser, async c => {
    try {
      const lw = await ownedWorkflow(c);
      if (!lw) return notFound(c);
      return c.json(await repo.listByWorkflow(lw.wf.id));
    } catch (err) { return fail(c, err); }
  });

  app.post('/api/workflows/:id/scheduled-calls', requireUser, rateLimit({ windowMs: 60_000, max: 10, key: c => `callsched:${(c as Context<Env>).var.userId}` }), async c => {
    const parsed = ScheduleCallInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Pick a time and add 1 to 6 questions.' }, 400);
    try {
      const lw = await ownedWorkflow(c);
      if (!lw) return notFound(c);
      const { row } = await s.scheduleCall({ householdId: lw.wf.householdId, workflowId: lw.wf.id, ...parsed.data, source: 'web' });
      return c.json(row, 201);
    } catch (err) { return fail(c, err); }
  });

  app.delete('/api/scheduled-calls/:id', requireUser, async c => {
    const id = Id.safeParse(c.req.param('id'));
    if (!id.success) return notFound(c);
    try {
      const row = await repo.get(id.data);
      if (!row) return notFound(c);
      if (row.workflowId) {
        const lw = await workflows.getWorkflow(row.workflowId);
        if (!lw || lw.wf.userId !== c.var.userId) return notFound(c);
      } else {
        const acct = await workflows.getAccount(c.var.userId);
        if (!acct || acct.householdId !== row.householdId) return notFound(c);
      }
      return c.json(await s.cancel(row.id));
    } catch (err) { return fail(c, err); }
  });

  return app;
}
