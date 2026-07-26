import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useMemo } from "react";
import { passiveRepository } from "../data/passiveRepository";
import type { PassiveDefinition, PassiveId } from "../domain/passive";

type PassiveOption = Pick<PassiveDefinition, "id" | "name" | "description" | "rank">;

type PassiveSelectorProps = {
  label: string;
  selected: readonly PassiveId[];
  onChange: (selected: readonly PassiveId[]) => void;
  max?: number;
  query: string;
  onQueryChange: (query: string) => void;
};

const allPassives = passiveRepository.all();
const filterPassives = createFilterOptions<PassiveOption>({
  stringify: (passive) => `${passive.name} ${passive.description} ${passive.id}`,
});

export default function PassiveSelector({
  label,
  selected,
  onChange,
  max = 4,
  query,
  onQueryChange,
}: PassiveSelectorProps) {
  const selectedOptions = useMemo<PassiveOption[]>(() => {
    return selected.flatMap((id) => {
      const passive = passiveRepository.get(id);
      return passive ? [passive] : [];
    });
  }, [selected]);

  return (
    <fieldset className="passive-selector">
      <legend>{label} <span>{selected.length}/{max}</span></legend>
      <Autocomplete<PassiveOption, true, false, false>
        className="passive-autocomplete"
        multiple
        options={allPassives}
        value={selectedOptions}
        inputValue={query}
        onInputChange={(_, nextValue, reason) => {
          if (reason === "input" || reason === "clear") onQueryChange(nextValue);
        }}
        onChange={(_, nextOptions) => {
          const nextIds = nextOptions
            .map((passive) => passive.id)
            .slice(0, max);
          onChange(nextIds);
        }}
        getOptionLabel={(passive) => passive.name}
        getOptionKey={(passive) => passive.id}
        isOptionEqualToValue={(passive, selectedPassive) => passive.id === selectedPassive.id}
        getOptionDisabled={(passive) => (
          !selected.includes(passive.id)
          && selected.length >= max
        )}
        filterOptions={filterPassives}
        filterSelectedOptions
        blurOnSelect
        openOnFocus
        autoHighlight
        noOptionsText={(
          <span className="autocomplete-empty">
            <strong>No passives found</strong>
            <small>Try another name or effect.</small>
          </span>
        )}
        slotProps={{
          popper: { className: "passive-autocomplete-popper" },
          paper: { className: "autocomplete-paper" },
          listbox: {
            className: "passive-autocomplete-listbox",
            "aria-label": `Add ${label.toLocaleLowerCase()}`,
          },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={selectedOptions.length ? "Add another passive" : "Search passive names or effects"}
            slotProps={{
              ...params.slotProps,
              htmlInput: {
                ...params.slotProps?.htmlInput,
                "aria-label": `Add ${label.toLocaleLowerCase()}`,
                autoComplete: "off",
                enterKeyHint: "search",
              },
            }}
          />
        )}
        renderOption={(props, passive) => {
          const { key, ...optionProps } = props;
          return (
            <li
              {...optionProps}
              key={key}
              className={`${optionProps.className ?? ""} passive-autocomplete-option`}
            >
              <span className="passive-autocomplete-copy">
                <strong>{passive.name}</strong>
                <small>{passive.description}</small>
              </span>
              <em>{passive.rank > 0 ? `+${passive.rank}` : passive.rank}</em>
            </li>
          );
        }}
      />
      <p className="passive-selector-help">Leave empty to ignore passives.</p>
    </fieldset>
  );
}
