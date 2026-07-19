import { useEffect, useMemo, useState } from "react";
import {
  Button as AriaButton,
  Input,
  Label,
  SearchField,
} from "react-aria-components";
import StatusBanner from "../../components/StatusBanner";
import type { InventoryProfile } from "../../domain/inventory";
import type { SearchUpdateMode } from "../../routing/searchParams";
import { inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";
import InventoryCollection from "./InventoryCollection";
import { filterInventoryPals } from "./inventoryCollectionFilter";
import type { InventorySearchState } from "./inventorySearch";
import InventoryWorldSelect from "./InventoryWorldSelect";
import WorldImportDialog from "./WorldImportDialog";

type InventoryPageProps = {
  search: InventorySearchState;
  onWorldChange: (profileId: string | undefined, mode?: SearchUpdateMode) => void;
  onQueryChange: (query: string) => void;
};

export default function InventoryPage({
  search,
  onWorldChange,
  onQueryChange,
}: InventoryPageProps) {
  const snapshot = useInventory();
  const [notice, setNotice] = useState<string>();
  const profiles = snapshot.document.profiles;
  const profile = profiles.find(({ id }) => id === search.world)
    ?? inventoryService.getActiveProfile();
  const profileId = profile?.id;
  const visiblePals = useMemo(
    () => filterInventoryPals(profile?.pals ?? [], search.q),
    [profile?.pals, search.q],
  );

  useEffect(() => {
    if (snapshot.status === "loading") return;
    if (profileId && inventoryService.getActiveProfile()?.id !== profileId) {
      inventoryService.selectProfile(profileId);
    }
    if (search.world !== profileId) onWorldChange(profileId, "replace");
  }, [onWorldChange, profileId, search.world, snapshot.status]);

  const selectWorld = (profileId: string) => {
    inventoryService.selectProfile(profileId);
    setNotice(undefined);
    onWorldChange(profileId);
  };

  const removeWorld = (removed: InventoryProfile) => {
    inventoryService.removeProfile(removed.id);
    const nextProfile = inventoryService.getActiveProfile();
    setNotice(`Removed ${removed.name} from Palpath.`);
    onWorldChange(nextProfile?.id);
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
      {notice ? <InventoryNotice message={notice} onDismiss={() => setNotice(undefined)} /> : null}

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
            onChange={onQueryChange}
            isDisabled={!profile}
          >
            <Label className="sr-only">Search Pals</Label>
            <SearchIcon />
            <Input placeholder="Search by name, passive, level, sex, or location" />
            <AriaButton slot="clear" className="inventory-search-clear" aria-label="Clear search">
              <CloseIcon />
            </AriaButton>
          </SearchField>

          <WorldImportDialog
            onImported={(profileId, message) => {
              setNotice(message);
              onWorldChange(profileId);
            }}
          />
        </div>

        <div className="inventory-browser-content">
          {profile ? (
            <InventoryCollection
              profile={profile}
              visiblePals={visiblePals}
              query={search.q}
              onQueryClear={() => onQueryChange("")}
              onRemove={() => removeWorld(profile)}
            />
          ) : (
            <div className="empty-state inventory-empty inventory-no-world">
              <WorldOutlineIcon />
              <strong>Import a world to get started</strong>
              <span>Once it's imported, you can browse your Pals here and use them in the Builder.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function InventoryHero() {
  return (
    <section className="feature-hero">
      <div>
        <span className="section-kicker">INVENTORY</span>
        <h1>Your Pals</h1>
        <p>Browse the Pals in your selected world, or switch worlds to use a different collection in the Builder.</p>
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

function InventoryNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="inventory-notice" role="status">
      <span>OK</span>
      <p>{message}</p>
      <AriaButton aria-label="Dismiss message" onPress={onDismiss}><CloseIcon /></AriaButton>
    </div>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>;
}

function WorldOutlineIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5M12 3.5C9.9 5.8 8.8 8.6 8.8 12s1.1 6.2 3.2 8.5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>;
}
