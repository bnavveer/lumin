-- Application details (legal name, date of birth, address, household members, job, rent, interview
-- preference) collected on the account page or by the chat agent. Read by the BenefitsCal filler
-- instead of placeholder values. Contract: shared/applicationDetails.ts.
alter table public.applicant_profiles
  add column if not exists application_details jsonb not null default '{}'::jsonb;
alter table public.applicant_profiles drop constraint if exists applicant_profiles_application_details_object;
alter table public.applicant_profiles add constraint applicant_profiles_application_details_object
  check (jsonb_typeof(application_details) = 'object');

-- Atomic merge so the account page and the chat agent can save at the same time.
-- p_set keys overwrite (or, with p_fill_only, only fill keys the account does not have yet);
-- p_clear keys are removed. Returns the new details, or null when the profile does not exist.
create or replace function public.merge_applicant_application_details(
  p_user_id uuid, p_set jsonb, p_clear text[] default '{}', p_fill_only boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if jsonb_typeof(coalesce(p_set, '{}'::jsonb)) <> 'object' then raise exception 'application details must be an object'; end if;
  update public.applicant_profiles
    set application_details = case
      when p_fill_only then coalesce(p_set, '{}'::jsonb) || application_details
      else (application_details || coalesce(p_set, '{}'::jsonb)) - coalesce(p_clear, '{}'::text[])
    end
    where user_id = p_user_id
    returning application_details into result;
  return result;
end $$;
revoke all on function public.merge_applicant_application_details(uuid, jsonb, text[], boolean) from public, anon, authenticated;
grant execute on function public.merge_applicant_application_details(uuid, jsonb, text[], boolean) to service_role;
