// Scripted county calls. Mounted by src/server.ts (before the conversation app and SPA fallback).
import type { Hono } from 'hono';
import { liveWorkflowDeps } from '../workflow/live.js';
import { liveCallsRuntime } from './live.js';
import { callsApp } from './routes.js';

export { callsApp } from './routes.js';
export { createCallsRuntime } from './runtime.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerCallRoutes(app: Hono<any>): void {
  app.route('/', callsApp(liveWorkflowDeps().auth, liveCallsRuntime()));
}
