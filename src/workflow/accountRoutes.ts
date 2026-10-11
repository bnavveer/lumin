import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import sharp from 'sharp';
import { z } from 'zod/v4';
import type { Me, Workflow } from '../../shared/workflow.js';
import { screenApplications, ScreeningFieldsSchema } from '../applicationScreening.js';
import { clientIp } from '../clientIp.js';
import { MAX_BYTES, extFor } from '../documents.js';
import { normalizePhone } from '../intake.js';
import { rateLimit } from '../rateLimit.js';
import { applyDocuments, applyResearch, DOC_TYPES, newWorkflow, officialHandoff, PROGRAMS, summary, type StoredDocument } from './model.js';
import { supabaseWorkflowRepo, WorkflowError, type ApplicantUser, type Profile, type WorkflowRepo } from './repo.js';

const Program = z.enum(PROGRAMS as [typeof PROGRAMS[number], ...typeof PROGRAMS[number][]]);
const Id = z.uuid();
const Phone = z.string().trim().min(10).max(24).transform((v, c) => {
  try { return normalizePhone(v); } catch { c.addIssue({ code: 'custom', message: 'Enter a US phone number.' }); return z.NEVER; }
});
const FirstName = z.string().trim().min(1).max(100);
const Screening = z.object({
  county: z.enum(['los_angeles', 'san_francisco']).optional(), size: z.number().int().min(1).max(20).optional(),
  monthlyIncome: z.number().min(0).max(100_000).optional(), childrenUnder18: z.number().int().min(0).max(15).optional(),
  pregnant: z.boolean().optional(), adultAge: z.number().int().min(14).max(120).optional(),
  immigrationStatus: z.enum(['citizen', 'green_card', 'humanitarian', 'undocumented', 'unknown']).optional(), childrenAreCitizens: z.boolean().optional(),
  ...ScreeningFieldsSchema.shape,
}).strict();
const Signup = z.object({ email: z.email().max(254), password: z.string().min(8).max(128), firstName: FirstName.optional(), phone: Phone.optional() }).strict();
const ProfilePatch = z.object({ firstName: FirstName.nullable().optional(), phone: Phone.nullable().optional(), screeningAnswers: z.record(z.string(), z.unknown()).optional() }).strict();
const Create = z.object({ programs: z.array(Program).min(1).max(PROGRAMS.length), chatSessionId: Id.optional() }).strict();
const Run = z.object({ stepId: Id }).strict();
const Approval = z.object({ stepId: Id, decision: z.enum(['approve', 'decline']) }).strict();
const Receipt = z.object({ program: Program, confirmation: z.string().trim().min(1).max(300), submittedAt: z.iso.datetime().optional() }).strict();
type Vars = { user: ApplicantUser };
export interface WorkflowRouteDeps { repo?: WorkflowRepo; now?: () => Date; eventPollMs?: number; eventMaxMs?: number }
const publicProfile = (p: Profile): Me => ({ userId: p.userId, email: p.email, householdId: p.householdId, phone: p.phone, firstName: p.firstName });
const publicDocument = ({ userId: _u, storagePath: _s, ...doc }: StoredDocument) => doc;

/** All account routes fail closed without a valid Supabase token, including in DEMO_MODE. */
export function registerAccountRoutes(app: Hono<any>, deps: WorkflowRouteDeps = {}): void {
  const repo = deps.repo ?? supabaseWorkflowRepo();
  const now = deps.now ?? (() => new Date());
  const routes = new Hono<{ Variables: Vars }>();
  routes.onError((err, c) => {
    if (err instanceof WorkflowError) return c.json({ error: err.message }, err.status);
    console.error('[workflow] request failed', err instanceof Error ? err.name : 'error');
    return c.json({ error: 'Lumin could not finish this request. Please try again.' }, 503);
  });
  const jsonLimit = bodyLimit({ maxSize: 32 * 1024, onError: c => c.json({ error: 'Request is too large.' }, 413) });
  routes.use('/api/auth/signup', jsonLimit, rateLimit({ windowMs: 60 * 60 * 1000, max: 6, key: clientIp }));
  routes.post('/api/auth/signup', async c => {
    const input = Signup.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'Enter a valid email, password (8–128 characters), name and US phone number.' }, 400);
    const result = await repo.signup(input.data);
    return c.json({ ok: true, ...result }, 201);
  });
  const authorize = async (c: import('hono').Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(c.req.header('authorization')?.trim() ?? '');
    if (!match) return c.json({ error: 'Sign in required.' }, 401);
    const user = await repo.authenticate(match[1]!);
    if (!user) return c.json({ error: 'Sign in required.' }, 401);
    c.set('user', user);
    c.header('Cache-Control', 'no-store');
    await next();
  };
  routes.use('/api/me', authorize);
  routes.use('/api/me/*', authorize);
  routes.use('/api/workflows', authorize);
  routes.use('/api/workflows/*', authorize);
  // Uploads get a separate bounded multipart limit; authorization runs before any body is read.
  routes.use('/api/me/*', async (c, next) => c.req.path === '/api/me/documents' && c.req.method === 'POST' ? next() : jsonLimit(c, next));
  routes.use('/api/workflows/*', async (c, next) => c.req.path.endsWith('/documents') ? next() : jsonLimit(c, next));
  routes.use('/api/workflows', jsonLimit);
  routes.get('/api/me', async c => c.json(publicProfile(await repo.profile(c.get('user')))));
  routes.post('/api/me/profile', async c => {
    const input = ProfilePatch.safeParse(await c.req.json().catch(() => null));
    if (!input.success || !Object.keys(input.data).length) return c.json({ error: 'Provide a valid name, phone or screening answers.' }, 400);
    let answers;
    if (input.data.screeningAnswers) {
      const merged: Record<string, unknown> = { ...(await repo.screening(c.get('user').id)) };
      for (const [key, value] of Object.entries(input.data.screeningAnswers)) {
        if (!(key in Screening.shape)) return c.json({ error: 'Unknown screening field.' }, 400);
        if (value === null) delete merged[key]; else merged[key] = value;
      }
      const parsed = Screening.safeParse(merged);
      if (!parsed.success) return c.json({ error: 'Provide valid screening answers; use null to clear an answer.' }, 400);
      try { screenApplications(parsed.data, now()); } catch { return c.json({ error: 'Check your household counts and income answers.' }, 400); }
      answers = parsed.data;
    }
    return c.json(publicProfile(await repo.updateProfile(c.get('user'), { firstName: input.data.firstName, phone: input.data.phone, screeningAnswers: answers })));
  });
  routes.post('/api/me/link-chat', async c => {
    const input = z.object({ chatSessionId: Id }).strict().safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'A valid chat session is required.' }, 400);
    await repo.profile(c.get('user'));
    await repo.claimChat(c.get('user').id, input.data.chatSessionId);
    return c.json(publicProfile(await repo.profile(c.get('user'))));
  });
  routes.get('/api/me/screening', async c => {
    await repo.profile(c.get('user'));
    return c.json(await repo.screening(c.get('user').id));
  });
  routes.get('/api/me/suggestions', async c => {
    const user = c.get('user');
    await repo.profile(user);
    const session = c.req.query('chatSessionId');
    if (session) {
      if (!Id.safeParse(session).success) return c.json({ error: 'Invalid chat session.' }, 400);
      await repo.claimChat(user.id, session);
    }
    return c.json(screenApplications(await repo.screening(user.id), now()));
  });
  const owned = async (userId: string, id: string) => {
    if (!Id.safeParse(id).success) throw new WorkflowError(404, 'Workflow not found.');
    const row = await repo.get(userId, id);
    if (!row) throw new WorkflowError(404, 'Workflow not found.');
    return row;
  };
  const docsFor = async (userId: string, id: string) => (await repo.documents(userId)).filter(d => d.workflowId === id || d.workflowId === null);
  routes.get('/api/workflows', async c => c.json((await repo.list(c.get('user').id)).map(r => summary(r.workflow))));
  routes.post('/api/workflows', async c => {
    const input = Create.safeParse(await c.req.json().catch(() => null));
    if (!input.success || new Set(input.data.programs).size !== input.data.programs.length) return c.json({ error: 'Choose one or more different supported programs.' }, 400);
    const user = c.get('user');
    await repo.profile(user);
    if (input.data.chatSessionId) await repo.claimChat(user.id, input.data.chatSessionId);
    const profile = await repo.profile(user);
    if ((await repo.list(user.id)).length >= 50) throw new WorkflowError(429, 'Your account already has 50 workflows.');
    const w = newWorkflow(profile.householdId, input.data.programs, screenApplications(await repo.screening(user.id), now()), now().toISOString());
    applyDocuments(w, await docsFor(user.id, w.id), now().toISOString());
    await repo.create(user.id, w);
    return c.json(w, 201);
  });
  routes.get('/api/workflows/:id', async c => c.json((await owned(c.get('user').id, c.req.param('id'))).workflow));
  routes.post('/api/workflows/:id/run', async c => {
    const row = await owned(c.get('user').id, c.req.param('id'));
    const input = Run.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'Provide a valid step ID.' }, 400);
    const step = row.workflow.steps.find(s => s.id === input.data.stepId);
    if (!step) throw new WorkflowError(404, 'Step not found.');
    if (row.workflow.steps.find(s => s.kind === 'fill')?.status === 'done' || row.workflow.steps.some(s => s.kind === 'submit' && s.evidence.some(e => e.source === 'applicant_report')))
      throw new WorkflowError(409, 'Your application handoff is already reviewed. Continue with the agency to sign, submit or verify your receipt.');
    const at = now().toISOString();
    if (step.kind === 'research') {
      applyResearch(row.workflow, screenApplications(await repo.screening(row.userId), now()), at);
      applyDocuments(row.workflow, await docsFor(row.userId, row.workflow.id), at);
    } else if (step.kind === 'documents') applyDocuments(row.workflow, await docsFor(row.userId, row.workflow.id), at);
    else if (step.kind === 'fill') {
      if (row.workflow.status !== 'ready_to_fill') throw new WorkflowError(409, 'Complete your preparation checklist first, or apply directly with the agency.');
      step.status = 'waiting_on_you'; step.summary = 'Review and approve the official application handoff. Automated form filling is not available.';
      row.workflow.updatedAt = at;
    } else throw new WorkflowError(409, 'Complete signatures and submission with the official agency. Lumin cannot perform or verify this step.');
    await repo.save(row);
    return c.json(row.workflow);
  });
  routes.post('/api/workflows/:id/approve', async c => {
    const row = await owned(c.get('user').id, c.req.param('id'));
    const input = Approval.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'Provide a valid step and approval decision.' }, 400);
    const step = row.workflow.steps.find(s => s.id === input.data.stepId);
    if (!step) throw new WorkflowError(404, 'Step not found.');
    if (step.kind !== 'fill' || row.workflow.status !== 'ready_to_fill' || step.status !== 'waiting_on_you') throw new WorkflowError(409, 'This step cannot be approved here. Agency signatures must be completed on the official site.');
    if (input.data.decision === 'approve') officialHandoff(row.workflow, screenApplications(await repo.screening(row.userId), now()), now().toISOString());
    else {
      step.status = 'waiting_on_you'; step.summary = 'You declined the handoff. Review your answers and documents before continuing.';
      row.workflow.updatedAt = now().toISOString();
    }
    await repo.save(row);
    return c.json(row.workflow);
  });
  routes.post('/api/workflows/:id/receipt', async c => {
    const row = await owned(c.get('user').id, c.req.param('id'));
    const input = Receipt.safeParse(await c.req.json().catch(() => null));
    if (!input.success || !row.workflow.programs.includes(input.data.program)) return c.json({ error: 'Provide a selected program and confirmation reference (1–300 characters).' }, 400);
    if (input.data.submittedAt && Date.parse(input.data.submittedAt) > now().getTime() + 300_000) return c.json({ error: 'Submission time cannot be in the future.' }, 400);
    const step = row.workflow.steps.find(s => s.kind === 'submit' && s.program === input.data.program)!;
    if (step.evidence.length >= 20) throw new WorkflowError(429, 'This application already has 20 reported receipt references.');
    step.evidence.push({ id: randomUUID(), kind: 'confirmation', title: 'Receipt reported by you (not verified)', url: null,
      detail: `Applicant-reported reference: ${input.data.confirmation}${input.data.submittedAt ? `; reported submission time: ${input.data.submittedAt}` : ''}. Lumin has not independently verified submission.`, source: 'applicant_report', at: now().toISOString() });
    step.status = 'waiting_on_you'; step.summary = 'A receipt was reported by you. Lumin has not verified agency acceptance or a completed submission.';
    row.workflow.status = 'needs_attention'; row.workflow.updatedAt = now().toISOString();
    const match = screenApplications(await repo.screening(row.userId), now()).matches.find(m => m.program === input.data.program)!;
    const signId = row.workflow.steps.find(s => s.kind === 'sign' && s.program === input.data.program)!.id;
    row.workflow.nextSteps = [
      ...row.workflow.nextSteps.filter(n => n.action?.stepId !== step.id && n.action?.stepId !== signId),
      { id: step.id, title: 'Verify your application with the agency', detail: 'Check the official portal or contact the agency to confirm it received your application and learn the next deadline.', actor: 'you', action: { type: 'open_url', label: 'Open official site', url: match.applicationUrl, stepId: step.id } },
    ];
    await repo.save(row);
    return c.json(row.workflow);
  });

  const uploadLimit = bodyLimit({ maxSize: MAX_BYTES + 64 * 1024, onError: c => c.json({ error: 'Files must be 10 MB or smaller.' }, 413) });
  const upload = async (c: import('hono').Context<{ Variables: Vars }>, workflowId: string | null): Promise<StoredDocument> => {
    await repo.profile(c.get('user'));
    const body = await c.req.parseBody().catch(() => null);
    const file = body?.file;
    const docType = z.enum(DOC_TYPES as [typeof DOC_TYPES[number], ...typeof DOC_TYPES[number][]]).safeParse(body?.docType);
    if (!(file instanceof File) || !docType.success) throw new WorkflowError(400, 'Choose a file and supported document type.');
    if (file.size === 0) throw new WorkflowError(400, 'The document is empty.');
    if (file.size > MAX_BYTES) throw new WorkflowError(413, 'Files must be 10 MB or smaller.');
    const contentType = file.type.toLowerCase();
    const ext = extFor(contentType);
    if (!ext) throw new WorkflowError(415, 'Use a PDF, JPEG, PNG, WebP or GIF document.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (contentType === 'application/pdf') {
      if (Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-') throw new WorkflowError(415, 'This file is not a PDF.');
    } else {
      try {
        const meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
        const expected = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[contentType];
        if (meta.format !== expected) throw new Error('type mismatch');
      } catch { throw new WorkflowError(415, 'This file is not a supported image.'); }
    }
    const docs = await repo.documents(c.get('user').id);
    if (docs.length >= 100 || docs.reduce((n, d) => n + d.sizeBytes, 0) + file.size > 100 * 1024 * 1024) throw new WorkflowError(413, 'Your private vault limit is 100 files and 100 MB. Remove a file before uploading another.');
    const id = randomUUID();
    const doc: StoredDocument = { id, userId: c.get('user').id, workflowId, docType: docType.data,
      fileName: file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 200) || `document.${ext}`, contentType, sizeBytes: file.size,
      storagePath: `applicants/${c.get('user').id}/${id}.${ext}`, status: 'received', createdAt: now().toISOString() };
    await repo.upload(doc, bytes);
    return doc;
  };
  routes.post('/api/workflows/:id/documents', uploadLimit, async c => {
    const row = await owned(c.get('user').id, c.req.param('id'));
    await upload(c, row.workflow.id);
    // Adding files after the handoff must not rewind the applicant's recorded review or reported receipt.
    if (['researching', 'needs_documents', 'ready_to_fill', 'needs_attention'].includes(row.workflow.status) && !row.workflow.steps.some(s => s.kind === 'submit' && s.evidence.length))
      applyDocuments(row.workflow, await docsFor(row.userId, row.workflow.id), now().toISOString());
    else row.workflow.updatedAt = now().toISOString();
    await repo.save(row);
    return c.json(row.workflow);
  });
  routes.get('/api/me/documents', async c => c.json((await repo.documents(c.get('user').id)).map(publicDocument)));
  routes.post('/api/me/documents', uploadLimit, async c => c.json(publicDocument(await upload(c, null)), 201));
  const ownDocument = async (userId: string, id: string) => {
    const doc = (await repo.documents(userId)).find(d => d.id === id);
    if (!doc) throw new WorkflowError(404, 'Document not found.');
    return doc;
  };
  routes.get('/api/me/documents/:id/download', async c => c.json({ url: await repo.download(await ownDocument(c.get('user').id, c.req.param('id'))), expiresIn: 600 }));
  routes.delete('/api/me/documents/:id', async c => {
    const doc = await ownDocument(c.get('user').id, c.req.param('id'));
    await repo.deleteDocument(doc);
    // Refresh preparation checklists that referenced the removed document.
    for (const row of await repo.list(c.get('user').id)) {
      if (doc.workflowId && doc.workflowId !== row.workflow.id) continue;
      if (['needs_documents', 'ready_to_fill'].includes(row.workflow.status)) {
        applyDocuments(row.workflow, await docsFor(row.userId, row.workflow.id), now().toISOString());
        await repo.save(row);
      } else {
        const documents = row.workflow.steps.find(s => s.kind === 'documents');
        if (documents?.evidence.some(e => e.id === doc.id)) {
          documents.evidence = documents.evidence.filter(e => e.id !== doc.id);
          row.workflow.updatedAt = now().toISOString();
          await repo.save(row);
        }
      }
    }
    return c.json({ ok: true });
  });
  routes.get('/api/workflows/:id/events', async c => {
    const first = await owned(c.get('user').id, c.req.param('id'));
    return streamSSE(c, async stream => {
      let last = JSON.stringify(first.workflow);
      await stream.writeSSE({ event: 'update', data: last, id: String(first.version) });
      const deadline = Date.now() + (deps.eventMaxMs ?? 60_000);
      while (!stream.aborted && Date.now() < deadline) {
        await stream.sleep(deps.eventPollMs ?? 2000);
        if (stream.aborted) break;
        const row = await repo.get(c.get('user').id, first.workflow.id);
        if (!row) break;
        const data = JSON.stringify(row.workflow);
        if (data !== last) { await stream.writeSSE({ event: 'update', data, id: String(row.version) }); last = data; }
        else await stream.writeSSE({ event: 'ping', data: '{}' });
      }
    });
  });
  app.route('/', routes);
}
