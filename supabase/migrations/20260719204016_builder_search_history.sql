begin;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.canonicalize_builder_search_passives(input_values text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct trim(value) order by trim(value)), '{}'::text[])
  from unnest(coalesce(input_values, '{}'::text[])) as value
  where char_length(trim(value)) between 1 and 160
    and trim(value) ~ '^[A-Za-z0-9_-]+$'
$$;

create or replace function private.builder_search_session_hash(session_token text)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
begin
  if session_token is null or session_token !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid anonymous search session is required.' using errcode = '22023';
  end if;
  return extensions.digest(session_token, 'sha256');
end;
$$;

create table public.builder_search_definitions (
  id bigint generated always as identity primary key,
  target_pal_id text not null check (
    char_length(target_pal_id) between 1 and 80
    and target_pal_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  passive_ids text[] not null default '{}'::text[],
  total_searches bigint not null default 1 check (total_searches > 0),
  first_searched_at timestamptz not null default now(),
  last_searched_at timestamptz not null default now(),
  check (cardinality(passive_ids) between 0 and 4),
  check (passive_ids = private.canonicalize_builder_search_passives(passive_ids)),
  unique (target_pal_id, passive_ids)
);

create table public.builder_search_history (
  id bigint generated always as identity primary key,
  definition_id bigint not null references public.builder_search_definitions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  anonymous_session_hash bytea,
  objective text not null check (objective in ('recommended', 'fewest', 'cleanest')),
  allowed_extra_passives smallint not null check (allowed_extra_passives between 0 and 2),
  search_count bigint not null default 1 check (search_count > 0),
  first_searched_at timestamptz not null default now(),
  last_searched_at timestamptz not null default now(),
  check ((user_id is null) <> (anonymous_session_hash is null)),
  check (anonymous_session_hash is null or octet_length(anonymous_session_hash) = 32)
);

create unique index builder_search_history_user_definition_uidx
  on public.builder_search_history (user_id, definition_id)
  where user_id is not null;

create unique index builder_search_history_session_definition_uidx
  on public.builder_search_history (anonymous_session_hash, definition_id)
  where user_id is null;

create index builder_search_history_definition_id_idx
  on public.builder_search_history (definition_id);

create index builder_search_history_user_recent_idx
  on public.builder_search_history (user_id, last_searched_at desc, id desc)
  include (definition_id, objective, allowed_extra_passives)
  where user_id is not null;

create index builder_search_history_session_recent_idx
  on public.builder_search_history (anonymous_session_hash, last_searched_at desc, id desc)
  include (definition_id, objective, allowed_extra_passives)
  where user_id is null;

create index builder_search_definitions_popular_idx
  on public.builder_search_definitions (total_searches desc, last_searched_at desc)
  include (target_pal_id, passive_ids);

create index builder_search_definitions_target_popular_idx
  on public.builder_search_definitions (target_pal_id, total_searches desc)
  include (passive_ids);

create index builder_search_definitions_passives_idx
  on public.builder_search_definitions using gin (passive_ids);

alter table public.builder_search_definitions enable row level security;
alter table public.builder_search_history enable row level security;

create policy builder_search_definitions_deny_direct_access
on public.builder_search_definitions for all to anon, authenticated
using (false)
with check (false);

create policy builder_search_history_deny_direct_access
on public.builder_search_history for all to anon, authenticated
using (false)
with check (false);

revoke all on public.builder_search_definitions from anon, authenticated;
revoke all on public.builder_search_history from anon, authenticated;
revoke all on sequence public.builder_search_definitions_id_seq from anon, authenticated;
revoke all on sequence public.builder_search_history_id_seq from anon, authenticated;

create or replace function public.record_builder_search(
  search_target_pal_id text,
  search_passive_ids text[],
  search_objective text,
  search_allowed_extra_passives integer,
  anonymous_session_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  caller_session_hash bytea;
  canonical_target_pal_id text := trim(search_target_pal_id);
  canonical_passive_ids text[] := private.canonicalize_builder_search_passives(search_passive_ids);
  canonical_allowed_extra_passives integer := search_allowed_extra_passives;
  matched_definition_id bigint;
  searched_at timestamptz := clock_timestamp();
begin
  if canonical_target_pal_id is null
    or canonical_target_pal_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or char_length(canonical_target_pal_id) not between 1 and 80 then
    raise exception 'The target Pal is invalid.' using errcode = '22023';
  end if;
  if cardinality(canonical_passive_ids) <> cardinality(coalesce(search_passive_ids, '{}'::text[]))
    or cardinality(canonical_passive_ids) > 4 then
    raise exception 'Searches may contain up to four unique passive IDs.' using errcode = '22023';
  end if;
  if search_objective is null
    or search_objective not in ('recommended', 'fewest', 'cleanest') then
    raise exception 'The builder objective is invalid.' using errcode = '22023';
  end if;
  if cardinality(canonical_passive_ids) = 0 then
    canonical_allowed_extra_passives := 0;
  elsif canonical_allowed_extra_passives is null
    or canonical_allowed_extra_passives not between 0 and 2 then
    raise exception 'Allowed extra passives must be between zero and two.' using errcode = '22023';
  end if;
  if caller_user_id is null then
    caller_session_hash := private.builder_search_session_hash(anonymous_session_token);
  end if;

  insert into public.builder_search_definitions as existing (
    target_pal_id,
    passive_ids,
    total_searches,
    first_searched_at,
    last_searched_at
  ) values (
    canonical_target_pal_id,
    canonical_passive_ids,
    1,
    searched_at,
    searched_at
  )
  on conflict (target_pal_id, passive_ids) do update set
    total_searches = existing.total_searches + 1,
    last_searched_at = excluded.last_searched_at
  returning id into matched_definition_id;

  if caller_user_id is not null then
    insert into public.builder_search_history as existing (
      definition_id,
      user_id,
      objective,
      allowed_extra_passives,
      search_count,
      first_searched_at,
      last_searched_at
    ) values (
      matched_definition_id,
      caller_user_id,
      search_objective,
      canonical_allowed_extra_passives::smallint,
      1,
      searched_at,
      searched_at
    )
    on conflict (user_id, definition_id) where user_id is not null do update set
      objective = excluded.objective,
      allowed_extra_passives = excluded.allowed_extra_passives,
      search_count = existing.search_count + 1,
      last_searched_at = excluded.last_searched_at;

    delete from public.builder_search_history as history
    where history.id in (
      select stale.id
      from public.builder_search_history as stale
      where stale.user_id = caller_user_id
      order by stale.last_searched_at desc, stale.id desc
      offset 8
    );
  else
    insert into public.builder_search_history as existing (
      definition_id,
      anonymous_session_hash,
      objective,
      allowed_extra_passives,
      search_count,
      first_searched_at,
      last_searched_at
    ) values (
      matched_definition_id,
      caller_session_hash,
      search_objective,
      canonical_allowed_extra_passives::smallint,
      1,
      searched_at,
      searched_at
    )
    on conflict (anonymous_session_hash, definition_id) where user_id is null do update set
      objective = excluded.objective,
      allowed_extra_passives = excluded.allowed_extra_passives,
      search_count = existing.search_count + 1,
      last_searched_at = excluded.last_searched_at;

    delete from public.builder_search_history as history
    where history.id in (
      select stale.id
      from public.builder_search_history as stale
      where stale.user_id is null
        and stale.anonymous_session_hash = caller_session_hash
      order by stale.last_searched_at desc, stale.id desc
      offset 8
    );
  end if;
end;
$$;

create or replace function public.list_recent_builder_searches(
  anonymous_session_token text default null,
  result_limit integer default 8
)
returns table (
  target_pal_id text,
  passive_ids text[],
  objective text,
  allowed_extra_passives smallint,
  searched_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  caller_session_hash bytea;
  safe_limit integer := least(greatest(coalesce(result_limit, 8), 1), 8);
begin
  if caller_user_id is not null then
    return query
    select definition.target_pal_id,
      definition.passive_ids,
      history.objective,
      history.allowed_extra_passives,
      history.last_searched_at
    from public.builder_search_history as history
    join public.builder_search_definitions as definition on definition.id = history.definition_id
    where history.user_id = caller_user_id
    order by history.last_searched_at desc, history.id desc
    limit safe_limit;
  else
    caller_session_hash := private.builder_search_session_hash(anonymous_session_token);
    return query
    select definition.target_pal_id,
      definition.passive_ids,
      history.objective,
      history.allowed_extra_passives,
      history.last_searched_at
    from public.builder_search_history as history
    join public.builder_search_definitions as definition on definition.id = history.definition_id
    where history.user_id is null
      and history.anonymous_session_hash = caller_session_hash
    order by history.last_searched_at desc, history.id desc
    limit safe_limit;
  end if;
end;
$$;

create or replace function public.delete_recent_builder_search(
  search_target_pal_id text,
  search_passive_ids text[],
  anonymous_session_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  caller_session_hash bytea;
  matched_definition_id bigint;
begin
  select definition.id into matched_definition_id
  from public.builder_search_definitions as definition
  where definition.target_pal_id = trim(search_target_pal_id)
    and definition.passive_ids = private.canonicalize_builder_search_passives(search_passive_ids);

  if caller_user_id is not null then
    delete from public.builder_search_history as history
    where history.user_id = caller_user_id
      and history.definition_id = matched_definition_id;
  else
    caller_session_hash := private.builder_search_session_hash(anonymous_session_token);
    delete from public.builder_search_history as history
    where history.user_id is null
      and history.anonymous_session_hash = caller_session_hash
      and history.definition_id = matched_definition_id;
  end if;
end;
$$;

create or replace function public.clear_recent_builder_searches(
  anonymous_session_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  caller_session_hash bytea;
begin
  if caller_user_id is not null then
    delete from public.builder_search_history as history
    where history.user_id = caller_user_id;
  else
    caller_session_hash := private.builder_search_session_hash(anonymous_session_token);
    delete from public.builder_search_history as history
    where history.user_id is null
      and history.anonymous_session_hash = caller_session_hash;
  end if;
end;
$$;

create or replace function public.claim_recent_builder_searches(
  anonymous_session_token text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  caller_session_hash bytea;
  anonymous_history public.builder_search_history%rowtype;
  claimed_count integer := 0;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  caller_session_hash := private.builder_search_session_hash(anonymous_session_token);

  for anonymous_history in
    select history.*
    from public.builder_search_history as history
    where history.user_id is null
      and history.anonymous_session_hash = caller_session_hash
    order by history.last_searched_at asc, history.id asc
    for update
  loop
    insert into public.builder_search_history as existing (
      definition_id,
      user_id,
      objective,
      allowed_extra_passives,
      search_count,
      first_searched_at,
      last_searched_at
    ) values (
      anonymous_history.definition_id,
      caller_user_id,
      anonymous_history.objective,
      anonymous_history.allowed_extra_passives,
      anonymous_history.search_count,
      anonymous_history.first_searched_at,
      anonymous_history.last_searched_at
    )
    on conflict (user_id, definition_id) where user_id is not null do update set
      objective = case
        when excluded.last_searched_at >= existing.last_searched_at then excluded.objective
        else existing.objective
      end,
      allowed_extra_passives = case
        when excluded.last_searched_at >= existing.last_searched_at then excluded.allowed_extra_passives
        else existing.allowed_extra_passives
      end,
      search_count = existing.search_count + excluded.search_count,
      first_searched_at = least(existing.first_searched_at, excluded.first_searched_at),
      last_searched_at = greatest(existing.last_searched_at, excluded.last_searched_at);
    claimed_count := claimed_count + 1;
  end loop;

  delete from public.builder_search_history as history
  where history.user_id is null
    and history.anonymous_session_hash = caller_session_hash;

  delete from public.builder_search_history as history
  where history.id in (
    select stale.id
    from public.builder_search_history as stale
    where stale.user_id = caller_user_id
    order by stale.last_searched_at desc, stale.id desc
    offset 8
  );

  return claimed_count;
end;
$$;

revoke execute on function private.canonicalize_builder_search_passives(text[]) from public, anon, authenticated;
revoke execute on function private.builder_search_session_hash(text) from public, anon, authenticated;

revoke execute on function public.record_builder_search(text, text[], text, integer, text) from public, anon, authenticated;
revoke execute on function public.list_recent_builder_searches(text, integer) from public, anon, authenticated;
revoke execute on function public.delete_recent_builder_search(text, text[], text) from public, anon, authenticated;
revoke execute on function public.clear_recent_builder_searches(text) from public, anon, authenticated;
revoke execute on function public.claim_recent_builder_searches(text) from public, anon, authenticated;

grant execute on function public.record_builder_search(text, text[], text, integer, text) to anon, authenticated;
grant execute on function public.list_recent_builder_searches(text, integer) to anon, authenticated;
grant execute on function public.delete_recent_builder_search(text, text[], text) to anon, authenticated;
grant execute on function public.clear_recent_builder_searches(text) to anon, authenticated;
grant execute on function public.claim_recent_builder_searches(text) to authenticated;

comment on table public.builder_search_definitions is
  'Canonical Pal Builder searches and aggregate usage counters for future popularity features.';
comment on table public.builder_search_history is
  'The eight most recent canonical Builder searches for an account or hashed anonymous browser session.';
comment on column public.builder_search_definitions.passive_ids is
  'Sorted unique passive IDs. An empty array represents the any-passives search.';

commit;
