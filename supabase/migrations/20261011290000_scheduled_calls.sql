-- Scheduled county calls ("call the county tomorrow at 10am and ask X"). Started by the 15s loop in src/calls/scheduleLive.ts.
create table if not exists public.scheduled_calls (
  id uuid primary key,
  household_id uuid not null,
  workflow_id uuid references public.workflows(id) on delete set null,
  run_at timestamptz not null,
  script jsonb not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'done', 'canceled', 'failed')),
  call_id uuid references public.scripted_calls(id) on delete set null,
  source text not null default 'chat' check (source in ('chat', 'sms', 'web')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_calls_due_idx on public.scheduled_calls (run_at) where status = 'scheduled';
create index if not exists scheduled_calls_workflow_idx on public.scheduled_calls (workflow_id, run_at desc);
create index if not exists scheduled_calls_household_idx on public.scheduled_calls (household_id, run_at desc);
-- Server-only (service role). No policies: anon/authenticated clients get nothing.
alter table public.scheduled_calls enable row level security;
