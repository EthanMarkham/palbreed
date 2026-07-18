import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Pal, PalId } from "../domain/pal";

type PalPickerProps = {
  label: string;
  value: PalId;
  onChange: (value: PalId) => void;
  pals: readonly Pal[];
  placeholder: string;
  eyebrow?: string;
};

export default function PalPicker({
  label,
  value,
  onChange,
  pals,
  placeholder,
  eyebrow,
}: PalPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = pals.find((pal) => pal.id === value);
  const closePicker = () => {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const filteredPals = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return pals.slice(0, 80);
    return pals
      .filter((pal) => pal.name.toLocaleLowerCase().includes(normalizedQuery))
      .sort((first, second) => {
        const firstStarts = first.name.toLocaleLowerCase().startsWith(normalizedQuery);
        const secondStarts = second.name.toLocaleLowerCase().startsWith(normalizedQuery);
        return Number(secondStarts) - Number(firstStarts) || first.name.localeCompare(second.name);
      })
      .slice(0, 80);
  }, [pals, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectPal = (palId: PalId) => {
    onChange(palId);
    closePicker();
  };

  return (
    <div className={`pal-picker${open ? " is-open" : ""}`} ref={rootRef}>
      <div className="picker-label-row">
        <span className="picker-label">{label}</span>
        {eyebrow && <span className="picker-eyebrow">{eyebrow}</span>}
      </div>
      <button
        ref={triggerRef}
        className={`picker-trigger${selected ? " has-selection" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? (
          <>
            <img src={selected.image} alt="" />
            <span className="picker-value">
              <strong>{selected.name}</strong>
              <small>Selected Pal</small>
            </span>
          </>
        ) : (
          <>
            <span className="picker-placeholder-mark" aria-hidden="true">+</span>
            <span className="picker-value">
              <strong>{placeholder}</strong>
              <small>Search all {pals.length} Pals</small>
            </span>
          </>
        )}
        <ChevronIcon />
      </button>

      {open && (
        <div className="picker-popover">
          <div className="picker-popover-head">
            <div>
              <span className="picker-eyebrow">PALDEX 1.0</span>
              <strong>Choose {label.toLocaleLowerCase()}</strong>
            </div>
            <button className="picker-close" type="button" onClick={closePicker} aria-label="Close picker">
              <CloseIcon />
            </button>
          </div>
          <label className="picker-search">
            <SearchIcon />
            <span className="sr-only">Search Pals</span>
            <input
              ref={inputRef}
              aria-label="Search Pals"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a Pal name"
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <CloseIcon />
              </button>
            )}
          </label>
          <div className="picker-options" id={listboxId} role="listbox" aria-label={label}>
            {value && (
              <button className="picker-reset-option" type="button" onClick={() => selectPal("")}>
                Clear selection
              </button>
            )}
            {filteredPals.map((pal) => (
              <button
                className={`picker-option${pal.id === value ? " is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={pal.id === value}
                key={pal.id}
                onClick={() => selectPal(pal.id)}
              >
                <img src={pal.image} alt="" loading="lazy" />
                <span>
                  <strong>{pal.name}</strong>
                  <small>{pal.id}</small>
                </span>
                {pal.id === value && <CheckIcon />}
              </button>
            ))}
            {filteredPals.length === 0 && (
              <div className="picker-empty">
                <strong>No matching Pal</strong>
                <span>Try a shorter name or check the spelling.</span>
              </div>
            )}
          </div>
          <div className="picker-count">
            Showing {filteredPals.length} of {pals.length}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function ChevronIcon() {
  return <svg className="picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>;
}

function CheckIcon() {
  return <svg className="picker-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>;
}
