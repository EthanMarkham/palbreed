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
import type { WorldSnapshotPayload } from "../sync/worldSnapshot";

export interface AccountGateway {
  ensureAccount(): Promise<void>;
  getProfile(): Promise<AccountProfile>;
  updateDisplayName(displayName: string): Promise<AccountProfile>;
  listWorkspaces(): Promise<readonly WorkspaceSummary[]>;
  createTeamWorkspace(name: string): Promise<string>;
  listMembers(workspaceId: string): Promise<readonly WorkspaceMember[]>;
  listInvites(workspaceId: string): Promise<readonly WorkspaceInvite[]>;
  createInvite(
    workspaceId: string,
    role: Exclude<WorkspaceRole, "owner">,
  ): Promise<CreatedWorkspaceInvite>;
  acceptInvite(token: string): Promise<string>;
  revokeInvite(invitationId: string): Promise<void>;
  setMemberRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
  listWorlds(workspaceId: string): Promise<readonly RemoteWorldMetadata[]>;
  getWorld(snapshotId: string): Promise<RemoteWorldSnapshot>;
  replaceWorld(input: {
    workspaceId: string;
    snapshotId: string;
    identityKey: string;
    expectedRevision: number;
    payload: WorldSnapshotPayload;
  }): Promise<RemoteWriteResult>;
  deleteWorld(snapshotId: string, expectedRevision: number): Promise<RemoteWriteResult>;
}
