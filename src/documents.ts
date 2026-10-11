import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocType, DocumentRecord } from './contracts.js';
import { admin } from './supabase.js';

export const ALLOWED_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};
export const MAX_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const BUCKET = 'documents';

let override: SupabaseClient | undefined;
/** Test seam: replace the service-role client. Call with no args to restore. */
export function setDocumentsClient(client?: SupabaseClient): void {
  override = client;
}
const db = (): SupabaseClient => override ?? admin();

const normalizeType = (ct: string): string => ct.split(';')[0]!.trim().toLowerCase();

/** File extension for a supported content type, or undefined. */
export function extFor(ct: string): string | undefined {
  return ALLOWED_TYPES[normalizeType(ct)];
}

export function objectPath(orgId: string, hid: string, docId: string, ct: string): string {
  const ext = extFor(ct);
  if (!ext) throw new Error(`[documents] unsupported content type`);
  return `${orgId}/${hid}/${docId}.${ext}`;
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$)/i;

export async function storeDocumentFromUrl(
  hid: string, url: string, contentType: string, docType: DocType,
): Promise<DocumentRecord> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('[documents] invalid url');
  }
  if (parsed.protocol !== 'https:') throw new Error('[documents] only https urls are allowed');
  if (PRIVATE_HOST.test(parsed.hostname)) throw new Error('[documents] url host not allowed');

  const ext = extFor(contentType);
  if (!ext) throw new Error(`[documents] unsupported content type`);
  const ct = normalizeType(contentType);

  const { data: hh, error: hhErr } = await db().from('households').select('org_id').eq('id', hid).maybeSingle();
  if (hhErr) throw new Error(`[documents] household lookup: ${hhErr.message}`);
  if (!hh) throw new Error('[documents] household not found');
  const orgId = (hh as { org_id: string }).org_id;

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`[documents] download failed: ${e instanceof Error ? e.name : 'error'}`);
  }
  if (!res.ok) throw new Error(`[documents] download failed: status ${res.status}`);

  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error('[documents] file too large');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error('[documents] file too large');
  if (bytes.byteLength === 0) throw new Error('[documents] empty file');

  const id = randomUUID();
  const path = objectPath(orgId, hid, id, ct);
  const bucket = db().storage.from(BUCKET);
  const up = await bucket.upload(path, bytes, { contentType: ct, upsert: false });
  if (up.error) throw new Error(`[documents] upload: ${up.error.message}`);

  const { data, error } = await db().from('documents')
    .insert({ id, household_id: hid, doc_type: docType, storage_path: path, content_type: ct })
    .select().single();
  if (error) {
    await bucket.remove([path]).catch(() => undefined);
    throw new Error(`[documents] insert: ${error.message}`);
  }
  const row = data as { created_at?: string };
  return {
    id, householdId: hid, docType, storagePath: path, contentType: ct,
    at: new Date(row?.created_at ?? Date.now()).toISOString(),
  };
}

export async function signedUrl(path: string, expiresInSec = 600): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  if (error || !data) throw new Error(`[documents] signedUrl: ${error?.message ?? 'no url'}`);
  return data.signedUrl;
}
