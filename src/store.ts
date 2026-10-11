import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActionKind, CallOutcomeKind, CallPurpose, CallRecord, County, DocumentRecord, DocType, Household,
  ImmigrationStatus, Message, Submission, TimelineEntry,
} from './contracts.js';
import { admin } from './supabase.js';

let override: SupabaseClient | undefined;
/** Test seam: replace the service-role client. Call with no args to restore. */
export function setStoreClient(client?: SupabaseClient): void {
  override = client;
}
const db = (): SupabaseClient => override ?? admin();

function fail(fn: string, error: { message: string }): never {
  throw new Error(`[store] ${fn}: ${error.message}`);
}

const iso = (v: string | null | undefined): string => new Date(v ?? Date.now()).toISOString();
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));

type Row = Record<string, unknown>;

export function householdToRow(h: Household): Row {
  return {
    id: h.id,
    org_id: h.orgId,
    phone: h.phone,
    first_name: h.firstName ?? null,
    county: h.county,
    size: h.size,
    monthly_income: h.monthlyIncome,
    children_under18: h.childrenUnder18,
    pregnant: h.pregnant,
    adult_age: h.adultAge,
    immigration_status: h.immigrationStatus,
    children_are_citizens: h.childrenAreCitizens,
  };
}

export function rowToHousehold(r: Row): Household {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    phone: r.phone as string,
    ...(r.first_name ? { firstName: r.first_name as string } : {}),
    county: r.county as County,
    size: num(r.size),
    monthlyIncome: num(r.monthly_income),
    childrenUnder18: num(r.children_under18),
    pregnant: Boolean(r.pregnant),
    adultAge: r.adult_age == null ? 0 : num(r.adult_age),
    immigrationStatus: r.immigration_status as ImmigrationStatus,
    childrenAreCitizens: Boolean(r.children_are_citizens),
  };
}

const rowToCall = (r: Row): CallRecord => ({
  dialId: r.dial_id as string,
  householdId: r.household_id as string,
  purpose: r.purpose as CallPurpose,
  outcome: (r.outcome as CallOutcomeKind | null) ?? null,
  transcript: (r.transcript as string | null) ?? null,
  at: iso(r.created_at as string),
});

const rowToDocument = (r: Row): DocumentRecord => ({
  id: r.id as string,
  householdId: r.household_id as string,
  docType: r.doc_type as DocType,
  storagePath: r.storage_path as string,
  contentType: (r.content_type as string | null) ?? '',
  at: iso(r.created_at as string),
});

export async function upsertHousehold(h: Household): Promise<void> {
  const { error } = await db().from('households').upsert(householdToRow(h), { onConflict: 'id' });
  if (error) fail('upsertHousehold', error);
}

export async function getHousehold(id: string): Promise<Household | undefined> {
  const { data, error } = await db().from('households').select('*').eq('id', id).maybeSingle();
  if (error) fail('getHousehold', error);
  return data ? rowToHousehold(data as Row) : undefined;
}

export async function getHouseholdByPhone(phone: string): Promise<Household | undefined> {
  const { data, error } = await db().from('households').select('*').eq('phone', phone).maybeSingle();
  if (error) fail('getHouseholdByPhone', error);
  return data ? rowToHousehold(data as Row) : undefined;
}

export async function listHouseholds(orgId?: string): Promise<Household[]> {
  let q = db().from('households').select('*');
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(200);
  if (error) fail('listHouseholds', error);
  return ((data ?? []) as Row[]).map(rowToHousehold);
}

export async function appendMessage(hid: string, role: 'user' | 'assistant', content: string): Promise<void> {
  const { error } = await db().from('messages').insert({ household_id: hid, role, content });
  if (error) fail('appendMessage', error);
}

/** Last `limit` messages, oldest first. */
export async function getMessages(hid: string, limit = 40): Promise<Message[]> {
  const { data, error } = await db()
    .from('messages').select('role, content, created_at')
    .eq('household_id', hid).order('id', { ascending: false }).limit(limit);
  if (error) fail('getMessages', error);
  return ((data ?? []) as Row[]).reverse().map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content as string,
    at: iso(r.created_at as string),
  }));
}

/** True only the first time an event id is seen. */
export async function markProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await db()
    .from('processed_events')
    .upsert({ event_id: eventId }, { onConflict: 'event_id', ignoreDuplicates: true })
    .select();
  if (error) fail('markProcessed', error);
  return (data ?? []).length === 1;
}

/** True only the first time (household, kind, day) is claimed. day = 'YYYY-MM-DD'. */
export async function claimAction(hid: string, kind: ActionKind | string, day: string): Promise<boolean> {
  const { data, error } = await db()
    .from('action_claims')
    .upsert({ household_id: hid, kind, day }, { onConflict: 'household_id,kind,day', ignoreDuplicates: true })
    .select();
  if (error) fail('claimAction', error);
  return (data ?? []).length === 1;
}

export interface SaveCallInput {
  dialId: string;
  householdId: string;
  purpose: CallPurpose | string;
  outcome?: CallOutcomeKind | string | null;
  transcript?: string | null;
}

export async function saveCall(c: SaveCallInput): Promise<void> {
  const row: Row = { dial_id: c.dialId, household_id: c.householdId, purpose: c.purpose };
  // Only overwrite outcome/transcript when provided, so later partial saves don't wipe them.
  if (c.outcome !== undefined) row.outcome = c.outcome;
  if (c.transcript !== undefined) row.transcript = c.transcript;
  const { error } = await db().from('calls').upsert(row, { onConflict: 'dial_id' });
  if (error) fail('saveCall', error);
}

export async function getCallByDialId(id: string): Promise<CallRecord | undefined> {
  const { data, error } = await db().from('calls').select('*').eq('dial_id', id).maybeSingle();
  if (error) fail('getCallByDialId', error);
  return data ? rowToCall(data as Row) : undefined;
}

export async function listCalls(hid: string): Promise<CallRecord[]> {
  const { data, error } = await db().from('calls').select('*')
    .eq('household_id', hid).order('created_at', { ascending: false });
  if (error) fail('listCalls', error);
  return ((data ?? []) as Row[]).map(rowToCall);
}

export async function saveSubmission(
  hid: string, kind: 'minimal' | 'full', confirmation: string, payload: unknown,
): Promise<void> {
  const { error } = await db().from('submissions')
    .insert({ household_id: hid, kind, confirmation, payload });
  if (error) fail('saveSubmission', error);
}

export async function listSubmissions(householdId?: string): Promise<Submission[]> {
  let q = db().from('submissions').select('household_id, kind, confirmation, created_at');
  if (householdId) q = q.eq('household_id', householdId);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
  if (error) fail('listSubmissions', error);
  return ((data ?? []) as Row[]).map((r) => ({
    householdId: r.household_id as string,
    kind: r.kind as 'minimal' | 'full',
    confirmation: r.confirmation as string,
    at: iso(r.created_at as string),
  }));
}

export async function addTimeline(hid: string, label: string, atUnix?: number): Promise<void> {
  const row: Row = { household_id: hid, label };
  if (atUnix !== undefined) row.at = new Date(atUnix * 1000).toISOString();
  const { error } = await db().from('timeline').insert(row);
  if (error) fail('addTimeline', error);
}

export async function getTimeline(hid: string): Promise<TimelineEntry[]> {
  const { data, error } = await db().from('timeline').select('label, at')
    .eq('household_id', hid).order('at', { ascending: true });
  if (error) fail('getTimeline', error);
  return ((data ?? []) as Row[]).map((r) => ({ label: r.label as string, at: iso(r.at as string) }));
}

export async function listDocuments(hid: string): Promise<DocumentRecord[]> {
  const { data, error } = await db().from('documents').select('*')
    .eq('household_id', hid).order('created_at', { ascending: false });
  if (error) fail('listDocuments', error);
  return ((data ?? []) as Row[]).map(rowToDocument);
}
