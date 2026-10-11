// Persistence for cross-channel intakes and the shared conversation thread.
// Supabase in production; the in-memory repo backs tests and local runs without Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Channel, Intake, IntakeFields, IntakeStatus } from './intake.js';
import { admin } from './supabase.js';

export type ThreadChannel = Channel | 'system';
export interface ThreadMessage { channel: ThreadChannel; role: 'user' | 'assistant'; content: string; at: string }

export interface IntakeRepo {
  get(id: string): Promise<Intake | undefined>;
  save(i: Intake): Promise<void>;
  /** Newest intake for this phone that is waiting on a YES, from any channel. */
  latestAwaiting(phone: string): Promise<Intake | undefined>;
  /** How many confirmation texts went to this phone since `sinceIso` (abuse guard for web sessions). */
  confirmationsSentSince(phone: string, sinceIso: string): Promise<number>;
  appendMessage(thread: string, channel: ThreadChannel, role: 'user' | 'assistant', content: string): Promise<void>;
  /** Last `limit` messages, oldest first. */
  getThread(thread: string, limit?: number): Promise<ThreadMessage[]>;
  /** Re-file a web session's messages under the household thread once the phone owner confirms. */
  moveThread(from: string, to: string): Promise<void>;
}

type Row = Record<string, unknown>;

const toRow = (i: Intake): Row => ({
  id: i.id, channel: i.channel, phone: i.phone, household_id: i.householdId, fields: i.fields, status: i.status,
  confirmation_requested_at: i.confirmationRequestedAt, confirmed_at: i.confirmedAt,
});
const fromRow = (r: Row): Intake => ({
  id: r.id as string,
  channel: r.channel as Channel,
  phone: (r.phone as string | null) ?? null,
  householdId: (r.household_id as string | null) ?? null,
  fields: (r.fields as IntakeFields | null) ?? {},
  status: r.status as IntakeStatus,
  confirmationRequestedAt: (r.confirmation_requested_at as string | null) ?? null,
  confirmedAt: (r.confirmed_at as string | null) ?? null,
  updatedAt: new Date((r.updated_at as string | null) ?? Date.now()).toISOString(),
});

function fail(fn: string, error: { message: string }): never {
  throw new Error(`[intakeStore] ${fn}: ${error.message}`);
}

export function supabaseIntakeRepo(client: () => SupabaseClient = admin): IntakeRepo {
  return {
    async get(id) {
      const { data, error } = await client().from('intakes').select('*').eq('id', id).maybeSingle();
      if (error) fail('get', error);
      return data ? fromRow(data as Row) : undefined;
    },
    async save(i) {
      const { error } = await client().from('intakes').upsert(toRow(i), { onConflict: 'id' });
      if (error) fail('save', error);
    },
    async latestAwaiting(phone) {
      const { data, error } = await client().from('intakes').select('*')
        .eq('phone', phone).eq('status', 'awaiting_confirmation')
        .order('confirmation_requested_at', { ascending: false }).limit(1);
      if (error) fail('latestAwaiting', error);
      const row = (data ?? [])[0] as Row | undefined;
      return row ? fromRow(row) : undefined;
    },
    async confirmationsSentSince(phone, sinceIso) {
      const { count, error } = await client().from('intakes').select('id', { count: 'exact', head: true })
        .eq('phone', phone).gte('confirmation_requested_at', sinceIso);
      if (error) fail('confirmationsSentSince', error);
      return count ?? 0;
    },
    async appendMessage(thread, channel, role, content) {
      const { error } = await client().from('conversation_messages').insert({ thread, channel, role, content });
      if (error) fail('appendMessage', error);
    },
    async getThread(thread, limit = 40) {
      const { data, error } = await client().from('conversation_messages')
        .select('channel, role, content, created_at').eq('thread', thread)
        .order('id', { ascending: false }).limit(limit);
      if (error) fail('getThread', error);
      return ((data ?? []) as Row[]).reverse().map(r => ({
        channel: r.channel as ThreadChannel, role: r.role as 'user' | 'assistant',
        content: r.content as string, at: new Date(r.created_at as string).toISOString(),
      }));
    },
    async moveThread(from, to) {
      const { error } = await client().from('conversation_messages').update({ thread: to }).eq('thread', from);
      if (error) fail('moveThread', error);
    },
  };
}

export function memoryIntakeRepo(): IntakeRepo & { intakes: Map<string, Intake>; messages: (ThreadMessage & { thread: string })[] } {
  const intakes = new Map<string, Intake>();
  const messages: (ThreadMessage & { thread: string })[] = [];
  return {
    intakes, messages,
    async get(id) { const i = intakes.get(id); return i && structuredClone(i); },
    async save(i) { intakes.set(i.id, structuredClone({ ...i, updatedAt: new Date().toISOString() })); },
    async latestAwaiting(phone) {
      const hits = [...intakes.values()].filter(i => i.phone === phone && i.status === 'awaiting_confirmation')
        .sort((a, b) => (b.confirmationRequestedAt ?? '').localeCompare(a.confirmationRequestedAt ?? ''));
      return hits[0] && structuredClone(hits[0]);
    },
    async confirmationsSentSince(phone, sinceIso) {
      return [...intakes.values()].filter(i => i.phone === phone && (i.confirmationRequestedAt ?? '') >= sinceIso).length;
    },
    async appendMessage(thread, channel, role, content) {
      messages.push({ thread, channel, role, content, at: new Date().toISOString() });
    },
    async getThread(thread, limit = 40) {
      return messages.filter(m => m.thread === thread).slice(-limit).map(({ thread: _t, ...m }) => ({ ...m }));
    },
    async moveThread(from, to) { for (const m of messages) if (m.thread === from) m.thread = to; },
  };
}
