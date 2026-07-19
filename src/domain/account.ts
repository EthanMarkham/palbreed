export type WorkspaceRole = "owner" | "editor" | "viewer";
export type WorkspaceKind = "personal" | "team";

export type AccountProfile = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  kind: WorkspaceKind;
  role: WorkspaceRole;
  createdAt: string;
};

export type WorkspaceMember = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  role: WorkspaceRole;
  joinedAt: string;
};

export type WorkspaceInvite = {
  id: string;
  role: Exclude<WorkspaceRole, "owner">;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
};

export type CreatedWorkspaceInvite = {
  id: string;
  token: string;
  role: Exclude<WorkspaceRole, "owner">;
  expiresAt: string;
};

export type RemoteWorldMetadata = {
  snapshotId: string;
  identityKey: string;
  name: string;
  platform: "xbox" | "steam";
  gameVersion: string;
  schemaVersion: number;
  revision: number;
  importedAt?: string;
  updatedAt: string;
  deletedAt?: string;
};

export type RemoteWorldSnapshot = Omit<RemoteWorldMetadata, "deletedAt"> & {
  workspaceId: string;
  payload: unknown;
};

export type RemoteWriteResult = {
  applied: boolean;
  snapshotId?: string;
  revision: number;
  updatedAt?: string;
  deletedAt?: string;
};

export type SyncConflict = {
  localProfileId: string;
  worldName: string;
  remoteSnapshotId: string;
  remoteRevision: number;
  kind: "both-changed" | "deleted-remotely" | "read-only-local-change";
};

export type AccountSyncState = {
  status: "idle" | "syncing" | "synced" | "offline" | "conflict" | "error";
  lastSyncedAt?: string;
  error?: string;
  conflicts: readonly SyncConflict[];
};
