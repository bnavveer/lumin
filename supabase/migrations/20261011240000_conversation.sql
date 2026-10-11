-- Aid: text-first case management (src/conversation/*). Idempotent.
-- The server uses the service role; clinic staff get read-only access scoped to their org.

-- Clinic join codes: "JOIN AID" by text attaches a household to the clinic.
alter table public.orgs add column if not exists join_code text;
create unique index if not exists orgs_join_code_key on public.orgs (upper(join_code));
update public.orgs set join_code = 'AID'
  where id = '00000000-0000-4000-8000-00000000a1d0' and join_code is null;

-- One row per household: where the text conversation is.
create table if not exists public.conversation_state (
  household_id uuid primary key references public.households on delete cascade,
  stage text not null default 'new'
    check (stage in ('new','awaiting_consent','screening','active','opted_out')),
  language text not null default 'en',
  language_locked boolean not null default false,
  channel text,
  pending_context jsonb not null default '{}',
  last_nudge_kind text,
  quiet_hours jsonb not null default '{"start":"20:00","end":"08:00","tz":"America/Los_Angeles"}',
  updated_at timestamptz not null default now()
);

-- Consent records: exact wording + timestamp (TCPA evidence).
create table if not exists public.consents (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households on delete cascade,
  kind text not null check (kind in ('sms_contact','opt_out','opt_in')),
  wording text not null,
  reply text,
  channel text,
  created_at timestamptz not null default now()
);

-- Human-in-the-loop approvals: Aid proposes, the person (or staff) says YES.
create table if not exists public.pending_approvals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  kind text not null,
  description text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending'
    check (status in ('pending','approved','declined','expired')),
  resolved_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists consents_household_id_idx on public.consents (household_id, created_at);
create index if not exists pending_approvals_household_idx on public.pending_approvals (household_id, status, created_at desc);

drop trigger if exists conversation_state_set_updated_at on public.conversation_state;
create trigger conversation_state_set_updated_at before update on public.conversation_state
  for each row execute function public.set_updated_at();

alter table public.conversation_state enable row level security;
alter table public.consents enable row level security;
alter table public.pending_approvals enable row level security;

drop policy if exists conversation_state_select_org on public.conversation_state;
create policy conversation_state_select_org on public.conversation_state for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

drop policy if exists consents_select_org on public.consents;
create policy consents_select_org on public.consents for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

drop policy if exists pending_approvals_select_org on public.pending_approvals;
create policy pending_approvals_select_org on public.pending_approvals for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pending_approvals'
  ) then
    alter publication supabase_realtime add table public.pending_approvals;
  end if;
end $$;
