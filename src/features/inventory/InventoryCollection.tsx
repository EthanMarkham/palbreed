import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  Popover,
} from "react-aria-components";
import GenderBadge from "../../components/GenderBadge";
import PalAvatar from "../../components/PalAvatar";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import { getPalCombatStats } from "../../data/palStatsRepository";
import type { InventoryProfile, OwnedPal, PalLocation } from "../../domain/inventory";
import {
  getAverageCombatIv,
  getInventoryPalName,
  getInventoryPalSpeciesName,
  groupInventoryPals,
  sortInventoryCopies,
  type InventoryCopySort,
  type InventorySpeciesGroup,
} from "./inventoryCollectionFilter";

type InventoryCollectionProps = {
  profile: InventoryProfile;
  visiblePals: readonly OwnedPal[];
  query: string | undefined;
  isFiltered: boolean;
  onReset: () => void;
  onRemove: () => void;
};

const MotionModalOverlay = motion.create(ModalOverlay);
const MotionModal = motion.create(Modal);

const copySortOptions: readonly { id: InventoryCopySort; label: string }[] = [
  { id: "level-desc", label: "Highest level" },
  { id: "iv-desc", label: "Best avg IV" },
  { id: "name", label: "Nickname" },
  { id: "location", label: "Location / slot" },
];

const locationLabels: Record<PalLocation, string> = {
  party: "Party",
  base: "Base",
  "global-storage": "Global",
  palbox: "Palbox",
};

export default function InventoryCollection({
  profile,
  visiblePals,
  query,
  isFiltered,
  onReset,
  onRemove,
}: InventoryCollectionProps) {
  const speciesGroups = useMemo(() => groupInventoryPals(visiblePals), [visiblePals]);
  const allSpeciesGroups = useMemo(() => groupInventoryPals(profile.pals), [profile.pals]);
  const totalCopiesBySpecies = useMemo(
    () => new Map(allSpeciesGroups.map(({ speciesId, pals }) => [speciesId, pals.length])),
    [allSpeciesGroups],
  );
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<OwnedPal["speciesId"]>();
  const selectedGroup = speciesGroups.find(({ speciesId }) => speciesId === selectedSpeciesId);

  return (
    <>
      <CollectionHeader
        profile={profile}
        visibleCount={visiblePals.length}
        visibleSpeciesCount={speciesGroups.length}
        totalSpeciesCount={allSpeciesGroups.length}
        isFiltered={isFiltered}
        onRemove={onRemove}
      />
      {visiblePals.length ? (
        <ul className="inventory-species-grid" aria-label={`${profile.name} Pal types`}>
          {speciesGroups.map((group) => (
            <li key={group.speciesId}>
              <InventorySpeciesCard
                group={group}
                totalCount={totalCopiesBySpecies.get(group.speciesId) ?? group.pals.length}
                onOpen={() => setSelectedSpeciesId(group.speciesId)}
              />
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

      <AnimatePresence>
        {selectedGroup ? (
          <InventorySpeciesModal
            key={selectedGroup.speciesId}
            group={selectedGroup}
            totalCount={totalCopiesBySpecies.get(selectedGroup.speciesId) ?? selectedGroup.pals.length}
            onClose={() => setSelectedSpeciesId(undefined)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function CollectionHeader({
  profile,
  visibleCount,
  visibleSpeciesCount,
  totalSpeciesCount,
  isFiltered,
  onRemove,
}: {
  profile: InventoryProfile;
  visibleCount: number;
  visibleSpeciesCount: number;
  totalSpeciesCount: number;
  isFiltered: boolean;
  onRemove: () => void;
}) {
  return (
    <header className="inventory-collection-header">
      <div>
        <span>PAL TYPES · A–Z</span>
        <h2>{profile.name}</h2>
        <p>{formatProfileDetails(profile)}</p>
      </div>
      <div className="inventory-collection-actions">
        <span className="inventory-result-count">
          <strong>{visibleSpeciesCount.toLocaleString()}</strong>
          {isFiltered ? ` of ${totalSpeciesCount.toLocaleString()}` : ""}
          {totalSpeciesCount === 1 ? " type" : " types"}
          <small>
            {visibleCount.toLocaleString()}
            {isFiltered ? ` of ${profile.pals.length.toLocaleString()}` : ""}
            {profile.pals.length === 1 ? " Pal shown" : " Pals shown"}
          </small>
        </span>
        <RemoveWorldButton profile={profile} onRemove={onRemove} />
      </div>
    </header>
  );
}

function InventorySpeciesCard({
  group,
  totalCount,
  onOpen,
}: {
  group: InventorySpeciesGroup;
  totalCount: number;
  onOpen: () => void;
}) {
  const species = breedingRepository.getPal(group.speciesId);
  const highestLevel = getHighestLevel(group.pals);
  const bestIv = getBestAverageIv(group.pals);
  const femaleCount = group.pals.filter(({ gender }) => gender === "F").length;
  const locations = summarizeLocations(group.pals);
  const isNarrowed = group.pals.length < totalCount;

  return (
    <Button
      className="inventory-species-card"
      onPress={onOpen}
      aria-label={`Open ${group.speciesName}, ${formatVisibleCopyCount(group.pals.length, totalCount)}`}
    >
      <span className="inventory-species-card-topline">
        <span className="inventory-species-number">No. {species?.number ?? "--"}</span>
        <span className="inventory-species-count">
          <strong>{group.pals.length}</strong>
          {isNarrowed
            ? ` of ${totalCount}`
            : group.pals.length === 1 ? " copy" : " copies"}
        </span>
      </span>

      <span className="inventory-species-portrait">
        {species ? <PalAvatar pal={species} /> : null}
      </span>

      <span className="inventory-species-name">{group.speciesName}</span>

      <span className="inventory-species-highlights">
        <span>
          <small>Max level</small>
          <strong>{highestLevel ?? "—"}</strong>
        </span>
        <span title="Best average of HP, Attack, and Defense hidden IVs">
          <small>Best avg IV</small>
          <strong>{bestIv ?? "—"}</strong>
        </span>
        <span>
          <small>Sex</small>
          <strong className="inventory-species-genders">
            <span>{femaleCount} female</span>
            <span>{group.pals.length - femaleCount} male</span>
          </strong>
        </span>
      </span>

      <span className="inventory-species-card-footer">
        <span className="inventory-species-locations">
          {locations.map(({ location, count }) => (
            <span key={location}>{locationLabels[location]} {count}</span>
          ))}
        </span>
        <span className="inventory-species-open">View copies <ArrowIcon /></span>
      </span>
    </Button>
  );
}

function InventorySpeciesModal({
  group,
  totalCount,
  onClose,
}: {
  group: InventorySpeciesGroup;
  totalCount: number;
  onClose: () => void;
}) {
  const [sort, setSort] = useState<InventoryCopySort>("level-desc");
  const shouldReduceMotion = useReducedMotion();
  const species = breedingRepository.getPal(group.speciesId);
  const sortedPals = useMemo(() => sortInventoryCopies(group.pals, sort), [group.pals, sort]);
  const motionDuration = shouldReduceMotion ? 0 : 0.2;

  return (
    <MotionModalOverlay
      className="inventory-pal-overlay"
      isOpen
      isDismissable
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: motionDuration, ease: "easeOut" }}
    >
      <MotionModal
        className="inventory-pal-modal"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.975 }}
        transition={{ duration: motionDuration, ease: [0.22, 1, 0.36, 1] }}
      >
        <Dialog className="inventory-pal-dialog" aria-label={`${group.speciesName} copies`}>
          <header className="inventory-pal-modal-header">
            <span className="inventory-pal-modal-portrait">
              {species ? <PalAvatar pal={species} /> : null}
            </span>
            <span className="inventory-pal-modal-heading">
              <small>No. {species?.number ?? "--"} · {formatVisibleCopyCount(group.pals.length, totalCount)}</small>
              <Heading slot="title">{group.speciesName}</Heading>
              <p>
                {group.pals.length < totalCount
                  ? "Showing only copies that match your current search and filters."
                  : "Compare your copies by level, hidden IVs, passives, and location."}
              </p>
            </span>
            <Button slot="close" className="inventory-modal-close" aria-label="Close Pal details">
              <CloseIcon />
            </Button>
          </header>

          {group.pals.length > 1 ? (
            <div className="inventory-copy-toolbar">
              <span><SortIcon /> Sort by</span>
              <div role="group" aria-label={`Sort ${group.speciesName} copies`}>
                {copySortOptions.map((option) => (
                  <Button
                    key={option.id}
                    className="inventory-copy-sort"
                    data-selected={sort === option.id || undefined}
                    aria-pressed={sort === option.id}
                    onPress={() => setSort(option.id)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <ul className="inventory-copy-grid" aria-label={`${group.speciesName} copies`}>
            {sortedPals.map((pal) => (
              <motion.li
                layout={!shouldReduceMotion}
                key={pal.id}
                transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: "easeOut" }}
              >
                <InventoryPalCard pal={pal} />
              </motion.li>
            ))}
          </ul>
        </Dialog>
      </MotionModal>
    </MotionModalOverlay>
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
            <small>{displayName === speciesName ? "Imported Pal" : speciesName}</small>
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

function getHighestLevel(pals: readonly OwnedPal[]) {
  const levels = pals.flatMap(({ level }) => level === undefined ? [] : [level]);
  return levels.length ? Math.max(...levels) : undefined;
}

function getBestAverageIv(pals: readonly OwnedPal[]) {
  const averages = pals.flatMap((pal) => {
    const average = getAverageCombatIv(pal);
    return average === undefined ? [] : [average];
  });
  return averages.length ? Math.max(...averages) : undefined;
}

function summarizeLocations(pals: readonly OwnedPal[]) {
  const counts = new Map<PalLocation, number>();
  pals.forEach(({ location }) => counts.set(location, (counts.get(location) ?? 0) + 1));
  const order: readonly PalLocation[] = ["party", "base", "global-storage", "palbox"];
  return order.flatMap((location) => {
    const count = counts.get(location);
    return count ? [{ location, count }] : [];
  });
}

function formatCopyCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? "copy" : "copies"}`;
}

function formatVisibleCopyCount(visibleCount: number, totalCount: number) {
  return visibleCount < totalCount
    ? `${visibleCount.toLocaleString()} of ${formatCopyCount(totalCount)}`
    : formatCopyCount(visibleCount);
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

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" /></svg>;
}

function SortIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h8M3 9h6M3 13h4M13 4v10m0 0-2.5-2.5M13 14l2.5-2.5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}
