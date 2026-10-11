-- Applicant accounts do not create fictitious households. Typed contact phone is not ownership proof.
create table if not exists public.applicant_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  household_id uuid unique references public.households on delete set null,
  first_name text,
  phone text,
  screening_answers jsonb not null default '{}'::jsonb,
  screening_answers_initialized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.applicant_profiles add column if not exists screening_answers_initialized boolean not null default false;
create table if not exists public.applicant_chat_claims (
  session_id uuid primary key,
  user_id uuid not null references public.applicant_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists applicant_chat_claims_user_idx on public.applicant_chat_claims(user_id, created_at desc);
create table if not exists public.applicant_workflows (
  id uuid primary key,
  user_id uuid not null references public.applicant_profiles(user_id) on delete cascade,
  household_id uuid references public.households on delete set null,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applicant_workflows_state_id check ((state->>'id')::uuid = id)
);
create index if not exists applicant_workflows_user_idx on public.applicant_workflows(user_id, updated_at desc);
create table if not exists public.applicant_documents (
  id uuid primary key,
  user_id uuid not null references public.applicant_profiles(user_id) on delete cascade,
  workflow_id uuid references public.applicant_workflows on delete set null,
  doc_type text not null check (doc_type in ('id','paystub','lease','ssn_card','birth_cert','immigration','other')),
  file_name text not null,
  storage_path text not null unique,
  content_type text not null check (content_type in ('application/pdf','image/jpeg','image/png','image/webp','image/gif')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);
create index if not exists applicant_documents_user_idx on public.applicant_documents(user_id, created_at desc);
create table if not exists public.applicant_storage_deletions (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists applicant_storage_deletions_user_idx on public.applicant_storage_deletions(user_id);
create table if not exists public.applicant_workflow_events (
  id bigint generated always as identity primary key,
  workflow_id uuid not null references public.applicant_workflows on delete cascade,
  user_id uuid not null references public.applicant_profiles(user_id) on delete cascade,
  version integer not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists applicant_workflow_events_workflow_idx on public.applicant_workflow_events(workflow_id, id);

drop trigger if exists applicant_profiles_updated_at on public.applicant_profiles;
create trigger applicant_profiles_updated_at before update on public.applicant_profiles for each row execute function public.set_updated_at();
drop trigger if exists applicant_workflows_updated_at on public.applicant_workflows;
create trigger applicant_workflows_updated_at before update on public.applicant_workflows for each row execute function public.set_updated_at();

-- Called only by the service role after token validation. Owning a random session UUID is the
-- same capability used by chat itself; it binds to one account. Household promotion additionally
-- requires that exact web intake to have been confirmed by YES from its phone through Dial.
create or replace function public.promote_applicant_chat(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare confirmed_household uuid; current_household uuid;
begin
  select household_id into current_household from public.applicant_profiles where user_id = p_user_id for update;
  select i.household_id into confirmed_household
    from public.applicant_chat_claims c
    join public.intakes i on i.id = 'web:' || c.session_id::text
    join public.households h on h.id = i.household_id and h.phone = i.phone
    where c.user_id = p_user_id and i.channel = 'web'
      and i.status = 'confirmed' and i.confirmed_at is not null
      and (current_household is null or i.household_id = current_household)
    order by c.created_at desc limit 1;
  if confirmed_household is null then return; end if;
  if exists(select 1 from public.applicant_profiles where household_id = confirmed_household and user_id <> p_user_id) then return; end if;
  begin
    update public.applicant_profiles set household_id = confirmed_household
      where user_id = p_user_id and (household_id is null or household_id = confirmed_household);
  exception when unique_violation then return;
  end;
  -- Connect applicant uploads to the verified household vault for authorized case management.
  insert into public.documents (id, household_id, doc_type, storage_path, content_type, size_bytes, created_at)
    select d.id, confirmed_household, d.doc_type, d.storage_path, d.content_type, d.size_bytes, d.created_at
    from public.applicant_documents d join public.applicant_profiles p on p.user_id = d.user_id
    where d.user_id = p_user_id and p.household_id = confirmed_household
    on conflict (id) do nothing;
  -- Preparations begun before phone verification become visible to the same household's staff.
  update public.applicant_workflows
    set household_id = confirmed_household,
        state = jsonb_set(jsonb_set(state, '{householdId}', to_jsonb(confirmed_household::text)),
          '{updatedAt}', to_jsonb(now())),
        version = version + 1
    where user_id = p_user_id and household_id is null;
end $$;

create or replace function public.claim_applicant_chat(p_user_id uuid, p_session_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare session_owner uuid; intake_household uuid; current_household uuid;
begin
  select household_id into current_household from public.applicant_profiles where user_id = p_user_id for update;
  if not found then return 'not_found'; end if;
  perform 1 from public.intakes where id = 'web:' || p_session_id::text and channel = 'web';
  if not found then return 'not_found'; end if;
  select household_id into intake_household from public.intakes
    where id = 'web:' || p_session_id::text and status = 'confirmed' and confirmed_at is not null;
  if current_household is not null and intake_household is not null and current_household <> intake_household then return 'conflict'; end if;
  if exists(select 1 from public.applicant_profiles where household_id = intake_household and user_id <> p_user_id) then return 'conflict'; end if;
  insert into public.applicant_chat_claims(session_id, user_id) values (p_session_id, p_user_id)
    on conflict (session_id) do nothing;
  select user_id into session_owner from public.applicant_chat_claims where session_id = p_session_id;
  if session_owner <> p_user_id then return 'conflict'; end if;
  perform public.promote_applicant_chat(p_user_id);
  return 'ok';
end $$;
revoke all on function public.claim_applicant_chat(uuid,uuid) from public, anon, authenticated;
revoke all on function public.promote_applicant_chat(uuid) from public, anon, authenticated;
grant execute on function public.claim_applicant_chat(uuid,uuid) to service_role;
grant execute on function public.promote_applicant_chat(uuid) to service_role;

create or replace function public.applicant_document_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owned_household uuid;
begin
  if TG_OP = 'DELETE' then
    delete from public.documents where id = old.id and storage_path = old.storage_path;
    return old;
  end if;
  if new.workflow_id is not null and not exists(select 1 from public.applicant_workflows where id = new.workflow_id and user_id = new.user_id) then
    raise exception 'Document workflow ownership mismatch';
  end if;
  -- Serialize quota checks across concurrent uploads for the same account.
  perform 1 from public.applicant_profiles where user_id = new.user_id for update;
  if (select count(*) from public.applicant_documents where user_id = new.user_id) >= 100
     or (select coalesce(sum(size_bytes),0) from public.applicant_documents where user_id = new.user_id) + new.size_bytes > 104857600 then
    raise exception 'Applicant vault quota exceeded';
  end if;
  select household_id into owned_household from public.applicant_profiles where user_id = new.user_id;
  if owned_household is not null then
    insert into public.documents(id, household_id, doc_type, storage_path, content_type, size_bytes, created_at)
      values(new.id, owned_household, new.doc_type, new.storage_path, new.content_type, new.size_bytes, new.created_at);
  end if;
  return new;
end $$;
drop trigger if exists applicant_documents_sync on public.applicant_documents;
create trigger applicant_documents_sync before insert or delete on public.applicant_documents
  for each row execute function public.applicant_document_sync();

-- Metadata and the household mirror are removed atomically. Object deletion is retried by the
-- server from this durable queue if private Storage is temporarily unavailable.
create or replace function public.delete_applicant_document(p_user_id uuid, p_document_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare object_path text;
begin
  select storage_path into object_path from public.applicant_documents
    where id = p_document_id and user_id = p_user_id for update;
  if not found then return null; end if;
  insert into public.applicant_storage_deletions(id, user_id, storage_path)
    values(p_document_id, p_user_id, object_path) on conflict(id) do nothing;
  delete from public.applicant_documents where id = p_document_id and user_id = p_user_id;
  return object_path;
end $$;
revoke all on function public.delete_applicant_document(uuid,uuid) from public, anon, authenticated;
grant execute on function public.delete_applicant_document(uuid,uuid) to service_role;

create or replace function public.record_applicant_workflow_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.household_id is not null and not exists(select 1 from public.applicant_profiles where user_id = new.user_id and household_id = new.household_id) then
    raise exception 'Workflow household ownership mismatch';
  end if;
  insert into public.applicant_workflow_events(workflow_id, user_id, version, state)
    values(new.id, new.user_id, new.version, new.state);
  return new;
end $$;
drop trigger if exists applicant_workflow_audit on public.applicant_workflows;
create trigger applicant_workflow_audit after insert or update on public.applicant_workflows
  for each row execute function public.record_applicant_workflow_event();

alter table public.applicant_profiles enable row level security;
alter table public.applicant_chat_claims enable row level security;
alter table public.applicant_workflows enable row level security;
alter table public.applicant_documents enable row level security;
alter table public.applicant_storage_deletions enable row level security;
alter table public.applicant_workflow_events enable row level security;
-- Browser access is read-only. Mutations must use authenticated routes with strict transition validation.
drop policy if exists applicant_profiles_read_own on public.applicant_profiles;
create policy applicant_profiles_read_own on public.applicant_profiles for select to authenticated using(user_id = (select auth.uid()));
drop policy if exists applicant_workflows_read_own on public.applicant_workflows;
create policy applicant_workflows_read_own on public.applicant_workflows for select to authenticated using(user_id = (select auth.uid()));
drop policy if exists applicant_documents_read_own on public.applicant_documents;
create policy applicant_documents_read_own on public.applicant_documents for select to authenticated using(user_id = (select auth.uid()));
drop policy if exists applicant_workflow_events_read_own on public.applicant_workflow_events;
create policy applicant_workflow_events_read_own on public.applicant_workflow_events for select to authenticated using(user_id = (select auth.uid()));
-- Claims remain service-role only; no browser policy. Storage remains private. Download routes
-- authorize each document and return a short-lived signed URL rather than a public object URL.
