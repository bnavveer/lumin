-- Aid: cross-channel intake. Text, phone calls and web chat all write to the same intake, keyed by phone.
-- Nothing reaches public.households until the person confirms it by replying YES to a text summary.

-- One row per conversation that is collecting someone's info.
--   id = household id (uuidv5 of the phone) for text and phone-call intakes, the phone itself being proof of identity;
--   id = 'web:<session uuid>' for a web chat session that hasn't been confirmed by text yet.
create table if not exists public.intakes (
  id text primary key,
  channel text not null check (channel in ('sms','voice','web')),
  phone text,                                   -- E.164; null for a web session until they give it
  household_id uuid,                            -- set once the phone owner confirms (links a web session to the case)
  fields jsonb not null default '{}'::jsonb,    -- working copy of the household profile, partial until complete
  status text not null default 'collecting'
    check (status in ('collecting','awaiting_confirmation','confirmed','rejected','superseded')),
  confirmation_requested_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The agent's memory, shared by every channel. thread = household id, or 'web:<session uuid>' before linking.
-- public.messages (dashboard) can't hold these: it requires a confirmed household row.
create table if not exists public.conversation_messages (
  id bigint generated always as identity primary key,
  thread text not null,
  channel text not null check (channel in ('sms','voice','web','system')),
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists intakes_phone_status_idx on public.intakes (phone, status, confirmation_requested_at desc);
create index if not exists conversation_messages_thread_idx on public.conversation_messages (thread, id);

drop trigger if exists intakes_set_updated_at on public.intakes;
create trigger intakes_set_updated_at before update on public.intakes
  for each row execute function public.set_updated_at();

-- Service role only (no policies): these hold unconfirmed, unscoped data.
alter table public.intakes enable row level security;
alter table public.conversation_messages enable row level security;
