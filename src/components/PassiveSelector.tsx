import { useMemo, useState } from "react";
import { passiveRepository } from "../data/passiveRepository";
import type { PassiveId } from "../domain/passive";

type PassiveSelectorProps = {
  label: string;
  selected: readonly PassiveId[];
  onChange: (selected: readonly PassiveId[]) => void;
  max?: number;
  query?: string;
  onQueryChange?: (query: string) => void;
};

const allPassives = passiveRepository.all();

export default function PassiveSelector({
  label,
  selected,
  onChange,
  max = 4,
  query: controlledQuery,
  onQueryChange,
}: PassiveSelectorProps) {
  const [localQuery, setLocalQuery] = useState("");
  const query = controlledQuery ?? localQuery;
  const visible = useMemo(() => {
    const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return allPassives;
    return allPassives.filter((passive) => {
      const searchable = `${passive.name} ${passive.description} ${passive.id}`.toLocaleLowerCase();
      return tokens.every((token) => searchable.includes(token));
    });
  }, [query]);

  const updateQuery = (value: string) => {
    if (onQueryChange) onQueryChange(value);
    else setLocalQuery(value);
  };

  const toggle = (id: PassiveId) => {
    if (selected.includes(id)) {
      onChange(selected.filter((value) => value !== id));
    } else if (selected.length < max) {
      onChange([...selected, id]);
    }
  };

  return (
    <fieldset className="passive-selector">
      <legend>{label} <span>{selected.length}/{max}</span></legend>
      <div className="passive-selected" aria-live="polite">
        {selected.length ? selected.map((id) => {
          const passive = passiveRepository.get(id);
          return (
            <button key={id} type="button" onClick={() => toggle(id)} title="Remove passive">
              {passive?.name ?? id}<span aria-hidden="true">×</span>
            </button>
          );
        }) : <span className="passive-empty">No passives selected</span>}
      </div>
      <input
        className="passive-search"
        value={query}
        onChange={(event) => updateQuery(event.target.value)}
        placeholder="Search passives"
        aria-label={`Search ${label.toLocaleLowerCase()}`}
      />
      <div className="passive-options" role="list" aria-label={`${label} options`}>
        {visible.length ? visible.map((passive) => {
          const checked = selected.includes(passive.id);
          const disabled = !checked && selected.length >= max;
          return (
            <label key={passive.id} className={`passive-option${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(passive.id)}
              />
              <span>
                <strong>{passive.name}</strong>
                <small>{passive.description}</small>
              </span>
              <em>{passive.rank > 0 ? `+${passive.rank}` : passive.rank}</em>
            </label>
          );
        }) : <div className="passive-no-results"><strong>No matching passives</strong><span>Try a name, effect, or identifier.</span></div>}
      </div>
    </fieldset>
  );
}
