-- Knowledge base: chunks of research/*.md with embeddings (qwen3-embedding-0-6b, 1024 dims).
create extension if not exists vector;

create table if not exists knowledge_chunks (
  id bigint generated always as identity primary key,
  source_file text not null,
  heading text not null default '',
  content text not null,
  source_urls text[] not null default '{}',
  embedding vector(1024) not null,
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists knowledge_chunks_source_idx on knowledge_chunks (source_file);

-- Server only: RLS on with no policies (service role bypasses).
alter table knowledge_chunks enable row level security;

create or replace function match_knowledge(query_embedding vector(1024), match_count int default 6)
returns table (
  id bigint,
  source_file text,
  heading text,
  content text,
  source_urls text[],
  similarity float
)
language sql stable
as $$
  select k.id, k.source_file, k.heading, k.content, k.source_urls,
         (1 - (k.embedding <=> query_embedding))::float as similarity
  from knowledge_chunks k
  order by k.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

revoke all on function match_knowledge(vector, int) from public, anon, authenticated;
