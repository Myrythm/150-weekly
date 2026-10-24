-- Weekly 150 web: accounts, per-user data, attempts log, sign-up trigger, RLS and RPCs.
--
-- Privileges are granted explicitly (revoke all, then grant what is needed) so the result
-- does not depend on Supabase's default privileges or on auto_expose_new_tables.

-- ============================================================== tables

create table public.profiles (
  username text primary key
    constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  user_id uuid unique not null references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_length check (
      display_name = btrim(display_name) and char_length(display_name) between 1 and 40
    ),
  created_at timestamptz not null default now()
);

-- One global sequence for user_data versions (inserts and updates), so a version is never
-- reused for a user and key, even after the row is deleted and inserted again.
create sequence public.user_data_version_seq as bigint;

create table public.user_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null
    constraint user_data_key_allowed check (
      key in ('w150.meta', 'w150.sessions', 'w150.plan', 'w150.prefs', 'w150.breaks', 'w150.tracks')
    ),
  value jsonb not null,
  version bigint not null default nextval('public.user_data_version_seq'),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Used by the auth-login and auth-recover Edge Functions (service role only) for rate limiting.
create table public.auth_attempts (
  id bigserial primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index auth_attempts_bucket_created_at_idx on public.auth_attempts (bucket, created_at);

-- ============================================================== privileges

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.user_data from public, anon, authenticated;
revoke all on table public.auth_attempts from public, anon, authenticated;
revoke all on sequence public.auth_attempts_id_seq from public, anon, authenticated;
revoke all on sequence public.user_data_version_seq from public, anon, authenticated;

-- Profiles: read own row, change only the display name. Inserts come from the trigger.
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select, insert, update, delete on table public.user_data to authenticated;
-- put_user_data runs as the caller and takes each new version from this sequence.
grant usage on sequence public.user_data_version_seq to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.user_data to service_role;
grant all on table public.auth_attempts to service_role;
grant all on sequence public.auth_attempts_id_seq to service_role;
grant all on sequence public.user_data_version_seq to service_role;

-- ============================================================== RLS

alter table public.profiles enable row level security;
alter table public.user_data enable row level security;
alter table public.auth_attempts enable row level security;
-- auth_attempts has no policies on purpose: only the service role (bypasses RLS) uses it.

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_data_select_own on public.user_data
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_data_insert_own on public.user_data
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_data_update_own on public.user_data
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_data_delete_own on public.user_data
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================== updated_at trigger

create function public.user_data_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.user_data_set_updated_at() from public, anon, authenticated;

create trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute function public.user_data_set_updated_at();

-- ============================================================== sign-up trigger

-- Creates the profile and the initial w150.prefs row from the sign-up metadata
-- (username, display_name, age). Any invalid value aborts the sign-up.
-- Age may arrive as a string ("34") or as a whole JSON number (34).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text;
  v_display_name text;
  v_age_raw jsonb := meta -> 'age';
  v_age_num numeric;
  v_age integer;
begin
  -- Username
  if jsonb_typeof(meta -> 'username') is distinct from 'string' then
    raise exception 'Username is required.' using errcode = '22023';
  end if;
  v_username := lower(btrim(meta ->> 'username'));
  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3 to 20 characters: lowercase letters, digits or underscore.'
      using errcode = '22023';
  end if;

  -- Display name
  if jsonb_typeof(meta -> 'display_name') is distinct from 'string' then
    raise exception 'Display name is required.' using errcode = '22023';
  end if;
  v_display_name := btrim(meta ->> 'display_name');
  if char_length(v_display_name) not between 1 and 40 then
    raise exception 'Display name must be 1 to 40 characters.' using errcode = '22023';
  end if;

  -- Age: whole number 0 to 120
  if jsonb_typeof(v_age_raw) = 'string' then
    if btrim(v_age_raw #>> '{}') !~ '^[0-9]{1,3}$' then
      raise exception 'Age must be a whole number from 0 to 120.' using errcode = '22023';
    end if;
    v_age_num := btrim(v_age_raw #>> '{}')::numeric;
  elsif jsonb_typeof(v_age_raw) = 'number' then
    v_age_num := (v_age_raw #>> '{}')::numeric;
    if v_age_num <> trunc(v_age_num) then
      raise exception 'Age must be a whole number from 0 to 120.' using errcode = '22023';
    end if;
  else
    raise exception 'Age is required.' using errcode = '22023';
  end if;
  if v_age_num not between 0 and 120 then
    raise exception 'Age must be a whole number from 0 to 120.' using errcode = '22023';
  end if;
  v_age := v_age_num::integer;

  -- Username taken (the primary key also guards against a concurrent sign-up)
  if exists (select 1 from public.profiles p where p.username = v_username) then
    raise exception 'Username is already taken.' using errcode = '23505';
  end if;

  begin
    insert into public.profiles (username, user_id, display_name)
    values (v_username, new.id, v_display_name);
  exception when unique_violation then
    raise exception 'Username is already taken.' using errcode = '23505';
  end;

  insert into public.user_data (user_id, key, value)
  values (new.id, 'w150.prefs', jsonb_build_object('age', v_age));

  return new;
end;
$$;

-- Only the trigger may run it; never reachable through the Data API.
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================== RPC: username_available

-- Reveals only whether a username is valid and free, never any other profile data.
create function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$', false)
    and not exists (
      select 1 from public.profiles p where p.username = lower(btrim(p_username))
    );
$$;

revoke all on function public.username_available(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated, service_role;

-- ============================================================== RPC: put_user_data

-- Compare-and-set write of one storage key for the calling user.
-- p_expected_version null: insert, the row must not exist yet.
-- Otherwise: update only if the stored version equals p_expected_version.
-- Every successful write takes a new version from user_data_version_seq: versions are only
-- compared for equality and never come back after a delete (no ABA).
-- On success ok = true with the new version and value. On conflict ok = false with the
-- current server version and value (both null when the row does not exist).
-- Security invoker: RLS applies and the row is always the caller's (auth.uid()).
create function public.put_user_data(p_key text, p_value jsonb, p_expected_version bigint)
returns table (ok boolean, version bigint, value jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_version bigint;
  v_value jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;
  if p_key is null
     or p_key not in ('w150.meta', 'w150.sessions', 'w150.plan', 'w150.prefs', 'w150.breaks', 'w150.tracks') then
    raise exception 'Key % is not allowed.', coalesce(p_key, 'null') using errcode = '23514';
  end if;
  -- supabase-js sends a JSON null argument as SQL NULL; store it as JSON null.
  p_value := coalesce(p_value, 'null'::jsonb);

  if p_expected_version is null then
    insert into public.user_data as d (user_id, key, value, version)
    values (v_uid, p_key, p_value, nextval('public.user_data_version_seq'))
    on conflict (user_id, key) do nothing
    returning d.version, d.value into v_version, v_value;
  else
    update public.user_data as d
    set value = p_value, version = nextval('public.user_data_version_seq')
    where d.user_id = v_uid and d.key = p_key and d.version = p_expected_version
    returning d.version, d.value into v_version, v_value;
  end if;

  if v_version is not null then
    return query select true, v_version, v_value;
    return;
  end if;

  select d.version, d.value into v_version, v_value
  from public.user_data d
  where d.user_id = v_uid and d.key = p_key;

  return query select false, v_version, v_value;
end;
$$;

revoke all on function public.put_user_data(text, jsonb, bigint) from public, anon, authenticated, service_role;
grant execute on function public.put_user_data(text, jsonb, bigint) to authenticated;
