import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from "react-aria-components";
import type { InventoryProfile } from "../../domain/inventory";

type InventoryWorldSelectProps = {
  profiles: readonly InventoryProfile[];
  selectedId: string | undefined;
  onChange: (profileId: string) => void;
};

export default function InventoryWorldSelect({
  profiles,
  selectedId,
  onChange,
}: InventoryWorldSelectProps) {
  return (
    <Select<InventoryProfile>
      className="inventory-world-select"
      selectedKey={selectedId}
      onSelectionChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
    >
      <Label>World</Label>
      <Button className="inventory-world-trigger">
        <WorldIcon />
        <SelectValue<InventoryProfile> className="inventory-world-value">
          {({ selectedItem }) => selectedItem ? (
            <>
              <strong>{selectedItem.name}</strong>
              <small>{formatWorldMeta(selectedItem)}</small>
            </>
          ) : (
            <strong>Choose a world</strong>
          )}
        </SelectValue>
        <ChevronIcon />
      </Button>
      <Popover className="inventory-world-popover" placement="bottom start">
        <ListBox items={profiles} className="inventory-world-options">
          {(profile) => (
            <ListBoxItem
              id={profile.id}
              textValue={profile.name}
              className="inventory-world-option"
            >
              {({ isSelected }) => (
                <>
                  <span className={`inventory-world-platform is-${profile.platform}`}>
                    {profile.platform === "xbox" ? "XB" : "ST"}
                  </span>
                  <span>
                    <strong>{profile.name}</strong>
                    <small>{formatWorldMeta(profile)}</small>
                  </span>
                  <span className={`inventory-world-check${isSelected ? " is-selected" : ""}`}>
                    <CheckIcon />
                  </span>
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}

function formatWorldMeta(profile: InventoryProfile) {
  return `${profile.pals.length.toLocaleString()} Pals · ${profile.platform === "xbox" ? "Xbox" : "Steam"}`;
}

function WorldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5M12 3.5C9.9 5.8 8.8 8.6 8.8 12s1.1 6.2 3.2 8.5" />
    </svg>
  );
}

function ChevronIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.3 3 3L13 4.7" /></svg>;
}
