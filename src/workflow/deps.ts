// The seam between the workflow engine and the outside world. Live wiring: live.ts. Tests inject fakes.
import type { ApplicationProgram } from '../../shared/chat.js';
import type { CallOutcomeKind, CaseEvent, DocType, Household } from '../contracts.js';
import type { FillOptions, FillResult } from '../benefitscal/filler.js';
import type { IntakeFields } from '../intake.js';
import type { WorkflowRepo } from './store.js';

export interface ResearchCitation { title: string; url: string | null; source: string; detail: string | null }
export interface ResearchAnswer { answer: string; citations: ResearchCitation[] }

export interface HeldDoc {
  id: string;
  docType: DocType;
  status: string;
  storagePath: string;
  extracted: Record<string, unknown> | null;
  expiresAt: string | null;
}

export interface CallStatus { done: boolean; transcript: string }

export interface WorkflowDeps {
  repo: WorkflowRepo;
  auth: {
    createUser(email: string, password: string, meta: Record<string, string>): Promise<{ userId: string } | 'exists'>;
    getUser(token: string): Promise<{ id: string; email: string } | null>;
  };
  households: {
    get(id: string): Promise<Household | undefined>;
    upsert(h: Household): Promise<void>;
  };
  /** Fields collected by a web chat session (/api/chat/sessions), or undefined if unknown. */
  chatFields(sessionId: string): Promise<IntakeFields | undefined>;
  research: {
    fromResearch(question: string, county: string): Promise<ResearchAnswer>;
    fromWeb(question: string): Promise<ResearchAnswer>;
    section8(): Promise<ResearchCitation[]>;
    summarize(program: string, text: string): Promise<string>;
  };
  docs: {
    list(householdId: string): Promise<HeldDoc[]>;
    store(householdId: string, orgId: string, buffer: Buffer, contentType: string, docType: DocType): Promise<{ id: string }>;
    /** Reads the document (vision) and returns the extracted fields, or null. */
    extract(documentId: string): Promise<Record<string, unknown> | null>;
    signedUrl(path: string): Promise<string>;
    /** Upload a local screenshot to private storage; returns a signed https URL or null. */
    storeScreenshot(householdId: string, orgId: string, localPath: string): Promise<string | null>;
  };
  fill: {
    run(opts: FillOptions): Promise<FillResult>;
    /** A publicly reachable base URL for this server (tunnel), or null when none can be had. */
    publicBase(): Promise<string | null>;
    localBase(): string;
    kernelAvailable(): boolean;
  };
  county: { submit(householdId: string, payload: unknown): Promise<string> };
  dial: {
    configured(): boolean;
    officePhone(): string | null;
    placeCall(o: { to: string; instruction: string; idempotencyKey: string; maxSeconds: number }): Promise<string>;
    getCall(id: string): Promise<CallStatus>;
    sendText(to: string, body: string): Promise<string>;
  };
  summarizeCall(transcript: string): Promise<{ outcome: CallOutcomeKind; details: string }>;
  log(householdId: string, e: CaseEvent): Promise<void>;
  sleep(ms: number): Promise<void>;
  /** Poll interval and limit for call transcripts. */
  callPoll: { intervalMs: number; timeoutMs: number };
}

export type ProgramList = ApplicationProgram[];
