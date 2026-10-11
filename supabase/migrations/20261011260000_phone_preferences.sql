-- STOP must persist before an intake becomes a household. Server-only phone preferences.
create table if not exists public.phone_messaging_preferences (
  phone text primary key check (phone ~ '^[+]1[0-9]{10}$'),
  opted_out boolean not null default false,
  last_reply text not null,
  updated_at timestamptz not null default now()
);
alter table public.phone_messaging_preferences enable row level security;
