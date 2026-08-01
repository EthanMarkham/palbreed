import { useEffect, useMemo, useState } from "react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Heading,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  SearchField,
  Select,
  SelectValue,
} from "react-aria-components";
import StatusBanner from "../../components/StatusBanner";
import type { InventoryProfile, PalLocation } from "../../domain/inventory";
import type { PalGender } from "../../domain/pal";
import type { SearchUpdateMode } from "../../routing/searchParams";
import { inventoryService } from "../../services/inventory/inventoryService";
import { saveWatchService } from "../../services/saveImport/saveWatchService";
import { useInventory } from "../../services/inventory/useInventory";
import InventoryCollection from "./InventoryCollection";
import { filterInventoryPals } from "./inventoryCollectionFilter";
import {
  clearInventoryFilters,
  resetInventoryView,
  setInventoryQuery,
  setInventoryWorld,
  updateInventorySearch,
  type InventoryIvFilter,
  type InventoryPassiveFilter,
  type InventorySearchState,
  type InventorySearchUpdate,
  type InventorySort,
} from "./inventorySearch";
import InventoryWorldSelect from "./InventoryWorldSelect";

type InventoryPageProps = {
  search: InventorySearchState;
  onSearchChange: (search: InventorySearchState, mode?: SearchUpdateMode) => void;
};

export default function InventoryPage({
  search,
  onSearchChange,
}: InventoryPageProps) {
  const snapshot = useInventory();
  const [notice, setNotice] = useState<{ message: string; kind: "success" | "error" }>();
  const profiles = snapshot.document.profiles;
  const profile = profiles.find(({ id }) => id === search.world)
    ?? inventoryService.getActiveProfile()
    ?? profiles[0];
  const profileId = profile?.id;
  const visiblePals = useMemo(
    () => filterInventoryPals(profile?.pals ?? [], {
      query: search.q,
      location: search.location,
      gender: search.gender,
      iv: search.iv,
      passives: search.passives,
      sort: search.sort,
    }),
    [
      profile?.pals,
      search.gender,
      search.iv,
      search.location,
      search.passives,
      search.q,
      search.sort,
    ],
  );
  const isFiltered = Boolean(
    search.q?.trim()
    || search.location
    || search.gender
    || search.iv
    || search.passives,
  );

  useEffect(() => {
    if (snapshot.status === "loading") return;
    if (profileId && inventoryService.getActiveProfile()?.id !== profileId) {
      inventoryService.selectProfile(profileId);
    }
    if (search.world !== profileId) {
      onSearchChange(setInventoryWorld(search, profileId), "replace");
    }
  }, [onSearchChange, profileId, search, snapshot.status]);

  const selectWorld = (profileId: string) => {
    inventoryService.selectProfile(profileId);
    setNotice(undefined);
    onSearchChange(setInventoryWorld(search, profileId), "push");
  };

  const updateView = (update: InventorySearchUpdate) => {
    onSearchChange(updateInventorySearch(search, update), "push");
  };

  const removeWorld = async (removed: InventoryProfile) => {
    try {
      await saveWatchService.disable(removed.id);
      inventoryService.removeProfile(removed.id);
      const nextProfile = inventoryService.getActiveProfile();
      setNotice({ message: `Removed ${removed.name} from Palpath.`, kind: "success" });
      onSearchChange(setInventoryWorld(search, nextProfile?.id), "push");
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "We couldn't remove that world.",
        kind: "error",
      });
    }
  };

  if (snapshot.status === "loading") {
    return (
      <main className="workspace feature-workspace inventory-workspace" aria-busy="true">
        <InventoryHero />
        <section className="feature-card loading-card">
          <StatusBanner kind="working" message="Loading your saved worlds..." />
        </section>
      </main>
    );
  }

  return (
    <main className="workspace feature-workspace inventory-workspace">
      <InventoryHero />

      {snapshot.status === "error" ? (
        <StatusBanner kind="error" message={snapshot.error ?? "We couldn't open your saved worlds."} />
      ) : null}
      {notice ? <InventoryNotice {...notice} onDismiss={() => setNotice(undefined)} /> : null}

      <section className="feature-card inventory-browser">
        <div className="inventory-browser-toolbar">
          {profiles.length ? (
            <InventoryWorldSelect
              profiles={profiles}
              selectedId={profile?.id}
              onChange={selectWorld}
            />
          ) : (
            <EmptyWorldControl />
          )}

          <SearchField
            className="inventory-search"
            value={search.q ?? ""}
            onChange={(query) => onSearchChange(setInventoryQuery(search, query), "replace")}
            isDisabled={!profile}
          >
            <Label className="sr-only">Search Pals</Label>
            <SearchIcon />
            <Input placeholder="Search names, passives, levels, or stats" />
            <AriaButton slot="clear" className="inventory-search-clear" aria-label="Clear search">
              <CloseIcon />
            </AriaButton>
          </SearchField>
          <InventorySortSelect
            value={search.sort}
            isDisabled={!profile}
            onChange={(sort) => updateView({ sort })}
          />
        </div>

        <InventoryFilterBar
          profile={profile}
          search={search}
          onChange={updateView}
          onClear={() => onSearchChange(clearInventoryFilters(search), "push")}
        />

        <div className="inventory-browser-content">
          {profile ? (
            <InventoryCollection
              profile={profile}
              visiblePals={visiblePals}
              query={search.q}
              isFiltered={isFiltered}
              onReset={() => onSearchChange(resetInventoryView(search), "push")}
              onRemove={() => void removeWorld(profile)}
            />
          ) : (
            <div className="empty-state inventory-empty inventory-no-world">
              <WorldOutlineIcon />
              <strong>Import a world to get started</strong>
              <span>Your Pals will appear here.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

const sortOptions: readonly SelectOption<InventorySort>[] = [
  { id: "name", label: "Name A-Z" },
  { id: "level-desc", label: "Level: high to low" },
  { id: "level-asc", label: "Level: low to high" },
  { id: "iv-desc", label: "Best average IV" },
  { id: "location", label: "Location & slot" },
];

const locationOptions: readonly { id: PalLocation | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "party", label: "Party" },
  { id: "palbox", label: "Palbox" },
  { id: "base", label: "Base" },
  { id: "global-storage", label: "Global" },
];

type SelectOption<T extends string> = { id: T; label: string };

function InventorySortSelect({
  value,
  isDisabled,
  onChange,
}: {
  value: InventorySort | undefined;
  isDisabled: boolean;
  onChange: (sort: InventorySort | undefined) => void;
}) {
  return (
    <Select<SelectOption<InventorySort>>
      className="inventory-sort-select"
      selectedKey={value ?? "name"}
      isDisabled={isDisabled}
      onSelectionChange={(key) => onChange(key === "name" ? undefined : String(key) as InventorySort)}
    >
      <Label>Sort by</Label>
      <AriaButton className="inventory-sort-trigger">
        <SortIcon />
        <SelectValue className="inventory-sort-value" />
        <ChevronIcon />
      </AriaButton>
      <Popover className="inventory-control-popover" placement="bottom end">
        <ListBox items={sortOptions} className="inventory-control-options">
          {(option) => (
            <ListBoxItem
              id={option.id}
              textValue={option.label}
              className="inventory-control-option"
            >
              {({ isSelected }) => (
                <>
                  <span>{option.label}</span>
                  {isSelected ? <CheckIcon /> : null}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

function InventoryFilterBar({
  profile,
  search,
  onChange,
  onClear,
}: {
  profile: InventoryProfile | undefined;
  search: InventorySearchState;
  onChange: (update: InventorySearchUpdate) => void;
  onClear: () => void;
}) {
  const counts = useMemo(() => {
    const next: Record<PalLocation | "all", number> = {
      all: profile?.pals.length ?? 0,
      party: 0,
      palbox: 0,
      base: 0,
      "global-storage": 0,
    };
    profile?.pals.forEach((pal) => { next[pal.location] += 1; });
    return next;
  }, [profile]);
  const extraFilterCount = [search.gender, search.iv, search.passives].filter(Boolean).length;
  const hasFilters = Boolean(search.location || extraFilterCount);

  return (
    <div className="inventory-filter-bar" aria-label="Inventory filters">
      <span className="inventory-filter-label"><LocationIcon /> Location</span>
      <div className="inventory-location-options" role="group" aria-label="Filter by location">
        {locationOptions.map((option) => {
          const isSelected = (search.location ?? "all") === option.id;
          return (
            <AriaButton
              key={option.id}
              className="inventory-location-filter"
              data-selected={isSelected || undefined}
              isDisabled={!profile}
              aria-pressed={isSelected}
              onPress={() => onChange({
                location: option.id === "all" ? undefined : option.id,
              })}
            >
              {option.label}<small>{counts[option.id].toLocaleString()}</small>
            </AriaButton>
          );
        })}
      </div>
      <InventoryMoreFilters
        search={search}
        isDisabled={!profile}
        activeCount={extraFilterCount}
        onChange={onChange}
      />
      {hasFilters ? (
        <AriaButton className="inventory-filter-clear" onPress={onClear}>Clear</AriaButton>
      ) : null}
    </div>
  );
}

function InventoryMoreFilters({
  search,
  isDisabled,
  activeCount,
  onChange,
}: {
  search: InventorySearchState;
  isDisabled: boolean;
  activeCount: number;
  onChange: (update: InventorySearchUpdate) => void;
}) {
  return (
    <DialogTrigger>
      <AriaButton className="inventory-more-filters" isDisabled={isDisabled}>
        <FilterIcon />
        More filters
        {activeCount ? <span>{activeCount}</span> : null}
      </AriaButton>
      <Popover className="inventory-filter-popover" placement="bottom end">
        <Dialog className="inventory-filter-dialog">
          <div className="inventory-filter-dialog-header">
            <div>
              <Heading slot="title">More filters</Heading>
              <p>Narrow this world without changing your save.</p>
            </div>
            {activeCount ? (
              <AriaButton
                className="inventory-filter-clear"
                onPress={() => onChange({ gender: undefined, iv: undefined, passives: undefined })}
              >
                Reset
              </AriaButton>
            ) : null}
          </div>
          <FilterChoiceGroup<PalGender>
            label="Sex"
            value={search.gender}
            options={[
              { id: "F", label: "Female" },
              { id: "M", label: "Male" },
            ]}
            onChange={(gender) => onChange({ gender })}
          />
          <FilterChoiceGroup<InventoryIvFilter>
            label="Hidden IV quality"
            value={search.iv}
            options={[
              { id: "known", label: "Known" },
              { id: "average-70", label: "70+ avg" },
              { id: "average-90", label: "90+ avg" },
            ]}
            onChange={(iv) => onChange({ iv })}
          />
          <FilterChoiceGroup<InventoryPassiveFilter>
            label="Passive skills"
            value={search.passives}
            options={[
              { id: "with", label: "Has passives" },
              { id: "none", label: "None" },
            ]}
            onChange={(passives) => onChange({ passives })}
          />
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function FilterChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: readonly SelectOption<T>[];
  onChange: (value: T | undefined) => void;
}) {
  return (
    <div className="inventory-filter-group">
      <span>{label}</span>
      <div role="group" aria-label={label}>
        <AriaButton
          data-selected={!value || undefined}
          aria-pressed={!value}
          onPress={() => onChange(undefined)}
        >
          Any
        </AriaButton>
        {options.map((option) => (
          <AriaButton
            key={option.id}
            data-selected={value === option.id || undefined}
            aria-pressed={value === option.id}
            onPress={() => onChange(option.id)}
          >
            {option.label}
          </AriaButton>
        ))}
      </div>
    </div>
  );
}

function InventoryHero() {
  return (
    <section className="feature-hero">
      <div>
        <span className="section-kicker">INVENTORY</span>
        <h1>Your Palworld 1.0 Pals</h1>
        <p>Search your imported Pals, compare stats, and choose which world the Builder uses.</p>
      </div>
      <span className="hero-index">01</span>
    </section>
  );
}

function EmptyWorldControl() {
  return (
    <div className="inventory-world-select is-empty">
      <span>World</span>
      <div className="inventory-world-trigger" aria-disabled="true">
        <WorldOutlineIcon />
        <span className="inventory-world-value">
          <strong>No world imported</strong>
          <small>Import a world to get started</small>
        </span>
      </div>
    </div>
  );
}

function InventoryNotice({
  message,
  kind,
  onDismiss,
}: {
  message: string;
  kind: "success" | "error";
  onDismiss: () => void;
}) {
  return (
    <div className={`inventory-notice is-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span>{kind === "error" ? "!" : "OK"}</span>
      <p>{message}</p>
      <AriaButton aria-label="Dismiss message" onPress={onDismiss}><CloseIcon /></AriaButton>
    </div>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
}

function SortIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h8M3 9h6M3 13h4M13 4v10m0 0-2.5-2.5M13 14l2.5-2.5" /></svg>;
}

function FilterIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M2.5 4h13M5 9h8m-5.5 5h3" /></svg>;
}

function LocationIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M9 16s5-4.4 5-9a5 5 0 0 0-10 0c0 4.6 5 9 5 9Z" /><circle cx="9" cy="7" r="1.7" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.3 3 3L13 4.7" /></svg>;
}

function WorldOutlineIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5M12 3.5C9.9 5.8 8.8 8.6 8.8 12s1.1 6.2 3.2 8.5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}
