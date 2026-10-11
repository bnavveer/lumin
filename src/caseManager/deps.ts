// Injectable dependencies for the conversation engine. Live wiring uses dynamic imports so a missing
// optional module (knowledge, webKnowledge, Lane A's calls.ts) never breaks the engine.
import type { ModelMessage, ToolSet } from 'ai';
import type { CaseEvent, County, DocType, Program } from '../contracts.js';
import { supabaseRepo, type ConversationRepo } from './state.js';

export interface AgentArgs {
  householdId: string;
  system: string;
  messages: ModelMessage[];
  tools: ToolSet;
}

export interface ConversationDeps {
  repo: ConversationRepo;
  logEvent(hid: string, e: CaseEvent): Promise<void>;
  storeDocument(hid: string, url: string, contentType: string, docType: DocType): Promise<{ id: string }>;
  startExtraction(documentId: string): Promise<{ status: string }>;
  pollExtraction(documentId: string): Promise<{ status: string; extracted?: unknown; docType?: string }>;
  vaultSummary(hid: string, programs?: Program[]): Promise<string>;
  missingDocs(hid: string, programs: Program[]): Promise<DocType[]>;
  requestDocument(hid: string, docType: DocType, reason: string): Promise<void>;
  translate(text: string, lang: string): Promise<string>;
  detectLanguage(text: string): Promise<string>;
  runAgent(args: AgentArgs): Promise<string>;
  packetUrl(hid: string): string;
  placeOfficeCall(hid: string, purpose: string): Promise<void>;
  answerQuestion(question: string, opts: { county?: string; lang?: string }): Promise<string>;
  findResources(need: string, county: County, zip?: string): Promise<unknown>;
  nudgeText(kind: 'interview_nudge' | 'docs_nudge' | 'renewal_start', name: string): Promise<{ variantId: string; text: string }>;
  now(): Date;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e)).slice(0, 200);

// Variable specifiers keep tsc from requiring modules other lanes may not have landed yet.
async function optionalImport<T>(spec: string): Promise<T | undefined> {
  try { return (await import(spec)) as T; } catch (err) {
    console.error(`[conversation] optional module ${spec} unavailable: ${errMsg(err)}`);
    return undefined;
  }
}

async function realDeps(): Promise<ConversationDeps> {
  const repo = await supabaseRepo();
  return {
    repo,
    logEvent: async (hid, e) => (await import('../keewano.js')).logEvent(hid, e),
    storeDocument: async (hid, url, ct, t) => (await import('../documents.js')).storeDocumentFromUrl(hid, url, ct, t),
    startExtraction: async (id) => (await import('../docExtract.js')).startExtraction(id),
    async pollExtraction(id) {
      const r = await (await import('../docExtract.js')).pollExtraction(id);
      const { vaultDb } = await import('../vault.js');
      const { data } = await vaultDb().from('documents').select('doc_type').eq('id', id).maybeSingle();
      return { ...r, ...(data ? { docType: (data as { doc_type: string }).doc_type } : {}) };
    },
    vaultSummary: async (hid, programs) => (await import('../vault.js')).vaultSummaryText(hid, programs),
    missingDocs: async (hid, programs) => (await import('../vault.js')).missingForPrograms(hid, programs),
    requestDocument: async (hid, t, reason) => (await import('../vault.js')).requestDocument(hid, t, reason),
    translate: async (text, lang) => (await import('../llm.js')).translate(text, lang),
    detectLanguage: async (text) => (await import('../llm.js')).detectLanguage(text),
    async runAgent({ householdId, system, messages, tools }) {
      const { generateWithFallback } = await import('../llm.js');
      const { stepCountIs } = await import('ai');
      const r = await generateWithFallback('agent', {
        householdId, system, messages, tools, stopWhen: stepCountIs(8), maxOutputTokens: 600,
      });
      return r.text;
    },
    packetUrl: (hid) => {
      // Lazy require-free: links.ts is tiny and synchronous; import cached by the module loader.
      if (!linksMod) throw new Error('[conversation] links not loaded');
      return linksMod.packetUrl(hid);
    },
    async placeOfficeCall(hid, purpose) {
      const calls = await optionalImport<{ placeOfficeCall?: (h: string, p: string) => Promise<unknown> }>('../calls.js');
      if (!calls?.placeOfficeCall) throw new Error('office calling not available yet');
      await calls.placeOfficeCall(hid, purpose);
    },
    async answerQuestion(question, opts) {
      const k = await optionalImport<{ answerFromResearch?: (q: string, o: object) => Promise<{ answer: string }> }>('../knowledge.js');
      if (k?.answerFromResearch) {
        try { return (await k.answerFromResearch(question, opts)).answer; } catch (err) { console.error('[conversation] knowledge failed:', errMsg(err)); }
      }
      const w = await optionalImport<{ answerFromWeb?: (q: string) => Promise<{ answer: string }> }>('../webKnowledge.js');
      if (w?.answerFromWeb) return (await w.answerFromWeb(question)).answer;
      return 'I could not look that up right now. Please call 211 or your county benefits office.';
    },
    async findResources(need, county, zip) {
      const w = await optionalImport<{ findLocalResources?: (a: object) => Promise<unknown> }>('../webKnowledge.js');
      if (!w?.findLocalResources) return [];
      return w.findLocalResources({ need, county, ...(zip ? { zip } : {}) });
    },
    nudgeText: async (kind, name) => (await import('../insights.js')).chooseNudge(kind, name),
    now: () => new Date(),
  };
}

let linksMod: typeof import('../links.js') | undefined;
let current: ConversationDeps | undefined;
let pendingInit: Promise<ConversationDeps> | undefined;

export async function getDeps(): Promise<ConversationDeps> {
  if (current) return current;
  pendingInit ??= (async () => {
    linksMod = await import('../links.js');
    current = await realDeps();
    return current;
  })();
  return pendingInit;
}

/** Test seam: replace dependencies wholesale. No args restores live wiring on next use. */
export function setConversationDeps(d?: ConversationDeps): void {
  current = d;
  pendingInit = undefined;
}

/** Fire-and-forget analytics: never block or fail a reply on Keewano. */
export function bg(p: Promise<unknown>, what: string): void {
  p.catch((err) => console.error(`[conversation] ${what} failed: ${errMsg(err)}`));
}
