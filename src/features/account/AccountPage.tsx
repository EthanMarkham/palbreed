import { useEffect, useMemo, useRef, useState } from "react";
import StatusBanner from "../../components/StatusBanner";
import { runtimeConfig } from "../../config/runtimeConfig";
import type { WorkspaceRole } from "../../domain/account";
import { inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";
import { accountService } from "../../services/account/accountService";
import { useAccount } from "../../services/account/useAccount";

type AccountPageProps = {
  inviteToken?: string;
  onInviteAccepted: () => void;
};

type Operation = { busy: boolean; message?: string; error?: string };

export default function AccountPage({ inviteToken, onInviteAccepted }: AccountPageProps) {
  const account = useAccount();
  const inventory = useInventory();
  const [operation, setOperation] = useState<Operation>({ busy: false });
  const [email, setEmail] = useState("");
  const acceptedToken = useRef<string>();
  const activeWorkspace = account.workspaces.find(({ id }) => id === account.activeWorkspaceId);
  const signInMethod = runtimeConfig.supabase?.signInMethod ?? "email";
  const usesEmail = signInMethod === "email";

  const run = async (task: () => Promise<unknown>, message?: string) => {
    setOperation({ busy: true });
    try {
      await task();
      setOperation({ busy: false, message });
    } catch (error) {
      setOperation({
        busy: false,
        error: error instanceof Error ? error.message : "The account operation failed.",
      });
    }
  };

  useEffect(() => {
    if (!inviteToken || account.status !== "ready" || acceptedToken.current === inviteToken) return;
    acceptedToken.current = inviteToken;
    void run(
      async () => {
        await accountService.acceptInvite(inviteToken);
        onInviteAccepted();
      },
      "Invitation accepted. The shared workspace is now active.",
    );
  }, [account.status, inviteToken, onInviteAccepted]);

  if (account.status === "disabled") {
    return (
      <AccountShell>
        <section className="feature-card account-empty-card">
          <span className="account-state-mark">LOCAL</span>
          <h2>Account sync is not configured</h2>
          <p>Palpath is fully usable on this device. Configure Supabase only when you want signed-in backup and team workspaces.</p>
          {account.configurationErrors.length ? (
            <StatusBanner kind="error" message={account.configurationErrors.join(" ")} />
          ) : null}
        </section>
      </AccountShell>
    );
  }

  if (account.status === "loading") {
    return (
      <AccountShell>
        <section className="feature-card"><StatusBanner kind="working" message="Loading your account..." /></section>
      </AccountShell>
    );
  }

  if (account.status === "signed-out") {
    return (
      <AccountShell>
        <section className="feature-card account-signin-card">
          <div>
            <span className="section-kicker">OPTIONAL CLOUD SYNC</span>
            <h2>Keep local speed. Add backup when you want it.</h2>
            <p>Signing in syncs extracted world snapshots. Raw save files, parsing, and breeding calculations stay on your device.</p>
          </div>
          {inviteToken ? <p className="account-invite-note">Sign in to accept the workspace invitation.</p> : null}
          {usesEmail ? (
            <label className="account-email-field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                disabled={operation.busy}
              />
            </label>
          ) : null}
          <button
            className="primary-button"
            disabled={operation.busy}
            onClick={() => void run(
              () => accountService.signIn(email),
              usesEmail ? "Check your inbox for your secure sign-in link." : undefined,
            )}
          >
            {usesEmail ? "Email me a sign-in link" : `Continue with ${capitalize(signInMethod)}`}
          </button>
          {operation.message ? <StatusBanner kind="working" message={operation.message} /> : null}
          {operation.error ? <StatusBanner kind="error" message={operation.error} /> : null}
        </section>
      </AccountShell>
    );
  }

  if (account.status === "error") {
    return (
      <AccountShell>
        <section className="feature-card account-empty-card">
          <StatusBanner kind="error" message={account.error ?? "We couldn't load your account."} />
          <button className="secondary-button" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </AccountShell>
    );
  }

  return (
    <AccountShell>
      {account.configurationErrors.length ? (
        <StatusBanner kind="error" message={account.configurationErrors.join(" ")} />
      ) : null}
      {operation.error ? <StatusBanner kind="error" message={operation.error} /> : null}
      {operation.message ? <div className="account-success" role="status">{operation.message}</div> : null}

      <section className="account-grid">
        <ProfileCard
          key={account.profile?.displayName}
          displayName={account.profile?.displayName ?? "Palpath player"}
          email={account.user?.email}
          busy={operation.busy}
          onSave={(name) => run(() => accountService.updateDisplayName(name), "Profile updated.")}
        />

        <WorkspaceCard
          workspaces={account.workspaces}
          activeWorkspaceId={account.activeWorkspaceId}
          busy={operation.busy}
          onSelect={(id) => run(() => accountService.selectWorkspace(id))}
          onCreate={(name) => run(
            () => accountService.createTeamWorkspace(name),
            "Team workspace created.",
          )}
        />
      </section>

      <SyncCard
        workspaceName={activeWorkspace?.name}
        workspaceId={activeWorkspace?.id}
        canWrite={activeWorkspace?.role !== "viewer"}
        profiles={inventory.document.profiles}
        sync={account.sync}
        busy={operation.busy}
        onSyncAll={() => run(() => accountService.syncNow(), "Workspace is up to date.")}
        onSyncProfile={(profileId) => run(
          () => accountService.syncProfileToActive(profileId),
          "World synced to this workspace.",
        )}
        onUseCloud={(profileId) => run(() => accountService.useCloudVersion(profileId))}
        onKeepLocal={(profileId) => run(() => accountService.keepLocalVersion(profileId))}
      />

      {activeWorkspace?.kind === "team" ? (
        <TeamCard
          currentUserId={account.user?.id}
          role={activeWorkspace.role}
          members={account.members}
          invites={account.invites}
          busy={operation.busy}
          onCreateInvite={(role) => createAndCopyInvite(role, run)}
          onRevokeInvite={(id) => run(() => accountService.revokeInvite(id), "Invitation revoked.")}
          onRoleChange={(userId, role) => run(() => accountService.setMemberRole(userId, role))}
          onRemove={(userId) => run(() => accountService.removeMember(userId), "Workspace membership updated.")}
        />
      ) : null}

      <section className="feature-card account-data-card">
        <div>
          <span className="section-kicker">YOUR DATA</span>
          <h2>Portable by default</h2>
          <p>Export the local cache at any time. Removing a synced world from Inventory also removes it from the active workspace after a revision check.</p>
        </div>
        <div className="account-actions">
          <button className="secondary-button compact-button" onClick={exportInventory}>Export local data</button>
          <button
            className="secondary-button compact-button danger-button"
            disabled={operation.busy}
            onClick={() => void run(() => accountService.signOut())}
          >
            Sign out
          </button>
        </div>
      </section>
    </AccountShell>
  );
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="workspace feature-workspace account-workspace">
      <section className="feature-hero">
        <div>
          <span className="section-kicker">ACCOUNT</span>
          <h1>Worlds, backed up.</h1>
          <p>Optional account sync and team workspaces without moving save parsing or breeding compute off your device.</p>
        </div>
        <span className="hero-index">04</span>
      </section>
      {children}
    </main>
  );
}

function ProfileCard({
  displayName,
  email,
  busy,
  onSave,
}: {
  displayName: string;
  email?: string;
  busy: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(displayName);
  return (
    <section className="feature-card account-card">
      <span className="section-kicker">PROFILE</span>
      <h2>{displayName}</h2>
      <p>{email ?? "Signed in"}</p>
      <label className="account-field">
        <span>Display name</span>
        <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </label>
      <button
        className="secondary-button compact-button"
        disabled={busy || !name.trim() || name.trim() === displayName}
        onClick={() => void onSave(name)}
      >
        Save profile
      </button>
    </section>
  );
}

function WorkspaceCard({
  workspaces,
  activeWorkspaceId,
  busy,
  onSelect,
  onCreate,
}: {
  workspaces: readonly { id: string; name: string; kind: string; role: string }[];
  activeWorkspaceId?: string;
  busy: boolean;
  onSelect: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  return (
    <section className="feature-card account-card">
      <span className="section-kicker">WORKSPACE</span>
      <label className="account-field">
        <span>Active workspace</span>
        <select
          value={activeWorkspaceId}
          disabled={busy}
          onChange={(event) => void onSelect(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name} · {workspace.role}
            </option>
          ))}
        </select>
      </label>
      <div className="account-inline-form">
        <label className="account-field">
          <span>New team workspace</span>
          <input
            value={name}
            maxLength={80}
            placeholder="Guild or server name"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          className="secondary-button compact-button"
          disabled={busy || !name.trim()}
          onClick={() => {
            const cleanName = name.trim();
            void onCreate(cleanName).then(() => setName(""));
          }}
        >
          Create team
        </button>
      </div>
    </section>
  );
}

function SyncCard({
  workspaceName,
  workspaceId,
  canWrite,
  profiles,
  sync,
  busy,
  onSyncAll,
  onSyncProfile,
  onUseCloud,
  onKeepLocal,
}: {
  workspaceName?: string;
  workspaceId?: string;
  canWrite: boolean;
  profiles: readonly import("../../domain/inventory").InventoryProfile[];
  sync: import("../../domain/account").AccountSyncState;
  busy: boolean;
  onSyncAll: () => Promise<void>;
  onSyncProfile: (id: string) => Promise<void>;
  onUseCloud: (id: string) => Promise<void>;
  onKeepLocal: (id: string) => Promise<void>;
}) {
  const statusLabel = sync.status === "synced" && sync.lastSyncedAt
    ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}`
    : capitalize(sync.status);
  return (
    <section className="feature-card account-sync-card">
      <header className="account-section-header">
        <div>
          <span className="section-kicker">SYNC</span>
          <h2>{workspaceName ?? "Workspace worlds"}</h2>
          <p>Only extracted, validated world snapshots are uploaded. Raw save files never leave this device.</p>
        </div>
        <div className="account-actions">
          <span className={`sync-state is-${sync.status}`}>{statusLabel}</span>
          <button
            className="secondary-button compact-button"
            disabled={busy || sync.status === "syncing"}
            onClick={() => void onSyncAll()}
          >
            Sync now
          </button>
        </div>
      </header>
      {sync.error ? <StatusBanner kind="error" message={sync.error} /> : null}
      {sync.conflicts.map((conflict) => (
        <div className="sync-conflict" key={conflict.localProfileId}>
          <div>
            <strong>{conflict.worldName}</strong>
            <span>{conflict.kind === "deleted-remotely"
              ? "was deleted on another device"
              : conflict.kind === "read-only-local-change"
                ? "changed locally, but this workspace is view-only"
                : "changed both locally and in the cloud"}</span>
          </div>
          <button className="secondary-button compact-button" onClick={() => void onUseCloud(conflict.localProfileId)}>Use cloud</button>
          <button className="primary-button compact-button" disabled={!canWrite} onClick={() => void onKeepLocal(conflict.localProfileId)}>Keep local</button>
        </div>
      ))}
      <div className="account-world-list">
        {profiles.length ? profiles.map((profile) => {
          const binding = profile.cloudBindings?.find((candidate) => candidate.workspaceId === workspaceId);
          return (
            <div className="account-world-row" key={profile.id}>
              <div>
                <strong>{profile.name}</strong>
                <span>{profile.pals.length.toLocaleString()} Pals · {profile.platform}</span>
              </div>
              <span className={binding ? "is-synced" : "is-local"}>{binding ? `Cloud r${binding.remoteRevision}` : "Local only"}</span>
              {!binding && canWrite ? (
                <button className="secondary-button compact-button" disabled={busy} onClick={() => void onSyncProfile(profile.id)}>
                  Sync here
                </button>
              ) : null}
            </div>
          );
        }) : <p className="account-list-empty">Import a world from Inventory to begin syncing.</p>}
      </div>
    </section>
  );
}

function TeamCard({
  currentUserId,
  role,
  members,
  invites,
  busy,
  onCreateInvite,
  onRevokeInvite,
  onRoleChange,
  onRemove,
}: {
  currentUserId?: string;
  role: WorkspaceRole;
  members: readonly import("../../domain/account").WorkspaceMember[];
  invites: readonly import("../../domain/account").WorkspaceInvite[];
  busy: boolean;
  onCreateInvite: (role: "editor" | "viewer") => Promise<void>;
  onRevokeInvite: (id: string) => Promise<void>;
  onRoleChange: (userId: string, role: WorkspaceRole) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const pendingInvites = useMemo(
    () => invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt && new Date(invite.expiresAt) > new Date()),
    [invites],
  );
  return (
    <section className="feature-card account-team-card">
      <header className="account-section-header">
        <div>
          <span className="section-kicker">TEAM ACCESS</span>
          <h2>{members.length} {members.length === 1 ? "member" : "members"}</h2>
        </div>
        {role === "owner" ? (
          <div className="account-actions">
            <button className="secondary-button compact-button" disabled={busy} onClick={() => void onCreateInvite("viewer")}>Invite viewer</button>
            <button className="primary-button compact-button" disabled={busy} onClick={() => void onCreateInvite("editor")}>Invite editor</button>
          </div>
        ) : null}
      </header>
      <div className="account-member-list">
        {members.map((member) => (
          <div className="account-member-row" key={member.userId}>
            <div>
              <strong>{member.displayName}{member.userId === currentUserId ? " (you)" : ""}</strong>
              <span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
            </div>
            {role === "owner" ? (
              <select value={member.role} disabled={busy} onChange={(event) => void onRoleChange(member.userId, event.target.value as WorkspaceRole)}>
                <option value="owner">Owner</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            ) : <span className="member-role">{member.role}</span>}
            {(role === "owner" || member.userId === currentUserId) ? (
              <button className="secondary-button compact-button danger-button" disabled={busy} onClick={() => void onRemove(member.userId)}>
                {member.userId === currentUserId ? "Leave" : "Remove"}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {role === "owner" && pendingInvites.length ? (
        <div className="account-invite-list">
          <strong>Pending invitations</strong>
          {pendingInvites.map((invite) => (
            <div key={invite.id}>
              <span>{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
              <button className="secondary-button compact-button" onClick={() => void onRevokeInvite(invite.id)}>Revoke</button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

async function createAndCopyInvite(
  role: "editor" | "viewer",
  run: (task: () => Promise<unknown>, message?: string) => Promise<void>,
) {
  await run(async () => {
    const invite = await accountService.createInvite(role);
    const url = new URL(`${import.meta.env.BASE_URL}account`, window.location.origin);
    url.searchParams.set("invite", invite.token);
    await navigator.clipboard.writeText(url.toString());
  }, "A one-time invitation link was copied. It expires in seven days.");
}

function exportInventory() {
  const blob = new Blob([JSON.stringify(inventoryService.getDocument(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `palpath-inventory-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
