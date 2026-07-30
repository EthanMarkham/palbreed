alter table public.builder_search_history
  drop constraint builder_search_history_objective_check;

alter table public.builder_search_history
  add constraint builder_search_history_objective_check
  check (objective in ('recommended', 'fewest', 'cleanest', 'ivs'));

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
    or search_objective not in ('recommended', 'fewest', 'cleanest', 'ivs') then
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
