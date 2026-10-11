// Supabase storage for applicant_profiles.application_details, shared by the account routes (repo.ts),
// the workflow engine's filler (store.ts) and the chat agent (channels.ts).
//
// Chat → account: before a chat is linked to an account, the agent saves details on the intake under
// `fields.application` (intake.ts APPLICATION_KEY). Once the web session is claimed or the phone household
// is linked to the account, absorbChatDetails() copies them into the account (the account's own answers
// win) and removes them from the intake, so a key the person later clears on the account page stays cleared.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationDetails } from '../../shared/applicationDetails.js';
import { APPLICATION_KEY, isWebIntake } from '../intake.js';
import { cleanDetails, hasDetails, type DetailsPatch } from './applicationDetails.js';

type Row = Record<string, unknown>;
const MAX_CLAIMS = 5;

function ok<T>(fn: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) {
    console.error(`[applicationDetails] ${fn} failed:`, r.error.message);
    throw new Error('Account storage is unavailable. Please try again.');
  }
  return r.data;
}

/** Atomic merge (merge_applicant_application_details). null in the patch clears that key. */
export async function mergeAccountDetails(client: () => SupabaseClient, userId: string, patch: DetailsPatch, fillOnly = false): Promise<ApplicationDetails> {
  const set: Row = {};
  const clear: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) clear.push(k); else set[k] = v;
  }
  const data = ok('merge', await client().rpc('merge_applicant_application_details', {
    p_user_id: userId, p_set: set, p_clear: clear, p_fill_only: fillOnly,
  }));
  return cleanDetails(data);
}

/** Copy chat-collected details from these intakes into the account, then remove them from the intakes. */
export async function absorbChatDetails(client: () => SupabaseClient, userId: string, intakeIds: string[]): Promise<void> {
  for (const id of [...new Set(intakeIds)]) {
    const row = ok('absorb.read', await client().from('intakes').select('fields').eq('id', id).maybeSingle()) as Row | null;
    const fields = (row?.fields ?? {}) as Row;
    if (!(APPLICATION_KEY in fields)) continue;
    const chat = cleanDetails(fields[APPLICATION_KEY]);
    if (hasDetails(chat)) await mergeAccountDetails(client, userId, chat, true);
    const { [APPLICATION_KEY]: _moved, ...rest } = fields;
    ok('absorb.strip', await client().from('intakes').update({ fields: rest }).eq('id', id));
  }
}

/** The intakes whose chat answers belong to this account: its linked household and its claimed web sessions. */
async function chatSources(client: () => SupabaseClient, userId: string, householdId: string | null): Promise<string[]> {
  const claims = ok('claims', await client().from('applicant_chat_claims').select('session_id').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(MAX_CLAIMS)) as Row[] | null;
  return [...(householdId ? [householdId] : []), ...(claims ?? []).map(c => `web:${c.session_id as string}`)];
}

/** The account's details, after pulling in anything a linked chat collected before it was linked. */
export async function readAccountDetails(client: () => SupabaseClient, userId: string): Promise<ApplicationDetails> {
  const before = ok('read', await client().from('applicant_profiles').select('household_id').eq('user_id', userId).maybeSingle()) as Row | null;
  if (!before) return {};
  await absorbChatDetails(client, userId, await chatSources(client, userId, (before.household_id as string | null) ?? null));
  const row = ok('read', await client().from('applicant_profiles').select('application_details').eq('user_id', userId).maybeSingle()) as Row | null;
  return cleanDetails(row?.application_details);
}

/**
 * Which applicant account a chat belongs to: the account linked to the phone household (verified by
 * YES), else the account that claimed this web session. null when the chat is not linked to any account.
 */
export async function accountForChat(client: () => SupabaseClient, ref: { intakeId: string; sessionId?: string }): Promise<string | null> {
  if (!isWebIntake(ref.intakeId)) {
    const p = ok('owner.household', await client().from('applicant_profiles').select('user_id').eq('household_id', ref.intakeId).maybeSingle()) as Row | null;
    if (p?.user_id) return p.user_id as string;
  }
  const sid = ref.sessionId ?? (isWebIntake(ref.intakeId) ? ref.intakeId.slice(4) : undefined);
  if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) return null;
  const c = ok('owner.claim', await client().from('applicant_chat_claims').select('user_id').eq('session_id', sid).maybeSingle()) as Row | null;
  return (c?.user_id as string | undefined) ?? null;
}
