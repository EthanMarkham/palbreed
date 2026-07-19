import { useRef, useState, type ChangeEvent } from "react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Popover,
} from "react-aria-components";
import GenderBadge from "../../components/GenderBadge";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { InventoryProfile, OwnedPal } from "../../domain/inventory";
import {
  SaveImportError,
  type SaveManifest,
  type SavePlatform,
} from "../../domain/saveImport";
import { inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";
import { extractPalsFromSlot } from "../../services/saveImport/palSaveParser";
import { scanSaveSelection } from "../../services/saveImport/saveScanner";
import { getInventoryPlatform, type InventorySearchState } from "./inventorySearch";
import { describeImportedWorld } from "./importedWorld";

const SAVE_PATHS = {
  xbox: "%LOCALAPPDATA%\\Packages\\PocketpairInc.Palworld_ad4psfrxyesvt\\SystemAppData\\wgs",
  steam: "%LOCALAPPDATA%\\Pal\\Saved\\SaveGames",
} as const;

type InventoryPageProps = {
  search: InventorySearchState;
  onPlatformChange: (platform: SavePlatform) => void;
};

export default function InventoryPage({
  search,
  onPlatformChange,
}: InventoryPageProps) {
  const snapshot = useInventory();
  const profile = inventoryService.getActiveProfile();
  const platform = getInventoryPlatform(search);
  const [manifest, setManifest] = useState<SaveManifest>();
  const [importStatus, setImportStatus] = useState<{ kind: "idle" | "working" | "success" | "error"; message?: string }>({ kind: "idle" });
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const activeManifest = manifest?.platform === platform ? manifest : undefined;
  const fileInput = useRef<HTMLInputElement>(null);
  const directoryProps = { webkitdirectory: "", directory: "" };

  const onFolderChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    setManifest(undefined);
    setImportStatus({ kind: "working", message: "Reading save index and discovering worlds…" });
    try {
      const nextManifest = await scanSaveSelection(files, platform);
      setManifest(nextManifest);
      setImportStatus({ kind: "idle" });
    } catch (error) {
      setImportStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const importSlot = async (slotId: string) => {
    const slot = activeManifest?.slots.find(({ id }) => id === slotId);
    if (!slot || !activeManifest) return;
    setImportStatus({ kind: "working", message: `Decoding ${slot.label} locally…` });
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
      const skipped = preview.unknownPalIds.length + preview.unknownPassiveIds.length;
      setImportStatus({
        kind: "success",
        message: `${result === "updated" ? "Updated" : "Imported"} ${preview.pals.length} Pals${skipped ? `; ${skipped} unknown 1.0 identifiers were safely skipped` : ""}.`,
      });
    } catch (error) {
      setImportStatus({ kind: "error", message: importMessage(error) });
    }
  };

  const copyCurrentPath = async () => {
    const copied = await copyPath(SAVE_PATHS[platform]);
    setCopyStatus(copied ? "copied" : "error");
    window.setTimeout(() => setCopyStatus("idle"), 1_800);
  };

  if (snapshot.status === "loading") {
    return (
      <main className="workspace feature-workspace" aria-busy="true">
        <InventoryHero />
        <section className="feature-card loading-card">
          <StatusBanner kind="working" message="Opening your saved inventories..." />
        </section>
      </main>
    );
  }

  return (
    <main className="workspace feature-workspace">
      <InventoryHero />

      {snapshot.status === "error" ? <StatusBanner kind="error" message={snapshot.error ?? "Inventory storage failed."} /> : null}

      <section className="inventory-layout">
        <div className="inventory-main">
          <section className="feature-card import-card">
            <div className="card-heading"><span>Import a 1.0 world</span><small>Local-only decoding</small></div>
            <div className="platform-tabs" role="group" aria-label="Save platform">
              <button type="button" className={platform === "xbox" ? "is-active" : ""} onClick={() => { onPlatformChange("xbox"); setManifest(undefined); setCopyStatus("idle"); }}>Xbox / Game Pass</button>
              <button type="button" className={platform === "steam" ? "is-active" : ""} onClick={() => { onPlatformChange("steam"); setManifest(undefined); setCopyStatus("idle"); }}>Steam</button>
            </div>

            <div className="path-card">
              <div className="path-labels">
                <span><small>System</small>{platform === "xbox" ? "Xbox / Microsoft Store" : "Windows"}</span>
                <span><small>Game</small>Palworld</span>
                <span><small>Choose</small>{platform === "xbox" ? "wgs folder" : "SaveGames folder"}</span>
              </div>
              <div className="copy-box">
                <code>{SAVE_PATHS[platform]}</code>
                <button type="button" aria-live="polite" onClick={() => void copyCurrentPath()}>
                  {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy path"}
                </button>
              </div>
            </div>

            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              multiple
              {...directoryProps}
              onChange={(event) => void onFolderChange(event)}
            />
            <button className="primary-button import-button" type="button" onClick={() => fileInput.current?.click()} disabled={importStatus.kind === "working"}>
              <FolderIcon />
              <span>{importStatus.kind === "working" ? "Reading saves…" : "Choose save folder"}</span>
            </button>
            <p className="privacy-note"><LockIcon />Save bytes never leave this browser. Palpath reads only; it never modifies the game files.</p>

            {importStatus.kind !== "idle" && importStatus.message ? <StatusBanner kind={importStatus.kind} message={importStatus.message} /> : null}
            {activeManifest ? (
              <div className="world-list">
                <div className="subheading"><strong>Choose a world</strong><span>{activeManifest.slots.length} found</span></div>
                {activeManifest.slots.map((slot) => (
                  <article className="world-row" key={slot.id}>
                    <div>
                      <strong>{slot.label}</strong>
                      <span>{slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : "Date unavailable"}</span>
                    </div>
                    <span className={`format-badge is-${slot.format === "palworld-1.0" ? "supported" : "unsupported"}`}>
                      {slot.format === "palworld-1.0" ? "1.0 ready" : slot.format === "pre-1.0" ? "Pre-1.0" : "Unknown"}
                    </span>
                    <button
                      type="button"
                      className="secondary-button compact-button"
                      disabled={slot.format !== "palworld-1.0"}
                      title={slot.format === "palworld-1.0" ? "Import this world" : "Palpath imports 1.0 worlds only"}
                      onClick={() => void importSlot(slot.id)}
                    >
                      {slot.format === "palworld-1.0" ? "Import" : "1.0 only"}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

        </div>

        <aside className="inventory-side">
          <section className="feature-card collection-card">
            <div className="card-heading">
              <span>{profile?.name ?? "Imported worlds"}</span>
              <small>{profile ? `${profile.pals.length} Pals` : "No world selected"}</small>
            </div>
            {profile ? (
              <>
                <div className="profile-toolbar">
                  <label>
                    <span>Active world</span>
                    <select value={profile.id} onChange={(event) => {
                      inventoryService.selectProfile(event.target.value);
                    }}>
                      {snapshot.document.profiles.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                      ))}
                    </select>
                  </label>
                  <RemoveWorldButton profile={profile} />
                </div>
                <div className="collection-list">
                  {profile.pals.length ? profile.pals.map((pal) => <InventoryPalRow key={pal.id} pal={pal} />) : (
                    <div className="empty-state compact-empty"><strong>No Pals found</strong><span>Re-import the world after Palworld finishes saving.</span></div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state compact-empty">
                <strong>No world imported</strong>
                <span>Choose a Palworld save folder, then import a discovered world.</span>
              </div>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}

function InventoryHero() {
  return (
    <section className="feature-hero">
      <div>
        <span className="section-kicker">INVENTORY LAB</span>
        <h1>Your collection becomes the route.</h1>
        <p>Import a Palworld 1.0 world and use its full collection to power every build across Palpath.</p>
      </div>
      <span className="hero-index">01</span>
    </section>
  );
}

function InventoryPalRow({ pal }: { pal: OwnedPal }) {
  const species = breedingRepository.getPal(pal.speciesId);
  return (
    <article className="inventory-pal">
      {species ? <img src={species.image} alt="" /> : null}
      <div>
        <strong>{pal.nickname || species?.name || pal.speciesId}</strong>
        <span className="inventory-pal-meta">
          <GenderBadge gender={pal.gender} />
          {pal.level ? <span>Level {pal.level}</span> : null}
          <span>{pal.location.replace("-", " ")}</span>
        </span>
        <small>{pal.passiveIds.length ? pal.passiveIds.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ") : "No passives recorded"}</small>
      </div>
    </article>
  );
}

function RemoveWorldButton({ profile }: { profile: InventoryProfile }) {
  return (
    <DialogTrigger>
      <AriaButton className="secondary-button compact-button danger-button">Remove world</AriaButton>
      <Popover className="world-remove-popover" placement="bottom end">
        <Dialog className="world-remove-dialog">
          <Heading slot="title">Remove {profile.name}?</Heading>
          <p>This removes the imported world from Palpath only. Your Palworld save files are never changed.</p>
          <div>
            <AriaButton slot="close" className="secondary-button compact-button">Cancel</AriaButton>
            <AriaButton
              slot="close"
              className="secondary-button compact-button danger-button"
              onPress={() => inventoryService.removeProfile(profile.id)}
            >
              Remove
            </AriaButton>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function StatusBanner({ kind, message }: { kind: "working" | "success" | "error"; message: string }) {
  return <div className={`status-banner is-${kind}`} role={kind === "error" ? "alert" : "status"}>{kind === "working" ? <span className="status-spinner" /> : <span>{kind === "success" ? "✓" : "!"}</span>}<p>{message}</p></div>;
}

function importMessage(error: unknown) {
  if (error instanceof SaveImportError) return `${error.message} [${error.code}]`;
  return error instanceof Error ? error.message : "The save could not be imported.";
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

function FolderIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}
