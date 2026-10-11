-- Aid: initial schema, RLS, storage, realtime. Idempotent where reasonable.
-- The server uses the service role (bypasses RLS); authenticated clinic staff get read-only access scoped to their org.

create extension if not exists pgcrypto;

-- ── Tables ──
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  user_id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references public.orgs,
  role text not null default 'caseworker',
  created_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key,
  org_id uuid not null references public.orgs,
  phone text unique not null,
  first_name text,
  county text not null check (county in ('los_angeles','san_francisco')),
  size int not null check (size > 0),
  monthly_income numeric not null check (monthly_income >= 0),
  children_under18 int not null default 0,
  pregnant boolean not null default false,
  adult_age int,
  immigration_status text not null default 'unknown'
    check (immigration_status in ('citizen','green_card','humanitarian','undocumented','unknown')),
  children_are_citizens boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.calls (
  dial_id text primary key,
  household_id uuid not null references public.households on delete cascade,
  purpose text not null,
  outcome text,
  transcript text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  doc_type text not null,
  storage_path text not null,
  content_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  kind text not null check (kind in ('minimal','full')),
  confirmation text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.timeline (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  label text not null,
  at timestamptz not null default now()
);

create table if not exists public.processed_events (
  event_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.action_claims (
  household_id uuid not null,
  kind text not null,
  day date not null,
  primary key (household_id, kind, day)
);

-- ── Indexes (FKs) ──
create index if not exists staff_org_id_idx on public.staff (org_id);
create index if not exists households_org_id_updated_idx on public.households (org_id, updated_at desc);
create index if not exists messages_household_id_idx on public.messages (household_id, id);
create index if not exists calls_household_id_idx on public.calls (household_id);
create index if not exists documents_household_id_idx on public.documents (household_id);
create index if not exists submissions_household_id_idx on public.submissions (household_id);
create index if not exists timeline_household_id_idx on public.timeline (household_id, at);

-- ── updated_at trigger ──
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at before update on public.households
  for each row execute function public.set_updated_at();

-- ── RLS helper ──
create or replace function public.my_org_id() returns uuid
language sql security definer stable set search_path = '' as $$
  select org_id from public.staff where user_id = (select auth.uid())
$$;
revoke all on function public.my_org_id() from public, anon;
grant execute on function public.my_org_id() to authenticated, service_role;

-- ── RLS ──
alter table public.orgs enable row level security;
alter table public.staff enable row level security;
alter table public.households enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;
alter table public.documents enable row level security;
alter table public.submissions enable row level security;
alter table public.timeline enable row level security;
alter table public.processed_events enable row level security;
alter table public.action_claims enable row level security;

drop policy if exists orgs_select_own on public.orgs;
create policy orgs_select_own on public.orgs for select to authenticated
  using (id = public.my_org_id());

drop policy if exists staff_select_own on public.staff;
create policy staff_select_own on public.staff for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists households_select_org on public.households;
create policy households_select_org on public.households for select to authenticated
  using (org_id = public.my_org_id());

drop policy if exists messages_select_org on public.messages;
create policy messages_select_org on public.messages for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

drop policy if exists calls_select_org on public.calls;
create policy calls_select_org on public.calls for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

drop policy if exists documents_select_org on public.documents;
create policy documents_select_org on public.documents for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

drop policy if exists submissions_select_org on public.submissions;
create policy submissions_select_org on public.submissions for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

drop policy if exists timeline_select_org on public.timeline;
create policy timeline_select_org on public.timeline for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

-- processed_events / action_claims: RLS on, no policies (service role only).

-- ── Storage: private 'documents' bucket ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do nothing;

drop policy if exists documents_objects_select_org on storage.objects;
create policy documents_objects_select_org on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = public.my_org_id()::text);

-- ── Realtime ──
do $$
declare t text;
begin
  foreach t in array array['messages','timeline','calls','submissions','documents'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
