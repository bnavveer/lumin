// Wipe-and-reload index of research/*.md into knowledge_chunks. Run: npx tsx scripts/index-research.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { chunkMarkdown, embed, EMBED_DIM } from '../src/knowledge.js';
import { env } from '../src/env.js';

const DIR = resolve(import.meta.dirname, '../research');
const BATCH = 32;

const files = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort(); // skips *.json catalogs, PDFs, subdirs
const rows: Array<{ file: string; heading: string; content: string; urls: string[] }> = [];
for (const f of files) {
  const chunks = chunkMarkdown(readFileSync(join(DIR, f), 'utf8'));
  for (const c of chunks) rows.push({ file: f, heading: c.heading, content: c.content, urls: c.sourceUrls });
  console.log(`${f}: ${chunks.length} chunks`);
}

const vectors: number[][] = [];
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const out = await embed(batch.map((r) => `${r.file} > ${r.heading}\n${r.content}`));
  if (out.length !== batch.length || out.some((v) => v.length !== EMBED_DIM)) throw new Error('unexpected embedding shape');
  vectors.push(...out);
  process.stdout.write(`embedded ${vectors.length}/${rows.length}\r`);
}
console.log();

const db = new pg.Client({
  host: 'aws-1-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.slqgkzkkgfwcrrwokdhj',
  password: env('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await db.connect();
try {
  await db.query('begin');
  await db.query('delete from knowledge_chunks');
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    await db.query(
      'insert into knowledge_chunks (source_file, heading, content, source_urls, embedding) values ($1,$2,$3,$4,$5::vector)',
      [r.file, r.heading, r.content, r.urls, `[${vectors[i]!.join(',')}]`],
    );
  }
  await db.query('commit');
} catch (e) {
  await db.query('rollback');
  throw e;
} finally {
  await db.end();
}
console.log(`indexed ${rows.length} chunks from ${files.length} files (dim ${EMBED_DIM}), ${rows.filter((r) => r.urls.length).length} with source URLs`);
