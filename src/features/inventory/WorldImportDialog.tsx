import { useState } from "react";
import {
  Button,
  Dialog,
  DialogTrigger,
  FileTrigger,
  Heading,
  Modal,
  ModalOverlay,
} from "react-aria-components";
import StatusBanner from "../../components/StatusBanner";
import type { InventoryProfile } from "../../domain/inventory";
import {
  SaveImportError,
  type SaveManifest,
  type SavePlatform,
  type SaveSlotCandidate,
} from "../../domain/saveImport";
import { inventoryService } from "../../services/inventory/inventoryService";
import {
  chooseSaveDirectory,
  readSaveDirectory,
  supportsPersistentSaveFolders,
} from "../../services/saveImport/fileSystemDirectory";
import { createImportedProfileInput } from "../../services/saveImport/importedProfile";
import { extractPalsFromSlot } from "../../services/saveImport/palSaveParser";
import {
  scanLogicalSaveSelection,
  scanSaveSelection,
} from "../../services/saveImport/saveScanner";
import { saveWatchService } from "../../services/saveImport/saveWatchService";
import { readStableSaveDirectory } from "../../services/saveImport/stableSaveDirectory";
import { useSaveWatch } from "../../services/saveImport/useSaveWatch";

const SAVE_PATHS = {
  steam: "%LOCALAPPDATA%\\Pal\\Saved\\SaveGames",
  xbox: "%LOCALAPPDATA%\\Packages\\PocketpairInc.Palworld_ad4psfrxyesvt\\SystemAppData\\wgs",
} as const;

type ImportStatus = {
  kind: "idle" | "working" | "error";
  message?: string;
};

type RefreshSelection = {
  manifest: SaveManifest;
  slot: SaveSlotCandidate;
  directoryHandle?: FileSystemDirectoryHandle;
};

type WorldImportDialogProps = {
  profiles: readonly InventoryProfile[];
  onImported: (profileId: string, message: string) => void;
  trigger?: "header" | "inventory";
};

export default function WorldImportDialog({
  profiles,
  onImported,
  trigger = "inventory",
}: WorldImportDialogProps) {
  const saveWatch = useSaveWatch();
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState<SavePlatform>("steam");
  const [manifest, setManifest] = useState<SaveManifest>();
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle>();
  const [importedBySlot, setImportedBySlot] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ImportStatus>({ kind: "idle" });
  const [completion, setCompletion] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const activeManifest = manifest?.platform === platform ? manifest : undefined;
  const persistentFoldersSupported = supportsPersistentSaveFolders();

  const resetSelection = () => {
    setManifest(undefined);
    setDirectoryHandle(undefined);
    setImportedBySlot({});
    setStatus({ kind: "idle" });
    setCompletion(undefined);
    setCopyStatus("idle");
  };

  const changePlatform = (nextPlatform: SavePlatform) => {
    if (nextPlatform === platform) return;
    setPlatform(nextPlatform);
    resetSelection();
  };

  const scanPickedDirectory = async () => {
    setManifest(undefined);
    setDirectoryHandle(undefined);
    setCompletion(undefined);
    setStatus({ kind: "working", message: "Looking for worlds…" });
    try {
      const handle = await chooseSaveDirectory(platform);
      const files = await readSaveDirectory(handle);
      const nextManifest = await scanLogicalSaveSelection(files, platform);
      setManifest(nextManifest);
      setDirectoryHandle(handle);
      setStatus({ kind: "idle" });

      // The common Xbox case is a single current world. Selecting WGS is the
      // user's intent to connect it, so do not make them confirm it again.
      const supportedSlots = nextManifest.slots.filter(({ format }) => format === "palworld-1.0");
      if (supportedSlots.length === 1 && supportedSlots[0]) {
        await importSlot(supportedSlots[0], {
          manifest: nextManifest,
          slot: supportedSlots[0],
          directoryHandle: handle,
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const scanFallbackFolder = async (files: FileList | null) => {
    const selection = [...(files ?? [])];
    if (!selection.length) return;
    setManifest(undefined);
    setDirectoryHandle(undefined);
    setCompletion(undefined);
    setStatus({ kind: "working", message: "Looking for worlds…" });
    try {
      setManifest(await scanSaveSelection(selection, platform));
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const importSlot = async (
    slot: SaveSlotCandidate,
    refreshSelection?: RefreshSelection,
  ) => {
    const selectedManifest = refreshSelection?.manifest ?? activeManifest;
    if (!selectedManifest) return;
    const selectedDirectoryHandle = refreshSelection?.directoryHandle ?? directoryHandle;
    const isRefresh = Boolean(
      importedBySlot[slot.id]
      ?? findImportedProfile(profiles, selectedManifest, slot)?.id,
    );
    setCompletion(undefined);
    setStatus({
      kind: "working",
      message: `${isRefresh ? "Refreshing" : "Importing"} ${slot.label}…`,
    });
    try {
      let importManifest = selectedManifest;
      let importSlot = refreshSelection?.slot ?? slot;
      if (refreshSelection) {
        setManifest(importManifest);
      }
      if (selectedDirectoryHandle) {
        const files = await readStableSaveDirectory(selectedDirectoryHandle, {
          platform: selectedManifest.platform,
          accountId: selectedManifest.accountId,
          worldRootPath: slot.rootPath,
        });
        importManifest = await scanLogicalSaveSelection(files, selectedManifest.platform);
        const refreshedSlot = importManifest.slots.find(({ worldId }) => worldId === slot.worldId)
          ?? (importManifest.slots.length === 1 ? importManifest.slots[0] : undefined);
        if (!refreshedSlot) {
          throw new SaveImportError(
            "NO_WORLDS",
            `We couldn't find ${slot.label} in the selected folder.`,
          );
        }
        importSlot = refreshedSlot;
        setManifest(importManifest);
      }

      const preview = await extractPalsFromSlot(importSlot);
      const result = inventoryService.replaceImportedProfile(
        createImportedProfileInput(importManifest, importSlot, preview),
      );
      const profile = inventoryService.getActiveProfile();
      if (!profile) throw new Error("We imported the world, but couldn't open it.");

      let syncError: string | undefined;
      if (persistentFoldersSupported && selectedDirectoryHandle) {
        try {
          await saveWatchService.enableAfterImport(
            profile.id,
            selectedDirectoryHandle,
            importSlot,
          );
        } catch (error) {
          syncError = importMessage(error);
        }
      }

      setImportedBySlot((current) => ({
        ...current,
        [slot.id]: profile.id,
        [importSlot.id]: profile.id,
      }));
      const skipped = preview.unknownPalIds.length + preview.unknownPassiveIds.length;
      const action = result === "created"
        ? "Imported"
        : result === "updated"
          ? "Updated"
          : "Already current";
      const message = result === "unchanged"
        ? `${profile.name} is already current.`
        : `${action} ${preview.pals.length.toLocaleString()} Pals.${skipped
          ? ` Skipped ${skipped} ${skipped === 1 ? "entry" : "entries"} that Palpath doesn't recognize yet.`
          : ""}`;
      const completionMessage = persistentFoldersSupported && selectedDirectoryHandle && !syncError
        ? `${message} Sync is on while Palpath is open.`
        : message;
      setStatus(syncError
        ? { kind: "error", message: `The world was imported, but sync could not start: ${syncError}` }
        : { kind: "idle" });
      setCompletion(completionMessage);
      onImported(profile.id, completionMessage);
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const refreshFallbackSlot = async (
    files: FileList | null,
    previousSlot: SaveSlotCandidate,
  ) => {
    const selection = [...(files ?? [])];
    if (!selection.length || !activeManifest) return;
    setCompletion(undefined);
    setStatus({ kind: "working", message: `Refreshing ${previousSlot.label}…` });
    try {
      const refreshedManifest = await scanSaveSelection(
        selection,
        activeManifest.platform,
      );
      const refreshedSlot = refreshedManifest.slots.find(
        ({ worldId }) => worldId === previousSlot.worldId,
      ) ?? (refreshedManifest.slots.length === 1
        ? refreshedManifest.slots[0]
        : undefined);
      if (!refreshedSlot) {
        throw new SaveImportError(
          "NO_WORLDS",
          `We couldn't find ${previousSlot.label} in the selected folder.`,
        );
      }
      await importSlot(previousSlot, {
        manifest: refreshedManifest,
        slot: refreshedSlot,
      });
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const refreshWorld = async (profile: InventoryProfile) => {
    setCompletion(undefined);
    setStatus({ kind: "working", message: `Refreshing ${profile.name}…` });
    try {
      const result = await saveWatchService.refresh(profile.id);
      const message = result === "updated"
        ? `Updated ${profile.name} from its ${profile.platform === "xbox" ? "Xbox" : "Steam"} save.`
        : `${profile.name} is already current.`;
      setStatus({ kind: "idle" });
      setCompletion(message);
      onImported(profile.id, message);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const chooseWorldFolder = async (profile: InventoryProfile) => {
    setCompletion(undefined);
    setStatus({ kind: "working", message: `Connecting ${profile.name}…` });
    try {
      await saveWatchService.chooseFolder(profile.id);
      setStatus({ kind: "idle" });
      setCompletion(`${profile.name} is connected and current.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const stopWatching = async (profile: InventoryProfile) => {
    setStatus({ kind: "working", message: `Stopping automatic refresh for ${profile.name}…` });
    try {
      await saveWatchService.disable(profile.id);
      setStatus({ kind: "idle" });
      setCompletion(`${profile.name} will now refresh only when you import it again.`);
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const copyCurrentPath = async () => {
    const copied = await copyPath(SAVE_PATHS[platform]);
    setCopyStatus(copied ? "copied" : "error");
    window.setTimeout(() => setCopyStatus("idle"), 1_800);
  };

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && status.kind === "working") return;
        setIsOpen(open);
      }}
    >
      <Button
        className={trigger === "header" ? "header-icon-trigger" : "primary-button inventory-import-trigger"}
        aria-label={profiles.length ? "Manage worlds" : "Import a world"}
      >
        <UploadIcon />
        {trigger === "inventory" ? (profiles.length ? "Manage worlds" : "Import world") : null}
      </Button>
      <ModalOverlay className="inventory-import-overlay" isDismissable={status.kind !== "working"}>
        <Modal className="inventory-import-modal">
          <Dialog className="inventory-import-dialog">
            <header className="inventory-import-header">
              <div>
                <span className="section-kicker">WORLDS</span>
                <Heading slot="title">{profiles.length ? "Manage your worlds" : "Import a world"}</Heading>
                <p>Connect a local save once. Palpath keeps it current while this site is open.</p>
              </div>
              <Button
                slot="close"
                className="inventory-modal-close"
                aria-label="Close world manager"
                isDisabled={status.kind === "working"}
              >
                <CloseIcon />
              </Button>
            </header>

            <div className="inventory-import-body">
              {profiles.length ? (
                <section className="managed-worlds" aria-labelledby="managed-worlds-title">
                  <div className="subheading">
                    <strong id="managed-worlds-title">Imported worlds</strong>
                    <span>{profiles.length}</span>
                  </div>
                  <div className="managed-world-list">
                    {profiles.map((profile) => {
                      const watch = saveWatch.worlds[profile.id];
                      return (
                        <article className="managed-world-row" key={profile.id}>
                          <span className={`inventory-world-platform is-${profile.platform}`}>
                            {profile.platform === "steam" ? "ST" : "XB"}
                          </span>
                          <div>
                            <strong>{profile.name}</strong>
                            <small>{worldStatus(profile, watch)}</small>
                          </div>
                          {persistentFoldersSupported ? (
                            !saveWatch.ready ? (
                              <span className="manual-only-badge">Loading sync…</span>
                            ) : watch ? (
                              <div className="managed-world-actions">
                                <Button
                                  className={`${watch.status === "needs-permission" ? "primary" : "secondary"}-button compact-button`}
                                  isDisabled={status.kind === "working"}
                                  onPress={() => void refreshWorld(profile)}
                                >
                                  {watch.status === "needs-permission" ? "Resume sync" : "Check now"}
                                </Button>
                                {watch.status === "needs-permission"
                                  || watch.status === "needs-folder"
                                  || watch.status === "error" ? (
                                  <Button
                                    className="secondary-button compact-button"
                                    isDisabled={status.kind === "working"}
                                    onPress={() => void chooseWorldFolder(profile)}
                                  >
                                    Change source
                                  </Button>
                                ) : null}
                                <Button
                                  className="secondary-button compact-button"
                                  isDisabled={status.kind === "working"}
                                  onPress={() => void stopWatching(profile)}
                                >
                                  Stop
                                </Button>
                              </div>
                            ) : (
                              <Button
                                className="secondary-button compact-button"
                                isDisabled={status.kind === "working"}
                                onPress={() => void chooseWorldFolder(profile)}
                              >
                                Connect save
                              </Button>
                            )
                          ) : (
                            <span className="manual-only-badge">Manual</span>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <p className="watch-lifetime-note">
                    Select a save once. Palpath remembers it, checks about every 15 seconds while open,
                    and asks only to resume browser access after a restart.
                  </p>
                </section>
              ) : null}

              <section className={`world-import-section${profiles.length ? " has-managed-worlds" : ""}`}>
                <div className="subheading import-section-heading">
                  <strong>{profiles.length ? "Connect another save" : "Choose your save source"}</strong>
                </div>

                <div className="platform-tabs" role="group" aria-label="Save platform">
                  <Button
                    className={platform === "steam" ? "is-active" : ""}
                    aria-pressed={platform === "steam"}
                    isDisabled={status.kind === "working"}
                    onPress={() => changePlatform("steam")}
                  >
                    Steam
                  </Button>
                  <Button
                    className={platform === "xbox" ? "is-active" : ""}
                    aria-pressed={platform === "xbox"}
                    isDisabled={status.kind === "working"}
                    onPress={() => changePlatform("xbox")}
                  >
                    Xbox / Game Pass
                  </Button>
                </div>

                <div className="path-card">
                  <div className="path-labels">
                    <span><small>System</small>{platform === "xbox" ? "Xbox / Microsoft Store" : "Windows"}</span>
                    <span><small>Game</small>Palworld</span>
                    <span><small>Choose</small>{platform === "xbox" ? "wgs folder" : "SaveGames or world folder"}</span>
                  </div>
                  <div className="copy-box">
                    <code>{SAVE_PATHS[platform]}</code>
                    <Button aria-live="polite" onPress={() => void copyCurrentPath()}>
                      {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Couldn't copy" : "Copy path"}
                    </Button>
                  </div>
                </div>

                {persistentFoldersSupported ? (
                  <Button
                    className="primary-button import-button"
                    isDisabled={status.kind === "working"}
                    onPress={() => void scanPickedDirectory()}
                  >
                    <FolderIcon />
                    <span>{status.kind === "working" ? "Please wait…" : platform === "xbox" ? "Connect Xbox saves" : "Connect Steam saves"}</span>
                  </Button>
                ) : (
                  <FileTrigger acceptDirectory allowsMultiple onSelect={(files) => void scanFallbackFolder(files)}>
                    <Button className="primary-button import-button" isDisabled={status.kind === "working"}>
                      <FolderIcon />
                      <span>{status.kind === "working" ? "Please wait…" : "Choose save folder"}</span>
                    </Button>
                  </FileTrigger>
                )}
                <p className="privacy-note">
                  <LockIcon />
                  Your save stays on this device. Signed-in accounts sync only changed Pal data.
                </p>

                {platform === "xbox" ? (
                  <p className="platform-limit-note">
                    Choose the WGS folder once. Palpath follows Xbox's rotating save blobs and
                    refreshes connected worlds automatically while this tab is open.
                  </p>
                ) : null}
                {status.kind !== "idle" && status.message ? (
                  <StatusBanner kind={status.kind} message={status.message} />
                ) : null}
                {completion ? <div className="import-completion" role="status"><CheckIcon />{completion}</div> : null}

                {activeManifest ? (
                  <div className="world-list">
                    <div className="subheading">
                      <strong>Choose a world</strong>
                      <span>{activeManifest.slots.length} {activeManifest.slots.length === 1 ? "world" : "worlds"} found</span>
                    </div>
                    {activeManifest.slots.map((slot) => {
                      const supported = slot.format === "palworld-1.0";
                      const importedProfile = findImportedProfile(profiles, activeManifest, slot);
                      const profileId = importedBySlot[slot.id] ?? importedProfile?.id;
                      const watch = profileId ? saveWatch.worlds[profileId] : undefined;
                      return (
                        <article className="world-row" key={slot.id}>
                          <div>
                            <strong>{importedProfile?.name ?? slot.label}</strong>
                            <span>{slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : "Date not available"}</span>
                          </div>
                          <span className={`format-badge is-${supported ? "supported" : "unsupported"}`}>
                            {supported ? "Palworld 1.0" : slot.format === "pre-1.0" ? "Older save" : "Not supported"}
                          </span>
                          <div className="world-row-actions">
                            {profileId && !directoryHandle ? (
                              <FileTrigger
                                acceptDirectory
                                allowsMultiple
                                onSelect={(files) => void refreshFallbackSlot(files, slot)}
                              >
                                <Button
                                  className="secondary-button compact-button"
                                  isDisabled={!supported || status.kind === "working"}
                                  aria-label={supported
                                    ? `Choose ${slot.label} again to refresh it`
                                    : `${slot.label} requires Palworld 1.0`}
                                >
                                  Refresh
                                </Button>
                              </FileTrigger>
                            ) : (
                              <Button
                                className="secondary-button compact-button"
                                isDisabled={!supported || status.kind === "working"}
                                aria-label={supported ? `Import ${slot.label}` : `${slot.label} requires Palworld 1.0`}
                                onPress={() => void importSlot(slot)}
                              >
                                {profileId ? "Update & connect" : "Import & connect"}
                              </Button>
                            )}
                            {watch && watch.status === "watching" ? (
                              <span className="watching-badge"><PulseIcon />Connected</span>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

function findImportedProfile(
  profiles: readonly InventoryProfile[],
  manifest: SaveManifest,
  slot: SaveSlotCandidate,
) {
  return profiles.find((profile) =>
    profile.platform === manifest.platform
    && profile.worldId === slot.worldId
    && (!profile.accountId || !manifest.accountId || profile.accountId === manifest.accountId),
  );
}

function worldStatus(
  profile: InventoryProfile,
  watch: ReturnType<typeof useSaveWatch>["worlds"][string] | undefined,
) {
  if (!watch) return `${profile.pals.length.toLocaleString()} Pals · Not connected`;
  if (watch.status === "checking") return "Checking for changes…";
  if (watch.status === "needs-permission") return "Sync paused · Resume with one click";
  if (watch.status === "needs-folder") return "Folder access needs to be reconnected";
  if (watch.status === "error") return watch.message;
  return `${profile.pals.length.toLocaleString()} Pals · Watching while open`;
}

function importMessage(error: unknown) {
  if (error instanceof SaveImportError) {
    if (error.code === "CORRUPT_SAVE") {
      return "We couldn't read this world. Palworld may be saving right now. Wait a few seconds, then try again.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "We couldn't import this world.";
}

async function copyPath(path: string) {
  try {
    await navigator.clipboard.writeText(path);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = path;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  }
}

function UploadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L8 8m4-4 4 4" /><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>;
}

function FolderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.3 3 3L13 4.7" /></svg>;
}

function PulseIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" /></svg>;
}
