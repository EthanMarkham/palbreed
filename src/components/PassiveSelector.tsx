import { useMemo, useState } from "react";
import { passiveRepository } from "../data/passiveRepository";
import type { PassiveId } from "../domain/passive";

type PassiveSelectorProps = {
  label: string;
  selected: readonly PassiveId[];
  onChange: (selected: readonly PassiveId[]) => void;
  max?: number;
};

const allPassives = passiveRepository.all();

export default function PassiveSelector({ label, selected, onChange, max = 4 }: PassiveSelectorProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return allPassives;
    return allPassives.filter((passive) =>
      `${passive.name} ${passive.description}`.toLocaleLowerCase().includes(normalized),
    );
  }, [query]);

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
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search passives"
        aria-label={`Search ${label.toLocaleLowerCase()}`}
      />
      <div className="passive-options" role="list" aria-label={`${label} options`}>
        {visible.map((passive) => {
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
        })}
      </div>
    </fieldset>
  );
}
