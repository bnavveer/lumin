// Conversation persistence: per-household state, consents, pending approvals.
// One repo interface, two implementations: Supabase (live) and in-memory (tests / offline sim).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Household, Message, TimelineEntry } from '../contracts.js';

export type Stage = 'new' | 'awaiting_consent' | 'screening' | 'active' | 'opted_out';
export type Lang = 'en' | 'es' | 'zh' | 'vi' | 'tl';
export const LANGS: readonly Lang[] = ['en', 'es', 'zh', 'vi', 'tl'];

export interface QuietHours { start: string; end: string; tz: string }
export interface PendingContext {
  extractions?: string[];          // document ids being read
  stageBeforeOptOut?: Stage;
  screened?: boolean;              // household profile is complete (screened by text or by the clinic)
}

export interface ConversationState {
  householdId: string;
  stage: Stage;
  language: Lang;
  languageLocked: boolean;         // true once the person picked a language explicitly (LANG XX)
  channel?: string;
  pendingContext: PendingContext;
  lastNudgeKind?: string | null;
  quietHours: QuietHours;
}

export type ApprovalKind = 'submit_application' | 'run_filler' | 'call_office' | 'share_documents' | 'start_renewal';
export const APPROVAL_KINDS: readonly ApprovalKind[] = ['submit_application', 'run_filler', 'call_office', 'share_documents', 'start_renewal'];
export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'expired';

export interface Approval {
  id: string;
  householdId: string;
  kind: ApprovalKind;
  description: string;
  payload: Record<string, unknown>;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export type ConsentKind = 'sms_contact' | 'opt_out' | 'opt_in';
export interface Org { id: string; name: string; county?: string | null }

export const DEFAULT_QUIET: QuietHours = { start: '20:00', end: '08:00', tz: 'America/Los_Angeles' };

export function defaultState(householdId: string): ConversationState {
  return { householdId, stage: 'new', language: 'en', languageLocked: false, pendingContext: {}, lastNudgeKind: null, quietHours: DEFAULT_QUIET };
}

/** Everything the engine needs from storage. */
export interface ConversationRepo {
  getState(hid: string): Promise<ConversationState | undefined>;
  saveState(s: ConversationState): Promise<void>;
  addConsent(hid: string, kind: ConsentKind, wording: string, reply: string, channel: string): Promise<void>;
  createApproval(hid: string, kind: ApprovalKind, description: string, payload: Record<string, unknown>): Promise<Approval>;
  latestPendingApproval(hid: string): Promise<Approval | undefined>;
  getApproval(id: string): Promise<Approval | undefined>;
  resolveApproval(id: string, status: Exclude<ApprovalStatus, 'pending'>, by: string): Promise<Approval | undefined>;
  listApprovals(hid: string): Promise<Approval[]>;
  orgByCode(code: string): Promise<Org | undefined>;
  orgById(id: string): Promise<Org | undefined>;
  // store.ts passthroughs (so tests can run fully in memory)
  getHousehold(id: string): Promise<Household | undefined>;
  getHouseholdByPhone(phone: string): Promise<Household | undefined>;
  upsertHousehold(h: Household): Promise<void>;
  appendMessage(hid: string, role: 'user' | 'assistant', content: string): Promise<void>;
  getMessages(hid: string, limit?: number): Promise<Message[]>;
  addTimeline(hid: string, label: string, atUnix?: number): Promise<void>;
  getTimeline(hid: string): Promise<TimelineEntry[]>;
  markProcessed(id: string): Promise<boolean>;
}

type Row = Record<string, unknown>;

const rowToState = (r: Row): ConversationState => ({
  householdId: r.household_id as string,
  stage: r.stage as Stage,
  language: (r.language as Lang) ?? 'en',
  languageLocked: Boolean(r.language_locked),
  ...(r.channel ? { channel: r.channel as string } : {}),
  pendingContext: (r.pending_context as PendingContext | null) ?? {},
  lastNudgeKind: (r.last_nudge_kind as string | null) ?? null,
  quietHours: (r.quiet_hours as QuietHours | null) ?? DEFAULT_QUIET,
});

const rowToApproval = (r: Row): Approval => ({
  id: r.id as string,
  householdId: r.household_id as string,
  kind: r.kind as ApprovalKind,
  description: r.description as string,
  payload: (r.payload as Record<string, unknown> | null) ?? {},
  status: r.status as ApprovalStatus,
  createdAt: new Date((r.created_at as string) ?? Date.now()).toISOString(),
  resolvedAt: (r.resolved_at as string | null) ?? null,
  resolvedBy: (r.resolved_by as string | null) ?? null,
});

function fail(fn: string, error: { message: string }): never {
  throw new Error(`[conversation] ${fn}: ${error.message}`);
}

export async function supabaseRepo(client?: SupabaseClient): Promise<ConversationRepo> {
  const store = await import('../store.js');
  const db = async (): Promise<SupabaseClient> => client ?? (await import('../supabase.js')).admin();
  return {
    async getState(hid) {
      const { data, error } = await (await db()).from('conversation_state').select('*').eq('household_id', hid).maybeSingle();
      if (error) fail('getState', error);
      return data ? rowToState(data as Row) : undefined;
    },
    async saveState(s) {
      const { error } = await (await db()).from('conversation_state').upsert({
        household_id: s.householdId, stage: s.stage, language: s.language, language_locked: s.languageLocked,
        channel: s.channel ?? null, pending_context: s.pendingContext, last_nudge_kind: s.lastNudgeKind ?? null,
        quiet_hours: s.quietHours,
      }, { onConflict: 'household_id' });
      if (error) fail('saveState', error);
    },
    async addConsent(hid, kind, wording, reply, channel) {
      const { error } = await (await db()).from('consents').insert({ household_id: hid, kind, wording, reply, channel });
      if (error) fail('addConsent', error);
    },
    async createApproval(hid, kind, description, payload) {
      const { data, error } = await (await db()).from('pending_approvals')
        .insert({ household_id: hid, kind, description, payload }).select('*').single();
      if (error) fail('createApproval', error);
      return rowToApproval(data as Row);
    },
    async latestPendingApproval(hid) {
      const { data, error } = await (await db()).from('pending_approvals').select('*')
        .eq('household_id', hid).eq('status', 'pending').order('created_at', { ascending: false }).limit(1);
      if (error) fail('latestPendingApproval', error);
      const r = (data ?? [])[0] as Row | undefined;
      return r ? rowToApproval(r) : undefined;
    },
    async getApproval(id) {
      const { data, error } = await (await db()).from('pending_approvals').select('*').eq('id', id).maybeSingle();
      if (error) fail('getApproval', error);
      return data ? rowToApproval(data as Row) : undefined;
    },
    async resolveApproval(id, status, by) {
      const { data, error } = await (await db()).from('pending_approvals')
        .update({ status, resolved_by: by, resolved_at: new Date().toISOString() })
        .eq('id', id).eq('status', 'pending').select('*');
      if (error) fail('resolveApproval', error);
      const r = (data ?? [])[0] as Row | undefined;
      return r ? rowToApproval(r) : undefined;
    },
    async listApprovals(hid) {
      const { data, error } = await (await db()).from('pending_approvals').select('*')
        .eq('household_id', hid).order('created_at', { ascending: false }).limit(50);
      if (error) fail('listApprovals', error);
      return ((data ?? []) as Row[]).map(rowToApproval);
    },
    async orgByCode(code) {
      const { data, error } = await (await db()).from('orgs').select('id, name, county, join_code');
      if (error) fail('orgByCode', error);
      const hit = ((data ?? []) as Row[]).find((r) => String(r.join_code ?? '').toUpperCase() === code.toUpperCase());
      return hit ? { id: hit.id as string, name: hit.name as string, county: (hit.county as string | null) ?? null } : undefined;
    },
    async orgById(id) {
      const { data, error } = await (await db()).from('orgs').select('id, name, county').eq('id', id).maybeSingle();
      if (error) fail('orgById', error);
      return data ? (data as Org) : undefined;
    },
    getHousehold: store.getHousehold,
    getHouseholdByPhone: store.getHouseholdByPhone,
    upsertHousehold: store.upsertHousehold,
    appendMessage: store.appendMessage,
    getMessages: store.getMessages,
    addTimeline: store.addTimeline,
    getTimeline: store.getTimeline,
    markProcessed: store.markProcessed,
  };
}

/** In-memory repo for tests and the offline CLI sim. */
export function memoryRepo(orgs: Array<Org & { code: string }> = []): ConversationRepo & {
  households: Map<string, Household>; states: Map<string, ConversationState>; approvals: Approval[];
  consents: Array<{ hid: string; kind: ConsentKind; wording: string; reply: string; at: string }>;
  messages: Map<string, Message[]>; timeline: Map<string, TimelineEntry[]>;
} {
  const households = new Map<string, Household>();
  const states = new Map<string, ConversationState>();
  const approvals: Approval[] = [];
  const consents: Array<{ hid: string; kind: ConsentKind; wording: string; reply: string; at: string }> = [];
  const messages = new Map<string, Message[]>();
  const timeline = new Map<string, TimelineEntry[]>();
  const processed = new Set<string>();
  let seq = 0;
  return {
    households, states, approvals, consents, messages, timeline,
    async getState(hid) { const s = states.get(hid); return s ? structuredClone(s) : undefined; },
    async saveState(s) { states.set(s.householdId, structuredClone(s)); },
    async addConsent(hid, kind, wording, reply) { consents.push({ hid, kind, wording, reply, at: new Date().toISOString() }); },
    async createApproval(hid, kind, description, payload) {
      const a: Approval = { id: `appr-${++seq}`, householdId: hid, kind, description, payload, status: 'pending', createdAt: new Date(Date.now() + seq).toISOString() };
      approvals.push(a);
      return { ...a };
    },
    async latestPendingApproval(hid) {
      const p = approvals.filter((a) => a.householdId === hid && a.status === 'pending');
      const last = p[p.length - 1];
      return last ? { ...last } : undefined;
    },
    async getApproval(id) { const a = approvals.find((x) => x.id === id); return a ? { ...a } : undefined; },
    async resolveApproval(id, status, by) {
      const i = approvals.findIndex((x) => x.id === id && x.status === 'pending');
      if (i < 0) return undefined;
      const next: Approval = { ...approvals[i]!, status, resolvedBy: by, resolvedAt: new Date().toISOString() };
      approvals[i] = next;
      return { ...next };
    },
    async listApprovals(hid) { return approvals.filter((a) => a.householdId === hid).map((a) => ({ ...a })).reverse(); },
    async orgByCode(code) { const o = orgs.find((x) => x.code.toUpperCase() === code.toUpperCase()); return o ? { id: o.id, name: o.name, county: o.county ?? null } : undefined; },
    async orgById(id) { const o = orgs.find((x) => x.id === id); return o ? { id: o.id, name: o.name, county: o.county ?? null } : undefined; },
    async getHousehold(id) { const h = households.get(id); return h ? { ...h } : undefined; },
    async getHouseholdByPhone(phone) { const h = [...households.values()].find((x) => x.phone === phone); return h ? { ...h } : undefined; },
    async upsertHousehold(h) { households.set(h.id, { ...h }); },
    async appendMessage(hid, role, content) {
      messages.set(hid, [...(messages.get(hid) ?? []), { role, content, at: new Date().toISOString() }]);
    },
    async getMessages(hid, limit = 40) { return (messages.get(hid) ?? []).slice(-limit); },
    async addTimeline(hid, label, atUnix) {
      const at = new Date(atUnix !== undefined ? atUnix * 1000 : Date.now()).toISOString();
      timeline.set(hid, [...(timeline.get(hid) ?? []), { label, at }]);
    },
    async getTimeline(hid) { return [...(timeline.get(hid) ?? [])]; },
    async markProcessed(id) { if (processed.has(id)) return false; processed.add(id); return true; },
  };
}
