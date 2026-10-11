import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;
export function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map(r => ({ ...r }));
  const signed: string[] = [];
  const builder = (name: string) => {
    const rows = (tables[name] ??= []);
    let op: 'select' | 'insert' | 'update' = 'select';
    let patch: Row = {};
    const filters: Array<(r: Row) => boolean> = [];
    const run = () => {
      const hit = rows.filter(r => filters.every(f => f(r)));
      if (op === 'insert') { const r = { id: `id${rows.length + 1}`, created_at: new Date().toISOString(), ...patch }; rows.push(r); return [r]; }
      if (op === 'update') { hit.forEach(r => Object.assign(r, patch)); return hit; }
      return hit;
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: Row) => { op = 'insert'; patch = p; return b; },
      update: (p: Row) => { op = 'update'; patch = p; return b; },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b; },
      is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return b; },
      order: () => b,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
    };
    return b;
  };
  const client = {
    from: builder,
    storage: { from: () => ({ createSignedUrl: async (p: string, ttl: number) => { signed.push(`${p}:${ttl}`); return { data: { signedUrl: `https://signed.example/${p}` }, error: null }; } }) },
  } as unknown as SupabaseClient;
  return { client, tables, signed };
}
