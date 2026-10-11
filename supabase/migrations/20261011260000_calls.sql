-- Scripted county calls (user-editable questions, transcript, extracted answers).
create table if not exists public.scripted_calls (
  id uuid primary key,
  household_id uuid not null,
  workflow_id uuid references public.workflows(id) on delete set null,
  dial_call_id text,
  status text not null check (status in ('queued', 'ringing', 'in_progress', 'completed', 'failed', 'simulated')),
  simulated boolean not null default false,
  script jsonb not null,
  transcript text,
  answers jsonb,
  summary text,
  outcome text,
  error text,
  trigger text not null default 'manual' check (trigger in ('manual', 'email', 'sms')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scripted_calls_workflow_idx on public.scripted_calls (workflow_id, created_at desc);
create index if not exists scripted_calls_household_idx on public.scripted_calls (household_id, created_at desc);
-- Server-only (service role). No policies: anon/authenticated clients get nothing.
alter table public.scripted_calls enable row level security;
