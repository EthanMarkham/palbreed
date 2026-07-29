begin;

alter table public.pal_instances
  add column palbox_slot_index integer
  check (
    palbox_slot_index is null
    or (location = 'palbox' and palbox_slot_index between 0 and 99999)
  );

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
    'activeProfileId', (
      select profile.local_profile_id
      from public.inventory_profiles as profile
      where profile.user_id = caller_user_id
      order by profile.updated_at desc, profile.id desc
      limit 1
    ),
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
          'palboxSlotIndex', pal.palbox_slot_index,
          'worldId', pal.world_id,
          'playerId', pal.player_id,
          'nickname', pal.nickname,
          'level', pal.level,
          'abilityScores', pal.ability_scores
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
  score_json jsonb;
  canonical_passive_ids text[];
  inserted_count integer := 0;
begin
  if profile_local_id is null or char_length(trim(profile_local_id)) not between 1 and 120 then raise exception 'The profile id is invalid.' using errcode = '22023'; end if;
  if profile_name is null or char_length(trim(profile_name)) not between 1 and 160 then raise exception 'The profile name is invalid.' using errcode = '22023'; end if;
  if profile_game_version <> '1.0' then raise exception 'The game version is invalid.' using errcode = '22023'; end if;
  if profile_platform not in ('xbox', 'steam') then raise exception 'The platform is invalid.' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(pal_records, '[]'::jsonb)) <> 'array' then raise exception 'Pal records must be an array.' using errcode = '22023'; end if;

  -- Preserve the physical-world reconciliation added in
  -- 20260726173222_reconcile_inventory_world_identity.sql.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller_user_id::text, 0));
  delete from public.inventory_profiles as profile
  where profile.user_id = caller_user_id
    and profile.local_profile_id <> trim(profile_local_id)
    and profile.platform = profile_platform
    and coalesce(profile.world_id, '') = coalesce(nullif(trim(coalesce(profile_world_id, '')), ''), '')
    and coalesce(profile.slot_id, '') = coalesce(nullif(trim(coalesce(profile_slot_id, '')), ''), '')
    and coalesce(profile.account_id, '') = coalesce(nullif(trim(coalesce(profile_account_id, '')), ''), '');

  insert into public.inventory_profiles as existing (
    user_id, local_profile_id, name, game_version, platform, world_id, slot_id,
    account_id, player_id, player_name, player_level, imported_at, created_at,
    updated_at, revision
  )
  values (
    caller_user_id, trim(profile_local_id), trim(profile_name), profile_game_version,
    profile_platform, nullif(trim(coalesce(profile_world_id, '')), ''),
    nullif(trim(coalesce(profile_slot_id, '')), ''),
    nullif(trim(coalesce(profile_account_id, '')), ''),
    nullif(trim(coalesce(profile_player_id, '')), ''),
    nullif(trim(coalesce(profile_player_name, '')), ''), profile_player_level,
    coalesce(imported_at, now_at), now_at, now_at, 1
  )
  on conflict (user_id, local_profile_id) do update set
    name = excluded.name,
    game_version = excluded.game_version,
    platform = excluded.platform,
    world_id = excluded.world_id,
    slot_id = excluded.slot_id,
    account_id = excluded.account_id,
    player_id = excluded.player_id,
    player_name = excluded.player_name,
    player_level = excluded.player_level,
    imported_at = excluded.imported_at,
    updated_at = excluded.updated_at,
    revision = existing.revision + 1
  returning * into matched_profile;

  delete from public.pal_instances as pal where pal.profile_id = matched_profile.id;

  for pal_record in select * from jsonb_array_elements(pal_records) loop
    passive_json := coalesce(pal_record -> 'passiveIds', '[]'::jsonb);
    if jsonb_typeof(passive_json) <> 'array' then raise exception 'Pal passive IDs are invalid.' using errcode = '22023'; end if;
    canonical_passive_ids := private.canonicalize_inventory_passives(array(select jsonb_array_elements_text(passive_json)));
    if cardinality(canonical_passive_ids) <> jsonb_array_length(passive_json) then raise exception 'Pal passive IDs are invalid.' using errcode = '22023'; end if;
    score_json := pal_record -> 'abilityScores';

    insert into public.pal_instances (
      profile_id, user_id, local_pal_id, source_instance_id, species_id, gender,
      passive_ids, location, palbox_slot_index, world_id, player_id, nickname,
      level, ability_scores, created_at, updated_at
    )
    values (
      matched_profile.id, caller_user_id, pal_record ->> 'id',
      pal_record ->> 'sourceInstanceId', pal_record ->> 'speciesId',
      pal_record ->> 'gender', canonical_passive_ids, pal_record ->> 'location',
      nullif(pal_record ->> 'palboxSlotIndex', '')::integer,
      nullif(pal_record ->> 'worldId', ''), nullif(pal_record ->> 'playerId', ''),
      nullif(pal_record ->> 'nickname', ''), nullif(pal_record ->> 'level', '')::integer,
      score_json, now_at, now_at
    );
    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'profileId', matched_profile.local_profile_id,
    'palCount', inserted_count,
    'revision', matched_profile.revision
  );
end;
$$;

revoke execute on function public.get_inventory_document() from public, anon, authenticated;
revoke execute on function public.replace_inventory_profile(text, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.get_inventory_document() to authenticated;
grant execute on function public.replace_inventory_profile(text, text, text, text, text, text, text, text, text, integer, timestamptz, jsonb) to authenticated;

commit;
