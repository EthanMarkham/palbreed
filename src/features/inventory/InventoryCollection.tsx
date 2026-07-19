import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Popover,
} from "react-aria-components";
import GenderBadge from "../../components/GenderBadge";
import PalAvatar from "../../components/PalAvatar";
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
        <ul className="inventory-collection" aria-label={`${profile.name} Pals`}>
          {visiblePals.map((pal) => (
            <li key={pal.id}>
              <InventoryPalCard pal={pal} />
            </li>
          ))}
        </ul>
      ) : profile.pals.length ? (
        <div className="empty-state inventory-empty">
          <SearchIcon />
          <strong>No Pals match “{query?.trim()}”</strong>
          <span>Try a nickname, Pal name, passive, level, sex, or location.</span>
          <Button className="secondary-button compact-button" onPress={onQueryClear}>
            Clear search
          </Button>
        </div>
      ) : (
        <div className="empty-state inventory-empty">
          <strong>No Pals found in this world</strong>
          <span>If Palworld was still saving, wait a moment and import the world again.</span>
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
        <span>PALS IN THIS WORLD</span>
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

function InventoryPalCard({ pal }: { pal: OwnedPal }) {
  const species = breedingRepository.getPal(pal.speciesId);
  const displayName = getInventoryPalName(pal);
  const speciesName = getInventoryPalSpeciesName(pal);
  const passives = passiveRepository.resolve(pal.passiveIds);

  return (
    <article className="inventory-pal-card">
      <header className="inventory-pal-identity">
        <span className="inventory-pal-image">
          {species ? <PalAvatar pal={species} /> : null}
        </span>
        <div>
          <strong>{displayName}</strong>
          <small>{displayName === speciesName ? `No. ${species?.number ?? "--"}` : speciesName}</small>
        </div>
      </header>

      <dl className="inventory-pal-facts">
        <div>
          <dt>Level</dt>
          <dd><strong>{pal.level ?? "--"}</strong></dd>
        </div>
        <div>
          <dt>Sex</dt>
          <dd><GenderBadge gender={pal.gender} /></dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{formatLocation(pal.location)}</dd>
        </div>
      </dl>

      <div className="inventory-passives">
        <span className="inventory-card-label">Passives</span>
        {passives.length ? (
          <ul aria-label="Passive skills">
            {passives.map((passive) => <li key={passive.id}>{passive.name}</li>)}
          </ul>
        ) : <span className="inventory-passives-empty">None</span>}
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
      <Button className="inventory-world-menu" aria-label={`More options for ${profile.name}`}>
        <MoreIcon />
      </Button>
      <Popover className="world-remove-popover" placement="bottom end">
        <Dialog className="world-remove-dialog">
          <Heading slot="title">Remove {profile.name}?</Heading>
          <p>This only removes the imported copy from Palpath. It won't change your Palworld save.</p>
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
  return parts.join(" · ");
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
