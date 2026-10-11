# Aid: Supabase setup

## Apply the schema
- Supabase MCP: `apply_migration` with `migrations/20261011190000_init.sql` (name `init`), then run `seed.sql` via `execute_sql`.
- Or SQL Editor: paste both files in order (migration, then seed).
- Or CLI: `supabase db push` then `psql < supabase/seed.sql`.

The migration is idempotent (`if not exists`, `drop policy if exists`, guarded realtime adds).

## First staff user
1. Dashboard -> Authentication -> Users -> Add user (email + password, auto-confirm).
2. Copy the user's UUID and run the commented `insert into public.staff ...` from `seed.sql` with that UUID.
3. Sign in on the dashboard; the server verifies the Bearer token and looks up the staff row.

## Security model
- Server uses the service role (`SUPABASE_SECRET_KEY`), which bypasses RLS. Never ship it to the browser.
- Authenticated staff get SELECT only, scoped to their org via `public.my_org_id()`. No insert/update/delete policies.
- `processed_events` and `action_claims` have RLS enabled with no policies (service role only).
- Storage bucket `documents` is private; path `${org_id}/${household_id}/${document_id}.${ext}`. Staff read via signed URLs or org-scoped select.
