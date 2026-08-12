import { useState } from "react";
import { AnimatePresence } from "motion/react";
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
  listXboxAccountDirectories,
  readSaveDirectory,
  supportsDirectoryPicker,
} from "../../services/saveImport/fileSystemDirectory";
import { createImportedProfileInput } from "../../services/saveImport/importedProfile";
import { extractPalsFromSlot } from "../../services/saveImport/palSaveParser";
import {
  scanLogicalSaveSelection,
  scanSaveSelection,
} from "../../services/saveImport/saveScanner";
import { readStableSaveDirectory } from "../../services/saveImport/stableSaveDirectory";
import ImportPathLoadingOverlay from "./ImportPathLoadingOverlay";

const SAVE_PATHS = {
  steam: "%LOCALAPPDATA%\\Pal\\Saved\\SaveGames",
  xbox: "%LOCALAPPDATA%\\Packages\\PocketpairInc.Palworld_ad4psfrxyesvt\\SystemAppData\\wgs",
} as const;

type ImportStatus = {
  kind: "idle" | "working" | "error";
  message?: string;
};

type XboxAccountOption = {
  directoryHandle: FileSystemDirectoryHandle;
  folderName: string;
  manifest?: SaveManifest;
  error?: string;
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
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState<SavePlatform>("steam");
  const [manifest, setManifest] = useState<SaveManifest>();
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle>();
  const [folderName, setFolderName] = useState<string>();
  const [xboxAccountOptions, setXboxAccountOptions] = useState<readonly XboxAccountOption[]>([]);
  const [status, setStatus] = useState<ImportStatus>({ kind: "idle" });
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const activeManifest = manifest?.platform === platform ? manifest : undefined;
  const canPickDirectory = supportsDirectoryPicker();

  const resetFlow = (resetPlatform = false) => {
    if (resetPlatform) setPlatform("steam");
    setManifest(undefined);
    setDirectoryHandle(undefined);
    setFolderName(undefined);
    setXboxAccountOptions([]);
    setStatus({ kind: "idle" });
    setCopyStatus("idle");
  };

  const changePlatform = (nextPlatform: SavePlatform) => {
    if (nextPlatform === platform) return;
    setPlatform(nextPlatform);
    resetFlow();
  };

  const scanDirectoryHandle = async (pickedHandle: FileSystemDirectoryHandle) => {
    setManifest(undefined);
    setXboxAccountOptions([]);
    setDirectoryHandle(pickedHandle);
    setFolderName(pickedHandle.name);
    setStatus({ kind: "working", message: "Looking for Palworld saves..." });

    try {
      let sourceHandle = pickedHandle;
      if (platform === "xbox") {
        const accounts = await listXboxAccountDirectories(pickedHandle);
        if (!accounts.length) {
          throw new SaveImportError(
            "WRONG_FOLDER",
            "No Xbox save account was found. Choose the wgs folder, or the long account folder inside it that contains containers.index.",
          );
        }
        if (accounts.length > 1) {
          const options = await Promise.all(accounts.map(async ({ directoryHandle }) => {
            const files = await readSaveDirectory(directoryHandle);
            try {
              return {
                directoryHandle,
                folderName: directoryHandle.name,
                manifest: await scanLogicalSaveSelection(files, "xbox"),
              } satisfies XboxAccountOption;
            } catch (error) {
              return {
                directoryHandle,
                folderName: directoryHandle.name,
                error: importMessage(error),
              } satisfies XboxAccountOption;
            }
          }));
          setXboxAccountOptions(options);
          setStatus({ kind: "idle" });
          return;
        }
        sourceHandle = accounts[0].directoryHandle;
      }

      const files = await readSaveDirectory(sourceHandle);
      setDirectoryHandle(sourceHandle);
      setFolderName(sourceHandle.name);
      setManifest(await scanLogicalSaveSelection(files, platform));
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const chooseXboxAccount = (option: XboxAccountOption) => {
    if (!option.manifest) return;
    setDirectoryHandle(option.directoryHandle);
    setFolderName(option.folderName);
    setManifest(option.manifest);
    setXboxAccountOptions([]);
    setStatus({ kind: "idle" });
  };

  const chooseFolder = async () => {
    try {
      const handle = await chooseSaveDirectory(directoryHandle);
      await scanDirectoryHandle(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const scanFallbackFolder = async (files: FileList | null) => {
    const selection = [...(files ?? [])];
    if (!selection.length) return;
    setManifest(undefined);
    setDirectoryHandle(undefined);
    setXboxAccountOptions([]);
    setFolderName(selection[0]?.webkitRelativePath.split("/")[0] || "Selected folder");
    setStatus({ kind: "working", message: "Looking for Palworld saves..." });
    try {
      setManifest(await scanSaveSelection(selection, platform));
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const importWorld = async (slot: SaveSlotCandidate) => {
    const selectedManifest = activeManifest;
    if (!selectedManifest) return;
    setStatus({ kind: "working", message: `Importing ${slot.label}...` });

    try {
      let importManifest = selectedManifest;
      let importSlot = slot;
      if (directoryHandle) {
        const files = await readStableSaveDirectory(directoryHandle, {
          platform: selectedManifest.platform,
          accountId: selectedManifest.sourceAccountId,
          worldRootPath: slot.rootPath,
        });
        importManifest = await scanLogicalSaveSelection(files, selectedManifest.platform);
        const refreshedSlot = importManifest.slots.find(({ worldId }) => worldId === slot.worldId);
        if (!refreshedSlot) {
          throw new SaveImportError(
            "NO_WORLDS",
            `We couldn't find ${slot.label} in the selected folder.`,
          );
        }
        importSlot = refreshedSlot;
      }

      const preview = await extractPalsFromSlot(importSlot);
      const result = inventoryService.replaceImportedProfile(
        createImportedProfileInput(importManifest, importSlot, preview),
      );
      const profile = inventoryService.getActiveProfile();
      if (!profile) throw new Error("We imported the world, but couldn't open it.");

      const skipped = preview.unknownPalIds.length + preview.unknownPassiveIds.length;
      const action = result === "created" ? "Imported" : "Updated";
      const message = result === "unchanged"
        ? `${profile.name} is already current.`
        : `${action} ${preview.pals.length.toLocaleString()} Pals from ${profile.name}.${skipped
          ? ` Skipped ${skipped} ${skipped === 1 ? "entry" : "entries"} Palpath doesn't recognize yet.`
          : ""}`;
      setStatus({ kind: "idle" });
      setIsOpen(false);
      onImported(profile.id, message);
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
        if (open) resetFlow(true);
        setIsOpen(open);
      }}
    >
      <Button
        className={trigger === "header" ? "header-icon-trigger" : "primary-button inventory-import-trigger"}
        aria-label="Import a world"
      >
        <UploadIcon />
        {trigger === "inventory" ? "Import world" : null}
      </Button>
      <ModalOverlay className="inventory-import-overlay" isDismissable={status.kind !== "working"}>
        <Modal className="inventory-import-modal">
          <Dialog className="inventory-import-dialog">
            <header className="inventory-import-header">
              <div>
                <span className="section-kicker">IMPORT</span>
                <Heading slot="title">Import a world</Heading>
                <p>Choose your save folder, then pick the world you want.</p>
              </div>
              <Button
                slot="close"
                className="inventory-modal-close"
                aria-label="Close world import"
                isDisabled={status.kind === "working"}
              >
                <CloseIcon />
              </Button>
            </header>

            <div className="inventory-import-body">
              <ol className="import-steps" aria-label="Import progress">
                <li className={!activeManifest ? "is-active" : "is-complete"}>
                  <span>{activeManifest ? <CheckIcon /> : "1"}</span>
                  <div><small>Step 1</small><strong>Choose folder</strong></div>
                </li>
                <li className={activeManifest ? "is-active" : ""}>
                  <span>2</span>
                  <div><small>Step 2</small><strong>Import world</strong></div>
                </li>
              </ol>

              {!activeManifest ? (
                <section className="import-panel" aria-labelledby="choose-folder-title">
                  <div className="import-panel-heading">
                    <div>
                      <span className="import-step-number">01</span>
                      <div>
                        <Heading id="choose-folder-title">Choose your save folder</Heading>
                        <p>Palpath reads it locally and forgets the folder when you close this window.</p>
                      </div>
                    </div>
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

                  <div className="folder-help">
                    <strong>{platform === "xbox" ? "Choose the wgs folder" : "Choose the SaveGames folder"}</strong>
                    <p>{platform === "xbox"
                      ? "Palpath will find the Xbox account and worlds inside it."
                      : "Palpath will find every account and world inside it."}</p>
                    <div className="copy-box">
                      <code>{SAVE_PATHS[platform]}</code>
                      <Button aria-live="polite" onPress={() => void copyCurrentPath()}>
                        {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Couldn't copy" : "Copy path"}
                      </Button>
                    </div>
                  </div>

                  {xboxAccountOptions.length ? (
                    <div className="account-choice-list">
                      <div className="subheading">
                        <strong>Which Xbox account?</strong>
                        <span>{xboxAccountOptions.length} found</span>
                      </div>
                      <p>Choose the account that contains the world you want to import.</p>
                      {xboxAccountOptions.map((option, index) => (
                        <article className="account-choice-row" key={option.folderName}>
                          <div>
                            <strong>Xbox account {index + 1}</strong>
                            <span>{option.manifest
                              ? `${option.manifest.slots.length} ${option.manifest.slots.length === 1 ? "world" : "worlds"}`
                              : option.error}</span>
                          </div>
                          <Button
                            className="secondary-button compact-button"
                            isDisabled={!option.manifest}
                            onPress={() => chooseXboxAccount(option)}
                          >
                            Choose
                          </Button>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {canPickDirectory ? (
                    <Button
                      className="primary-button import-button"
                      isDisabled={status.kind === "working"}
                      onPress={() => void chooseFolder()}
                    >
                      <FolderIcon />
                      <span>{status.kind === "working" ? "Scanning folder..." : folderName ? "Choose another folder" : "Choose folder"}</span>
                    </Button>
                  ) : (
                    <FileTrigger acceptDirectory allowsMultiple onSelect={(files) => void scanFallbackFolder(files)}>
                      <Button className="primary-button import-button" isDisabled={status.kind === "working"}>
                        <FolderIcon />
                        <span>{status.kind === "working" ? "Scanning folder..." : folderName ? "Choose another folder" : "Choose folder"}</span>
                      </Button>
                    </FileTrigger>
                  )}

                  <p className="privacy-note">
                    <LockIcon />
                    Your save files never leave this device.
                  </p>
                  {platform === "xbox" ? (
                    <p className="platform-limit-note">
                      For Xbox app / PC Game Pass saves on Windows. Console cloud saves cannot be selected here.
                    </p>
                  ) : null}
                </section>
              ) : (
                <section className="import-panel" aria-labelledby="choose-world-title">
                  <div className="folder-selection">
                    <span><FolderIcon /></span>
                    <div>
                      <small>Selected folder</small>
                      <strong>{folderName ?? "Save folder"}</strong>
                    </div>
                    <Button
                      className="secondary-button compact-button"
                      isDisabled={status.kind === "working"}
                      onPress={() => resetFlow()}
                    >
                      Change
                    </Button>
                  </div>

                  <div className="import-panel-heading world-heading">
                    <div>
                      <span className="import-step-number">02</span>
                      <div>
                        <Heading id="choose-world-title">Choose a world</Heading>
                        <p>{activeManifest.slots.length} {activeManifest.slots.length === 1 ? "world" : "worlds"} found</p>
                      </div>
                    </div>
                  </div>

                  <div className="world-list">
                    {activeManifest.slots.map((slot) => {
                      const supported = slot.format === "palworld-1.0";
                      const importedProfile = findImportedProfile(profiles, activeManifest, slot);
                      return (
                        <article className="world-row" key={slot.id}>
                          <div>
                            <strong>{importedProfile?.name ?? slot.label}</strong>
                            <span>{slot.updatedAt ? `Saved ${new Date(slot.updatedAt).toLocaleString()}` : "Save date unavailable"}</span>
                          </div>
                          {!supported ? (
                            <span className="format-badge is-unsupported">
                              {slot.format === "pre-1.0" ? "Older save" : "Not supported"}
                            </span>
                          ) : null}
                          <Button
                            className="primary-button compact-button world-import-button"
                            isDisabled={!supported || status.kind === "working"}
                            aria-label={supported ? `Import ${slot.label}` : `${slot.label} requires Palworld 1.0`}
                            onPress={() => void importWorld(slot)}
                          >
                            {importedProfile ? "Re-import" : "Import world"}
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                  <p className="privacy-note">
                    <LockIcon />
                    Only the imported Pal data is saved. Folder access is not remembered.
                  </p>
                </section>
              )}

              {status.kind === "error" && status.message ? (
                <StatusBanner kind={status.kind} message={status.message} />
              ) : null}
            </div>
            <AnimatePresence>
              {status.kind === "working" && status.message ? (
                <ImportPathLoadingOverlay key="import-loading" message={status.message} />
              ) : null}
            </AnimatePresence>
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
    && profile.worldId === slot.worldId,
  );
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
