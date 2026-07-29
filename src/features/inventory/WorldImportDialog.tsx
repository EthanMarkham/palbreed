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
import { useSaveWatch } from "../../services/saveImport/useSaveWatch";

const SAVE_PATHS = {
  steam: "%LOCALAPPDATA%\\Pal\\Saved\\SaveGames",
  xbox: "%LOCALAPPDATA%\\Packages\\PocketpairInc.Palworld_ad4psfrxyesvt\\SystemAppData\\wgs",
} as const;

type ImportStatus = {
  kind: "idle" | "working" | "error";
  message?: string;
};

type WorldImportDialogProps = {
  profiles: readonly InventoryProfile[];
  onImported: (profileId: string, message: string) => void;
};

export default function WorldImportDialog({
  profiles,
  onImported,
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
      const handle = await chooseSaveDirectory();
      const files = await readSaveDirectory(handle);
      setManifest(await scanLogicalSaveSelection(files, platform));
      setDirectoryHandle(handle);
      setStatus({ kind: "idle" });
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

  const importSlot = async (slot: SaveSlotCandidate) => {
    if (!activeManifest) return;
    setCompletion(undefined);
    setStatus({ kind: "working", message: `Importing ${slot.label}…` });
    try {
      const preview = await extractPalsFromSlot(slot);
      const result = inventoryService.replaceImportedProfile(
        createImportedProfileInput(activeManifest, slot, preview),
      );
      const profile = inventoryService.getActiveProfile();
      if (!profile) throw new Error("We imported the world, but couldn't open it.");

      setImportedBySlot((current) => ({ ...current, [slot.id]: profile.id }));
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
      setStatus({ kind: "idle" });
      setCompletion(message);
      onImported(profile.id, message);
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const keepSlotSynced = async (slot: SaveSlotCandidate, profileId: string) => {
    if (!directoryHandle) return;
    setCompletion(undefined);
    setStatus({ kind: "working", message: `Turning on automatic refresh for ${slot.label}…` });
    try {
      await saveWatchService.enableAfterImport(profileId, directoryHandle, slot);
      setStatus({ kind: "idle" });
      setCompletion("Automatic refresh is on. It runs only while Palpath is open.");
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const reconnectWorld = async (profile: InventoryProfile) => {
    setCompletion(undefined);
    setStatus({ kind: "working", message: `Reconnecting ${profile.name}…` });
    try {
      await saveWatchService.reconnect(profile.id);
      setStatus({ kind: "idle" });
      setCompletion(`${profile.name} is watching its Steam save while Palpath is open.`);
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
        if (!open) resetSelection();
      }}
    >
      <Button className="primary-button inventory-import-trigger">
        <ManageWorldsIcon />
        {profiles.length ? "Manage worlds" : "Import world"}
      </Button>
      <ModalOverlay className="inventory-import-overlay" isDismissable={status.kind !== "working"}>
        <Modal className="inventory-import-modal">
          <Dialog className="inventory-import-dialog">
            <header className="inventory-import-header">
              <div>
                <span className="section-kicker">WORLDS</span>
                <Heading slot="title">{profiles.length ? "Manage your worlds" : "Import a world"}</Heading>
                <p>Import manually, or let Palpath refresh a Steam world while this site is open.</p>
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
                          {profile.platform === "steam" && persistentFoldersSupported ? (
                            watch ? (
                              <div className="managed-world-actions">
                                {watch.status === "needs-folder" || watch.status === "error" ? (
                                  <Button
                                    className="secondary-button compact-button"
                                    isDisabled={status.kind === "working"}
                                    onPress={() => void reconnectWorld(profile)}
                                  >
                                    Reconnect
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
                                onPress={() => void reconnectWorld(profile)}
                              >
                                Choose folder
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
                    Automatic refresh checks only each connected world’s <code>Level/01.sav</code> about every 15 seconds
                    and stops when all Palpath tabs close.
                  </p>
                </section>
              ) : null}

              <section className={`world-import-section${profiles.length ? " has-managed-worlds" : ""}`}>
                <div className="subheading import-section-heading">
                  <strong>{profiles.length ? "Import or refresh" : "Choose your save source"}</strong>
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
                    <span>{status.kind === "working" ? "Please wait…" : "Choose save folder"}</span>
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
                  <p className="platform-limit-note">Xbox worlds can be imported or refreshed manually. Automatic refresh is available for Steam.</p>
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
                      const needsConnection = !watch
                        || watch.status === "needs-folder"
                        || watch.status === "error";
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
                            <Button
                              className="secondary-button compact-button"
                              isDisabled={!supported || status.kind === "working"}
                              aria-label={supported ? `Import ${slot.label}` : `${slot.label} requires Palworld 1.0`}
                              onPress={() => void importSlot(slot)}
                            >
                              {profileId ? "Refresh" : "Import"}
                            </Button>
                            {platform === "steam"
                              && persistentFoldersSupported
                              && directoryHandle
                              && profileId
                              && needsConnection ? (
                                <Button
                                  className="primary-button compact-button"
                                  isDisabled={status.kind === "working"}
                                  onPress={() => void keepSlotSynced(slot, profileId)}
                                >
                                  {watch ? "Reconnect" : "Keep synced"}
                                </Button>
                              ) : null}
                            {watch && !needsConnection ? <span className="watching-badge"><PulseIcon />Watching</span> : null}
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
  if (profile.platform === "xbox") return `${profile.pals.length.toLocaleString()} Pals · Manual refresh`;
  if (!watch) return `${profile.pals.length.toLocaleString()} Pals · Not connected`;
  if (watch.status === "checking") return "Checking for changes…";
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

function ManageWorldsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="4" /><circle cx="16" cy="16" r="4" /><path d="M11 10.5 13.5 13M16 9V5m-2 2h4" /></svg>;
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
