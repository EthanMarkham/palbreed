begin;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.canonicalize_inventory_passives(input_values text[])
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

create or replace function private.require_inventory_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
begin
  if caller_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  return caller_user_id;
end;
$$;

create table public.inventory_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_profile_id text not null check (char_length(local_profile_id) between 1 and 120),
  name text not null check (char_length(name) between 1 and 160),
  game_version text not null check (game_version = '1.0'),
  platform text not null check (platform in ('xbox', 'steam')),
  world_id text check (world_id is null or char_length(world_id) between 1 and 160),
  slot_id text check (slot_id is null or char_length(slot_id) between 1 and 220),
  account_id text check (account_id is null or char_length(account_id) between 1 and 160),
  player_id text check (player_id is null or char_length(player_id) between 1 and 160),
  player_name text check (player_name is null or char_length(player_name) between 1 and 160),
  player_level integer check (player_level is null or player_level between 1 and 999),
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 0 check (revision >= 0),
  unique (user_id, local_profile_id)
);

create unique index inventory_profiles_world_uidx
  on public.inventory_profiles (user_id, platform, coalesce(world_id, ''), coalesce(slot_id, ''), coalesce(account_id, ''));

create table public.pal_instances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.inventory_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_pal_id text not null check (char_length(local_pal_id) between 1 and 160),
  source_instance_id text not null check (char_length(source_instance_id) between 1 and 220),
  species_id text not null check (char_length(species_id) between 1 and 100 and species_id ~ '^[A-Za-z0-9_-]+$'),
  gender text not null check (gender in ('F', 'M')),
  passive_ids text[] not null default '{}'::text[],
  location text not null check (location in ('party', 'palbox', 'base', 'global-storage')),
  world_id text check (world_id is null or char_length(world_id) between 1 and 160),
  player_id text check (player_id is null or char_length(player_id) between 1 and 160),
  nickname text check (nickname is null or char_length(nickname) between 1 and 160),
  level integer check (level is null or level between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(passive_ids) between 0 and 4),
  check (passive_ids = private.canonicalize_inventory_passives(passive_ids)),
  unique (profile_id, source_instance_id)
);

create index inventory_profiles_user_updated_idx on public.inventory_profiles (user_id, updated_at desc, id desc);
create index pal_instances_profile_idx on public.pal_instances (profile_id);
create index pal_instances_user_species_idx on public.pal_instances (user_id, species_id);
create index pal_instances_user_passives_idx on public.pal_instances using gin (passive_ids);

create or replace function public.get_inventory_document()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := private.require_inventory_user();
  document jsonb;
begin
  select jsonb_build_object(
    'schemaVersion', 1,
    'activeProfileId', (select profile.local_profile_id from public.inventory_profiles as profile where profile.user_id = caller_user_id order by profile.updated_at desc, profile.id desc limit 1),
    'profiles', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', profile.local_profile_id,
      'owner', jsonb_build_object('kind', 'account', 'id', profile.user_id),
      'name', profile.name,
      'gameVersion', profile.game_version,
      'platform', profile.platform,
      'worldId', profile.world_id,
      'slotId', profile.slot_id,
      'accountId', profile.account_id,
      'playerId', profile.player_id,
      'playerName', profile.player_name,
      'playerLevel', profile.player_level,
      'importedAt', profile.imported_at,
      'createdAt', profile.created_at,
      'updatedAt', profile.updated_at,
      'revision', profile.revision,
      'pals', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', pal.local_pal_id,
          'sourceInstanceId', pal.source_instance_id,
          'speciesId', pal.species_id,
          'gender', pal.gender,
          'passiveIds', pal.passive_ids,
          'location', pal.location,
          'worldId', pal.world_id,
          'playerId', pal.player_id,
          'nickname', pal.nickname,
          'level', pal.level
        )) order by pal.local_pal_id)
        from public.pal_instances as pal
        where pal.profile_id = profile.id and pal.user_id = profile.user_id
      ), '[]'::jsonb)
    )) order by profile.updated_at desc, profile.id desc), '[]'::jsonb)
  ) into document
  from public.inventory_profiles as profile
  where profile.user_id = caller_user_id;
  return coalesce(document, jsonb_build_object('schemaVersion', 1, 'profiles', '[]'::jsonb));
end;
$$;

create or replace function public.list_inventory_profiles()
returns table (
  profile_id uuid,
  local_profile_id text,
  name text,
  game_version text,
  platform text,
  world_id text,
  slot_id text,
  account_id text,
  player_id text,
  player_name text,
  player_level integer,
  pal_count bigint,
  imported_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  revision integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.local_profile_id, profile.name, profile.game_version, profile.platform,
    profile.world_id, profile.slot_id, profile.account_id, profile.player_id, profile.player_name,
    profile.player_level, count(pal.id), profile.imported_at, profile.created_at, profile.updated_at,
    profile.revision
  from public.inventory_profiles as profile
  left join public.pal_instances as pal on pal.profile_id = profile.id
  where profile.user_id = private.require_inventory_user()
  group by profile.id
  order by profile.updated_at desc, profile.id desc
$$;

create or replace function public.replace_inventory_profile(
  profile_local_id text,
  profile_name text,
  profile_game_version text,
  profile_platform text,
  profile_world_id text,
  profile_slot_id text,
  profile_account_id text default null,
  profile_player_id text default null,
  profile_player_name text default null,
  profile_player_level integer default null,
  imported_at timestamptz default null,
  pal_records jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := private.require_inventory_user();
  now_at timestamptz := clock_timestamp();
  matched_profile public.inventory_profiles%rowtype;
  pal_record jsonb;
  passive_json jsonb;
  canonical_passive_ids text[];
  inserted_count integer := 0;
begin
  if profile_local_id is null or char_length(trim(profile_local_id)) not between 1 and 120 then raise exception 'The profile id is invalid.' using errcode = '22023'; end if;
  if profile_name is null or char_length(trim(profile_name)) not between 1 and 160 then raise exception 'The profile name is invalid.' using errcode = '22023'; end if;
  if profile_game_version <> '1.0' then raise exception 'The game version is invalid.' using errcode = '22023'; end if;
  if profile_platform not in ('xbox', 'steam') then raise exception 'The platform is invalid.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(pal_records, '[]'::jsonb)) <> 'array' then raise exception 'Pal records must be an array.' using errcode = '22023'; end if;

  insert into public.inventory_profiles as existing (user_id, local_profile_id, name, game_version, platform, world_id, slot_id, account_id, player_id, player_name, player_level, imported_at, created_at, updated_at, revision)
  values (caller_user_id, trim(profile_local_id), trim(profile_name), profile_game_version, profile_platform, nullif(trim(coalesce(profile_world_id, '')), ''), nullif(trim(coalesce(profile_slot_id, '')), ''), nullif(trim(coalesce(profile_account_id, '')), ''), nullif(trim(coalesce(profile_player_id, '')), ''), nullif(trim(coalesce(profile_player_name, '')), ''), profile_player_level, coalesce(imported_at, now_at), now_at, now_at, 1)
  on conflict (user_id, local_profile_id) do update set
    name = excluded.name, game_version = excluded.game_version, platform = excluded.platform,
    world_id = excluded.world_id, slot_id = excluded.slot_id, account_id = excluded.account_id,
    player_id = excluded.player_id, player_name = excluded.player_name, player_level = excluded.player_level,
    imported_at = excluded.imported_at, updated_at = excluded.updated_at, revision = existing.revision + 1
  returning * into matched_profile;

  delete from public.pal_instances as pal where pal.profile_id = matched_profile.id;

  for pal_record in select * from jsonb_array_elements(pal_records) loop
    passive_json := coalesce(pal_record -> 'passiveIds', '[]'::jsonb);
    if jsonb_typeof(passive_json) <> 'array' then raise exception 'Pal passive IDs are invalid.' using errcode = '22023'; end if;
    canonical_passive_ids := private.canonicalize_inventory_passives(array(select jsonb_array_elements_text(passive_json)));
    if cardinality(canonical_passive_ids) <> jsonb_array_length(passive_json) then raise exception 'Pal passive IDs are invalid.' using errcode = '22023'; end if;

    insert into public.pal_instances (profile_id, user_id, local_pal_id, source_instance_id, species_id, gender, passive_ids, location, world_id, player_id, nickname, level, created_at, updated_at)
    values (matched_profile.id, caller_user_id, pal_record ->> 'id', pal_record ->> 'sourceInstanceId', pal_record ->> 'speciesId', pal_record ->> 'gender', canonical_passive_ids, pal_record ->> 'location', nullif(pal_record ->> 'worldId', ''), nullif(pal_record ->> 'playerId', ''), nullif(pal_record ->> 'nickname', ''), nullif(pal_record ->> 'level', '')::integer, now_at, now_at);
    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object('profileId', matched_profile.local_profile_id, 'palCount', inserted_count, 'revision', matched_profile.revision);
end;
$$;

create or replace function public.delete_inventory_profile(profile_local_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.inventory_profiles as profile
  where profile.user_id = private.require_inventory_user()
    and profile.local_profile_id = profile_local_id;
end;
$$;

alter table public.inventory_profiles enable row level security;
alter table public.pal_instances enable row level security;

create policy inventory_profiles_deny_direct_access on public.inventory_profiles for all to anon, authenticated using (false) with check (false);
create policy pal_instances_deny_direct_access on public.pal_instances for all to anon, authenticated using (false) with check (false);

revoke all on public.inventory_profiles from anon, authenticated;
revoke all on public.pal_instances from anon, authenticated;
revoke execute on function private.canonicalize_inventory_passives(text[]) from public, anon, authenticated;
revoke execute on function private.require_inventory_user() from public, anon, authenticated;
revoke execute on function public.get_inventory_document() from public, anon, authenticated;
revoke execute on function public.list_inventory_profiles() from public, anon, authenticated;
revoke execute on function public.replace_inventory_profile(text, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.delete_inventory_profile(text) from public, anon, authenticated;

grant execute on function public.get_inventory_document() to authenticated;
grant execute on function public.list_inventory_profiles() to authenticated;
grant execute on function public.replace_inventory_profile(text, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb) to authenticated;
grant execute on function public.delete_inventory_profile(text) to authenticated;

comment on table public.inventory_profiles is 'Synced imported world metadata for authenticated accounts. Raw save files are not stored.';
comment on table public.pal_instances is 'Normalized owned Pal records extracted locally from saves and synced per account profile.';

commit;
