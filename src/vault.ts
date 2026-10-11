// Per-household document vault: compression, status/expiry view, missing-doc checks, requests.
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { DocType, Program } from './contracts.js';
import { logEvent } from './keewano.js';
import { admin } from './supabase.js';

export const DEFAULT_MAX_BYTES = 7.5 * 1024 * 1024;
export const EXPIRES_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

let override: SupabaseClient | undefined;
/** Test seam: replace the service-role client (shared with docExtract). */
export function setVaultClient(client?: SupabaseClient): void {
  override = client;
}
export const vaultDb = (): SupabaseClient => override ?? admin();

type Row = Record<string, unknown>;

// ── Compression ─────────────────────────────────────────────────────────────
export interface Compressed { buffer: Buffer; contentType: string; resized: boolean }

export async function compressForUpload(
  buffer: Buffer, contentType: string, maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Compressed> {
  const ct = contentType.split(';')[0]!.trim().toLowerCase();
  if (ct === 'application/pdf') {
    if (buffer.byteLength > maxBytes) throw new Error('[vault] pdf too large to upload');
    return { buffer, contentType: ct, resized: false };
  }
  if (!ct.startsWith('image/')) throw new Error('[vault] unsupported content type');
  if (buffer.byteLength <= maxBytes && ct === 'image/jpeg') return { buffer, contentType: ct, resized: false };

  const meta = await sharp(buffer).metadata();
  let width = Math.min(meta.width ?? 3000, 3000);
  for (let quality = 85; quality >= 40; quality -= 15) {
    for (let scale = 1; scale >= 0.3; scale -= 0.2) {
      const out = await sharp(buffer).rotate()
        .resize({ width: Math.max(200, Math.round(width * scale)), withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true }).toBuffer();
      if (out.byteLength <= maxBytes) return { buffer: out, contentType: 'image/jpeg', resized: true };
    }
    width = Math.round(width * 0.8);
  }
  throw new Error('[vault] could not compress image under the size limit');
}

// ── Vault view ──────────────────────────────────────────────────────────────
export interface VaultDoc {
  id: string; docType: DocType; status: string; extracted: Record<string, unknown> | null;
  docDate: string | null; expiresAt: string | null; expiresSoon: boolean; expired: boolean;
  reusedFor: string[]; createdAt: string;
}

const parseDay = (d: string): number => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** Expiry flags relative to `now`; expiresSoon = within 7 days (and not yet expired). */
export function expiryFlags(expiresAt: string | null, now: Date = new Date()): { expired: boolean; expiresSoon: boolean } {
  if (!expiresAt) return { expired: false, expiresSoon: false };
  const today = parseDay(now.toISOString());
  const diffDays = Math.round((parseDay(expiresAt) - today) / DAY_MS);
  return { expired: diffDays < 0, expiresSoon: diffDays >= 0 && diffDays <= EXPIRES_SOON_DAYS };
}

const rowToVaultDoc = (r: Row, now: Date): VaultDoc => ({
  id: r.id as string,
  docType: r.doc_type as DocType,
  status: (r.status as string) ?? 'received',
  extracted: (r.extracted as Record<string, unknown> | null) ?? null,
  docDate: (r.doc_date as string | null) ?? null,
  expiresAt: (r.expires_at as string | null) ?? null,
  ...expiryFlags((r.expires_at as string | null) ?? null, now),
  reusedFor: (r.reused_for as string[] | null) ?? [],
  createdAt: new Date(r.created_at as string).toISOString(),
});

export async function getVault(householdId: string, now: Date = new Date()): Promise<VaultDoc[]> {
  const { data, error } = await vaultDb().from('documents').select('*')
    .eq('household_id', householdId).order('created_at', { ascending: false });
  if (error) throw new Error(`[vault] getVault: ${error.message}`);
  return ((data ?? []) as Row[]).map(r => rowToVaultDoc(r, now));
}

// ── Requirements ────────────────────────────────────────────────────────────
export const REQUIRED_DOCS: Readonly<Partial<Record<Program, DocType[]>>> = {
  calfresh: ['id', 'paystub', 'lease'],
  medi_cal: ['id', 'paystub'],
  calworks: ['id', 'paystub', 'birth_cert'],
};
const COUNTS_AS_HELD = new Set(['received', 'reading', 'read', 'uploaded_to_application']);

export function missingFrom(docs: VaultDoc[], programs: Program[]): DocType[] {
  const held = new Set(docs.filter(d => COUNTS_AS_HELD.has(d.status) && !d.expired).map(d => d.docType));
  const need = new Set<DocType>();
  for (const p of programs) for (const t of REQUIRED_DOCS[p] ?? ['id']) need.add(t);
  return [...need].filter(t => !held.has(t));
}

export async function missingForPrograms(householdId: string, programs: Program[], now?: Date): Promise<DocType[]> {
  return missingFrom(await getVault(householdId, now), programs);
}

export async function requestDocument(householdId: string, docType: DocType, reason: string): Promise<void> {
  const { error } = await vaultDb().from('document_requests')
    .insert({ household_id: householdId, doc_type: docType, reason });
  if (error) throw new Error(`[vault] requestDocument: ${error.message}`);
  await logEvent(householdId, { type: 'DocsRequested', value: 1 });
}

export async function markUploadedToApplication(documentId: string, program: Program): Promise<void> {
  const { data, error } = await vaultDb().from('documents').select('reused_for').eq('id', documentId).maybeSingle();
  if (error) throw new Error(`[vault] markUploaded: ${error.message}`);
  if (!data) throw new Error('[vault] document not found');
  const prev = ((data as Row).reused_for as string[] | null) ?? [];
  const reused = prev.includes(program) ? prev : [...prev, program];
  const upd = await vaultDb().from('documents')
    .update({ status: 'uploaded_to_application', reused_for: reused }).eq('id', documentId);
  if (upd.error) throw new Error(`[vault] markUploaded: ${upd.error.message}`);
}

// ── SMS summary ─────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const MISSING_LABEL: Partial<Record<DocType, string>> = {
  id: 'ID', paystub: 'pay stub', lease: 'rent receipt', birth_cert: 'birth certificate',
  ssn_card: 'Social Security card', immigration: 'immigration papers',
};

function describe(d: VaultDoc): string {
  if (d.docType === 'id') return 'ID';
  if (d.docType === 'lease') return 'lease';
  if (d.docType === 'paystub') {
    const month = d.docDate ? MONTHS[Number(d.docDate.slice(5, 7)) - 1] : undefined;
    const gross = Number((d.extracted as Row | null)?.grossPay);
    return `${month ? `${month} ` : ''}pay stub${Number.isFinite(gross) && gross > 0 ? ` (${money(gross)})` : ''}`;
  }
  return MISSING_LABEL[d.docType] ?? d.docType.replace('_', ' ');
}

const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

export async function vaultSummaryText(householdId: string, programs?: Program[], now?: Date): Promise<string> {
  const docs = await getVault(householdId, now);
  const have = docs.filter(d => COUNTS_AS_HELD.has(d.status) && !d.expired);
  const seen = new Set<DocType>();
  const labels = have.filter(d => !seen.has(d.docType) && seen.add(d.docType)).map(describe);

  let missing: DocType[];
  if (programs) missing = missingFrom(docs, programs);
  else {
    const { data } = await vaultDb().from('document_requests').select('doc_type')
      .eq('household_id', householdId).is('fulfilled_document_id', null);
    const held = new Set(have.map(d => d.docType));
    missing = [...new Set(((data ?? []) as Row[]).map(r => r.doc_type as DocType))].filter(t => !held.has(t));
  }
  const parts: string[] = [labels.length ? `We have your ${list(labels)}.` : 'We do not have any documents from you yet.'];
  if (missing.length) parts.push(`Still need: ${list(missing.map(t => MISSING_LABEL[t] ?? t))}.`);
  return parts.join(' ');
}
