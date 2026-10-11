-- Aid: applicant accounts (Supabase Auth email/password) and application workflows. Idempotent.
-- Writes come from the server (service role) only; signed-in applicants may read their own rows.

create table if not exists public.applicant_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  household_id uuid references public.households on delete set null,
  phone text,
  first_name text,
  created_at timestamptz not null default now()
);
alter table public.applicant_accounts enable row level security;
drop policy if exists applicant_accounts_select_own on public.applicant_accounts;
create policy applicant_accounts_select_own on public.applicant_accounts for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  household_id uuid not null references public.households on delete cascade,
  programs text[] not null default '{}',
  status text not null default 'researching' check (status in
    ('researching','needs_documents','ready_to_fill','filling','awaiting_signature',
     'submitted','following_up','done','needs_attention')),
  live_view_url text,
  chat_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_user_id_idx on public.workflows (user_id, updated_at desc);
alter table public.workflows enable row level security;
drop policy if exists workflows_select_own on public.workflows;
create policy workflows_select_own on public.workflows for select to authenticated
  using (user_id = auth.uid());

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows on delete cascade,
  ord int not null,
  kind text not null check (kind in ('research','documents','fill','sign','submit','call','notify','follow_up')),
  program text,
  title text not null,
  status text not null default 'pending' check (status in ('pending','running','waiting_on_you','done','failed','skipped')),
  summary text not null default '',
  meta jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists workflow_steps_workflow_id_idx on public.workflow_steps (workflow_id, ord);
alter table public.workflow_steps enable row level security;
drop policy if exists workflow_steps_select_own on public.workflow_steps;
create policy workflow_steps_select_own on public.workflow_steps for select to authenticated
  using (workflow_id in (select id from public.workflows where user_id = auth.uid()));

create table if not exists public.workflow_evidence (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.workflow_steps on delete cascade,
  kind text not null check (kind in ('citation','document','live_view','replay','screenshot','call_transcript',
    'message','confirmation','keewano_event')),
  title text not null,
  url text check (url is null or url ~ '^https?://'),
  detail text,
  source text,
  at timestamptz not null default now()
);
create index if not exists workflow_evidence_step_id_idx on public.workflow_evidence (step_id, at);
alter table public.workflow_evidence enable row level security;
drop policy if exists workflow_evidence_select_own on public.workflow_evidence;
create policy workflow_evidence_select_own on public.workflow_evidence for select to authenticated
  using (step_id in (select s.id from public.workflow_steps s join public.workflows w on w.id = s.workflow_id
                     where w.user_id = auth.uid()));
