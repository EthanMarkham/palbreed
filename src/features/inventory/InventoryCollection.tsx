import {
  Button,
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
  getInventoryPalName,
  getInventoryPalSpeciesName,
} from "./inventoryCollectionFilter";

type InventoryCollectionProps = {
  profile: InventoryProfile;
  visiblePals: readonly OwnedPal[];
  query: string | undefined;
  onQueryClear: () => void;
  onRemove: () => void;
};

export default function InventoryCollection({
  profile,
  visiblePals,
  query,
  onQueryClear,
  onRemove,
}: InventoryCollectionProps) {
  const isFiltered = Boolean(query?.trim());

  return (
    <>
      <CollectionHeader
        profile={profile}
        visibleCount={visiblePals.length}
        isFiltered={isFiltered}
        onRemove={onRemove}
      />
      {visiblePals.length ? (
        <div className="inventory-collection" role="list" aria-label={`${profile.name} Pals`}>
          <div className="inventory-list-labels" aria-hidden="true">
            <span>Pal</span>
            <span>Level</span>
            <span>Sex</span>
            <span>Location</span>
            <span>Passives</span>
          </div>
          {visiblePals.map((pal) => <InventoryPalRow key={pal.id} pal={pal} />)}
        </div>
      ) : profile.pals.length ? (
        <div className="empty-state inventory-empty">
          <SearchIcon />
          <strong>No Pals match “{query?.trim()}”</strong>
          <span>Search by nickname, species, passive, level, sex, or storage location.</span>
          <Button className="secondary-button compact-button" onPress={onQueryClear}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="empty-state inventory-empty">
          <strong>No Pals found in this world</strong>
          <span>Refresh the import after Palworld finishes writing its save.</span>
        </div>
      )}
    </>
  );
}

function CollectionHeader({
  profile,
  visibleCount,
  isFiltered,
  onRemove,
}: {
  profile: InventoryProfile;
  visibleCount: number;
  isFiltered: boolean;
  onRemove: () => void;
}) {
  return (
    <header className="inventory-collection-header">
      <div>
        <span>PAL COLLECTION</span>
        <h2>{profile.name}</h2>
        <p>{formatProfileDetails(profile)}</p>
      </div>
      <div className="inventory-collection-actions">
        <span className="inventory-result-count">
          <strong>{visibleCount.toLocaleString()}</strong>
          {isFiltered ? ` of ${profile.pals.length.toLocaleString()} Pals` : " Pals"}
        </span>
        <RemoveWorldButton profile={profile} onRemove={onRemove} />
      </div>
    </header>
  );
}

function InventoryPalRow({ pal }: { pal: OwnedPal }) {
  const species = breedingRepository.getPal(pal.speciesId);
  const displayName = getInventoryPalName(pal);
  const speciesName = getInventoryPalSpeciesName(pal);
  const passives = passiveRepository.resolve(pal.passiveIds);

  return (
    <article className="inventory-pal-row" role="listitem">
      <div className="inventory-pal-identity">
        <span className="inventory-pal-image">
          {species ? <img src={species.image} alt="" /> : null}
        </span>
        <span>
          <strong>{displayName}</strong>
          <small>{displayName === speciesName ? `No. ${species?.number ?? "--"}` : speciesName}</small>
        </span>
      </div>
      <div className="inventory-pal-cell" data-label="Level">
        <strong>{pal.level ?? "--"}</strong>
      </div>
      <div className="inventory-pal-cell" data-label="Sex">
        <GenderBadge gender={pal.gender} />
      </div>
      <div className="inventory-pal-cell inventory-location" data-label="Location">
        {formatLocation(pal.location)}
      </div>
      <div className="inventory-pal-cell inventory-passives" data-label="Passives">
        {passives.length ? passives.map((passive) => (
          <span key={passive.id}>{passive.name}</span>
        )) : <em>None recorded</em>}
      </div>
    </article>
  );
}

function RemoveWorldButton({
  profile,
  onRemove,
}: {
  profile: InventoryProfile;
  onRemove: () => void;
}) {
  return (
    <DialogTrigger>
      <Button className="inventory-world-menu" aria-label={`Manage ${profile.name}`}>
        <MoreIcon />
      </Button>
      <Popover className="world-remove-popover" placement="bottom end">
        <Dialog className="world-remove-dialog">
          <Heading slot="title">Remove {profile.name}?</Heading>
          <p>This removes the imported world from Palpath only. Your Palworld save files are never changed.</p>
          <div>
            <Button slot="close" className="secondary-button compact-button">Cancel</Button>
            <Button
              slot="close"
              className="secondary-button compact-button danger-button"
              onPress={onRemove}
            >
              Remove world
            </Button>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function formatProfileDetails(profile: InventoryProfile) {
  const parts = [profile.platform === "xbox" ? "Xbox / Game Pass" : "Steam"];
  if (profile.playerName && profile.playerName !== profile.name) parts.push(profile.playerName);
  if (profile.playerLevel) parts.push(`Player level ${profile.playerLevel}`);
  if (profile.importedAt) parts.push(`Updated ${new Date(profile.importedAt).toLocaleDateString()}`);
  return parts.join(" / ");
}

function formatLocation(location: OwnedPal["location"]) {
  if (location === "palbox") return "Palbox";
  if (location === "global-storage") return "Global storage";
  return location === "party" ? "Party" : "Base";
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="4" cy="9" r="1" /><circle cx="9" cy="9" r="1" /><circle cx="14" cy="9" r="1" /></svg>;
}
