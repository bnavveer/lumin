import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ApplicationDetails } from '../../shared/applicationDetails.js';
import type { Me, Workflow } from '../../shared/workflow.js';
import type { ScreeningInput } from '../applicationScreening.js';
import { admin } from '../supabase.js';
import { extFor } from '../documents.js';
import { env, optionalEnv } from '../env.js';
import { normalizePhone, screeningOnly, webIntakeId } from '../intake.js';
import type { DetailsPatch } from './applicationDetails.js';
import { absorbChatDetails, mergeAccountDetails, readAccountDetails } from './applicationDetailsDb.js';
import type { StoredDocument, StoredWorkflow } from './model.js';
import { summary } from './model.js';

export interface ApplicantUser { id: string; email: string; firstName?: string; phone?: string }
export interface Profile extends Me { screeningAnswers: ScreeningInput }
export class WorkflowError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 429 | 503, message: string) { super(message); }
}
export interface WorkflowRepo {
  authenticate(token: string): Promise<ApplicantUser | null>;
  signup(input: { email: string; password: string; firstName?: string; phone?: string }): Promise<{ confirmationRequired: boolean }>;
  profile(user: ApplicantUser): Promise<Profile>;
  updateProfile(user: ApplicantUser, values: { firstName?: string | null; phone?: string | null; screeningAnswers?: ScreeningInput }): Promise<Profile>;
  claimChat(userId: string, sessionId: string): Promise<void>;
  screening(userId: string): Promise<ScreeningInput>;
  /** Saved application details (after absorbing anything a linked chat collected). */
  applicationDetails(userId: string): Promise<ApplicationDetails>;
  /** Merge a patch (null clears a key) and return the new details. */
  updateApplicationDetails(userId: string, patch: DetailsPatch): Promise<ApplicationDetails>;
  list(userId: string): Promise<StoredWorkflow[]>;
  get(userId: string, id: string): Promise<StoredWorkflow | null>;
  create(userId: string, w: Workflow): Promise<void>;
  save(row: StoredWorkflow): Promise<void>;
  documents(userId: string): Promise<StoredDocument[]>;
  upload(doc: StoredDocument, bytes: Uint8Array): Promise<void>;
  download(doc: StoredDocument): Promise<string>;
  deleteDocument(doc: StoredDocument): Promise<void>;
}

function checked<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) { console.error('[workflow] database request failed:', r.error.message); throw new WorkflowError(503, 'Account storage is unavailable. Please try again.'); }
  return r.data;
}
type Row = Record<string, unknown>;
const profileFrom = (row: Row, user: ApplicantUser): Profile => ({ userId: user.id, email: user.email,
  householdId: row.household_id as string | null, firstName: row.first_name as string | null,
  phone: row.phone as string | null, screeningAnswers: (row.screening_answers ?? {}) as ScreeningInput });
const workflowFrom = (r: Row): StoredWorkflow => ({ userId: r.user_id as string, workflow: r.state as Workflow, version: r.version as number });
const documentFrom = (r: Row): StoredDocument => ({ id: r.id as string, userId: r.user_id as string, workflowId: r.workflow_id as string | null,
  docType: r.doc_type as StoredDocument['docType'], fileName: r.file_name as string, contentType: r.content_type as string,
  sizeBytes: r.size_bytes as number, storagePath: r.storage_path as string, status: 'received', createdAt: r.created_at as string });

/** Caller must first verify the staff member's organization owns this household. */
export async function listHouseholdWorkflows(householdId: string) {
  const rows = checked(await admin().from('applicant_workflows').select('state')
    .eq('household_id', householdId).order('updated_at', { ascending: false })) as Row[];
  return rows.map(row => summary(row.state as Workflow));
}

/** A fresh, isolated publishable-key client: never shares or persists an applicant session. */
const publicAuthClient = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

/** Where the signup confirmation email lands: the dashboard, when PUBLIC_BASE_URL is set. */
export const signupRedirect = (base = optionalEnv('PUBLIC_BASE_URL')): string | undefined =>
  base ? `${base.replace(/\/+$/, '')}/dashboard` : undefined;

export type PasswordCheck = (email: string, password: string) => Promise<boolean>;

/**
 * Re-checks an applicant's password by signing in on a brand-new isolated client, then discards it.
 * Any error (wrong password, unconfirmed email, outage) counts as not verified.
 */
export function supabasePasswordCheck(authClient: () => SupabaseClient = publicAuthClient): PasswordCheck {
  return async (email, password) => {
    if (!email || !password) return false;
    try {
      const c = authClient();
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      const verified = !error && Boolean(data.user) && data.user!.email?.toLowerCase() === email.toLowerCase();
      // The session only proved the password; revoke just this session so no token outlives the check.
      if (data?.session) await c.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return verified;
    } catch { return false; }
  };
}

export function supabaseWorkflowRepo(client: () => SupabaseClient = admin, signupClient: () => SupabaseClient = publicAuthClient): WorkflowRepo {
  async function promote(userId: string) {
    checked(await client().rpc('promote_applicant_chat', { p_user_id: userId }));
  }
  async function removeQueuedObjects(userId: string) {
    const pending = await client().from('applicant_storage_deletions').select('id,storage_path').eq('user_id', userId).limit(20);
    if (pending.error) { console.error('[workflow] storage deletion queue unavailable'); return; }
    for (const r of (pending.data ?? []) as Row[]) {
      const result = await client().storage.from('documents').remove([r.storage_path as string]).catch(() => null);
      if (!result || result.error) continue;
      await client().from('applicant_storage_deletions').delete().eq('id', r.id).eq('user_id', userId);
    }
  }
  return {
    async authenticate(token) {
      const { data, error } = await client().auth.getUser(token);
      if (error || !data.user) return null;
      let phone: string | undefined;
      try { if (typeof data.user.user_metadata?.phone === 'string') phone = normalizePhone(data.user.user_metadata.phone); } catch { /* Unverified contact metadata may be absent or invalid. */ }
      return { id: data.user.id, email: data.user.email ?? '', firstName: typeof data.user.user_metadata?.firstName === 'string' ? data.user.user_metadata.firstName.slice(0, 100) : undefined, phone };
    },
    async signup(input) {
      // Public signUp honors the project's email confirmation policy; never admin-create a preconfirmed email.
      // Use an isolated public-key client: signUp may store an applicant session in memory,
      // which must never replace the authorization of our shared service-role DB client.
      const redirect = signupRedirect();
      const { data, error } = await signupClient().auth.signUp({ email: input.email, password: input.password,
        options: { data: { firstName: input.firstName ?? null, phone: input.phone ?? null }, ...(redirect ? { emailRedirectTo: redirect } : {}) } });
      if (error) throw new WorkflowError(error.status === 429 ? 429 : 400, error.status === 429 ? 'Too many signup attempts. Please try later.' : 'Could not create the account. Check your email and password, or sign in to your existing account.');
      return { confirmationRequired: !data.session };
    },
    async profile(user) {
      checked(await client().from('applicant_profiles').upsert({ user_id: user.id, first_name: user.firstName ?? null, phone: user.phone ?? null }, { onConflict: 'user_id', ignoreDuplicates: true }));
      await promote(user.id);
      const row = checked(await client().from('applicant_profiles').select('*').eq('user_id', user.id).single()) as Row;
      return profileFrom(row, user);
    },
    async updateProfile(user, values) {
      await this.profile(user);
      const patch: Row = {};
      if (values.firstName !== undefined) patch.first_name = values.firstName;
      if (values.phone !== undefined) patch.phone = values.phone;
      if (values.screeningAnswers !== undefined) { patch.screening_answers = values.screeningAnswers; patch.screening_answers_initialized = true; }
      const row = checked(await client().from('applicant_profiles').update(patch).eq('user_id', user.id).select().single()) as Row;
      return profileFrom(row, user);
    },
    async claimChat(userId, sessionId) {
      const result = checked(await client().rpc('claim_applicant_chat', { p_user_id: userId, p_session_id: sessionId })) as string;
      if (result === 'not_found') throw new WorkflowError(404, 'Start a chat before linking it to your account.');
      if (result !== 'ok') throw new WorkflowError(409, 'This chat or confirmed household is already linked to another account.');
      // Details the chat collected before it was linked now belong to this account.
      const linked = checked(await client().from('applicant_profiles').select('household_id').eq('user_id', userId).maybeSingle()) as Row | null;
      await absorbChatDetails(client, userId, [webIntakeId(sessionId), ...(linked?.household_id ? [linked.household_id as string] : [])])
        .catch(() => console.error('[workflow] could not copy chat application details'));
    },
    async applicationDetails(userId) {
      await promote(userId);
      return readAccountDetails(client, userId);
    },
    async updateApplicationDetails(userId, patch) {
      await promote(userId);
      await readAccountDetails(client, userId); // absorb first so chat answers can't later overwrite a cleared key
      return mergeAccountDetails(client, userId, patch);
    },
    async screening(userId) {
      await promote(userId);
      const profile = checked(await client().from('applicant_profiles').select('household_id,screening_answers,screening_answers_initialized').eq('user_id', userId).maybeSingle()) as Row | null;
      if (profile?.screening_answers_initialized) return (profile.screening_answers ?? {}) as ScreeningInput;
      if (profile?.household_id) {
        // Phone YES may correct the merged fields after the original web snapshot was saved.
        // The linked account reads the canonical confirmed phone intake, never a different claimed household.
        const canonical = checked(await client().from('intakes').select('fields').eq('id', profile.household_id).eq('status', 'confirmed').maybeSingle()) as Row | null;
        if (canonical) return screeningOnly((canonical.fields ?? {}) as ScreeningInput & Record<string, unknown>) as ScreeningInput;
      }
      const claims = checked(await client().from('applicant_chat_claims').select('session_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(1)) as Row[];
      let fields: ScreeningInput = {};
      if (claims[0]) {
        const intake = checked(await client().from('intakes').select('fields,household_id,status').eq('id', `web:${claims[0].session_id}`).maybeSingle()) as Row | null;
        if (!profile?.household_id || (intake?.status === 'confirmed' && intake?.household_id === profile.household_id)) fields = (intake?.fields ?? {}) as ScreeningInput;
      }
      return screeningOnly(fields as ScreeningInput & Record<string, unknown>) as ScreeningInput;
    },
    async list(userId) {
      const rows = checked(await client().from('applicant_workflows').select('user_id,state,version').eq('user_id', userId).order('updated_at', { ascending: false })) as Row[];
      return rows.map(workflowFrom);
    },
    async get(userId, id) {
      const row = checked(await client().from('applicant_workflows').select('user_id,state,version').eq('id', id).eq('user_id', userId).maybeSingle()) as Row | null;
      return row ? workflowFrom(row) : null;
    },
    async create(userId, w) {
      checked(await client().from('applicant_workflows').insert({ id: w.id, user_id: userId, household_id: w.householdId, state: w, version: 1 }));
    },
    async save(row) {
      const rows = checked(await client().from('applicant_workflows').update({ state: row.workflow, household_id: row.workflow.householdId, version: row.version + 1 })
        .eq('id', row.workflow.id).eq('user_id', row.userId).eq('version', row.version).select('id')) as Row[];
      if (!rows.length) throw new WorkflowError(409, 'Your workflow changed. Refresh it and try again.');
    },
    async documents(userId) {
      await removeQueuedObjects(userId);
      const rows = checked(await client().from('applicant_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false })) as Row[];
      return rows.map(documentFrom);
    },
    async upload(doc, bytes) {
      if (!extFor(doc.contentType)) throw new WorkflowError(415, 'Unsupported file type.');
      const bucket = client().storage.from('documents');
      const up = await bucket.upload(doc.storagePath, bytes, { contentType: doc.contentType, upsert: false });
      if (up.error) throw new WorkflowError(503, 'Could not save this document. Please try again.');
      const result = await client().from('applicant_documents').insert({ id: doc.id, user_id: doc.userId, workflow_id: doc.workflowId,
        doc_type: doc.docType, file_name: doc.fileName, content_type: doc.contentType, size_bytes: doc.sizeBytes, storage_path: doc.storagePath });
      if (result.error) {
        await bucket.remove([doc.storagePath]).catch(() => undefined);
        checked(result);
      }
    },
    async download(doc) {
      const result = await client().storage.from('documents').createSignedUrl(doc.storagePath, 600);
      if (result.error || !result.data) throw new WorkflowError(503, 'Could not open this document. Please try again.');
      return result.data.signedUrl;
    },
    async deleteDocument(doc) {
      // First remove metadata and its mirrored household record transactionally. The durable
      // deletion queue survives a Storage outage; listing the vault retries physical removal.
      const path = checked(await client().rpc('delete_applicant_document', { p_user_id: doc.userId, p_document_id: doc.id }));
      if (!path) throw new WorkflowError(404, 'Document not found.');
      await removeQueuedObjects(doc.userId);
    },
  };
}
