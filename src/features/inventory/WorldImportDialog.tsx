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
import {
  SaveImportError,
  type SaveManifest,
  type SavePlatform,
} from "../../domain/saveImport";
import StatusBanner from "../../components/StatusBanner";
import { useAccount } from "../../services/account/useAccount";
import { inventoryService } from "../../services/inventory/inventoryService";
import { extractPalsFromSlot } from "../../services/saveImport/palSaveParser";
import { scanSaveSelection } from "../../services/saveImport/saveScanner";
import { describeImportedWorld } from "./importedWorld";

const SAVE_PATHS = {
  xbox: "%LOCALAPPDATA%\\Packages\\PocketpairInc.Palworld_ad4psfrxyesvt\\SystemAppData\\wgs",
  steam: "%LOCALAPPDATA%\\Pal\\Saved\\SaveGames",
} as const;

type ImportStatus = {
  kind: "idle" | "working" | "error";
  message?: string;
};

type WorldImportDialogProps = {
  onImported: (profileId: string, message: string) => void;
};

export default function WorldImportDialog({ onImported }: WorldImportDialogProps) {
  const account = useAccount();
  const activeWorkspace = account.workspaces.find(({ id }) => id === account.activeWorkspaceId);
  const syncsImport = account.status === "ready" && activeWorkspace?.role !== "viewer";
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState<SavePlatform>("xbox");
  const [manifest, setManifest] = useState<SaveManifest>();
  const [status, setStatus] = useState<ImportStatus>({ kind: "idle" });
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const activeManifest = manifest?.platform === platform ? manifest : undefined;

  const resetSelection = () => {
    setManifest(undefined);
    setStatus({ kind: "idle" });
    setCopyStatus("idle");
  };

  const changePlatform = (nextPlatform: SavePlatform) => {
    if (nextPlatform === platform) return;
    setPlatform(nextPlatform);
    resetSelection();
  };

  const scanFolder = async (files: FileList | null) => {
    const selection = [...(files ?? [])];
    if (!selection.length) return;
    setManifest(undefined);
    setStatus({ kind: "working", message: "Looking for worlds..." });
    try {
      setManifest(await scanSaveSelection(selection, platform));
      setStatus({ kind: "idle" });
    } catch (error) {
      setStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const importSlot = async (slotId: string) => {
    const slot = activeManifest?.slots.find(({ id }) => id === slotId);
    if (!slot || !activeManifest) return;
    setStatus({ kind: "working", message: `Importing ${slot.label}...` });
    try {
      const preview = await extractPalsFromSlot(slot);
      const world = describeImportedWorld(slot.label, preview.players);
      const result = inventoryService.replaceImportedProfile({
        name: world.name,
        platform: activeManifest.platform,
        worldId: slot.worldId,
        slotId: slot.id,
        accountId: activeManifest.accountId,
        playerId: world.player?.id,
        playerName: world.player?.name,
        playerLevel: world.player?.level,
        pals: preview.pals,
      });
      const profile = inventoryService.getActiveProfile();
      if (!profile) throw new Error("We imported the world, but couldn't open it.");
      const skipped = preview.unknownPalIds.length + preview.unknownPassiveIds.length;
      const action = result === "updated" ? "Updated" : "Imported";
      const message = `${action} ${preview.pals.length.toLocaleString()} Pals.${skipped
        ? ` Skipped ${skipped} ${skipped === 1 ? "entry" : "entries"} that Palpath doesn't recognize yet.`
        : ""}`;
      onImported(profile.id, message);
      setIsOpen(false);
      resetSelection();
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
        <ImportIcon />
        Import world
      </Button>
      <ModalOverlay className="inventory-import-overlay" isDismissable={status.kind !== "working"}>
        <Modal className="inventory-import-modal">
          <Dialog className="inventory-import-dialog">
            <header className="inventory-import-header">
              <div>
                <span className="section-kicker">WORLD IMPORT</span>
                <Heading slot="title">Import or refresh a world</Heading>
                <p>Choose your Palworld save folder. We'll show the worlds inside so you can pick one.</p>
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
              <div className="platform-tabs" role="group" aria-label="Save platform">
                <Button
                  className={platform === "xbox" ? "is-active" : ""}
                  aria-pressed={platform === "xbox"}
                  isDisabled={status.kind === "working"}
                  onPress={() => changePlatform("xbox")}
                >
                  Xbox / Game Pass
                </Button>
                <Button
                  className={platform === "steam" ? "is-active" : ""}
                  aria-pressed={platform === "steam"}
                  isDisabled={status.kind === "working"}
                  onPress={() => changePlatform("steam")}
                >
                  Steam
                </Button>
              </div>

              <div className="path-card">
                <div className="path-labels">
                  <span><small>System</small>{platform === "xbox" ? "Xbox / Microsoft Store" : "Windows"}</span>
                  <span><small>Game</small>Palworld</span>
                  <span><small>Choose</small>{platform === "xbox" ? "wgs folder" : "SaveGames folder"}</span>
                </div>
                <div className="copy-box">
                  <code>{SAVE_PATHS[platform]}</code>
                  <Button aria-live="polite" onPress={() => void copyCurrentPath()}>
                    {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Couldn't copy" : "Copy path"}
                  </Button>
                </div>
              </div>

              <FileTrigger acceptDirectory allowsMultiple onSelect={(files) => void scanFolder(files)}>
                <Button className="primary-button import-button" isDisabled={status.kind === "working"}>
                  <FolderIcon />
                  <span>{status.kind === "working" ? "Please wait..." : "Choose save folder"}</span>
                </Button>
              </FileTrigger>
              <p className="privacy-note">
                <LockIcon />
                {syncsImport
                  ? "Your raw save stays on this device. The extracted world snapshot syncs to your active workspace."
                  : "Your save stays on this device. Palpath reads it without changing any files."}
              </p>

              {status.kind !== "idle" && status.message ? (
                <StatusBanner kind={status.kind} message={status.message} />
              ) : null}

              {activeManifest ? (
                <div className="world-list">
                  <div className="subheading">
                    <strong>Choose a world</strong>
                    <span>{activeManifest.slots.length} {activeManifest.slots.length === 1 ? "world" : "worlds"} found</span>
                  </div>
                  {activeManifest.slots.map((slot) => {
                    const supported = slot.format === "palworld-1.0";
                    return (
                      <article className="world-row" key={slot.id}>
                        <div>
                          <strong>{slot.label}</strong>
                          <span>{slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : "Date not available"}</span>
                        </div>
                        <span className={`format-badge is-${supported ? "supported" : "unsupported"}`}>
                          {supported ? "Palworld 1.0" : slot.format === "pre-1.0" ? "Older save" : "Not supported"}
                        </span>
                        <Button
                          className="secondary-button compact-button"
                          isDisabled={!supported || status.kind === "working"}
                          aria-label={supported ? `Import ${slot.label}` : `${slot.label} requires Palworld 1.0`}
                          onPress={() => void importSlot(slot.id)}
                        >
                          {supported ? "Import" : "Needs 1.0"}
                        </Button>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

function importMessage(error: unknown) {
  if (error instanceof SaveImportError) {
    if (error.code === "CORRUPT_SAVE") {
      return "We couldn't read this world. Palworld may have been saving when you chose the folder. Wait a few seconds, then try choosing the save folder again.";
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

function ImportIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>;
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
