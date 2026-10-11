import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/store.js', () => ({ addTimeline: vi.fn(async () => {}) }));

import { toWire, EVENTS_HASH, EVENT_TYPES, ingest, logEvent, setKeewanoFetch, registerEvents } from '../src/keewano.js';
import { addTimeline } from '../src/store.js';

const ok = (status = 202) => new Response('', { status });
let calls: Array<{ url: string; init: RequestInit }>;
let respond: () => Response;
beforeEach(() => {
  calls = [];
  respond = () => ok();
  process.env.KEEWANO_SDK_KEY = 'test-key';
  setKeewanoFetch((async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond(); }) as unknown as typeof fetch);
  vi.mocked(addTimeline).mockReset();
  vi.mocked(addTimeline).mockResolvedValue(undefined);
});
const body = (i = 0) => JSON.parse(calls[i].init.body as string);

describe('event ids', () => {
  it('assigns permanent ids from 2000 in list order', () => {
    const id = (n: string) => EVENT_TYPES.find(e => e.name === n)?.eventTypeId;
    expect(EVENT_TYPES[0]).toEqual({ eventTypeId: 2000, name: 'County', dataType: 'string' });
    expect(id('Screened')).toBe(2004);
    expect(id('PacketSigned')).toBe(2007);
    expect(id('NudgeVariant')).toBe(2021);
    expect(EVENT_TYPES).toHaveLength(22);
    expect(EVENTS_HASH).toBeGreaterThan(0);
  });
});

describe('toWire', () => {
  it('maps none/string/uint/timestamp', () => {
    expect(toWire({ type: 'PacketSigned' }, 100)).toEqual({ eventTypeId: 2007, dataType: 'none', timestamp: 100 });
    expect(toWire({ type: 'Screened', value: 'calfresh,medi_cal' }, 100))
      .toEqual({ eventTypeId: 2004, dataType: 'string', timestamp: 100, data: 'calfresh,medi_cal' });
    expect(toWire({ type: 'HouseholdSize', value: 3 }, 100)).toEqual({ eventTypeId: 2001, dataType: 'uint', timestamp: 100, data: 3 });
    expect(toWire({ type: 'InterviewScheduled', at: 999 }, 100))
      .toEqual({ eventTypeId: 2009, dataType: 'timestamp', timestamp: 100, data: 999 });
  });
  it('rejects strings over 256 chars but allows exactly 256', () => {
    expect(() => toWire({ type: 'AgentToolCalled', value: 'x'.repeat(257) }, 1)).toThrow(RangeError);
    expect(toWire({ type: 'AgentToolCalled', value: 'x'.repeat(256) }, 1).data).toHaveLength(256);
  });
  it('rejects negative or fractional uints', () => {
    expect(() => toWire({ type: 'AgentTurnMs', value: -1 }, 1)).toThrow(RangeError);
    expect(() => toWire({ type: 'AgentTurnMs', value: 1.5 }, 1)).toThrow(RangeError);
  });
});

describe('ingest', () => {
  it('posts the right url, header and body, sorted by time', async () => {
    await ingest('hid-1', [
      { event: { type: 'PacketSigned' }, at: 200 },
      { event: { type: 'County', value: 'los_angeles' }, at: 100 },
    ], 'sess-a');
    expect(calls[0].url).toBe('https://api.keewano.com/event/ingress/v1/json/in');
    expect((calls[0].init.headers as Record<string, string>)['k-token']).toBe('test-key');
    const b = body();
    expect(b).toMatchObject({ dataSessionId: 'sess-a', batch: 1, customEventsHash: EVENTS_HASH, installId: 'hid-1' });
    expect(b.events.map((e: { timestamp: number }) => e.timestamp)).toEqual([100, 200]);
    expect(calls).toHaveLength(1);
  });
  it('increments batch per session', async () => {
    await ingest('h', [{ event: { type: 'PacketSigned' }, at: 1 }], 'sess-b');
    await ingest('h', [{ event: { type: 'PacketSigned' }, at: 2 }], 'sess-b');
    await ingest('h', [{ event: { type: 'PacketSigned' }, at: 3 }], 'sess-c');
    expect([body(0).batch, body(1).batch, body(2).batch]).toEqual([1, 2, 1]);
  });
  it('throws on 4xx', async () => {
    respond = () => new Response('bad', { status: 400 });
    await expect(ingest('h', [{ event: { type: 'PacketSigned' }, at: 1 }], 'sess-d')).rejects.toThrow(/400/);
  });
});

describe('logEvent', () => {
  it('ingests then mirrors a Type: value label', async () => {
    await logEvent('h', { type: 'NudgeSent', value: 'docs_nudge' }, 50);
    expect(addTimeline).toHaveBeenCalledWith('h', 'NudgeSent: docs_nudge', 50);
  });
  it('uses bare Type label for none events', async () => {
    await logEvent('h', { type: 'UserReplied' }, 50);
    expect(addTimeline).toHaveBeenCalledWith('h', 'UserReplied', 50);
  });
  it('does not throw when the mirror fails', async () => {
    vi.mocked(addTimeline).mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(logEvent('h', { type: 'UserReplied' }, 50)).resolves.toBeUndefined();
    spy.mockRestore();
  });
  it('throws and skips mirror when ingest fails', async () => {
    respond = () => new Response('no', { status: 401 });
    await expect(logEvent('h', { type: 'UserReplied' }, 50)).rejects.toThrow();
    expect(addTimeline).not.toHaveBeenCalled();
  });
});

describe('registerEvents', () => {
  it('returns status and posts the type list', async () => {
    respond = () => ok(200);
    expect(await registerEvents()).toBe(200);
    expect(calls[0].url.endsWith('/custom')).toBe(true);
    expect(body().eventTypes).toHaveLength(22);
  });
});
