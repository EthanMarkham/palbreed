begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner-a@example.test', '{}', '{"name":"Owner A"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'owner-b@example.test', '{}', '{"name":"Owner B"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'viewer@example.test', '{}', '{"name":"Viewer"}', now(), now());

insert into public.workspaces (id, kind, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'team', 'Team A', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'team', 'Team B', '22222222-2222-2222-2222-222222222222');

insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'viewer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner');

insert into public.world_snapshots (
  id, workspace_id, identity_key, name, platform, game_version, schema_version,
  payload, created_by, updated_by
) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'xbox:a:world', 'A world', 'xbox', '1.0', 1, '{"schemaVersion":1}',
    '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'steam:b:world', 'B world', 'steam', '1.0', 1, '{"schemaVersion":1}',
    '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$ select id from public.workspaces where id in (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ) order by id $$,
  $$ values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'owners only see team workspaces they belong to'
);

select is(
  (select count(*) from public.world_snapshots where workspace_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0::bigint,
  'cross-workspace snapshot reads are denied'
);

select lives_ok(
  $$ select public.replace_world_snapshot(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a0000000-0000-0000-0000-000000000001',
    'xbox:a:world', 1, 'A world updated', 'xbox', '1.0', 1,
    '{"schemaVersion":1,"profileId":"profile-a"}'::jsonb, null
  ) $$,
  'workspace owners can replace snapshots'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.world_snapshots where workspace_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1::bigint,
  'viewers can read their workspace snapshots'
);

select throws_ok(
  $$ select public.replace_world_snapshot(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'a0000000-0000-0000-0000-000000000001',
    'xbox:a:world', 2, 'Forbidden', 'xbox', '1.0', 1,
    '{"schemaVersion":1,"profileId":"profile-a"}'::jsonb, null
  ) $$,
  '42501',
  'Workspace edit access is required.',
  'viewers cannot replace snapshots'
);

select throws_ok(
  $$ select public.create_workspace_invite(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'editor', 24
  ) $$,
  '42501',
  'Workspace owner access is required.',
  'non-owners cannot create invitations'
);

select throws_ok(
  $$ update public.world_snapshots set name = 'Bypass' where id = 'a0000000-0000-0000-0000-000000000001' $$,
  '42501',
  'permission denied for table world_snapshots',
  'direct snapshot mutation is not granted to browser roles'
);

select * from finish();
rollback;
