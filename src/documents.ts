import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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

const PRIVATE_NAME = /(^|\.)(localhost|local|internal)$/i;
const MAX_REDIRECTS = 3;

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

/** True for loopback, private, link-local, CGNAT, multicast and unspecified addresses (v4 and v6). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v !== 6) return true;
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return ipv4Private(mapped[1]!);
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(lower)) return true;
  return lower === '::' || lower === '::1'
    || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower);
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);
let resolveHost: Resolver = defaultResolver;
/** Test seam: override DNS resolution. Call with no args to restore. */
export function setHostResolver(r?: Resolver): void { resolveHost = r ?? defaultResolver; }

async function assertPublicUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('[documents] invalid url');
  }
  if (parsed.protocol !== 'https:') throw new Error('[documents] only https urls are allowed');
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_NAME.test(host)) throw new Error('[documents] url host not allowed');
  let addrs: string[];
  if (isIP(host)) addrs = [host];
  else {
    try {
      addrs = await resolveHost(host);
    } catch {
      throw new Error('[documents] url host not allowed');
    }
  }
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) throw new Error('[documents] url host not allowed');
  return parsed;
}

async function readCapped(res: Response): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('[documents] file too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

export async function storeDocumentFromUrl(
  hid: string, url: string, contentType: string, docType: DocType,
): Promise<DocumentRecord> {
  let target = await assertPublicUrl(url);

  const ext = extFor(contentType);
  if (!ext) throw new Error(`[documents] unsupported content type`);
  const ct = normalizeType(contentType);

  const { data: hh, error: hhErr } = await db().from('households').select('org_id').eq('id', hid).maybeSingle();
  if (hhErr) throw new Error(`[documents] household lookup: ${hhErr.message}`);
  if (!hh) throw new Error('[documents] household not found');
  const orgId = (hh as { org_id: string }).org_id;

  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let res: Response;
  for (let hops = 0; ; hops++) {
    try {
      res = await fetch(target, { signal, redirect: 'manual' });
    } catch (e) {
      throw new Error(`[documents] download failed: ${e instanceof Error ? e.name : 'error'}`);
    }
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) break;
    await res.body?.cancel().catch(() => {});
    if (hops >= MAX_REDIRECTS) throw new Error('[documents] too many redirects');
    target = await assertPublicUrl(new URL(location, target).toString());
  }
  if (!res.ok) throw new Error(`[documents] download failed: status ${res.status}`);

  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw new Error('[documents] file too large');
  const bytes = await readCapped(res);
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
