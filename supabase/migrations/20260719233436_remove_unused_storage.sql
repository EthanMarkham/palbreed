begin;

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.delete_world_snapshot(uuid, bigint);
drop function if exists public.replace_world_snapshot(uuid, uuid, text, bigint, text, text, text, integer, jsonb, timestamptz);
drop function if exists public.get_world_snapshot(uuid);
drop function if exists public.list_world_snapshot_metadata(uuid);
drop function if exists public.remove_workspace_member(uuid, uuid);
drop function if exists public.set_workspace_member_role(uuid, uuid, text);
drop function if exists public.revoke_workspace_invite(uuid);
drop function if exists public.accept_workspace_invite(text);
drop function if exists public.list_workspace_invites(uuid);
drop function if exists public.create_workspace_invite(uuid, text, integer);
drop function if exists public.create_team_workspace(text);
drop function if exists public.list_workspace_members(uuid);
drop function if exists public.list_my_workspaces();
drop function if exists public.ensure_my_account();

drop table if exists public.world_snapshots;
drop table if exists public.workspace_invites;
drop table if exists public.workspace_members;
drop table if exists public.workspaces;
drop table if exists public.user_profiles;

drop function if exists private.require_workspace_owner(uuid);
drop function if exists private.current_workspace_role(uuid);
drop function if exists private.handle_new_user();
drop function if exists private.set_updated_at();
commit;
