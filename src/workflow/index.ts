// Applicant accounts + application workflows. Mounted by src/server.ts.
import type { Hono } from 'hono';
import type { WorkflowDeps } from './deps.js';
import { liveWorkflowDeps } from './live.js';
import { workflowApp } from './routes.js';

export { workflowApp } from './routes.js';
export { createEngine } from './engine.js';
export type { WorkflowDeps } from './deps.js';

/** Register /api/auth/signup, /api/me*, /api/workflows* on the app. Deps are created lazily-safe (no I/O here). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerWorkflowRoutes(app: Hono<any>, deps: WorkflowDeps = liveWorkflowDeps()): void {
  app.route('/', workflowApp(deps));
}
