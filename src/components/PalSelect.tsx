import { useState, type Key } from "react";
import {
  Button,
  ComboBox,
  Group,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
} from "react-aria-components";
import { breedingRepository } from "../data/breedingRepository";
import type { Pal, PalId } from "../domain/pal";
import { filterPals, formatPalMeta, formatPalNumber } from "./palPickerUtils";

type PalSelectProps = {
  label: string;
  value?: PalId;
  onChange: (value: PalId | undefined) => void;
  query?: {
    value: string;
    onChange: (value: string) => void;
  };
};

const pals = breedingRepository.allPals();

export default function PalSelect({
  label,
  value,
  onChange,
  query,
}: PalSelectProps) {
  const selected = value ? breedingRepository.getPal(value) : undefined;
  const [localInputValue, setLocalInputValue] = useState(selected?.name ?? "");
  const inputValue = query ? query.value || selected?.name || "" : localInputValue;
  const visiblePals = filterPals(pals, inputValue);

  const updateInputValue = (nextValue: string) => {
    if (query) query.onChange(nextValue);
    else setLocalInputValue(nextValue);
  };

  const handleSelectionChange = (key: Key | null) => {
    if (typeof key !== "string") {
      if (!query) onChange(undefined);
      return;
    }
    const nextPal = breedingRepository.getPal(key);
    if (!query) setLocalInputValue(nextPal?.name ?? "");
    onChange(key);
  };

  return (
    <ComboBox<Pal>
      className="catalog-pal-select pal-select-field"
      items={visiblePals}
      selectedKey={value ?? null}
      inputValue={inputValue}
      onInputChange={updateInputValue}
      onSelectionChange={handleSelectionChange}
      menuTrigger="focus"
      allowsEmptyCollection
    >
      <Label>{label}</Label>
      <Group className="catalog-pal-select-control">
        <span className="catalog-pal-select-media" aria-hidden="true">
          {selected ? <img src={selected.image} alt="" /> : <SearchIcon />}
        </span>
        <span className="catalog-pal-select-input">
          <small>{selected ? formatPalNumber(selected.number) : "Search catalog"}</small>
          <Input placeholder="Choose a Pal" autoComplete="off" />
        </span>
        <Button className="catalog-pal-select-toggle" aria-label="Show options">
          <ChevronIcon />
        </Button>
      </Group>
      <Popover className="catalog-pal-select-popover" placement="bottom start">
        <ListBox<Pal>
          className="catalog-pal-select-options"
          renderEmptyState={() => (
            <div className="catalog-pal-select-empty">
              <strong>No matching Pal</strong>
              <span>Try a different name, variant, or Pal number.</span>
            </div>
          )}
        >
          {(pal) => (
            <ListBoxItem
              id={pal.id}
              textValue={pal.name}
              aria-label={`${formatPalNumber(pal.number)} ${pal.name} ${formatPalMeta(pal.id)}`}
              className="catalog-pal-select-option"
            >
              {({ isSelected }) => (
                <>
                  <span className="catalog-pal-option-media"><img src={pal.image} alt="" loading="lazy" /></span>
                  <span className="catalog-pal-option-copy">
                    <small>{formatPalNumber(pal.number)}</small>
                    <strong>{pal.name}</strong>
                    <span>{formatPalMeta(pal.id)}</span>
                  </span>
                  <span className={`catalog-pal-option-check${isSelected ? " is-visible" : ""}`} aria-hidden="true"><CheckIcon /></span>
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 3.5 3.5L18 8" /></svg>;
}
