-- Aid: per-household document vault. Idempotent.
alter table public.documents add column if not exists status text not null default 'received';
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents add constraint documents_status_check check (status in
  ('requested','received','reading','read','needs_review','rejected','uploaded_to_application'));
alter table public.documents add column if not exists extracted jsonb;
alter table public.documents add column if not exists extract_provider text;
alter table public.documents add column if not exists extract_session text;
alter table public.documents add column if not exists doc_date date;
alter table public.documents add column if not exists expires_at date;
alter table public.documents add column if not exists size_bytes int;
alter table public.documents add column if not exists compressed_path text;
alter table public.documents add column if not exists reused_for text[] default '{}';

create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  doc_type text not null,
  reason text,
  requested_at timestamptz not null default now(),
  fulfilled_document_id uuid references public.documents on delete set null
);
create index if not exists document_requests_household_id_idx on public.document_requests (household_id);
create index if not exists document_requests_fulfilled_idx on public.document_requests (fulfilled_document_id);
create index if not exists documents_status_idx on public.documents (status) where status = 'reading';

alter table public.document_requests enable row level security;
drop policy if exists document_requests_select_org on public.document_requests;
create policy document_requests_select_org on public.document_requests for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));
