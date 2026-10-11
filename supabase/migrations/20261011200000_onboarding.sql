-- Aid: self-serve clinic onboarding. Idempotent.
--
-- orgs.settings shape (validated server-side by OrgSettingsSchema in src/onboarding.ts):
--   {
--     "autopilot": {
--       "enabled": boolean,
--       "quietHours": { "start": "20:00", "end": "08:00" },
--       "nudges": { "interview_nudge": bool, "docs_nudge": bool, "submit": bool,
--                   "waitlist_check": bool, "renewal_start": bool }
--     },
--     "programs": Program[],            -- programs to screen for
--     "escalateAfterNoAnswers": number  -- hand off to a human after N unanswered calls
--   }

alter table public.orgs add column if not exists county text default 'los_angeles';
alter table public.orgs add column if not exists aid_phone text;
alter table public.orgs add column if not exists settings jsonb not null default '{}';
alter table public.orgs add column if not exists created_by uuid;

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.orgs on delete cascade,
  email text not null,
  role text not null default 'caseworker',
  invited_by uuid,
  created_at timestamptz default now(),
  accepted_at timestamptz
);

create index if not exists staff_invites_org_id_idx on public.staff_invites (org_id);

alter table public.staff_invites enable row level security;

drop policy if exists staff_invites_select_org on public.staff_invites;
create policy staff_invites_select_org on public.staff_invites for select to authenticated
  using (org_id = public.my_org_id());
