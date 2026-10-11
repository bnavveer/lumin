-- Demo org (matches DEMO_ORG_ID in src/supabase.ts)
insert into public.orgs (id, name)
values ('00000000-0000-4000-8000-00000000a1d0', 'Mission Neighborhood Health Center (Demo)')
on conflict (id) do nothing;

-- Link a staff user (create the user first in Supabase Auth -> Users), then run:
-- insert into public.staff (user_id, org_id, role)
-- values ('<AUTH_USER_UUID>', '00000000-0000-4000-8000-00000000a1d0', 'caseworker')
-- on conflict (user_id) do update set org_id = excluded.org_id, role = excluded.role;
