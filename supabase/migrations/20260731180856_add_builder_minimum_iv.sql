begin;

alter table public.builder_search_history
  add column minimum_iv smallint,
  add constraint builder_search_history_minimum_iv_check
    check (minimum_iv is null or minimum_iv between 1 and 100);

drop function public.record_builder_search(text, text[], text, integer, text);

create function public.record_builder_search(
  search_target_pal_id text,
  search_passive_ids text[],
  search_objective text,
  search_allowed_extra_passives integer,
  anonymous_session_token text default null,
  search_minimum_iv integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  caller_session_hash bytea;
  caller_searcher_kind text;
  caller_searcher_hash bytea;
  canonical_target_pal_id text := trim(search_target_pal_id);
  canonical_passive_ids text[] := private.canonicalize_builder_search_passives(search_passive_ids);
  canonical_allowed_extra_passives integer := search_allowed_extra_passives;
  canonical_minimum_iv integer := search_minimum_iv;
  matched_definition_id bigint;
  new_searcher_count integer;
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
  if search_minimum_iv is not null and search_minimum_iv not between 1 and 100 then
    raise exception 'Minimum IV must be between one and one hundred.' using errcode = '22023';
  end if;

  if caller_user_id is null then
    caller_session_hash := private.builder_search_session_hash(anonymous_session_token);
    caller_searcher_kind := 'session';
    caller_searcher_hash := caller_session_hash;
  else
    caller_searcher_kind := 'user';
    caller_searcher_hash := private.builder_search_user_hash(caller_user_id);
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
    0,
    searched_at,
    searched_at
  )
  on conflict (target_pal_id, passive_ids) do update set
    last_searched_at = excluded.last_searched_at
  returning id into matched_definition_id;

  insert into public.builder_search_unique_searchers (
    definition_id,
    searcher_kind,
    searcher_hash
  ) values (
    matched_definition_id,
    caller_searcher_kind,
    caller_searcher_hash
  )
  on conflict do nothing;

  get diagnostics new_searcher_count = row_count;
  if new_searcher_count = 1 then
    update public.builder_search_definitions as definition
    set total_searches = definition.total_searches + 1
    where definition.id = matched_definition_id;
  end if;

  if caller_user_id is not null then
    insert into public.builder_search_history as existing (
      definition_id,
      user_id,
      objective,
      allowed_extra_passives,
      minimum_iv,
      search_count,
      first_searched_at,
      last_searched_at
    ) values (
      matched_definition_id,
      caller_user_id,
      search_objective,
      canonical_allowed_extra_passives::smallint,
      canonical_minimum_iv::smallint,
      1,
      searched_at,
      searched_at
    )
    on conflict (user_id, definition_id) where user_id is not null do update set
      objective = excluded.objective,
      allowed_extra_passives = excluded.allowed_extra_passives,
      minimum_iv = excluded.minimum_iv,
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
      minimum_iv,
      search_count,
      first_searched_at,
      last_searched_at
    ) values (
      matched_definition_id,
      caller_session_hash,
      search_objective,
      canonical_allowed_extra_passives::smallint,
      canonical_minimum_iv::smallint,
      1,
      searched_at,
      searched_at
    )
    on conflict (anonymous_session_hash, definition_id) where user_id is null do update set
      objective = excluded.objective,
      allowed_extra_passives = excluded.allowed_extra_passives,
      minimum_iv = excluded.minimum_iv,
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

drop function public.list_recent_builder_searches(text, integer);

create function public.list_recent_builder_searches(
  anonymous_session_token text default null,
  result_limit integer default 8
)
returns table (
  target_pal_id text,
  passive_ids text[],
  objective text,
  allowed_extra_passives smallint,
  minimum_iv smallint,
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
      history.minimum_iv,
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
      history.minimum_iv,
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
  caller_user_hash bytea;
  caller_session_hash bytea;
  anonymous_history public.builder_search_history%rowtype;
  anonymous_searcher record;
  claimed_count integer := 0;
  new_user_searcher_count integer;
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  caller_user_hash := private.builder_search_user_hash(caller_user_id);
  caller_session_hash := private.builder_search_session_hash(anonymous_session_token);

  for anonymous_searcher in
    select searcher.definition_id
    from public.builder_search_unique_searchers as searcher
    where searcher.searcher_kind = 'session'
      and searcher.searcher_hash = caller_session_hash
    for update
  loop
    insert into public.builder_search_unique_searchers (
      definition_id,
      searcher_kind,
      searcher_hash
    ) values (
      anonymous_searcher.definition_id,
      'user',
      caller_user_hash
    )
    on conflict do nothing;

    get diagnostics new_user_searcher_count = row_count;
    if new_user_searcher_count = 0 then
      update public.builder_search_definitions as definition
      set total_searches = greatest(definition.total_searches - 1, 0)
      where definition.id = anonymous_searcher.definition_id;
    end if;

    delete from public.builder_search_unique_searchers as searcher
    where searcher.definition_id = anonymous_searcher.definition_id
      and searcher.searcher_kind = 'session'
      and searcher.searcher_hash = caller_session_hash;
  end loop;

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
      minimum_iv,
      search_count,
      first_searched_at,
      last_searched_at
    ) values (
      anonymous_history.definition_id,
      caller_user_id,
      anonymous_history.objective,
      anonymous_history.allowed_extra_passives,
      anonymous_history.minimum_iv,
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
      minimum_iv = case
        when excluded.last_searched_at >= existing.last_searched_at then excluded.minimum_iv
        else existing.minimum_iv
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

revoke execute on function public.record_builder_search(text, text[], text, integer, text, integer)
  from public, anon, authenticated;
revoke execute on function public.list_recent_builder_searches(text, integer)
  from public, anon, authenticated;
grant execute on function public.record_builder_search(text, text[], text, integer, text, integer)
  to anon, authenticated;
grant execute on function public.list_recent_builder_searches(text, integer)
  to anon, authenticated;

comment on column public.builder_search_history.minimum_iv is
  'Optional inclusive 1-100 floor required for each of HP, Attack, and Defense.';

commit;
