// Thin client for Cognition's Devin API (v1). Never logs or returns the API key.
const BASE = 'https://api.devin.ai/v1';
const TIMEOUT_MS = 20_000;

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (...a) => fetch(...a);
export function setDevinFetch(f?: FetchFn): void {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

export interface DevinSession {
  id: string;
  status: string;
  done: boolean;
  structuredOutput: unknown;
  url: string;
}

const DONE_STATES = new Set(['finished', 'expired', 'suspend_requested', 'suspend_requested_frontend']);

export const devinSessionUrl = (id: string): string => `https://app.devin.ai/sessions/${id.replace(/^devin-/, '')}`;

async function call(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const key = process.env.DEVIN_API_KEY;
  if (!key) throw new Error('[devin] DEVIN_API_KEY is not set');
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`[devin] ${method} ${path} failed: ${err instanceof Error ? err.name : 'error'}`);
  }
  if (!res.ok) throw new Error(`[devin] ${method} ${path} returned ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function createDevinSession(prompt: string, title: string): Promise<{ id: string; url: string }> {
  const j = await call('POST', '/sessions', { prompt, title, idempotent: false });
  const id = j.session_id;
  if (typeof id !== 'string') throw new Error('[devin] create returned no session_id');
  return { id, url: typeof j.url === 'string' ? j.url : devinSessionUrl(id) };
}

export async function getDevinSession(id: string): Promise<DevinSession> {
  const j = await call('GET', `/sessions/${encodeURIComponent(id)}`);
  const status = String(j.status_enum ?? j.status ?? 'unknown');
  const structuredOutput = j.structured_output ?? null;
  // A session that has produced structured output counts as done even if Devin keeps running.
  const done = DONE_STATES.has(status) || (structuredOutput !== null && typeof structuredOutput === 'object' && 'answer' in structuredOutput);
  return { id, status, done, structuredOutput, url: typeof j.url === 'string' ? j.url : devinSessionUrl(id) };
}
