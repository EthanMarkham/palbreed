import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { breedingRepository } from "../data/breedingRepository";
import type { Pal, PalId } from "../domain/pal";

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

  return (
    <Autocomplete<Pal, false, false, false>
      className="pal-autocomplete pal-select-field"
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
          <strong>No matching Pal</strong>
          <small>Try a different name, variant, or Pal number.</small>
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
          label={label}
          placeholder="Search name or number"
          helperText={selected
            ? `${formatPalNumber(selected.number)} / ${formatPalMeta(selected.id)}`
            : "Search the complete Pal catalog"}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps?.htmlInput,
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
              <img src={pal.image} alt="" loading="lazy" />
            </span>
            <span className="pal-autocomplete-copy">
              <small>{formatPalNumber(pal.number)}</small>
              <strong>{pal.name}</strong>
              <span>{formatPalMeta(pal.id)}</span>
            </span>
            <span className={`autocomplete-check${isSelected ? " is-visible" : ""}`} aria-hidden="true">
              <CheckIcon />
            </span>
          </li>
        );
      }}
    />
  );
}

function formatPalNumber(number: number) {
  return `No. ${String(number).padStart(3, "0")}`;
}

function formatPalMeta(palId: string) {
  return palId.split("-").join(" / ").toLocaleUpperCase();
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 3.5 3.5L18 8" /></svg>;
}
