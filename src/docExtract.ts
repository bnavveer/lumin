// Photo/document reading for the vault.
//
// PRIVACY: sending an applicant's documents to a third-party model provider (Devin by Cognition, or
// Anthropic) is a third-party data transfer that REQUIRES the applicant's consent. Callers must have
// captured it before calling startExtraction. The provider is swappable: when llm.ts hasModel() is true (Neon AI Gateway or ANTHROPIC_API_KEY)
// set we use a Claude vision call (synchronous); otherwise Devin (asynchronous, minutes).
// User instruction: "use devin for photo reading".
import { z } from 'zod';
import type { DocType } from './contracts.js';
import { createDevinSession, getDevinSession, type DevinSession } from './devin.js';
import { logEvent } from './keewano.js';
import { generateObjectWithFallback, hasModel } from './llm.js';
import { getTimeline } from './store.js';
import { vaultDb } from './vault.js';

type Row = Record<string, unknown>;
const BUCKET = 'documents';
const SIGNED_URL_TTL_SEC = 3600;
const PAYSTUB_VALID_DAYS = 30;
const DAY_MS = 86_400_000;

const str = z.string().nullable();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const EXTRACT_SCHEMAS = {
  paystub: z.object({
    employerName: str, payPeriodStart: day, payPeriodEnd: day, payDate: day,
    grossPay: z.number().nullable(), netPay: z.number().nullable(),
    hoursWorked: z.number().nullish(), payFrequency: z.string().nullish(),
  }),
  id: z.object({
    fullName: str, dateOfBirth: day, idNumberLast4: z.string().max(4).nullable(),
    expirationDate: day, address: z.string().nullish(),
  }),
  lease: z.object({ landlord: str, monthlyRent: z.number().nullable(), address: str, startDate: day }),
  other: z.object({ summary: str }),
} as const;
type SchemaKey = keyof typeof EXTRACT_SCHEMAS;
const schemaFor = (t: string): z.ZodObject => EXTRACT_SCHEMAS[(t in EXTRACT_SCHEMAS ? t : 'other') as SchemaKey];

export type ExtractProvider = 'devin' | 'claude';
export const pickProvider = (): ExtractProvider => (deps.hasModel() ? 'claude' : 'devin');

export interface ExtractDeps {
  createSession: (prompt: string, title: string) => Promise<{ id: string; url: string }>;
  getSession: (id: string) => Promise<DevinSession>;
  /** Fallback when Devin finishes without setting structured_output: last JSON answer in its messages. */
  getMessageAnswer: (id: string) => Promise<unknown>;
  claudeExtract: (schema: z.ZodObject, url: string, docType: string) => Promise<unknown>;
  hasModel: () => boolean;
  logEvent: typeof logEvent;
  getTimeline: typeof getTimeline;
}
/** Pull the last {"answer": ...} JSON object out of a list of Devin message texts. */
export function answerFromMessages(texts: string[]): unknown {
  for (const t of [...texts].reverse()) {
    const start = t.indexOf('{"answer"');
    if (start < 0) continue;
    for (let end = t.lastIndexOf('}'); end > start; end = t.lastIndexOf('}', end - 1)) {
      try {
        const o = JSON.parse(t.slice(start, end + 1)) as Row;
        if (o && typeof o === 'object' && 'answer' in o) return o.answer;
      } catch { /* try a shorter slice */ }
    }
  }
  return null;
}

async function fetchMessageAnswer(id: string): Promise<unknown> {
  const key = process.env.DEVIN_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.devin.ai/v1/sessions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { messages?: Array<{ type?: string; message?: string }> };
  return answerFromMessages((j.messages ?? []).filter(m => m.type === 'devin_message').map(m => String(m.message ?? '')));
}

/** Vision read via the 'vision' task: opus-5-5 first (JSON-text path), then Gemini / GPT fallbacks. */
async function claudeVision(schema: z.ZodObject, url: string, docType: string): Promise<unknown> {
  const instruction = `Read ONLY the listed fields from this ${docType} image. Use null for anything unreadable.`;
  // The gateway rejects URL image sources for Claude, so download the bytes from our own signed URL.
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`[docExtract] image download failed: ${res.status}`);
  const image = {
    type: 'image' as const, image: Buffer.from(await res.arrayBuffer()),
    mediaType: (res.headers.get('content-type') ?? 'image/png').split(';')[0]!,
  };
  const { object } = await generateObjectWithFallback('vision', schema, {
    messages: [{ role: 'user', content: [{ type: 'text', text: instruction }, image] }],
  });
  return object;
}

const realDeps = (): ExtractDeps => ({
  createSession: createDevinSession,
  getSession: getDevinSession,
  getMessageAnswer: fetchMessageAnswer,
  claudeExtract: claudeVision,
  hasModel,
  logEvent,
  getTimeline,
});
let deps: ExtractDeps = realDeps();
/** Test seam: override any dependency; call with no args to restore. */
export function setExtractDeps(d?: Partial<ExtractDeps>): void {
  deps = d ? { ...realDeps(), ...d } : realDeps();
}

export function buildPrompt(docType: string, url: string): string {
  const schema = JSON.stringify(z.toJSONSchema(schemaFor(docType)));
  return [
    `Download the ${docType} image from this URL: ${url}`,
    'Read ONLY the fields listed in the JSON schema below. If a field is unreadable or absent, use null.',
    'Dates must be ISO YYYY-MM-DD. Money values are plain numbers in USD.',
    'Do not store, share, or keep the file. Do not browse anywhere else and do not open any other URL.',
    `When finished, set your structured output to exactly: {"answer": <object matching this JSON schema>}.`,
    `Schema: ${schema}`,
  ].join('\n');
}

export const addDays = (isoDay: string, n: number): string =>
  new Date(Date.parse(`${isoDay}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Expiry rule: paystub = payDate + 30 days, id = expirationDate. */
export function computeDates(docType: string, data: Record<string, unknown>): { docDate: string | null; expiresAt: string | null } {
  if (docType === 'paystub') {
    const payDate = (data.payDate as string | null) ?? null;
    return { docDate: (data.payPeriodEnd as string | null) ?? payDate, expiresAt: payDate ? addDays(payDate, PAYSTUB_VALID_DAYS) : null };
  }
  if (docType === 'id') return { docDate: null, expiresAt: (data.expirationDate as string | null) ?? null };
  if (docType === 'lease') return { docDate: (data.startDate as string | null) ?? null, expiresAt: null };
  return { docDate: null, expiresAt: null };
}

const requiredKeys = (schema: z.ZodObject): string[] =>
  Object.entries(schema.shape).filter(([, v]) => !(v as z.ZodType).safeParse(undefined).success).map(([k]) => k);

async function getDoc(documentId: string): Promise<Row> {
  const { data, error } = await vaultDb().from('documents').select('*').eq('id', documentId).maybeSingle();
  if (error) throw new Error(`[docExtract] lookup: ${error.message}`);
  if (!data) throw new Error('[docExtract] document not found');
  return data as Row;
}

async function update(documentId: string, patch: Row, onlyIfStatus?: string): Promise<boolean> {
  let q = vaultDb().from('documents').update(patch).eq('id', documentId);
  if (onlyIfStatus) q = q.eq('status', onlyIfStatus);
  const { data, error } = await q.select('id');
  if (error) throw new Error(`[docExtract] update: ${error.message}`);
  return (data ?? []).length > 0;
}

async function applyResult(doc: Row, raw: unknown): Promise<{ status: 'read' | 'needs_review'; extracted: unknown }> {
  const docType = doc.doc_type as string;
  const schema = schemaFor(docType);
  const parsed = schema.safeParse(raw);
  let status: 'read' | 'needs_review' = 'needs_review';
  let patch: Row = { extracted: raw && typeof raw === 'object' ? raw : null };
  if (parsed.success) {
    const data = parsed.data as Record<string, unknown>;
    const dates = computeDates(docType, data);
    const complete = requiredKeys(schema).every(k => data[k] !== null && data[k] !== undefined);
    status = complete ? 'read' : 'needs_review';
    patch = { extracted: data, doc_date: dates.docDate, expires_at: dates.expiresAt };
  }
  // Atomic claim: only the poll that flips reading -> final status logs the events.
  const claimed = await update(doc.id as string, { ...patch, status }, 'reading');
  if (claimed) await logOnce(doc.household_id as string, docType as DocType);
  return { status, extracted: patch.extracted };
}

async function logOnce(hid: string, docType: DocType): Promise<void> {
  try {
    const seen = (await deps.getTimeline(hid)).some(t => t.label === `DocReceived: ${docType}`);
    if (!seen) await deps.logEvent(hid, { type: 'DocReceived', value: docType });
    await deps.logEvent(hid, { type: 'AgentToolCalled', value: 'devin_doc_extract' });
  } catch (err) {
    console.error('[docExtract] keewano log failed:', err instanceof Error ? err.message : err);
  }
}

export async function startExtraction(documentId: string): Promise<{ provider: ExtractProvider; sessionId?: string; url?: string; status: string }> {
  const doc = await getDoc(documentId);
  const path = (doc.compressed_path as string | null) ?? (doc.storage_path as string);
  const signed = await vaultDb().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (signed.error || !signed.data) throw new Error(`[docExtract] signedUrl: ${signed.error?.message ?? 'no url'}`);
  const url = signed.data.signedUrl;
  const docType = doc.doc_type as string;
  const provider = pickProvider();

  if (provider === 'claude') {
    await update(documentId, { status: 'reading', extract_provider: 'claude' });
    let raw: unknown = null;
    try { raw = await deps.claudeExtract(schemaFor(docType), url, docType); }
    catch (err) { console.error('[docExtract] claude failed:', err instanceof Error ? err.message : err); }
    const r = await applyResult({ ...doc, status: 'reading' }, raw);
    return { provider, status: r.status };
  }

  const session = await deps.createSession(buildPrompt(docType, url), `Aid read ${docType}`);
  await update(documentId, { status: 'reading', extract_provider: 'devin', extract_session: session.id });
  return { provider, sessionId: session.id, url: session.url, status: 'reading' };
}

export async function pollExtraction(documentId: string): Promise<{ status: string; extracted?: unknown }> {
  const doc = await getDoc(documentId);
  if (doc.status !== 'reading') return { status: doc.status as string, extracted: doc.extracted };
  const sid = doc.extract_session as string | null;
  if (!sid) return { status: 'reading' };
  const s = await deps.getSession(sid);
  if (!s.done) return { status: 'reading' };
  const out = s.structuredOutput && typeof s.structuredOutput === 'object' ? (s.structuredOutput as Row) : null;
  let raw: unknown = out && 'answer' in out ? out.answer : out;
  if (raw === null && s.status === 'finished') {
    raw = await deps.getMessageAnswer(sid).catch(() => null);
  }
  return applyResult(doc, raw);
}

/** For the main loop: poll every document currently being read. Errors are isolated per document. */
export async function pollPendingExtractions(): Promise<number> {
  const { data, error } = await vaultDb().from('documents').select('id').eq('status', 'reading');
  if (error) throw new Error(`[docExtract] pending: ${error.message}`);
  let finished = 0;
  for (const r of (data ?? []) as Row[]) {
    try {
      if ((await pollExtraction(r.id as string)).status !== 'reading') finished++;
    } catch (err) {
      console.error('[docExtract] poll failed:', err instanceof Error ? err.message : err);
    }
  }
  return finished;
}
