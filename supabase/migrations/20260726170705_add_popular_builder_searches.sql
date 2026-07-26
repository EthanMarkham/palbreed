begin;

create or replace function public.list_popular_builder_searches(
  result_limit integer default 8
)
returns table (
  target_pal_id text,
  passive_ids text[],
  search_count bigint,
  searched_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select definition.target_pal_id,
    definition.passive_ids,
    definition.total_searches,
    definition.last_searched_at
  from public.builder_search_definitions as definition
  where definition.total_searches >= 2
  order by definition.total_searches desc,
    definition.last_searched_at desc,
    definition.id desc
  limit least(greatest(coalesce(result_limit, 8), 1), 8)
$$;

revoke execute on function public.list_popular_builder_searches(integer)
  from public, anon, authenticated;
grant execute on function public.list_popular_builder_searches(integer)
  to anon, authenticated;

comment on function public.list_popular_builder_searches(integer) is
  'Returns frequently repeated canonical Builder searches without exposing user or session history.';

commit;
