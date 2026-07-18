import {
  Group,
  Input,
  Label,
  SearchField,
} from "react-aria-components";
import type { Pal, PalId } from "../domain/pal";
import { formatPalNumber } from "./palPickerUtils";

type PalPickerProps = {
  label: string;
  description: string;
  selectedId?: PalId;
  inputValue: string;
  onInputChange: (value: string) => void;
  onActivate: () => void;
  isActive: boolean;
  isBrowserOpen: boolean;
  pals: readonly Pal[];
  placeholder: string;
};

export default function PalPicker({
  label,
  description,
  selectedId,
  inputValue,
  onInputChange,
  onActivate,
  isActive,
  isBrowserOpen,
  pals,
  placeholder,
}: PalPickerProps) {
  const selected = pals.find((pal) => pal.id === selectedId);
  const pickerState = isActive && isBrowserOpen
    ? "Browsing"
    : selected
      ? "Selected"
      : "Standby";

  return (
    <SearchField
      className={`pal-picker${isActive ? " is-active" : ""}`}
      aria-label={`${label} search`}
      value={inputValue}
      onChange={onInputChange}
      onFocus={onActivate}
      onClick={onActivate}
    >
      <div className="picker-card-head">
        <div className="picker-card-copy">
          <Label>{label}</Label>
          <span>{description}</span>
        </div>
        <span className="picker-card-state">{pickerState}</span>
      </div>

      <div className={`picker-selection${selected ? "" : " is-empty"}`}>
        {selected ? (
          <>
            <div className="picker-selection-media">
              <img src={selected.image} alt="" loading="lazy" />
            </div>
            <span className="picker-selection-copy">
              <small>Selected</small>
              <strong>{selected.name}</strong>
            </span>
            <span className="picker-selection-number">
              {formatPalNumber(selected.number)}
            </span>
          </>
        ) : (
          <span className="picker-selection-empty">
            <strong>No Pal selected</strong>
            <small>Use the browser below to pick one.</small>
          </span>
        )}
      </div>

      <Group className="picker-field">
        <SearchIcon />
        <Input
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
      </Group>
    </SearchField>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
