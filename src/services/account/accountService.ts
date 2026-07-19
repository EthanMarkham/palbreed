import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { runtimeConfig } from "../../config/runtimeConfig";
import type {
  AccountProfile,
  AccountSyncState,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceSummary,
} from "../../domain/account";
import type { InventoryProfile } from "../../domain/inventory";
import { inventoryService, type InventoryService } from "../inventory/inventoryService";
import type { Database } from "../supabase/database.types";
import { WorkspaceSyncCoordinator } from "../sync/workspaceSyncCoordinator";
import type { AccountGateway } from "./accountGateway";

type Listener = () => void;

export type AccountSnapshot = {
  status: "disabled" | "loading" | "signed-out" | "ready" | "error";
  user?: { id: string; email?: string };
  profile?: AccountProfile;
  workspaces: readonly WorkspaceSummary[];
  activeWorkspaceId?: string;
  members: readonly WorkspaceMember[];
  invites: readonly WorkspaceInvite[];
  sync: AccountSyncState;
  error?: string;
  configurationErrors: readonly string[];
};

const emptySync: AccountSyncState = { status: "idle", conflicts: [] };

export class AccountService {
  private readonly listeners = new Set<Listener>();
  private syncCoordinator?: WorkspaceSyncCoordinator;
  private snapshot: AccountSnapshot;
  private started = false;
  private sessionGeneration = 0;

  constructor(
    private client: SupabaseClient<Database> | undefined,
    private gateway: AccountGateway | undefined,
    private readonly inventory: InventoryService,
  ) {
    this.snapshot = {
      status: (client && gateway) || runtimeConfig.supabase ? "loading" : "disabled",
      workspaces: [],
      members: [],
      invites: [],
      sync: emptySync,
      configurationErrors: runtimeConfig.errors,
    };
    if (gateway) this.configureSync(gateway);
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    if (this.started) return;
    this.started = true;
    this.inventory.start();
    this.inventory.subscribeToProfileChanges((profile) => {
      this.syncCoordinator?.syncChangedProfile(profile);
    });
    if (this.client && this.gateway) this.bindAuth();
    else if (runtimeConfig.supabase) void this.initializeSupabase();
  }

  private bindAuth() {
    const client = this.client;
    if (!client) return;
    client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => void this.applySession(session));
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (error) this.fail(error);
      else void this.applySession(data.session);
    });
  }

  private async initializeSupabase() {
    try {
      const [{ supabaseClient: client }, { SupabaseAccountGateway }] = await Promise.all([
        import("../supabase/supabaseClient"),
        import("./supabaseAccountGateway"),
      ]);
      if (!client) throw new Error("Supabase configuration could not be loaded.");
      this.client = client;
      this.gateway = new SupabaseAccountGateway(client);
      this.configureSync(this.gateway);
      this.bindAuth();
    } catch (error) {
      this.fail(error);
    }
  }

  private configureSync(gateway: AccountGateway) {
    this.syncCoordinator = new WorkspaceSyncCoordinator(
      this.inventory,
      gateway,
      (sync) => this.update({ sync }),
    );
  }

  async signIn(email?: string) {
    if (!this.client || !runtimeConfig.supabase) {
      throw new Error("Account sync is not configured for this deployment.");
    }
    if (runtimeConfig.supabase.signInMethod === "email") {
      const normalizedEmail = email?.trim();
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new Error("Enter a valid email address.");
      }
      const { error } = await this.client.auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: window.location.href },
      });
      if (error) throw new Error(`We couldn't send the sign-in link. ${error.message}`);
      return;
    }

    const { error } = await this.client.auth.signInWithOAuth({
      provider: runtimeConfig.supabase.signInMethod,
      options: { redirectTo: window.location.href },
    });
    if (error) throw new Error(`We couldn't start sign-in. ${error.message}`);
  }

  async signOut() {
    if (!this.client) return;
    const { error } = await this.client.auth.signOut();
    if (error) throw new Error(`We couldn't sign you out. ${error.message}`);
  }

  async updateDisplayName(displayName: string) {
    const gateway = this.requireGateway();
    const profile = await gateway.updateDisplayName(displayName);
    this.update({ profile });
  }

  async selectWorkspace(workspaceId: string) {
    const workspace = this.snapshot.workspaces.find(({ id }) => id === workspaceId);
    if (!workspace || !this.snapshot.user) throw new Error("That workspace is not available.");
    persistActiveWorkspace(this.snapshot.user.id, workspace.id);
    const details = await this.loadWorkspaceDetails(workspace);
    this.update({ activeWorkspaceId: workspace.id, ...details });
    await this.syncCoordinator?.activate({
      userId: this.snapshot.user.id,
      workspaceId: workspace.id,
      canWrite: workspace.role !== "viewer",
      claimUnbound: workspace.kind === "personal",
    });
  }

  async createTeamWorkspace(name: string) {
    const gateway = this.requireGateway();
    const workspaceId = await gateway.createTeamWorkspace(name);
    await this.refreshWorkspaces(workspaceId);
    return workspaceId;
  }

  async createInvite(role: Exclude<WorkspaceRole, "owner">) {
    const gateway = this.requireGateway();
    const workspace = this.requireActiveWorkspace("owner");
    const invitation = await gateway.createInvite(workspace.id, role);
    this.update({ invites: await gateway.listInvites(workspace.id) });
    return invitation;
  }

  async acceptInvite(token: string) {
    const workspaceId = await this.requireGateway().acceptInvite(token.trim());
    await this.refreshWorkspaces(workspaceId);
    return workspaceId;
  }

  async revokeInvite(invitationId: string) {
    const gateway = this.requireGateway();
    const workspace = this.requireActiveWorkspace("owner");
    await gateway.revokeInvite(invitationId);
    this.update({ invites: await gateway.listInvites(workspace.id) });
  }

  async setMemberRole(userId: string, role: WorkspaceRole) {
    const gateway = this.requireGateway();
    const workspace = this.requireActiveWorkspace("owner");
    await gateway.setMemberRole(workspace.id, userId, role);
    const details = await this.loadWorkspaceDetails(workspace);
    this.update(details);
  }

  async removeMember(userId: string) {
    const gateway = this.requireGateway();
    const workspace = this.requireActiveWorkspace();
    await gateway.removeMember(workspace.id, userId);
    if (userId === this.snapshot.user?.id) await this.refreshWorkspaces();
    else this.update(await this.loadWorkspaceDetails(workspace));
  }

  syncNow() {
    return this.syncCoordinator?.syncNow() ?? Promise.resolve();
  }

  syncProfileToActive(profileId: string) {
    return this.syncCoordinator?.syncProfileToActive(profileId)
      ?? Promise.reject(new Error("Account sync is not active."));
  }

  removeInventoryProfile(profile: InventoryProfile) {
    return this.syncCoordinator?.removeProfile(profile.id) ?? Promise.resolve(this.inventory.removeProfile(profile.id));
  }

  useCloudVersion(profileId: string) {
    return this.syncCoordinator?.useCloud(profileId) ?? Promise.resolve();
  }

  keepLocalVersion(profileId: string) {
    return this.syncCoordinator?.keepLocal(profileId) ?? Promise.resolve();
  }

  private async applySession(session: Session | null) {
    const generation = ++this.sessionGeneration;
    if (!session || !this.gateway) {
      this.syncCoordinator?.deactivate();
      this.snapshot = {
        ...this.snapshot,
        status: this.client ? "signed-out" : "disabled",
        user: undefined,
        profile: undefined,
        workspaces: [],
        activeWorkspaceId: undefined,
        members: [],
        invites: [],
        sync: emptySync,
        error: undefined,
      };
      this.emit();
      return;
    }

    this.update({ status: "loading", error: undefined });
    try {
      await this.gateway.ensureAccount();
      const [profile, workspaces] = await Promise.all([
        this.gateway.getProfile(),
        this.gateway.listWorkspaces(),
      ]);
      if (generation !== this.sessionGeneration) return;
      const preferredId = readActiveWorkspace(session.user.id);
      const activeWorkspace = workspaces.find(({ id }) => id === preferredId)
        ?? workspaces.find(({ kind }) => kind === "personal")
        ?? workspaces[0];
      if (!activeWorkspace) throw new Error("Your personal workspace was not created.");
      const details = await this.loadWorkspaceDetails(activeWorkspace);
      if (generation !== this.sessionGeneration) return;
      this.snapshot = {
        ...this.snapshot,
        status: "ready",
        user: { id: session.user.id, email: session.user.email },
        profile,
        workspaces,
        activeWorkspaceId: activeWorkspace.id,
        ...details,
        error: undefined,
      };
      this.emit();
      persistActiveWorkspace(session.user.id, activeWorkspace.id);
      await this.syncCoordinator?.activate({
        userId: session.user.id,
        workspaceId: activeWorkspace.id,
        canWrite: activeWorkspace.role !== "viewer",
        claimUnbound: activeWorkspace.kind === "personal",
      });
    } catch (error) {
      if (generation === this.sessionGeneration) this.fail(error);
    }
  }

  private async refreshWorkspaces(preferredId?: string) {
    const gateway = this.requireGateway();
    const user = this.snapshot.user;
    if (!user) throw new Error("Sign in before managing workspaces.");
    const workspaces = await gateway.listWorkspaces();
    const activeWorkspace = workspaces.find(({ id }) => id === preferredId)
      ?? workspaces.find(({ id }) => id === this.snapshot.activeWorkspaceId)
      ?? workspaces.find(({ kind }) => kind === "personal")
      ?? workspaces[0];
    if (!activeWorkspace) throw new Error("No workspace is available.");
    const details = await this.loadWorkspaceDetails(activeWorkspace);
    this.update({ workspaces, activeWorkspaceId: activeWorkspace.id, ...details });
    persistActiveWorkspace(user.id, activeWorkspace.id);
    await this.syncCoordinator?.activate({
      userId: user.id,
      workspaceId: activeWorkspace.id,
      canWrite: activeWorkspace.role !== "viewer",
      claimUnbound: activeWorkspace.kind === "personal",
    });
  }

  private async loadWorkspaceDetails(workspace: WorkspaceSummary) {
    const gateway = this.requireGateway();
    const [members, invites] = await Promise.all([
      gateway.listMembers(workspace.id),
      workspace.role === "owner" && workspace.kind === "team"
        ? gateway.listInvites(workspace.id)
        : Promise.resolve([]),
    ]);
    return { members, invites };
  }

  private requireGateway() {
    if (!this.gateway) throw new Error("Account sync is not configured for this deployment.");
    return this.gateway;
  }

  private requireActiveWorkspace(requiredRole?: WorkspaceRole) {
    const workspace = this.snapshot.workspaces.find(({ id }) => id === this.snapshot.activeWorkspaceId);
    if (!workspace) throw new Error("Choose a workspace first.");
    if (requiredRole && workspace.role !== requiredRole) {
      throw new Error(`${capitalize(requiredRole)} access is required.`);
    }
    return workspace;
  }

  private update(change: Partial<AccountSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.emit();
  }

  private fail(error: unknown) {
    this.update({
      status: "error",
      error: error instanceof Error ? error.message : "We couldn't load your account.",
    });
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

export const accountService = new AccountService(undefined, undefined, inventoryService);

function activeWorkspaceKey(userId: string) {
  return `palpath-active-workspace:${userId}`;
}

function persistActiveWorkspace(userId: string, workspaceId: string) {
  try {
    localStorage.setItem(activeWorkspaceKey(userId), workspaceId);
  } catch {
    // The workspace still works for this session when storage is unavailable.
  }
}

function readActiveWorkspace(userId: string) {
  try {
    return localStorage.getItem(activeWorkspaceKey(userId)) ?? undefined;
  } catch {
    return undefined;
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
