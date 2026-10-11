import { crc32 } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { CaseEvent } from './contracts.js';
import { addTimeline } from './store.js';

const API = 'https://api.keewano.com/event/ingress/v1/json';
const MAX_STRING = 256;

export interface EventType { eventTypeId: number; name: string; dataType: 'none' | 'string' | 'uint' | 'timestamp' }

// APPEND-ONLY. Never reorder, rename or change a type: ids are 2000 + position.
const DEFS: Array<[string, EventType['dataType']]> = [
  ['County', 'string'], ['HouseholdSize', 'uint'], ['IncomePctFpl', 'uint'], ['Source', 'string'],
  ['Screened', 'string'], ['DocsRequested', 'uint'], ['DocReceived', 'string'], ['PacketSigned', 'none'],
  ['ApplicationSubmitted', 'string'], ['InterviewScheduled', 'timestamp'], ['InterviewConfirmed', 'none'],
  ['CallPlaced', 'string'], ['CallOutcome', 'string'], ['Approved', 'string'], ['RenewalDue', 'timestamp'],
  ['NudgeSent', 'string'], ['UserReplied', 'none'], ['WaitlistStatus', 'string'],
  ['AgentToolCalled', 'string'], ['AgentTurnMs', 'uint'], ['EscalatedToHuman', 'string'], ['NudgeVariant', 'string'],
];
export const EVENT_TYPES: EventType[] = DEFS.map(([name, dataType], i) => ({ eventTypeId: 2000 + i, name, dataType }));
const BY_NAME = new Map(EVENT_TYPES.map(e => [e.name, e]));

// crc32 of the JSON list with keys sorted within each object; unsigned, never 0.
export const EVENTS_HASH = (crc32(JSON.stringify(
  EVENT_TYPES.map(e => ({ dataType: e.dataType, eventTypeId: e.eventTypeId, name: e.name })),
)) >>> 0) || 1;

export interface WireEvent { eventTypeId: number; dataType: string; timestamp: number; data?: string | number }

export function toWire(e: CaseEvent, ts: number): WireEvent {
  const t = BY_NAME.get(e.type);
  if (!t) throw new Error(`unknown event type ${e.type}`);
  const base = { eventTypeId: t.eventTypeId, dataType: t.dataType, timestamp: ts };
  if (t.dataType === 'none') return base;
  const data = 'at' in e ? e.at : (e as { value: string | number }).value;
  if (t.dataType === 'string') {
    if (typeof data !== 'string') throw new TypeError(`${e.type} needs a string`);
    if (data.length > MAX_STRING) throw new RangeError(`${e.type} value exceeds ${MAX_STRING} chars`);
  } else if (typeof data !== 'number' || !Number.isInteger(data) || data < 0) {
    throw new RangeError(`${e.type} needs a non-negative integer`);
  }
  return { ...base, data };
}

type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (...a) => fetch(...a);
export function setKeewanoFetch(f?: FetchFn): void {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

async function post(path: string, body: unknown): Promise<number> {
  const res = await fetchImpl(`${API}/${path}`, {
    method: 'POST',
    headers: { 'k-token': process.env.KEEWANO_SDK_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status >= 400) throw new Error(`Keewano ${path} ${res.status}: ${await res.text()}`);
  return res.status;
}

/** 202 = registered, 200 = already registered; 409 (conflict) throws. */
export const registerEvents = (): Promise<number> =>
  post('custom', { customEventsHash: EVENTS_HASH, eventTypes: EVENT_TYPES });

const processSession = randomUUID();
const batches = new Map<string, number>();
const nowSec = () => Math.floor(Date.now() / 1000);

export async function ingest(
  hid: string,
  events: Array<{ event: CaseEvent; at: number }>,
  sessionId: string = processSession,
): Promise<void> {
  if (events.length === 0) return;
  const wire = [...events].sort((a, b) => a.at - b.at).map(x => toWire(x.event, x.at));
  const batch = (batches.get(sessionId) ?? 0) + 1;
  await post('in', { dataSessionId: sessionId, batch, customEventsHash: EVENTS_HASH, installId: hid, events: wire });
  batches.set(sessionId, batch); // only advance after a successful POST so a retry reuses the batch number
}

const label = (e: CaseEvent): string => {
  if ('value' in e) return `${e.type}: ${e.value}`;
  if ('at' in e) return `${e.type}: ${new Date(e.at * 1000).toISOString()}`;
  return e.type;
};

export async function logEvent(hid: string, e: CaseEvent, atUnix?: number): Promise<void> {
  const ts = atUnix ?? nowSec();
  await ingest(hid, [{ event: e, at: ts }]);
  try {
    await addTimeline(hid, label(e), ts);
  } catch (err) {
    console.error(`[keewano] timeline mirror failed for ${e.type}:`, err);
  }
}

export async function logEvents(hid: string, es: CaseEvent[]): Promise<void> {
  for (const e of es) await logEvent(hid, e);
}

let pool: pg.Pool | undefined;
export async function keewanoSql<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  pool ??= new pg.Pool({
    host: 'pgsql.keewano.com', port: 27543, user: process.env.KEEWANO_PG_USER,
    password: process.env.KEEWANO_PAT, database: process.env.KEEWANO_PROJECT_ID, ssl: true, max: 2,
  });
  return (await pool.query(sql)).rows as T[];
}
