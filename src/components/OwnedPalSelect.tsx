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
import { passiveRepository } from "../data/passiveRepository";
import type { OwnedPal } from "../domain/inventory";

const ANY_PAL_ID = "__any-included-pal__";

type OwnedPalOption = {
  id: string;
  pal?: OwnedPal;
};

type OwnedPalSelectProps = {
  label: string;
  pals: readonly OwnedPal[];
  value: string;
  onChange: (value: string) => void;
  query?: {
    value: string;
    onChange: (value: string) => void;
  };
};

export default function OwnedPalSelect({ label, pals, value, onChange, query }: OwnedPalSelectProps) {
  const options: readonly OwnedPalOption[] = [
    { id: ANY_PAL_ID },
    ...pals.map((pal) => ({ id: pal.id, pal })),
  ];
  const selectedPal = pals.find(({ id }) => id === value);
  const selectedSpecies = selectedPal ? breedingRepository.getPal(selectedPal.speciesId) : undefined;
  const [localInputValue, setLocalInputValue] = useState(selectedPal ? ownedPalName(selectedPal) : "");
  const inputValue = query ? query.value || (selectedPal ? ownedPalName(selectedPal) : "") : localInputValue;
  const normalizedQuery = inputValue.trim().toLocaleLowerCase();
  const visibleOptions = normalizedQuery ? options.filter(({ pal }) => pal
    ? ownedPalSearchText(pal).toLocaleLowerCase().includes(normalizedQuery)
    : "any included pal flexible start target only".includes(normalizedQuery)) : options;

  const updateInputValue = (nextValue: string) => {
    if (query) query.onChange(nextValue);
    else setLocalInputValue(nextValue);
  };

  const handleSelectionChange = (key: Key | null) => {
    if (key === ANY_PAL_ID) {
      if (!query) setLocalInputValue("");
      onChange("");
      return;
    }
    if (typeof key !== "string") {
      if (!query) onChange("");
      return;
    }
    const nextPal = pals.find(({ id }) => id === key);
    if (!query) setLocalInputValue(nextPal ? ownedPalName(nextPal) : "");
    onChange(key);
  };

  return (
    <ComboBox<OwnedPalOption>
      className="catalog-pal-select owned-pal-select"
      items={visibleOptions}
      selectedKey={value || ANY_PAL_ID}
      inputValue={inputValue}
      onInputChange={updateInputValue}
      onSelectionChange={handleSelectionChange}
      menuTrigger="focus"
    >
      <Label>{label}</Label>
      <Group className="catalog-pal-select-control">
        <span className="catalog-pal-select-media" aria-hidden="true">
          {selectedSpecies ? <img src={selectedSpecies.image} alt="" /> : <InventoryIcon />}
        </span>
        <span className="catalog-pal-select-input">
          <small>{selectedPal ? `${selectedPal.level ? `Level ${selectedPal.level} · ` : ""}${selectedPal.location.replace("-", " ")}` : "Inventory search"}</small>
          <Input placeholder="Any included Pal" autoComplete="off" />
        </span>
        {selectedPal ? <GenderBadge gender={selectedPal.gender} /> : null}
        <Button className="catalog-pal-select-toggle" aria-label="Show options"><ChevronIcon /></Button>
      </Group>
      <Popover className="catalog-pal-select-popover owned-pal-select-popover" placement="bottom start">
        <ListBox<OwnedPalOption>
          className="catalog-pal-select-options owned-pal-select-options"
          renderEmptyState={() => (
            <div className="catalog-pal-select-empty">
              <strong>No matching owned Pal</strong>
              <span>Search by Pal, passive, gender, or location.</span>
            </div>
          )}
        >
          {(option) => option.pal ? <OwnedPalOptionCard option={option} /> : (
            <ListBoxItem
              id={option.id}
              textValue="Any included Pal"
              aria-label="Any included Pal, flexible start, use the whole included inventory"
              className="catalog-pal-select-option owned-pal-any-option"
            >
              <span className="catalog-pal-option-media"><InventoryIcon /></span>
              <span className="catalog-pal-option-copy"><small>Flexible start</small><strong>Any included Pal</strong><span>Use the whole included inventory</span></span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}

function OwnedPalOptionCard({ option }: { option: OwnedPalOption }) {
  const pal = option.pal!;
  const species = breedingRepository.getPal(pal.speciesId);
  const passives = pal.passiveIds.map((id) => passiveRepository.get(id)?.name ?? id);
  const searchText = ownedPalSearchText(pal);

  return (
    <ListBoxItem
      id={option.id}
      textValue={ownedPalName(pal)}
      aria-label={searchText}
      className="catalog-pal-select-option owned-pal-option"
    >
      {({ isSelected }) => (
        <>
          <span className="catalog-pal-option-media">{species ? <img src={species.image} alt="" loading="lazy" /> : <InventoryIcon />}</span>
          <span className="owned-pal-option-copy">
            <span className="owned-pal-option-heading">
              <span><strong>{pal.nickname || species?.name || pal.speciesId}</strong>{pal.nickname && species ? <small>{species.name}</small> : null}</span>
              <GenderBadge gender={pal.gender} />
            </span>
            <span className="owned-pal-option-meta">
              {pal.level ? <span>Level {pal.level}</span> : null}
              <span>{pal.location.replace("-", " ")}</span>
            </span>
            <span className="owned-pal-passives">
              {passives.length ? passives.map((passive) => <span key={passive}>{passive}</span>) : <em>No passives recorded</em>}
            </span>
          </span>
          <span className={`catalog-pal-option-check${isSelected ? " is-visible" : ""}`} aria-hidden="true"><CheckIcon /></span>
        </>
      )}
    </ListBoxItem>
  );
}

function ownedPalName(pal: OwnedPal) {
  return pal.nickname || breedingRepository.getPal(pal.speciesId)?.name || pal.speciesId;
}

function ownedPalSearchText(pal: OwnedPal) {
  const species = breedingRepository.getPal(pal.speciesId);
  const passives = pal.passiveIds.map((id) => passiveRepository.get(id)?.name ?? id);
  return [
    pal.nickname,
    species?.name,
    genderName(pal.gender),
    pal.location.replace("-", " "),
    pal.level ? `level ${pal.level}` : "",
    ...passives,
  ].filter(Boolean).join(" ");
}

export function GenderBadge({ gender }: { gender: OwnedPal["gender"] }) {
  return <span className={`gender-badge is-${gender === "F" ? "female" : "male"}`}>{genderName(gender)}</span>;
}

function genderName(gender: OwnedPal["gender"]) {
  return gender === "F" ? "Female" : "Male";
}

function InventoryIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v12H4z" /><path d="M8 7.5V5h8v2.5M4 12h16M10 12v2h4v-2" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24"><path d="m6 12.5 3.5 3.5L18 8" /></svg>;
}
