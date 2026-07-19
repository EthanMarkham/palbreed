begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal', 'team')),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_personal_workspace_per_user
  on public.workspaces (created_by)
  where kind = 'personal';

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx
  on public.workspace_members (user_id, workspace_id);

create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token_hash bytea not null unique,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index workspace_invites_workspace_id_idx
  on public.workspace_invites (workspace_id, created_at desc);

create table public.world_snapshots (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  identity_key text not null check (char_length(identity_key) between 1 and 512),
  name text not null check (char_length(name) between 1 and 120),
  platform text not null check (platform in ('xbox', 'steam')),
  game_version text not null,
  schema_version integer not null check (schema_version > 0),
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null,
  imported_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, identity_key)
);

create index world_snapshots_workspace_updated_idx
  on public.world_snapshots (workspace_id, updated_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function private.set_updated_at();

create trigger workspace_members_set_updated_at
before update on public.workspace_members
for each row execute function private.set_updated_at();

create or replace function private.current_workspace_role(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.workspace_members as membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = (select auth.uid())
$$;

create or replace function private.require_workspace_owner(target_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_workspace_role(target_workspace_id)) is distinct from 'owner' then
    raise exception 'Workspace owner access is required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  personal_workspace_id uuid := gen_random_uuid();
  initial_name text;
begin
  initial_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Palpath player'
  );

  insert into public.user_profiles (user_id, display_name, avatar_url)
  values (new.id, left(initial_name, 80), nullif(new.raw_user_meta_data ->> 'avatar_url', ''));

  insert into public.workspaces (id, kind, name, created_by)
  values (personal_workspace_id, 'personal', left(initial_name || '''s worlds', 80), new.id);

  insert into public.workspace_members (workspace_id, user_id, role)
  values (personal_workspace_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.user_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.world_snapshots enable row level security;

create policy user_profiles_select_self
on public.user_profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy user_profiles_update_self
on public.user_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy workspaces_select_member
on public.workspaces for select to authenticated
using ((select private.current_workspace_role(id)) is not null);

create policy workspace_members_select_member
on public.workspace_members for select to authenticated
using ((select private.current_workspace_role(workspace_id)) is not null);

create policy workspace_invites_select_owner
on public.workspace_invites for select to authenticated
using ((select private.current_workspace_role(workspace_id)) = 'owner');

create policy world_snapshots_select_member
on public.world_snapshots for select to authenticated
using ((select private.current_workspace_role(workspace_id)) is not null);

revoke all on public.user_profiles from anon, authenticated;
revoke all on public.workspaces from anon, authenticated;
revoke all on public.workspace_members from anon, authenticated;
revoke all on public.workspace_invites from anon, authenticated;
revoke all on public.world_snapshots from anon, authenticated;

grant select, update (display_name, avatar_url) on public.user_profiles to authenticated;
grant select on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select on public.workspace_invites to authenticated;
grant select on public.world_snapshots to authenticated;

grant usage on schema private to authenticated;
revoke execute on function private.set_updated_at() from public;
revoke execute on function private.current_workspace_role(uuid) from public;
revoke execute on function private.require_workspace_owner(uuid) from public;
revoke execute on function private.handle_new_user() from public;
grant execute on function private.current_workspace_role(uuid) to authenticated;

create or replace function public.ensure_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_user auth.users%rowtype;
  personal_workspace_id uuid;
  initial_name text;
begin
  select * into account_user from auth.users where id = (select auth.uid());
  if not found then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  initial_name := coalesce(
    nullif(trim(account_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(account_user.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(account_user.email, ''), '@', 1), ''),
    'Palpath player'
  );

  insert into public.user_profiles (user_id, display_name, avatar_url)
  values (
    account_user.id,
    left(initial_name, 80),
    nullif(account_user.raw_user_meta_data ->> 'avatar_url', '')
  ) on conflict (user_id) do nothing;

  select id into personal_workspace_id from public.workspaces
  where created_by = account_user.id and kind = 'personal';
  if not found then
    personal_workspace_id := gen_random_uuid();
    insert into public.workspaces (id, kind, name, created_by)
    values (personal_workspace_id, 'personal', left(initial_name || '''s worlds', 80), account_user.id);
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (personal_workspace_id, account_user.id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
end;
$$;

create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  name text,
  kind text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select workspace.id, workspace.name, workspace.kind, membership.role, workspace.created_at
  from public.workspace_members as membership
  join public.workspaces as workspace on workspace.id = membership.workspace_id
  where membership.user_id = (select auth.uid())
  order by (workspace.kind = 'personal') desc, workspace.created_at asc
$$;

create or replace function public.list_workspace_members(target_workspace_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_workspace_role(target_workspace_id)) is null then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;

  return query
  select membership.user_id, profile.display_name, profile.avatar_url, membership.role,
    membership.created_at
  from public.workspace_members as membership
  join public.user_profiles as profile on profile.user_id = membership.user_id
  where membership.workspace_id = target_workspace_id
  order by (membership.role = 'owner') desc, profile.display_name asc;
end;
$$;

create or replace function public.create_team_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_workspace_id uuid := gen_random_uuid();
  clean_name text := trim(workspace_name);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if char_length(clean_name) not between 1 and 80 then
    raise exception 'Workspace names must contain 1 to 80 characters.' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.workspace_members as membership
    join public.workspaces as workspace on workspace.id = membership.workspace_id
    where membership.user_id = (select auth.uid())
      and membership.role = 'owner'
      and workspace.kind = 'team'
  ) >= 10 then
    raise exception 'A user may own at most 10 team workspaces.' using errcode = '54000';
  end if;

  insert into public.workspaces (id, kind, name, created_by)
  values (created_workspace_id, 'team', clean_name, (select auth.uid()));
  insert into public.workspace_members (workspace_id, user_id, role)
  values (created_workspace_id, (select auth.uid()), 'owner');
  return created_workspace_id;
end;
$$;

create or replace function public.create_workspace_invite(
  target_workspace_id uuid,
  invited_role text,
  expires_in_hours integer default 168
)
returns table (
  invitation_id uuid,
  invitation_token text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
  created_invite public.workspace_invites%rowtype;
begin
  perform private.require_workspace_owner(target_workspace_id);
  if (select kind from public.workspaces where id = target_workspace_id) <> 'team' then
    raise exception 'Personal workspaces cannot be shared.' using errcode = '22023';
  end if;
  if invited_role not in ('editor', 'viewer') then
    raise exception 'Invites may grant editor or viewer access.' using errcode = '22023';
  end if;
  if expires_in_hours not between 1 and 720 then
    raise exception 'Invite expiry must be between 1 and 720 hours.' using errcode = '22023';
  end if;

  insert into public.workspace_invites (
    workspace_id, token_hash, role, invited_by, expires_at
  ) values (
    target_workspace_id,
    extensions.digest(raw_token, 'sha256'),
    invited_role,
    (select auth.uid()),
    now() + make_interval(hours => expires_in_hours)
  ) returning * into created_invite;

  return query select created_invite.id, raw_token, created_invite.role, created_invite.expires_at;
end;
$$;

create or replace function public.list_workspace_invites(target_workspace_id uuid)
returns table (
  invitation_id uuid,
  role text,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_workspace_owner(target_workspace_id);
  return query
  select invite.id, invite.role, invite.created_at, invite.expires_at,
    invite.accepted_at, invite.revoked_at
  from public.workspace_invites as invite
  where invite.workspace_id = target_workspace_id
  order by invite.created_at desc
  limit 50;
end;
$$;

create or replace function public.accept_workspace_invite(invitation_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_invite public.workspace_invites%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if char_length(invitation_token) <> 48 then
    raise exception 'This invitation is invalid.' using errcode = '22023';
  end if;

  select * into matched_invite
  from public.workspace_invites
  where token_hash = extensions.digest(invitation_token, 'sha256')
  for update;

  if not found or matched_invite.revoked_at is not null
    or matched_invite.accepted_at is not null or matched_invite.expires_at <= now() then
    raise exception 'This invitation is invalid or has expired.' using errcode = '22023';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (matched_invite.workspace_id, (select auth.uid()), matched_invite.role)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invites
  set accepted_by = (select auth.uid()), accepted_at = now()
  where id = matched_invite.id;

  return matched_invite.workspace_id;
end;
$$;

create or replace function public.revoke_workspace_invite(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id
  from public.workspace_invites where id = invitation_id;
  if not found then
    raise exception 'Invitation not found.' using errcode = '22023';
  end if;
  perform private.require_workspace_owner(target_workspace_id);
  update public.workspace_invites set revoked_at = now()
  where id = invitation_id and accepted_at is null and revoked_at is null;
end;
$$;

create or replace function public.set_workspace_member_role(
  target_workspace_id uuid,
  target_user_id uuid,
  next_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role text;
begin
  perform private.require_workspace_owner(target_workspace_id);
  if (select kind from public.workspaces where id = target_workspace_id) <> 'team' then
    raise exception 'Personal workspace membership cannot be changed.' using errcode = '22023';
  end if;
  if next_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Unknown workspace role.' using errcode = '22023';
  end if;
  select role into current_role from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id for update;
  if not found then
    raise exception 'Workspace member not found.' using errcode = '22023';
  end if;
  if current_role = 'owner' and next_role <> 'owner' and (
    select count(*) from public.workspace_members
    where workspace_id = target_workspace_id and role = 'owner'
  ) <= 1 then
    raise exception 'A workspace must keep at least one owner.' using errcode = '22023';
  end if;
  update public.workspace_members set role = next_role
  where workspace_id = target_workspace_id and user_id = target_user_id;
end;
$$;

create or replace function public.remove_workspace_member(
  target_workspace_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := private.current_workspace_role(target_workspace_id);
  target_role text;
begin
  if caller_role is null or (caller_role <> 'owner' and target_user_id <> (select auth.uid())) then
    raise exception 'You cannot remove this workspace member.' using errcode = '42501';
  end if;
  if (select kind from public.workspaces where id = target_workspace_id) <> 'team' then
    raise exception 'Personal workspace membership cannot be changed.' using errcode = '22023';
  end if;
  select role into target_role from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id for update;
  if not found then
    raise exception 'Workspace member not found.' using errcode = '22023';
  end if;
  if target_role = 'owner' and (
    select count(*) from public.workspace_members
    where workspace_id = target_workspace_id and role = 'owner'
  ) <= 1 then
    raise exception 'A workspace must keep at least one owner.' using errcode = '22023';
  end if;
  delete from public.workspace_members
  where workspace_id = target_workspace_id and user_id = target_user_id;
end;
$$;

create or replace function public.list_world_snapshot_metadata(target_workspace_id uuid)
returns table (
  snapshot_id uuid,
  identity_key text,
  name text,
  platform text,
  game_version text,
  schema_version integer,
  revision bigint,
  imported_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select private.current_workspace_role(target_workspace_id)) is null then
    raise exception 'Workspace membership is required.' using errcode = '42501';
  end if;
  return query
  select snapshot.id, snapshot.identity_key, snapshot.name, snapshot.platform,
    snapshot.game_version, snapshot.schema_version, snapshot.revision,
    snapshot.imported_at, snapshot.updated_at, snapshot.deleted_at
  from public.world_snapshots as snapshot
  where snapshot.workspace_id = target_workspace_id
  order by snapshot.updated_at desc;
end;
$$;

create or replace function public.get_world_snapshot(target_snapshot_id uuid)
returns table (
  snapshot_id uuid,
  workspace_id uuid,
  identity_key text,
  name text,
  platform text,
  game_version text,
  schema_version integer,
  revision bigint,
  payload jsonb,
  imported_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select snapshot.workspace_id into target_workspace_id
  from public.world_snapshots as snapshot
  where snapshot.id = target_snapshot_id and snapshot.deleted_at is null;
  if not found or (select private.current_workspace_role(target_workspace_id)) is null then
    raise exception 'World snapshot not found.' using errcode = '22023';
  end if;
  return query
  select snapshot.id, snapshot.workspace_id, snapshot.identity_key, snapshot.name,
    snapshot.platform, snapshot.game_version, snapshot.schema_version,
    snapshot.revision, snapshot.payload, snapshot.imported_at, snapshot.updated_at
  from public.world_snapshots as snapshot
  where snapshot.id = target_snapshot_id and snapshot.deleted_at is null;
end;
$$;

create or replace function public.replace_world_snapshot(
  target_workspace_id uuid,
  target_snapshot_id uuid,
  target_identity_key text,
  expected_revision bigint,
  snapshot_name text,
  snapshot_platform text,
  snapshot_game_version text,
  snapshot_schema_version integer,
  snapshot_payload jsonb,
  snapshot_imported_at timestamptz
)
returns table (
  applied boolean,
  snapshot_id uuid,
  revision bigint,
  updated_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_snapshot public.world_snapshots%rowtype;
  saved_snapshot public.world_snapshots%rowtype;
  caller_role text := private.current_workspace_role(target_workspace_id);
begin
  if caller_role is null or caller_role not in ('owner', 'editor') then
    raise exception 'Workspace edit access is required.' using errcode = '42501';
  end if;
  if expected_revision < 0 then
    raise exception 'Expected revision cannot be negative.' using errcode = '22023';
  end if;
  if char_length(trim(target_identity_key)) not between 1 and 512
    or char_length(trim(snapshot_name)) not between 1 and 120 then
    raise exception 'Snapshot identity or name is invalid.' using errcode = '22023';
  end if;
  if snapshot_platform not in ('xbox', 'steam') or snapshot_schema_version <> 1
    or jsonb_typeof(snapshot_payload) <> 'object'
    or snapshot_payload ->> 'schemaVersion' <> '1' then
    raise exception 'Snapshot payload metadata is invalid.' using errcode = '22023';
  end if;
  if octet_length(snapshot_payload::text) > 10485760 then
    raise exception 'World snapshots may not exceed 10 MiB.' using errcode = '54000';
  end if;

  select * into existing_snapshot
  from public.world_snapshots as snapshot
  where snapshot.workspace_id = target_workspace_id
    and snapshot.identity_key = target_identity_key
  for update;

  if found then
    if existing_snapshot.revision <> expected_revision then
      return query select false, existing_snapshot.id, existing_snapshot.revision,
        existing_snapshot.updated_at, existing_snapshot.deleted_at;
      return;
    end if;

    update public.world_snapshots as snapshot set
      name = trim(snapshot_name),
      platform = snapshot_platform,
      game_version = snapshot_game_version,
      schema_version = snapshot_schema_version,
      payload = snapshot_payload,
      imported_at = snapshot_imported_at,
      updated_by = (select auth.uid()),
      updated_at = now(),
      deleted_at = null,
      revision = snapshot.revision + 1
    where snapshot.id = existing_snapshot.id
    returning snapshot.* into saved_snapshot;
  else
    if expected_revision <> 0 then
      return query select false, null::uuid, 0::bigint, null::timestamptz, null::timestamptz;
      return;
    end if;
    if (
      select count(*) from public.world_snapshots as snapshot
      where snapshot.workspace_id = target_workspace_id and snapshot.deleted_at is null
    ) >= 100 then
      raise exception 'A workspace may contain at most 100 active worlds.' using errcode = '54000';
    end if;

    insert into public.world_snapshots (
      id, workspace_id, identity_key, name, platform, game_version,
      schema_version, revision, payload, imported_at, created_by, updated_by
    ) values (
      target_snapshot_id, target_workspace_id, trim(target_identity_key),
      trim(snapshot_name), snapshot_platform, snapshot_game_version,
      snapshot_schema_version, 1, snapshot_payload, snapshot_imported_at,
      (select auth.uid()), (select auth.uid())
    ) returning * into saved_snapshot;
  end if;

  return query select true, saved_snapshot.id, saved_snapshot.revision,
    saved_snapshot.updated_at, saved_snapshot.deleted_at;
end;
$$;

create or replace function public.delete_world_snapshot(
  target_snapshot_id uuid,
  expected_revision bigint
)
returns table (
  applied boolean,
  snapshot_id uuid,
  revision bigint,
  updated_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_snapshot public.world_snapshots%rowtype;
  saved_snapshot public.world_snapshots%rowtype;
begin
  select * into existing_snapshot from public.world_snapshots
  where id = target_snapshot_id for update;
  if not found then
    return query select false, null::uuid, 0::bigint, null::timestamptz, null::timestamptz;
    return;
  end if;
  if private.current_workspace_role(existing_snapshot.workspace_id) is null
    or private.current_workspace_role(existing_snapshot.workspace_id) not in ('owner', 'editor') then
    raise exception 'Workspace edit access is required.' using errcode = '42501';
  end if;
  if existing_snapshot.revision <> expected_revision then
    return query select false, existing_snapshot.id, existing_snapshot.revision,
      existing_snapshot.updated_at, existing_snapshot.deleted_at;
    return;
  end if;

  update public.world_snapshots as snapshot set
    name = 'Deleted world',
    payload = '{}'::jsonb,
    imported_at = null,
    updated_by = (select auth.uid()),
    updated_at = now(),
    deleted_at = now(),
    revision = snapshot.revision + 1
  where snapshot.id = target_snapshot_id
  returning snapshot.* into saved_snapshot;

  return query select true, saved_snapshot.id, saved_snapshot.revision,
    saved_snapshot.updated_at, saved_snapshot.deleted_at;
end;
$$;

revoke execute on function public.ensure_my_account() from public, anon;
revoke execute on function public.list_my_workspaces() from public, anon;
revoke execute on function public.list_workspace_members(uuid) from public, anon;
revoke execute on function public.create_team_workspace(text) from public, anon;
revoke execute on function public.create_workspace_invite(uuid, text, integer) from public, anon;
revoke execute on function public.list_workspace_invites(uuid) from public, anon;
revoke execute on function public.accept_workspace_invite(text) from public, anon;
revoke execute on function public.revoke_workspace_invite(uuid) from public, anon;
revoke execute on function public.set_workspace_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_workspace_member(uuid, uuid) from public, anon;
revoke execute on function public.list_world_snapshot_metadata(uuid) from public, anon;
revoke execute on function public.get_world_snapshot(uuid) from public, anon;
revoke execute on function public.replace_world_snapshot(uuid, uuid, text, bigint, text, text, text, integer, jsonb, timestamptz) from public, anon;
revoke execute on function public.delete_world_snapshot(uuid, bigint) from public, anon;
grant execute on function public.ensure_my_account() to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.create_team_workspace(text) to authenticated;
grant execute on function public.create_workspace_invite(uuid, text, integer) to authenticated;
grant execute on function public.list_workspace_invites(uuid) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.revoke_workspace_invite(uuid) to authenticated;
grant execute on function public.set_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.list_world_snapshot_metadata(uuid) to authenticated;
grant execute on function public.get_world_snapshot(uuid) to authenticated;
grant execute on function public.replace_world_snapshot(uuid, uuid, text, bigint, text, text, text, integer, jsonb, timestamptz) to authenticated;
grant execute on function public.delete_world_snapshot(uuid, bigint) to authenticated;

commit;
