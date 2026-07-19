import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { useMemo, useState } from "react";
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
const filterPassives = createFilterOptions<PassiveOption>({
  stringify: (passive) => `${passive.name} ${passive.description} ${passive.id}`,
});

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
  const selectedOptions = useMemo<PassiveOption[]>(() => {
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

  return (
    <fieldset className="passive-selector">
      <legend>{label} <span>{anySelected ? "Any" : `${selected.length}/${max}`}</span></legend>
      <Autocomplete<PassiveOption, true, false, false>
        className="passive-autocomplete"
        multiple
        options={options}
        value={selectedOptions}
        inputValue={query}
        onInputChange={(_, nextValue, reason) => {
          if (reason === "input" || reason === "clear") updateQuery(nextValue);
        }}
        onChange={(_, nextOptions, reason, details) => {
          const changedOption = details?.option;
          if (reason === "selectOption" && changedOption?.isAny) {
            onAnyChange?.(true);
            return;
          }
          if (reason === "removeOption" && changedOption?.isAny) {
            onAnyChange?.(false);
            return;
          }
          const nextIds = nextOptions
            .filter((passive) => !passive.isAny)
            .map((passive) => passive.id)
            .slice(0, max);
          onChange(nextIds);
        }}
        getOptionLabel={(passive) => passive.name}
        getOptionKey={(passive) => passive.id}
        isOptionEqualToValue={(passive, selectedPassive) => passive.id === selectedPassive.id}
        getOptionDisabled={(passive) => (
          !passive.isAny
          && !anySelected
          && !selected.includes(passive.id)
          && selected.length >= max
        )}
        filterOptions={filterPassives}
        filterSelectedOptions
        blurOnSelect
        openOnFocus
        autoHighlight
        noOptionsText={(
          <span className="autocomplete-empty">
            <strong>No matching passives</strong>
            <small>Try a name, effect, or identifier.</small>
          </span>
        )}
        slotProps={{
          popper: { className: "passive-autocomplete-popper" },
          paper: { className: "autocomplete-paper" },
          listbox: {
            className: "passive-autocomplete-listbox",
            "aria-label": `Add ${label.toLocaleLowerCase()}`,
          },
          chip: { className: anySelected ? "is-any" : undefined },
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={selectedOptions.length ? "Search for another" : "Search by name or effect"}
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
              className={`${optionProps.className ?? ""} passive-autocomplete-option${passive.isAny ? " is-any" : ""}`}
            >
              <span className="passive-autocomplete-copy">
                <strong>{passive.name}</strong>
                <small>{passive.description}</small>
              </span>
              {passive.isAny
                ? <span className="passive-any-badge">Wildcard</span>
                : <em>{passive.rank > 0 ? `+${passive.rank}` : passive.rank}</em>}
            </li>
          );
        }}
      />
    </fieldset>
  );
}
