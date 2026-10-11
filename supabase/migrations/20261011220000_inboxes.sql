-- Per-case AgentMail inboxes (authorized-representative contact address) and inbound county emails.
create table if not exists public.case_inboxes (
  household_id uuid primary key references public.households(id) on delete cascade,
  inbox_id text unique,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.inbound_emails (
  id text primary key,
  household_id uuid references public.households(id) on delete cascade,
  from_addr text,
  subject text,
  received_at timestamptz,
  category text,
  extracted jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inbound_emails_household_idx on public.inbound_emails (household_id, received_at desc);

alter table public.case_inboxes enable row level security;
alter table public.inbound_emails enable row level security;

drop policy if exists case_inboxes_select_org on public.case_inboxes;
create policy case_inboxes_select_org on public.case_inboxes for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));

drop policy if exists inbound_emails_select_org on public.inbound_emails;
create policy inbound_emails_select_org on public.inbound_emails for select to authenticated
  using (household_id in (select id from public.households where org_id = public.my_org_id()));
