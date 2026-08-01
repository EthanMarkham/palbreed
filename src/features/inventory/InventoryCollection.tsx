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
import { getPalCombatStats } from "../../data/palStatsRepository";
import type { InventoryProfile, OwnedPal } from "../../domain/inventory";
import {
  getAverageCombatIv,
  getInventoryPalName,
  getInventoryPalSpeciesName,
} from "./inventoryCollectionFilter";

type InventoryCollectionProps = {
  profile: InventoryProfile;
  visiblePals: readonly OwnedPal[];
  query: string | undefined;
  isFiltered: boolean;
  onReset: () => void;
  onRemove: () => void;
};

export default function InventoryCollection({
  profile,
  visiblePals,
  query,
  isFiltered,
  onReset,
  onRemove,
}: InventoryCollectionProps) {
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
          <strong>{query?.trim() ? `No Pals match “${query.trim()}”` : "No Pals match these filters"}</strong>
          <span>Try a broader search or clear one of the active filters.</span>
          <Button className="secondary-button compact-button" onPress={onReset}>
            Reset results
          </Button>
        </div>
      ) : (
        <div className="empty-state inventory-empty">
          <strong>No Pals found in this world</strong>
          <span>Try importing this world again after Palworld finishes saving.</span>
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
  const combatStats = getPalCombatStats(pal);
  const averageIv = getAverageCombatIv(pal);

  return (
    <article className="inventory-pal-card">
      <header className="inventory-pal-identity">
        <span className="inventory-pal-image">
          {species ? <PalAvatar pal={species} /> : null}
        </span>
        <div className="inventory-pal-name">
          <strong>{displayName}</strong>
          <span>
            <small>{displayName === speciesName ? "Paldeck" : speciesName}</small>
            <em>No. {species?.number ?? "--"}</em>
          </span>
        </div>
        {averageIv !== undefined ? (
          <span
            className="inventory-iv-average"
            data-tier={getPotentialTier(averageIv)}
            title="Average of HP, Attack, and Defense hidden IVs"
          >
            <small>IV AVG</small>
            <strong>{averageIv}</strong>
          </span>
        ) : null}
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
          <dd title={formatLocation(pal)}>{formatLocation(pal)}</dd>
        </div>
      </dl>

      {combatStats ? (
        <div
          className="inventory-combat-stats"
          title={`Core stats at level ${pal.level}, before passive and enhancement bonuses`}
        >
          <span className="inventory-card-label">Core stats <em>Lv. {pal.level}</em></span>
          <dl>
            <div><dt>HP</dt><dd>{combatStats.hp.toLocaleString()}</dd></div>
            <div><dt>Attack</dt><dd>{combatStats.attack.toLocaleString()}</dd></div>
            <div><dt>Defense</dt><dd>{combatStats.defense.toLocaleString()}</dd></div>
          </dl>
        </div>
      ) : null}

      {pal.abilityScores ? <HiddenIvBadges scores={pal.abilityScores} /> : null}

      <div className="inventory-passives">
        <span className="inventory-card-label">Passives</span>
        {passives.length ? (
          <ul aria-label="Passive skills">
            {passives.map((passive) => (
              <li
                key={passive.id}
                data-rank={getPassiveRankTier(passive.rank)}
                title={`${passive.description} Rank ${passive.rank}.`}
              >
                <span>{passive.name}</span>
                <small>R{passive.rank}</small>
              </li>
            ))}
          </ul>
        ) : <span className="inventory-passives-empty">None</span>}
      </div>
    </article>
  );
}

function HiddenIvBadges({ scores }: { scores: NonNullable<OwnedPal["abilityScores"]> }) {
  const values = [
    ["HP", scores.hp],
    ["Attack", scores.ranged],
    ["Defense", scores.defense],
    ["Melee", scores.melee],
  ] as const;

  return (
    <div className="inventory-potential" title="Hidden stat scores from the imported save, from 0 to 100">
      <span className="inventory-card-label">Hidden IVs <em>0–100</em></span>
      <dl>
        {values.map(([label, value]) => (
          <div key={label} data-tier={getPotentialTier(value)} title={`${label} IV: ${value} out of 100`}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function getPotentialTier(value: number) {
  if (value >= 90) return "exceptional";
  if (value >= 70) return "strong";
  return "standard";
}

function getPassiveRankTier(rank: number) {
  if (rank >= 3) return "high";
  if (rank < 0) return "negative";
  return "standard";
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

function formatLocation(pal: OwnedPal) {
  if (pal.location === "palbox") {
    return pal.palboxSlotIndex === undefined
      ? "Palbox"
      : `Palbox P${Math.floor(pal.palboxSlotIndex / 30) + 1} / S${(pal.palboxSlotIndex % 30) + 1}`;
  }
  if (pal.location === "global-storage") return "Global storage";
  return pal.location === "party" ? "Party" : "Base";
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="4" cy="9" r="1" /><circle cx="9" cy="9" r="1" /><circle cx="14" cy="9" r="1" /></svg>;
}
