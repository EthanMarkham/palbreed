import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Pal, PalId } from "../domain/pal";

type PalPickerProps = {
  label: string;
  value: PalId;
  onChange: (value: PalId) => void;
  pals: readonly Pal[];
  placeholder: string;
  eyebrow?: string;
};

type PickerPlacement = "top" | "bottom";
type PickerPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: PickerPlacement;
};

const MOBILE_BREAKPOINT = 640;
const VIEWPORT_GUTTER = 16;
const POPOVER_OFFSET = 10;
const MIN_DESKTOP_WIDTH = 320;
const MIN_POPOVER_HEIGHT = 260;
const MAX_POPOVER_HEIGHT = 440;

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
  const [activeId, setActiveId] = useState<PalId | null>(null);
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
      : false,
  );
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<PalId, HTMLButtonElement | null>());
  const listboxId = useId();
  const dialogId = useId();
  const dialogTitleId = useId();
  const inputId = useId();
  const selected = pals.find((pal) => pal.id === value);
  const sortedPals = useMemo(
    () => [...pals].sort((first, second) => first.name.localeCompare(second.name)),
    [pals],
  );

  const closePicker = () => {
    setOpen(false);
    setQuery("");
    setActiveId(null);
    setPosition(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const openPicker = () => {
    setOpen(true);
    setQuery("");
  };
  const filteredPals = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return sortedPals;

    return sortedPals
      .filter((pal) => {
        const normalizedName = pal.name.toLocaleLowerCase();
        return (
          normalizedName.includes(normalizedQuery) ||
          pal.id.toLocaleLowerCase().includes(normalizedQuery)
        );
      })
      .sort((first, second) => {
        const firstRank = getMatchRank(first, normalizedQuery);
        const secondRank = getMatchRank(second, normalizedQuery);
        return firstRank - secondRank || first.name.localeCompare(second.name);
      });
  }, [query, sortedPals]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const syncCompact = () => setIsCompact(mediaQuery.matches);
    syncCompact();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncCompact);
      return () => mediaQuery.removeEventListener("change", syncCompact);
    }

    mediaQuery.addListener(syncCompact);
    return () => mediaQuery.removeListener(syncCompact);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    requestAnimationFrame(() => inputRef.current?.focus());

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
      setQuery("");
      setActiveId(null);
      setPosition(null);
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }

      setOpen(false);
      setQuery("");
      setActiveId(null);
      setPosition(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isCompact) return undefined;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [open, isCompact]);

  useLayoutEffect(() => {
    if (!open || isCompact) return undefined;

    let frameId = 0;
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return undefined;

    const updatePosition = () => {
      const nextTrigger = triggerRef.current;
      const nextPopover = popoverRef.current;
      if (!nextTrigger || !nextPopover) return;

      const triggerRect = nextTrigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = clamp(
        triggerRect.width,
        Math.min(MIN_DESKTOP_WIDTH, viewportWidth - VIEWPORT_GUTTER * 2),
        viewportWidth - VIEWPORT_GUTTER * 2,
      );
      const left = clamp(
        triggerRect.left,
        VIEWPORT_GUTTER,
        viewportWidth - width - VIEWPORT_GUTTER,
      );
      const spaceBelow =
        viewportHeight - triggerRect.bottom - POPOVER_OFFSET - VIEWPORT_GUTTER;
      const spaceAbove = triggerRect.top - POPOVER_OFFSET - VIEWPORT_GUTTER;
      const placement: PickerPlacement =
        spaceBelow >= MIN_POPOVER_HEIGHT || spaceBelow >= spaceAbove
          ? "bottom"
          : "top";
      const availableHeight = clamp(
        placement === "bottom" ? spaceBelow : spaceAbove,
        MIN_POPOVER_HEIGHT,
        MAX_POPOVER_HEIGHT,
      );
      const popoverHeight = Math.min(
        nextPopover.getBoundingClientRect().height,
        availableHeight,
      );
      const top =
        placement === "bottom"
          ? Math.round(triggerRect.bottom + POPOVER_OFFSET)
          : Math.round(
              Math.max(
                VIEWPORT_GUTTER,
                triggerRect.top - POPOVER_OFFSET - popoverHeight,
              ),
            );

      setPosition({
        left: Math.round(left),
        top,
        width: Math.round(width),
        maxHeight: Math.round(availableHeight),
        placement,
      });
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updatePosition);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(trigger);
    resizeObserver.observe(popover);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);

    scheduleUpdate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, [filteredPals.length, isCompact, open, query, value]);

  useEffect(() => {
    if (!open) return;

    if (!filteredPals.length) {
      setActiveId(null);
      return;
    }

    setActiveId((current) => {
      if (current && filteredPals.some((pal) => pal.id === current)) return current;
      if (value && filteredPals.some((pal) => pal.id === value)) return value;
      return filteredPals[0].id;
    });
  }, [filteredPals, open, value]);

  useEffect(() => {
    if (!open || !activeId) return;

    optionRefs.current.get(activeId)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeId, open]);

  const selectPal = (palId: PalId) => {
    onChange(palId);
    closePicker();
  };
  const moveActive = (direction: 1 | -1) => {
    if (!filteredPals.length) return;

    const currentIndex = activeId
      ? filteredPals.findIndex((pal) => pal.id === activeId)
      : -1;
    const fallbackIndex = direction > 0 ? 0 : filteredPals.length - 1;
    const nextIndex =
      currentIndex === -1
        ? fallbackIndex
        : clamp(currentIndex + direction, 0, filteredPals.length - 1);
    setActiveId(filteredPals[nextIndex]?.id ?? null);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }

    if (event.key === "Enter" && activeId) {
      event.preventDefault();
      selectPal(activeId);
    }
  };
  const activeOptionId = activeId ? `${listboxId}-${activeId}` : undefined;
  const countLabel = query
    ? `${filteredPals.length} match${filteredPals.length === 1 ? "" : "es"}`
    : `${filteredPals.length} pals`;

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
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          openPicker();
        }}
      >
        {selected ? (
          <>
            <img src={selected.image} alt="" />
            <span className="picker-value">
              <strong>{selected.name}</strong>
              <small>Search or choose a different Pal</small>
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

      {open &&
        createPortal(
          <>
            {isCompact && (
              <div
                className="picker-backdrop"
                aria-hidden="true"
                onClick={closePicker}
              />
            )}
            <div
              className={`picker-popover${isCompact ? " is-compact is-ready" : ""}${
                position ? " is-ready" : ""
              }`}
              id={dialogId}
              ref={popoverRef}
              role="dialog"
              aria-modal={isCompact || undefined}
              aria-labelledby={dialogTitleId}
              data-placement={position?.placement ?? "bottom"}
              style={
                isCompact
                  ? undefined
                  : {
                      left: position?.left ?? VIEWPORT_GUTTER,
                      top: position?.top ?? VIEWPORT_GUTTER,
                      width: position?.width ?? MIN_DESKTOP_WIDTH,
                      maxHeight: position?.maxHeight ?? MAX_POPOVER_HEIGHT,
                    }
              }
            >
              <div className="picker-popover-head">
                <div>
                  <span className="picker-eyebrow">{eyebrow ?? "PAL SEARCH"}</span>
                  <strong id={dialogTitleId}>Choose {label.toLocaleLowerCase()}</strong>
                  <span className="picker-search-meta">
                    {selected
                      ? `${selected.name} is currently selected.`
                      : `Browse or search the full ${pals.length}-Pal roster.`}
                  </span>
                </div>
                <button
                  className="picker-close"
                  type="button"
                  onClick={closePicker}
                  aria-label="Close picker"
                >
                  <CloseIcon />
                </button>
              </div>

              <label className="picker-search" htmlFor={inputId}>
                <SearchIcon />
                <span className="sr-only">Search Pals</span>
                <input
                  id={inputId}
                  ref={inputRef}
                  role="combobox"
                  aria-label={`Search ${label}`}
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-activedescendant={activeOptionId}
                  aria-autocomplete="list"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type a Pal name or ID"
                  autoComplete="off"
                  spellCheck={false}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                  >
                    <CloseIcon />
                  </button>
                )}
              </label>

              {selected && (
                <div className="picker-current">
                  <img src={selected.image} alt="" />
                  <span className="picker-current-meta">
                    <small>Current selection</small>
                    <strong>{selected.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => selectPal("")}
                    className="picker-inline-clear"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div
                className="picker-options"
                id={listboxId}
                role="listbox"
                aria-label={`${label} options`}
              >
                {filteredPals.map((pal) => {
                  const active = pal.id === activeId;
                  const isSelected = pal.id === value;

                  return (
                    <button
                      id={`${listboxId}-${pal.id}`}
                      ref={(node) => optionRefs.current.set(pal.id, node)}
                      className={`picker-option${isSelected ? " is-selected" : ""}${
                        active ? " is-active" : ""
                      }`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={-1}
                      key={pal.id}
                      onMouseEnter={() => setActiveId(pal.id)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectPal(pal.id)}
                    >
                      <img src={pal.image} alt="" loading="lazy" />
                      <span>
                        <HighlightedName name={pal.name} query={query} />
                        <small>{pal.id}</small>
                      </span>
                      <span className="picker-option-status">
                        {isSelected && <span className="picker-option-badge">Selected</span>}
                        {isSelected && <CheckIcon />}
                      </span>
                    </button>
                  );
                })}
                {filteredPals.length === 0 && (
                  <div className="picker-empty">
                    <strong>No matching Pal</strong>
                    <span>Try a shorter name, a different spelling, or a Pal ID.</span>
                  </div>
                )}
              </div>

              <div className="picker-count">
                <span>{countLabel}</span>
                <span>Use arrows to move, Enter to choose, Esc to close</span>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return <strong>{name}</strong>;

  const normalizedName = name.toLocaleLowerCase();
  const matchIndex = normalizedName.indexOf(normalizedQuery);
  if (matchIndex === -1) return <strong>{name}</strong>;

  return (
    <strong>
      {name.slice(0, matchIndex)}
      <mark>{name.slice(matchIndex, matchIndex + normalizedQuery.length)}</mark>
      {name.slice(matchIndex + normalizedQuery.length)}
    </strong>
  );
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function getMatchRank(pal: Pal, query: string) {
  const normalizedName = pal.name.toLocaleLowerCase();
  if (normalizedName.startsWith(query)) return 0;
  if (pal.id.toLocaleLowerCase().startsWith(query)) return 1;
  if (normalizedName.includes(query)) return 2;
  return 3;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="picker-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="picker-check" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}
