begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '55555555-5555-5555-5555-555555555555',
  'authenticated',
  'authenticated',
  'ability-scores@example.test',
  '{}',
  '{"name":"Ability scores test"}',
  now(),
  now()
);

insert into public.inventory_profiles (
  id, user_id, local_profile_id, name, game_version, platform
) values (
  '66666666-6666-6666-6666-666666666666',
  '55555555-5555-5555-5555-555555555555',
  'ability-scores-profile',
  'Ability scores test',
  '1.0',
  'steam'
);

insert into public.pal_instances (
  profile_id, user_id, local_pal_id, source_instance_id,
  species_id, gender, passive_ids, location, ability_scores
) values (
  '66666666-6666-6666-6666-666666666666',
  '55555555-5555-5555-5555-555555555555',
  'partial-ivs',
  'partial-ivs',
  'lamball',
  'F',
  '{}',
  'palbox',
  '{"hp":91,"ranged":87,"defense":96}'::jsonb
);

select pass('imports can persist ability scores when the save omits melee IV');

select is(
  (
    select ability_scores
    from public.pal_instances
    where source_instance_id = 'partial-ivs'
  ),
  '{"hp":91,"ranged":87,"defense":96}'::jsonb,
  'the available IV values are preserved unchanged'
);

insert into public.pal_instances (
  profile_id, user_id, local_pal_id, source_instance_id,
  species_id, gender, passive_ids, location, ability_scores
) values (
  '66666666-6666-6666-6666-666666666666',
  '55555555-5555-5555-5555-555555555555',
  'complete-ivs',
  'complete-ivs',
  'cattiva',
  'M',
  '{}',
  'palbox',
  '{"hp":91,"melee":34,"ranged":87,"defense":96}'::jsonb
);

select pass('imports with all four ability scores remain valid');

select * from finish();
rollback;
