begin;

alter table public.pal_instances
  drop constraint if exists pal_instances_ability_scores_check;

alter table public.pal_instances
  add constraint pal_instances_ability_scores_check
  check (
    ability_scores is null
    or (
      jsonb_typeof(ability_scores) = 'object'
      and ability_scores ?& array['hp', 'ranged', 'defense']
      and ability_scores ->> 'hp' is not null
      and ability_scores ->> 'hp' ~ '^(100|[0-9]{1,2})$'
      and ability_scores ->> 'ranged' is not null
      and ability_scores ->> 'ranged' ~ '^(100|[0-9]{1,2})$'
      and ability_scores ->> 'defense' is not null
      and ability_scores ->> 'defense' ~ '^(100|[0-9]{1,2})$'
      and (ability_scores ->> 'hp')::integer between 0 and 100
      and (ability_scores ->> 'ranged')::integer between 0 and 100
      and (ability_scores ->> 'defense')::integer between 0 and 100
      and (
        not (ability_scores ? 'melee')
        or (
          ability_scores ->> 'melee' is not null
          and ability_scores ->> 'melee' ~ '^(100|[0-9]{1,2})$'
          and (ability_scores ->> 'melee')::integer between 0 and 100
        )
      )
    )
  )
  not valid;

alter table public.pal_instances
  validate constraint pal_instances_ability_scores_check;

commit;
