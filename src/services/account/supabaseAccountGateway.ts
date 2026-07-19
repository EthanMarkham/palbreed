import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  AccountProfile,
  CreatedWorkspaceInvite,
  RemoteWorldMetadata,
  RemoteWorldSnapshot,
  RemoteWriteResult,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "../../domain/account";
import type { Database } from "../supabase/database.types";
import type { WorldSnapshotPayload } from "../sync/worldSnapshot";
import type { AccountGateway } from "./accountGateway";

const roleSchema = z.enum(["owner", "editor", "viewer"]);
const inviteRoleSchema = z.enum(["editor", "viewer"]);
const workspaceKindSchema = z.enum(["personal", "team"]);
const platformSchema = z.enum(["xbox", "steam"]);

export class SupabaseAccountGateway implements AccountGateway {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async ensureAccount() {
    const { error } = await this.client.rpc("ensure_my_account");
    if (error) throw requestError("initialize your account", error);
  }

  async getProfile(): Promise<AccountProfile> {
    const { data, error } = await this.client
      .from("user_profiles")
      .select("user_id, display_name, avatar_url")
      .single();
    if (error) throw requestError("load your profile", error);
    return {
      userId: data.user_id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url ?? undefined,
    };
  }

  async updateDisplayName(displayName: string): Promise<AccountProfile> {
    const cleanName = displayName.trim();
    if (!cleanName || cleanName.length > 80) {
      throw new Error("Display names must contain 1 to 80 characters.");
    }
    const user = await this.getProfile();
    const { data, error } = await this.client
      .from("user_profiles")
      .update({ display_name: cleanName })
      .eq("user_id", user.userId)
      .select("user_id, display_name, avatar_url")
      .single();
    if (error) throw requestError("update your profile", error);
    return {
      userId: data.user_id,
      displayName: data.display_name,
      avatarUrl: data.avatar_url ?? undefined,
    };
  }

  async listWorkspaces(): Promise<readonly WorkspaceSummary[]> {
    const data = await this.rpc("list_my_workspaces", {}, "load your workspaces");
    return data.map((row) => ({
      id: row.workspace_id,
      name: row.name,
      kind: workspaceKindSchema.parse(row.kind),
      role: roleSchema.parse(row.role),
      createdAt: row.created_at,
    }));
  }

  async createTeamWorkspace(name: string) {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 80) {
      throw new Error("Workspace names must contain 1 to 80 characters.");
    }
    return this.rpc("create_team_workspace", { workspace_name: cleanName }, "create the workspace");
  }

  async listMembers(workspaceId: string): Promise<readonly WorkspaceMember[]> {
    const data = await this.rpc(
      "list_workspace_members",
      { target_workspace_id: workspaceId },
      "load workspace members",
    );
    return data.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ?? undefined,
      role: roleSchema.parse(row.role),
      joinedAt: row.joined_at,
    }));
  }

  async listInvites(workspaceId: string): Promise<readonly WorkspaceInvite[]> {
    const data = await this.rpc(
      "list_workspace_invites",
      { target_workspace_id: workspaceId },
      "load workspace invitations",
    );
    return data.map((row) => ({
      id: row.invitation_id,
      role: inviteRoleSchema.parse(row.role),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at ?? undefined,
      revokedAt: row.revoked_at ?? undefined,
    }));
  }

  async createInvite(
    workspaceId: string,
    role: Exclude<WorkspaceRole, "owner">,
  ): Promise<CreatedWorkspaceInvite> {
    const rows = await this.rpc("create_workspace_invite", {
      target_workspace_id: workspaceId,
      invited_role: role,
      expires_in_hours: 168,
    }, "create an invitation");
    const created = rows[0];
    if (!created) throw new Error("The invitation was not created.");
    return {
      id: created.invitation_id,
      token: created.invitation_token,
      role: inviteRoleSchema.parse(created.role),
      expiresAt: created.expires_at,
    };
  }

  acceptInvite(token: string) {
    return this.rpc("accept_workspace_invite", { invitation_token: token }, "accept the invitation");
  }

  async revokeInvite(invitationId: string) {
    await this.rpc("revoke_workspace_invite", { invitation_id: invitationId }, "revoke the invitation");
  }

  async setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    await this.rpc("set_workspace_member_role", {
      target_workspace_id: workspaceId,
      target_user_id: userId,
      next_role: role,
    }, "change the workspace role");
  }

  async removeMember(workspaceId: string, userId: string) {
    await this.rpc("remove_workspace_member", {
      target_workspace_id: workspaceId,
      target_user_id: userId,
    }, "remove the workspace member");
  }

  async listWorlds(workspaceId: string): Promise<readonly RemoteWorldMetadata[]> {
    const data = await this.rpc(
      "list_world_snapshot_metadata",
      { target_workspace_id: workspaceId },
      "load synced worlds",
    );
    return data.map((row) => ({
      snapshotId: row.snapshot_id,
      identityKey: row.identity_key,
      name: row.name,
      platform: platformSchema.parse(row.platform),
      gameVersion: row.game_version,
      schemaVersion: row.schema_version,
      revision: row.revision,
      importedAt: row.imported_at ?? undefined,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? undefined,
    }));
  }

  async getWorld(snapshotId: string): Promise<RemoteWorldSnapshot> {
    const rows = await this.rpc(
      "get_world_snapshot",
      { target_snapshot_id: snapshotId },
      "download the synced world",
    );
    const row = rows[0];
    if (!row) throw new Error("The synced world no longer exists.");
    return {
      snapshotId: row.snapshot_id,
      workspaceId: row.workspace_id,
      identityKey: row.identity_key,
      name: row.name,
      platform: platformSchema.parse(row.platform),
      gameVersion: row.game_version,
      schemaVersion: row.schema_version,
      revision: row.revision,
      payload: row.payload,
      importedAt: row.imported_at ?? undefined,
      updatedAt: row.updated_at,
    };
  }

  async replaceWorld(input: {
    workspaceId: string;
    snapshotId: string;
    identityKey: string;
    expectedRevision: number;
    payload: WorldSnapshotPayload;
  }): Promise<RemoteWriteResult> {
    const rows = await this.rpc("replace_world_snapshot", {
      target_workspace_id: input.workspaceId,
      target_snapshot_id: input.snapshotId,
      target_identity_key: input.identityKey,
      expected_revision: input.expectedRevision,
      snapshot_name: input.payload.name,
      snapshot_platform: input.payload.platform,
      snapshot_game_version: "1.0",
      snapshot_schema_version: input.payload.schemaVersion,
      snapshot_payload: input.payload,
      snapshot_imported_at: input.payload.importedAt ?? null,
    }, "sync the world");
    return parseWriteResult(rows[0]);
  }

  async deleteWorld(snapshotId: string, expectedRevision: number): Promise<RemoteWriteResult> {
    const rows = await this.rpc("delete_world_snapshot", {
      target_snapshot_id: snapshotId,
      expected_revision: expectedRevision,
    }, "delete the synced world");
    return parseWriteResult(rows[0]);
  }

  private async rpc<Name extends keyof Database["public"]["Functions"]>(
    name: Name,
    args: Database["public"]["Functions"][Name]["Args"],
    action: string,
  ): Promise<Database["public"]["Functions"][Name]["Returns"]> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw requestError(action, error);
    return data;
  }
}

function parseWriteResult(row: {
  applied: boolean;
  snapshot_id: string | null;
  revision: number;
  updated_at: string | null;
  deleted_at: string | null;
} | undefined): RemoteWriteResult {
  if (!row) throw new Error("The server did not return a snapshot result.");
  return {
    applied: row.applied,
    snapshotId: row.snapshot_id ?? undefined,
    revision: row.revision,
    updatedAt: row.updated_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function requestError(action: string, error: { message: string }) {
  return new Error(`We couldn't ${action}. ${error.message}`);
}
