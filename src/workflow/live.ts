// Live wiring of WorkflowDeps to Supabase, research, Exa, Kernel, Dial, Keewano and the LLM gateway.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { CallOutcomeKind, DocType } from '../contracts.js';
import { fillApplication } from '../benefitscal/filler.js';
import { sharedTunnel } from '../benefitscal/tunnel.js';
import { startExtraction } from '../docExtract.js';
import { objectPath, signedUrl } from '../documents.js';
import { optionalEnv } from '../env.js';
import { fieldsFromHousehold, mergeFields, normalizePhone, webIntakeId } from '../intake.js';
import { supabaseIntakeRepo } from '../intakeStore.js';
import { logEvent } from '../keewano.js';
import { generateObjectWithFallback, generateWithFallback } from '../llm.js';
import { getHousehold, upsertHousehold } from '../store.js';
import { admin } from '../supabase.js';
import { compressForUpload } from '../vault.js';
import type { HeldDoc, ResearchAnswer, ResearchCitation, WorkflowDeps } from './deps.js';
import { supabaseWorkflowRepo } from './store.js';

const SIGNED_TTL_SEC = 7 * 24 * 3600;
const BUCKET = 'documents';
const OUTCOMES = ['transferred', 'booked', 'waitlist_open', 'waitlist_closed', 'no_answer', 'info'] as const satisfies readonly CallOutcomeKind[];

const host = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'web'; } };

/** The sentence(s) of an answer that cite source [n], as a short excerpt. */
function excerptFor(answer: string, n: number): string | null {
  const sentences = answer.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(\s*\[\d+\])*/g) ?? [];
  const hit = sentences.filter(s => s.includes(`[${n}]`)).slice(0, 2).join(' ').replace(/\[\d+\]/g, '').trim();
  return hit ? hit.slice(0, 400) : null;
}

type AnyCitation = { file?: string; heading?: string; urls?: string[]; n?: number; title?: string; url?: string };

function mapAnswer(answer: string, citations: AnyCitation[], kind: 'research' | 'web'): ResearchAnswer {
  const out: ResearchCitation[] = citations.map((c, i) => {
    if (c.file) {
      return { title: c.heading || c.file, url: c.urls?.[0] ?? null, source: c.file, detail: excerptFor(answer, i + 1) };
    }
    const url = c.url ?? null;
    return { title: c.title || (url ? host(url) : 'Web source'), url, source: `exa:${url ? host(url) : 'web'}`, detail: excerptFor(answer, c.n ?? i + 1) };
  });
  return { answer: answer.trim(), citations: kind === 'web' ? out : out };
}

const localBase = (): string => `http://localhost:${process.env.PORT ?? 3000}`;

async function listDocs(hid: string): Promise<HeldDoc[]> {
  const { data, error } = await admin().from('documents')
    .select('id, doc_type, status, storage_path, compressed_path, extracted, expires_at')
    .eq('household_id', hid).order('created_at', { ascending: false });
  if (error) throw new Error(`[workflow] list documents: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(r => ({
    id: r.id as string, docType: r.doc_type as DocType, status: (r.status as string) ?? 'received',
    storagePath: (r.storage_path as string), extracted: (r.extracted as Record<string, unknown> | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
  }));
}

async function storeDoc(hid: string, orgId: string, buffer: Buffer, contentType: string, docType: DocType): Promise<{ id: string }> {
  const id = randomUUID();
  const path = objectPath(orgId, hid, id, contentType);
  const bucket = admin().storage.from(BUCKET);
  const up = await bucket.upload(path, buffer, { contentType, upsert: false });
  if (up.error) throw new Error(`[workflow] upload: ${up.error.message}`);
  let compressedPath: string | null = null;
  try {
    const c = await compressForUpload(buffer, contentType);
    if (c.resized) {
      compressedPath = `${orgId}/${hid}/${id}-c.jpg`;
      const cu = await bucket.upload(compressedPath, c.buffer, { contentType: c.contentType, upsert: true });
      if (cu.error) compressedPath = null;
    }
  } catch (err) {
    console.error('[workflow] compress failed:', err instanceof Error ? err.message : err);
  }
  const { error } = await admin().from('documents').insert({
    id, household_id: hid, doc_type: docType, storage_path: path, content_type: contentType,
    size_bytes: buffer.byteLength, compressed_path: compressedPath, status: 'received',
  });
  if (error) {
    await bucket.remove([path]).catch(() => undefined);
    throw new Error(`[workflow] insert document: ${error.message}`);
  }
  return { id };
}

async function extractDoc(documentId: string): Promise<Record<string, unknown> | null> {
  await startExtraction(documentId);
  const { data } = await admin().from('documents').select('extracted').eq('id', documentId).maybeSingle();
  return ((data as { extracted?: Record<string, unknown> | null } | null)?.extracted) ?? null;
}

async function storeScreenshot(hid: string, orgId: string, localPath: string): Promise<string | null> {
  const buf = await readFile(localPath);
  const path = `${orgId}/${hid}/wf-shot-${randomUUID()}.png`;
  const up = await admin().storage.from(BUCKET).upload(path, buf, { contentType: 'image/png', upsert: false });
  if (up.error) throw new Error(`[workflow] screenshot upload: ${up.error.message}`);
  return signedUrl(path, SIGNED_TTL_SEC);
}

async function publicBase(): Promise<string | null> {
  const configured = optionalEnv('PUBLIC_BASE_URL');
  if (configured && /^https:\/\//.test(configured) && !/localhost|127\.0\.0\.1/.test(configured)) return configured.replace(/\/+$/, '');
  return sharedTunnel(localBase());
}

async function chatFields(sessionId: string) {
  const repo = supabaseIntakeRepo();
  const web = await repo.get(webIntakeId(sessionId));
  if (!web) return undefined;
  if (!web.householdId) return web.fields;
  const linked = await repo.get(web.householdId);
  const h = await getHousehold(web.householdId);
  return mergeFields(h ? fieldsFromHousehold(h) : {}, linked?.fields ?? web.fields);
}

const dialConfigured = (): boolean =>
  Boolean(optionalEnv('DIAL_API_KEY') && (optionalEnv('DIAL_FROM_NUMBER') || optionalEnv('DIAL_FROM_NUMBER_ID')));

export function liveWorkflowDeps(): WorkflowDeps {
  return {
    repo: supabaseWorkflowRepo(),
    auth: {
      async createUser(email, password, meta) {
        const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
        if (error) {
          if ((error as { code?: string }).code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message)) return 'exists';
          throw new Error(`[workflow] createUser: ${error.message}`);
        }
        return { userId: data.user.id };
      },
      async getUser(token) {
        const { data, error } = await admin().auth.getUser(token);
        if (error || !data?.user) return null;
        return { id: data.user.id, email: data.user.email ?? '' };
      },
    },
    households: { get: (id) => getHousehold(id), upsert: (h) => upsertHousehold(h) },
    chatFields,
    research: {
      async fromResearch(q, county) {
        const { answerFromResearch } = await import('../knowledge.js');
        const r = await answerFromResearch(q, { county });
        return mapAnswer(r.answer, r.citations as AnyCitation[], r.source);
      },
      async fromWeb(q) {
        const { answerFromWeb } = await import('../webKnowledge.js');
        const r = await answerFromWeb(q);
        return mapAnswer(r.answer, r.citations, 'web');
      },
      async section8() {
        const { checkSection8Waitlists } = await import('../waitlistWatcher.js');
        return (await checkSection8Waitlists()).map(w => ({
          title: `${w.authority} Section 8 waitlist: ${w.status}`, url: w.sourceUrl || null,
          source: `exa:${w.sourceUrl ? host(w.sourceUrl) : w.authority.toLowerCase()}`, detail: w.evidence || null,
        }));
      },
      async summarize(program, text) {
        const { text: out } = await generateWithFallback('fast', {
          system: 'You summarize benefits research for an applicant. Write 2 to 3 short sentences in plain 6th-grade English: what documents to have ready, the key eligibility rule, and how to apply. No citations, no markdown, never invent facts.',
          prompt: `Program: ${program}\n\nResearch:\n${text.slice(0, 6000)}`,
        });
        return out;
      },
    },
    docs: {
      list: listDocs,
      store: storeDoc,
      extract: extractDoc,
      signedUrl: (p) => signedUrl(p, SIGNED_TTL_SEC),
      storeScreenshot,
    },
    fill: {
      run: (o) => fillApplication(o),
      publicBase,
      localBase,
      kernelAvailable: () => Boolean(optionalEnv('KERNEL_API_KEY')),
    },
    county: {
      async submit(householdId, payload) {
        const res = await fetch(`${localBase()}/county/api/applications`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ householdId, kind: 'full', payload }), signal: AbortSignal.timeout(20_000),
        });
        const j = (await res.json().catch(() => ({}))) as { confirmation?: string; error?: string };
        if (!res.ok || !j.confirmation) throw new Error(`county endpoint: ${j.error ?? res.status}`);
        return j.confirmation;
      },
    },
    dial: {
      configured: dialConfigured,
      officePhone() {
        const raw = optionalEnv('DEMO_OFFICE_PHONE');
        if (!raw) return null;
        try { return normalizePhone(raw); } catch { return null; }
      },
      async placeCall(o) { return (await import('../dial.js')).placeCall(o); },
      async getCall(id) {
        const { getCall, transcriptText } = await import('../dial.js');
        const call = await getCall(id);
        const transcript = transcriptText(call);
        const st = call.status;
        const done = transcript.trim().length > 0 || (st?.state === 'Terminated' && st.terminationType !== 'completed');
        return { done, transcript };
      },
      async sendText(to, body) { return (await import('../dial.js')).sendText(to, body); },
    },
    async summarizeCall(transcript) {
      const schema = z.object({ outcome: z.enum(OUTCOMES), details: z.string().max(600) });
      const { object } = await generateObjectWithFallback('fast', schema, {
        system: 'Summarize a phone call with a county benefits office for the applicant. outcome: booked if an interview time was set, waitlist_open/waitlist_closed for Section 8 answers, no_answer if nobody helped, transferred if moved to a person, else info. details: 1 to 2 plain sentences with any dates, times and documents mentioned.',
        prompt: transcript.slice(0, 8000),
      });
      return object;
    },
    log: (hid, e) => logEvent(hid, e),
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    callPoll: { intervalMs: 5000, timeoutMs: 180_000 },
    calls: {
      async runStep(ctx) {
        const [{ liveCallsRuntime }, { runScriptedCallStep }] = await Promise.all([import('../calls/live.js'), import('../calls/stepCall.js')]);
        return runScriptedCallStep(liveCallsRuntime(), ctx);
      },
    },
  };
}
