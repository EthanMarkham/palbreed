begin;

create extension if not exists pgtap with schema extensions;
select plan(23);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $$ select public.record_builder_search(
    'lamball', array['Legend', 'Swift'], 'fewest', 1,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ) $$,
  'anonymous sessions can record builder searches'
);

select lives_ok(
  $$ select public.record_builder_search(
    'lamball', array['Swift', 'Legend'], 'cleanest', 2,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ) $$,
  'setting variants update the same canonical search'
);

select is(
  (select count(*) from public.list_recent_builder_searches(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 8
  )),
  1::bigint,
  'setting variants do not create duplicate recent searches'
);

select results_eq(
  $$ select target_pal_id, passive_ids, objective, allowed_extra_passives
    from public.list_recent_builder_searches(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 8
    ) $$,
  $$ values ('lamball'::text, array['Legend', 'Swift']::text[], 'cleanest'::text, 2::smallint) $$,
  'the latest settings replace the prior variant and passive IDs are canonicalized'
);

select throws_ok(
  $$ select public.record_builder_search('lamball', '{}'::text[], 'recommended', 0, 'short') $$,
  '22023',
  'A valid anonymous search session is required.',
  'anonymous session tokens must have 256 bits of hex entropy'
);

select throws_ok(
  $$ select public.claim_recent_builder_searches(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ) $$,
  '42501',
  'permission denied for function claim_recent_builder_searches',
  'anonymous callers cannot execute the authenticated-only claim RPC'
);

select is(
  (select count(*) from public.list_recent_builder_searches(
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 8
  )),
  0::bigint,
  'anonymous sessions cannot read one another''s history'
);

reset role;

select is(
  (select total_searches from public.builder_search_definitions
    where target_pal_id = 'lamball' and passive_ids = array['Legend', 'Swift']),
  2::bigint,
  'canonical definitions retain aggregate search counts for future analytics'
);

select is(
  (select search_count from public.builder_search_history),
  2::bigint,
  'recent history tracks repeat usage without duplicating rows'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '44444444-4444-4444-4444-444444444444',
  'authenticated',
  'authenticated',
  'search-owner@example.test',
  '{}',
  '{"name":"Search owner"}',
  now(),
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.record_builder_search(
    'lamball', array['Legend', 'Swift'], 'recommended', 0, null
  ) $$,
  'authenticated users can record directly to their account'
);

select is(
  public.claim_recent_builder_searches(
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  1,
  'claiming reports the number of anonymous records merged'
);

reset role;

select results_eq(
  $$ select search_count, user_id, anonymous_session_hash is null
    from public.builder_search_history
    where definition_id = (
      select id from public.builder_search_definitions
      where target_pal_id = 'lamball' and passive_ids = array['Legend', 'Swift']
    ) $$,
  $$ values (3::bigint, '44444444-4444-4444-4444-444444444444'::uuid, true) $$,
  'claiming merges duplicates, preserves counts, and removes anonymous ownership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.list_recent_builder_searches(null, 8)),
  1::bigint,
  'authenticated recent history is scoped to auth.uid'
);

select lives_ok(
  $$ select public.delete_recent_builder_search(
    'lamball', array['Swift', 'Legend'], null
  ) $$,
  'authenticated users can remove a canonical recent search'
);

select is(
  (select count(*) from public.list_recent_builder_searches(null, 8)),
  0::bigint,
  'removed recent searches disappear from the account history'
);

select lives_ok(
  $$ select public.record_builder_search(
    format('pal-%s', search_number), '{}'::text[], 'recommended', 0, null
  ) from generate_series(1, 9) as search_number $$,
  'accounts can record more searches than the recent-history limit'
);

select is(
  (select count(*) from public.list_recent_builder_searches(null, 8)),
  8::bigint,
  'the RPC retains only the eight most recent canonical searches'
);

select lives_ok(
  $$ select public.clear_recent_builder_searches(null) $$,
  'authenticated users can clear recent history'
);

select is(
  (select count(*) from public.list_recent_builder_searches(null, 8)),
  0::bigint,
  'clearing removes all account history rows'
);

select throws_ok(
  $$ select count(*) from public.builder_search_history $$,
  '42501',
  'permission denied for table builder_search_history',
  'browser roles cannot bypass the RPC boundary'
);

reset role;

select has_index(
  'public',
  'builder_search_history',
  'builder_search_history_user_recent_idx',
  'account recent-history reads have a matching ordered index'
);

select has_index(
  'public',
  'builder_search_definitions',
  'builder_search_definitions_passives_idx',
  'passive containment analytics have a GIN index'
);

select has_index(
  'public',
  'builder_search_history',
  'builder_search_history_definition_id_idx',
  'definition cascades and joins have a foreign-key index'
);

select * from finish();
rollback;
