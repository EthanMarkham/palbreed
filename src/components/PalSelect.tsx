import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useId } from "react";
import { breedingRepository } from "../data/breedingRepository";
import type { Pal, PalId } from "../domain/pal";
import PalAvatar from "./PalAvatar";

type PalSelectProps = {
  label: string;
  value?: PalId;
  onChange: (value: PalId | undefined) => void;
  query: {
    value: string;
    onChange: (value: string) => void;
  };
};

const pals = breedingRepository.allPals();
const filterPals = createFilterOptions<Pal>({
  stringify: (pal) => [
    pal.name,
    pal.id,
    String(pal.number),
    String(pal.number).padStart(3, "0"),
  ].join(" "),
});

export default function PalSelect({
  label,
  value,
  onChange,
  query,
}: PalSelectProps) {
  const selected = value ? breedingRepository.getPal(value) ?? null : null;
  const inputValue = query.value || selected?.name || "";
  const inputId = useId();
  const helperId = `${inputId}-helper`;
  const helperText = selected
    ? formatPalNumber(selected.number)
    : "Palworld 1.0 Paldex";

  return (
    <div className="pal-select-field">
      <label className="control-label" htmlFor={inputId}>{label}</label>
      <Autocomplete<Pal, false, false, false>
        className="pal-autocomplete"
        options={pals}
        value={selected}
        inputValue={inputValue}
        onChange={(_, pal) => onChange(pal?.id)}
        onInputChange={(_, nextValue, reason) => {
          if (reason === "input" || reason === "clear") query.onChange(nextValue);
        }}
        getOptionLabel={(pal) => pal.name}
        getOptionKey={(pal) => pal.id}
        isOptionEqualToValue={(pal, selectedPal) => pal.id === selectedPal.id}
        filterOptions={filterPals}
        blurOnSelect
        openOnFocus
        autoHighlight
        noOptionsText={(
          <span className="autocomplete-empty">
            <strong>No Pal found</strong>
            <small>Try another name or Pal number.</small>
          </span>
        )}
        slotProps={{
          popper: { className: "pal-autocomplete-popper" },
          paper: { className: "autocomplete-paper" },
          listbox: { className: "pal-autocomplete-listbox" },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            id={inputId}
            placeholder="Search Pals by name or number"
            slotProps={{
              ...params.slotProps,
              htmlInput: {
                ...params.slotProps?.htmlInput,
                id: inputId,
                "aria-label": label,
                "aria-describedby": helperId,
                autoComplete: "off",
                enterKeyHint: "search",
              },
            }}
          />
        )}
        renderOption={(props, pal, { selected: isSelected }) => {
          const { key, ...optionProps } = props;
          return (
            <li {...optionProps} key={key} className={`${optionProps.className ?? ""} pal-autocomplete-option`}>
              <span className="pal-autocomplete-media" aria-hidden="true">
                <PalAvatar pal={pal} />
              </span>
              <span className="pal-autocomplete-copy">
                <small>{formatPalNumber(pal.number)}</small>
                <strong>{pal.name}</strong>
              </span>
              <span className={`autocomplete-check${isSelected ? " is-visible" : ""}`} aria-hidden="true">
                <CheckIcon />
              </span>
            </li>
          );
        }}
      />
      <small className="pal-select-helper" id={helperId}>{helperText}</small>
    </div>
  );
}

function formatPalNumber(number: number) {
  return `No. ${String(number).padStart(3, "0")}`;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 3.5 3.5L18 8" /></svg>;
}
