import { useMemo, useState, type Key } from "react";
import {
  Button,
  ComboBox,
  Group,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Tag,
  TagGroup,
  TagList,
} from "react-aria-components";
import { passiveRepository } from "../data/passiveRepository";
import type { PassiveDefinition, PassiveId } from "../domain/passive";

const ANY_PASSIVE_ID = "__any-passive__";

type PassiveOption = Pick<PassiveDefinition, "id" | "name" | "description" | "rank"> & {
  isAny?: boolean;
};

type PassiveSelectorBaseProps = {
  label: string;
  selected: readonly PassiveId[];
  onChange: (selected: readonly PassiveId[]) => void;
  max?: number;
};

type PassiveSelectorQueryProps =
  | { query: string; onQueryChange: (query: string) => void }
  | { query?: never; onQueryChange?: never };

type PassiveSelectorAnyProps =
  | { allowAny: true; anySelected: boolean; onAnyChange: (selected: boolean) => void }
  | { allowAny?: false; anySelected?: never; onAnyChange?: never };

type PassiveSelectorProps = PassiveSelectorBaseProps & PassiveSelectorQueryProps & PassiveSelectorAnyProps;

const allPassives = passiveRepository.all();
const anyPassive: PassiveOption = {
  id: ANY_PASSIVE_ID,
  name: "Any",
  description: "Accept any passive combination, including no passives.",
  rank: 0,
  isAny: true,
};

export default function PassiveSelector({
  label,
  selected,
  onChange,
  max = 4,
  query: controlledQuery,
  onQueryChange,
  allowAny = false,
  anySelected = false,
  onAnyChange,
}: PassiveSelectorProps) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const options = useMemo<readonly PassiveOption[]>(
    () => allowAny ? [anyPassive, ...allPassives] : allPassives,
    [allowAny],
  );
  const visibleOptions = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return options;
    return options.filter((passive) => {
      const searchable = `${passive.name} ${passive.description} ${passive.id}`.toLocaleLowerCase();
      return tokens.every((token) => searchable.includes(token));
    });
  }, [options, query]);
  const selectedOptions = useMemo<readonly PassiveOption[]>(() => {
    if (anySelected) return [anyPassive];
    return selected.flatMap((id) => {
      const passive = passiveRepository.get(id);
      return passive ? [passive] : [];
    });
  }, [anySelected, selected]);

  const updateQuery = (value: string) => {
    if (onQueryChange) onQueryChange(value);
    else setLocalQuery(value);
  };

  const clearLocalQuery = () => {
    if (controlledQuery === undefined) setLocalQuery("");
  };

  const handleSelection = (key: Key | null) => {
    if (typeof key !== "string") return;
    if (key === ANY_PASSIVE_ID) {
      clearLocalQuery();
      onAnyChange?.(true);
      return;
    }
    if (!passiveRepository.get(key) || selected.includes(key) || selected.length >= max) return;
    clearLocalQuery();
    onChange(anySelected ? [key] : [...selected, key]);
  };

  const removeSelections = (keys: Set<Key>) => {
    if (keys.has(ANY_PASSIVE_ID)) {
      onAnyChange?.(false);
      return;
    }
    onChange(selected.filter((id) => !keys.has(id)));
  };

  const countLabel = anySelected ? "Any" : `${selected.length}/${max}`;

  return (
    <fieldset className="passive-selector">
      <legend>{label} <span>{countLabel}</span></legend>

      <TagGroup className="passive-tag-group" onRemove={removeSelections} aria-label={`Selected ${label.toLocaleLowerCase()}`}>
        <TagList<PassiveOption>
          className="passive-tags"
          items={selectedOptions}
          renderEmptyState={() => <span className="passive-empty">No passives selected</span>}
        >
          {(passive) => (
            <Tag id={passive.id} textValue={passive.name} className={`passive-tag${passive.isAny ? " is-any" : ""}`}>
              <span>{passive.name}</span>
              <Button slot="remove" aria-label={`Remove ${passive.name}`}><CloseIcon /></Button>
            </Tag>
          )}
        </TagList>
      </TagGroup>

      <ComboBox<PassiveOption>
        className="passive-combobox"
        items={visibleOptions}
        selectedKey={null}
        inputValue={query}
        onInputChange={updateQuery}
        onSelectionChange={handleSelection}
        menuTrigger="focus"
        allowsEmptyCollection
      >
        <Label className="sr-only">Add {label.toLocaleLowerCase()}</Label>
        <Group className="passive-combobox-control">
          <SearchIcon />
          <Input placeholder="Type to search passives" autoComplete="off" />
          <Button className="passive-combobox-toggle" aria-label="Show passive options"><ChevronIcon /></Button>
        </Group>
        <Popover className="passive-combobox-popover" placement="bottom start">
          <ListBox<PassiveOption>
            className="passive-combobox-options"
            renderEmptyState={() => (
              <div className="passive-no-results"><strong>No matching passives</strong><span>Try a name, effect, or identifier.</span></div>
            )}
          >
            {(passive) => {
              const isSelected = passive.isAny ? anySelected : selected.includes(passive.id);
              const isAtLimit = !passive.isAny && !isSelected && !anySelected && selected.length >= max;
              return (
                <ListBoxItem
                  id={passive.id}
                  textValue={`${passive.name} ${passive.description}`}
                  isDisabled={isSelected || isAtLimit}
                  className={`passive-combobox-option${passive.isAny ? " is-any" : ""}`}
                >
                  <span className="passive-option-copy">
                    <strong>{passive.name}</strong>
                    <small>{passive.description}</small>
                  </span>
                  {passive.isAny ? <span className="passive-any-badge">Wildcard</span> : <em>{passive.rank > 0 ? `+${passive.rank}` : passive.rank}</em>}
                  <span className={`passive-option-check${isSelected ? " is-visible" : ""}`} aria-hidden="true"><CheckIcon /></span>
                </ListBoxItem>
              );
            }}
          </ListBox>
        </Popover>
      </ComboBox>
    </fieldset>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8M16 8l-8 8" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 3.5 3.5L18 8" /></svg>;
}
