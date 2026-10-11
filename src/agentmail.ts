import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

// Thin typed REST client for AgentMail. Verified against https://docs.agentmail.to and live calls:
// base https://api.agentmail.to/v0, auth `Authorization: Bearer <key>`.
const BASE = 'https://api.agentmail.to/v0';
const TIMEOUT_MS = 15_000;
const SVIX_TOLERANCE_S = 300;

export interface AmInbox { inbox_id: string; email: string; display_name?: string; created_at?: string }
export interface AmMessageSummary {
  inbox_id: string; message_id: string; thread_id?: string; labels?: string[]; timestamp: string;
  from: string; to?: string[]; subject?: string; preview?: string;
}
export interface AmMessage extends AmMessageSummary { text?: string; html?: string; extracted_text?: string }
export interface AmSendResult { message_id: string; thread_id?: string }

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (...a) => fetch(...a);
/** Test seam: replace fetch. Call with no args to restore. */
export function setAgentMailFetch(f?: FetchFn): void {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${env('AGENTMAIL_API_KEY')}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`[agentmail] ${method} ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`[agentmail] ${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[agentmail] ${method} ${path} returned non-JSON`);
  }
}

const enc = encodeURIComponent;

export function createInbox(username?: string, displayName?: string): Promise<AmInbox> {
  return call<AmInbox>('POST', '/inboxes', {
    ...(username ? { username } : {}),
    ...(displayName ? { display_name: displayName } : {}),
  });
}

export async function listMessages(inboxId: string, limit = 20): Promise<AmMessageSummary[]> {
  const r = await call<{ messages?: AmMessageSummary[] }>('GET', `/inboxes/${enc(inboxId)}/messages?limit=${limit}`);
  return r.messages ?? [];
}

export const getMessage = (inboxId: string, messageId: string): Promise<AmMessage> =>
  call<AmMessage>('GET', `/inboxes/${enc(inboxId)}/messages/${enc(messageId)}`);

export const sendMessage = (
  inboxId: string, msg: { to: string; subject: string; text: string },
): Promise<AmSendResult> => call<AmSendResult>('POST', `/inboxes/${enc(inboxId)}/messages/send`, msg);

/**
 * Svix-style signature check (AgentMail webhooks are signed with Svix):
 * HMAC-SHA256(base64decode(secret minus "whsec_"), `${svix-id}.${svix-timestamp}.${rawBody}`), base64,
 * compared with any `v1,<sig>` entry in the space-delimited svix-signature header. 5 minute tolerance.
 */
export function verifyWebhookSignature(
  rawBody: string,
  h: { id?: string; timestamp?: string; signature?: string },
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!h.id || !h.timestamp || !h.signature || !secret) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > SVIX_TOLERANCE_S) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();
  return h.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
