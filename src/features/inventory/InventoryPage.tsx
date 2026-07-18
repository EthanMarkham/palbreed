import { useRef, useState, type ChangeEvent } from "react";
import { GenderBadge } from "../../components/OwnedPalSelect";
import OwnedPalSelect from "../../components/OwnedPalSelect";
import PalSelect from "../../components/PalSelect";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { OwnedPal } from "../../domain/inventory";
import type { PalId } from "../../domain/pal";
import { SaveImportError, type SaveManifest, type SavePlatform } from "../../domain/saveImport";
import { findInventoryLineage } from "../../services/inventory/inventoryLineageFinder";
import { inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";
import { extractPalsFromSlot } from "../../services/saveImport/palSaveParser";
import { scanSaveSelection } from "../../services/saveImport/saveScanner";
import ManualPalDialog from "./ManualPalDialog";
import { getInventoryPlatform, type InventorySearchState } from "./inventorySearch";

const SAVE_PATHS = {
  xbox: "%LOCALAPPDATA%\\Packages\\PocketpairInc.Palworld_ad4psfrxyesvt\\SystemAppData\\wgs",
  steam: "%LOCALAPPDATA%\\Pal\\Saved\\SaveGames",
} as const;

type InventoryPageProps = {
  search: InventorySearchState;
  onPlatformChange: (platform: SavePlatform) => void;
  onStartInputChange: (value: string) => void;
  onStartSelectionChange: (value: string) => void;
  onTargetInputChange: (value: string) => void;
  onTargetSelectionChange: (value: PalId | undefined) => void;
  isAddPalOpen: boolean;
  onAddPalOpenChange: (isOpen: boolean) => void;
};

export default function InventoryPage({
  search,
  onPlatformChange,
  onStartInputChange,
  onStartSelectionChange,
  onTargetInputChange,
  onTargetSelectionChange,
  isAddPalOpen,
  onAddPalOpenChange,
}: InventoryPageProps) {
  const snapshot = useInventory();
  const profile = inventoryService.getActiveProfile();
  const includedPals = profile.pals.filter(({ included }) => included);
  const platform = getInventoryPlatform(search);
  const [manifest, setManifest] = useState<SaveManifest>();
  const [importStatus, setImportStatus] = useState<{ kind: "idle" | "working" | "success" | "error"; message?: string }>({ kind: "idle" });
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const startOwnedPalId = includedPals.some(({ id }) => id === search.start) ? search.start ?? "" : "";
  const targetId = search.target;
  const activeManifest = manifest?.platform === platform ? manifest : undefined;
  const fileInput = useRef<HTMLInputElement>(null);
  const directoryProps = { webkitdirectory: "", directory: "" };

  const routeResult = targetId ? findInventoryLineage({
    inventory: profile.pals,
    targetId,
    startOwnedPalId: startOwnedPalId || undefined,
  }) : null;

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
      inventoryService.replaceImportedProfile({
        name: slot.label,
        platform: activeManifest.platform,
        worldId: slot.worldId,
        slotId: slot.id,
        pals: preview.pals,
      });
      onStartSelectionChange("");
      const skipped = preview.unknownPalIds.length + preview.unknownPassiveIds.length;
      setImportStatus({
        kind: "success",
        message: `Imported ${preview.pals.length} Pals${skipped ? `; ${skipped} unknown 1.0 identifiers were safely skipped` : ""}.`,
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
            <div className="card-heading"><span>{profile.name}</span><small>{includedPals.length} included / {profile.pals.length} total</small></div>
            <div className="profile-toolbar">
              <label>
                <span>Active inventory</span>
                <select value={profile.id} onChange={(event) => {
                  inventoryService.selectProfile(event.target.value);
                  onStartSelectionChange("");
                }}>
                  {snapshot.document.profiles.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => {
                  inventoryService.createProfile(`Inventory ${snapshot.document.profiles.length + 1}`);
                  onStartSelectionChange("");
                }}
              >
                New list
              </button>
            </div>
            <button className="primary-button add-pal-cta" type="button" onClick={() => onAddPalOpenChange(true)}>
              <AddIcon />
              Add Pal manually
            </button>
            <div className="collection-list">
              {profile.pals.length ? profile.pals.map((pal) => <InventoryPalRow key={pal.id} pal={pal} />) : (
                <div className="empty-state compact-empty"><strong>No Pals yet</strong><span>Import a world or add your first Pal.</span></div>
              )}
            </div>
          </section>
        </aside>
      </section>

      <section className="feature-card route-lab">
        <div className="card-heading"><span>Shortest inventory route</span><small>Exact breadth-first search</small></div>
        <div className="route-lab-controls">
          <OwnedPalSelect key={profile.id} label="Starting Pal" pals={includedPals} value={startOwnedPalId} onChange={onStartSelectionChange} query={{ value: search.startQuery ?? "", onChange: onStartInputChange }} />
          <span className="route-arrow" aria-hidden="true">→</span>
          <PalSelect label="Target Pal" value={targetId} onChange={onTargetSelectionChange} query={{ value: search.targetQuery ?? "", onChange: onTargetInputChange }} />
        </div>
        <InventoryRouteResult result={routeResult} inventory={profile.pals} />
      </section>

      {isAddPalOpen ? <ManualPalDialog isOpen onOpenChange={onAddPalOpenChange} /> : null}
    </main>
  );
}

function InventoryHero() {
  return (
    <section className="feature-hero">
      <div>
        <span className="section-kicker">INVENTORY LAB</span>
        <h1>Your collection becomes the route.</h1>
        <p>Import a Palworld 1.0 world or add Pals manually, then calculate the fewest breedings using only partners you actually own.</p>
      </div>
      <span className="hero-index">03</span>
    </section>
  );
}

function InventoryPalRow({ pal }: { pal: OwnedPal }) {
  const species = breedingRepository.getPal(pal.speciesId);
  return (
    <article className={`inventory-pal${pal.included ? "" : " is-excluded"}`}>
      <label className="include-toggle" title={pal.included ? "Included in plans" : "Excluded from plans"}>
        <input type="checkbox" checked={pal.included} onChange={(event) => inventoryService.setPalIncluded(pal.id, event.target.checked)} />
      </label>
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
      <button type="button" className="icon-button" onClick={() => inventoryService.removePal(pal.id)} aria-label={`Remove ${species?.name ?? "Pal"}`}>×</button>
    </article>
  );
}

function InventoryRouteResult({ result, inventory }: {
  result: ReturnType<typeof findInventoryLineage> | null;
  inventory: readonly OwnedPal[];
}) {
  if (!result) return <div className="route-placeholder">Choose a target to calculate the shortest route from your included inventory.</div>;
  if (result.status === "already-owned") return <StatusBanner kind="success" message="The target is already in the selected starting set. Zero breedings needed." />;
  if (result.status !== "found") return <StatusBanner kind="error" message={result.reason} />;
  return (
    <div className="inventory-route-result">
      <div className="route-summary"><strong>{result.steps.length}</strong><span>{result.steps.length === 1 ? "breeding" : "breedings"}<small>Shortest continuous carrier path</small></span></div>
      <div className="route-step-list">
        {result.steps.map((step, index) => {
          const from = breedingRepository.getPal(step.from);
          const partner = breedingRepository.getPal(step.partner);
          const child = breedingRepository.getPal(step.result);
          const ownedPartner = inventory.find(({ id }) => id === step.partnerOwnedPalId);
          return (
            <article className="mini-route-step" key={`${step.from}-${step.partner}-${index}`}>
              <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
              <PalToken palId={step.from} />
              <span className="operator">+</span>
              <PalToken palId={step.partner} note={ownedPartner?.nickname || "Owned partner"} />
              <span className="operator">→</span>
              <PalToken palId={step.result} featured />
              <span className="sr-only">{from?.name} plus {partner?.name} makes {child?.name}</span>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function PalToken({ palId, note, featured = false }: { palId: PalId; note?: string; featured?: boolean }) {
  const pal = breedingRepository.getPal(palId);
  return pal ? <span className={`pal-token${featured ? " is-featured" : ""}`}><img src={pal.image} alt="" /><span><strong>{pal.name}</strong>{note ? <small>{note}</small> : null}</span></span> : null;
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

function AddIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
