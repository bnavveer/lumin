import { afterEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Household } from '../src/contracts.js';
import {
  addTimeline, claimAction, getMessages, getTimeline, householdToRow, listHouseholds, markProcessed,
  rowToHousehold, saveCall, setStoreClient, upsertHousehold, getHousehold,
} from '../src/store.js';

type Op = { method: string; args: unknown[] };
type Result = { data: unknown; error: { message: string } | null };

// Chainable, thenable fake of the PostgREST builder. `handler` decides the result per terminal call.
function fakeClient(handler: (table: string, ops: Op[]) => Result) {
  const log: { table: string; ops: Op[] }[] = [];
  const from = (table: string) => {
    const ops: Op[] = [];
    const run = () => {
      log.push({ table, ops });
      return Promise.resolve(handler(table, ops));
    };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'upsert', 'update', 'eq', 'order', 'limit']) {
      b[m] = (...args: unknown[]) => { ops.push({ method: m, args }); return b; };
    }
    b.maybeSingle = () => { ops.push({ method: 'maybeSingle', args: [] }); return run(); };
    b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej);
    return b;
  };
  return { client: { from } as unknown as SupabaseClient, log };
}

const h: Household = {
  id: 'h1', orgId: 'o1', phone: '+12135550100', firstName: 'Ana', county: 'los_angeles', size: 3,
  monthlyIncome: 1800.5, childrenUnder18: 2, pregnant: false, adultAge: 34,
  immigrationStatus: 'green_card', childrenAreCitizens: true,
};

afterEach(() => setStoreClient());

describe('mappers', () => {
  it('round-trips a household', () => {
    expect(rowToHousehold(householdToRow(h))).toEqual(h);
  });
  it('converts numeric strings and omits null first name', () => {
    const r = { ...householdToRow(h), monthly_income: '1800.50', size: '3', first_name: null };
    const out = rowToHousehold(r);
    expect(out.monthlyIncome).toBe(1800.5);
    expect(out.size).toBe(3);
    expect('firstName' in out).toBe(false);
  });
});

describe('processed events and claims', () => {
  it('markProcessed is true first time, false after', async () => {
    const seen = new Set<string>();
    const { client } = fakeClient((_t, ops) => {
      const row = ops.find((o) => o.method === 'upsert')!.args[0] as { event_id: string };
      const fresh = !seen.has(row.event_id);
      seen.add(row.event_id);
      return { data: fresh ? [row] : [], error: null };
    });
    setStoreClient(client);
    expect(await markProcessed('e1')).toBe(true);
    expect(await markProcessed('e1')).toBe(false);
    expect(await markProcessed('e2')).toBe(true);
  });
  it('claimAction is idempotent per (household, kind, day)', async () => {
    const seen = new Set<string>();
    const { client } = fakeClient((_t, ops) => {
      const row = ops.find((o) => o.method === 'upsert')!.args[0] as Record<string, string>;
      const key = `${row.household_id}|${row.kind}|${row.day}`;
      const fresh = !seen.has(key);
      seen.add(key);
      return { data: fresh ? [row] : [], error: null };
    });
    setStoreClient(client);
    expect(await claimAction('h1', 'docs_nudge', '2026-10-11')).toBe(true);
    expect(await claimAction('h1', 'docs_nudge', '2026-10-11')).toBe(false);
    expect(await claimAction('h1', 'docs_nudge', '2026-10-12')).toBe(true);
  });
});

describe('errors', () => {
  it('prefixes errors with [store] <fn>', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'boom' } }));
    setStoreClient(client);
    await expect(upsertHousehold(h)).rejects.toThrow('[store] upsertHousehold: boom');
    await expect(getHousehold('h1')).rejects.toThrow('[store] getHousehold: boom');
    await expect(markProcessed('x')).rejects.toThrow('[store] markProcessed: boom');
  });
});

describe('reads', () => {
  it('getMessages returns oldest first', async () => {
    const { client, log } = fakeClient(() => ({
      data: [
        { role: 'assistant', content: 'third', created_at: '2026-10-11T10:02:00+00:00' },
        { role: 'user', content: 'second', created_at: '2026-10-11T10:01:00+00:00' },
        { role: 'user', content: 'first', created_at: '2026-10-11T10:00:00+00:00' },
      ],
      error: null,
    }));
    setStoreClient(client);
    const msgs = await getMessages('h1', 3);
    expect(msgs.map((m) => m.content)).toEqual(['first', 'second', 'third']);
    expect(msgs[0]!.at).toBe('2026-10-11T10:00:00.000Z');
    expect(log[0]!.ops.some((o) => o.method === 'limit' && o.args[0] === 3)).toBe(true);
  });
  it('listHouseholds filters by org and orders by updated_at desc, limit 200', async () => {
    const { client, log } = fakeClient(() => ({ data: [householdToRow(h)], error: null }));
    setStoreClient(client);
    expect(await listHouseholds('o1')).toEqual([h]);
    const ops = log[0]!.ops;
    expect(ops).toContainEqual({ method: 'eq', args: ['org_id', 'o1'] });
    expect(ops).toContainEqual({ method: 'order', args: ['updated_at', { ascending: false }] });
    expect(ops).toContainEqual({ method: 'limit', args: [200] });
  });
  it('getTimeline maps to ISO timestamps', async () => {
    const { client } = fakeClient(() => ({ data: [{ label: 'Screened', at: '2026-10-11T10:00:00+00:00' }], error: null }));
    setStoreClient(client);
    expect(await getTimeline('h1')).toEqual([{ label: 'Screened', at: '2026-10-11T10:00:00.000Z' }]);
  });
});

describe('writes', () => {
  it('saveCall upserts on dial_id and keeps unset fields out of the row', async () => {
    const { client, log } = fakeClient(() => ({ data: null, error: null }));
    setStoreClient(client);
    await saveCall({ dialId: 'd1', householdId: 'h1', purpose: 'status_check' });
    const up = log[0]!.ops.find((o) => o.method === 'upsert')!;
    expect(up.args[0]).toEqual({ dial_id: 'd1', household_id: 'h1', purpose: 'status_check' });
    expect(up.args[1]).toEqual({ onConflict: 'dial_id' });
  });
  it('addTimeline converts unix seconds to ISO', async () => {
    const { client, log } = fakeClient(() => ({ data: null, error: null }));
    setStoreClient(client);
    await addTimeline('h1', 'Call placed', 1_760_000_000);
    const row = log[0]!.ops.find((o) => o.method === 'insert')!.args[0] as { at: string };
    expect(row.at).toBe(new Date(1_760_000_000_000).toISOString());
  });
});
