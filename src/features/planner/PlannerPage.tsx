import { useMemo, useState } from "react";
import {
  Button,
  ListBox,
  ListBoxItem,
  Radio,
  RadioGroup,
} from "react-aria-components";
import PalPicker from "../../components/PalPicker";
import {
  filterPals,
  formatPalMeta,
  formatPalNumber,
} from "../../components/palPickerUtils";
import { breedingRepository } from "../../data/breedingRepository";
import type { LineageResult, Pal, PalGender, PalId } from "../../domain/pal";
import { findLineage } from "../../services/lineageFinder";
import type { PlannerSearchState } from "./plannerSearch";

const pals = breedingRepository.allPals();

type PlannerPageProps = {
  search: PlannerSearchState;
  onFromInputChange: (value: string) => void;
  onToInputChange: (value: string) => void;
  onFromSelectionChange: (value: PalId | undefined) => void;
  onToSelectionChange: (value: PalId | undefined) => void;
  onSwap: () => void;
};

export default function PlannerPage({
  search,
  onFromInputChange,
  onToInputChange,
  onFromSelectionChange,
  onToSelectionChange,
  onSwap,
}: PlannerPageProps) {
  const [activeField, setActiveField] = useState<"from" | "to">("from");
  const [isBrowserOpen, setIsBrowserOpen] = useState(
    () => Boolean(search.fromQuery || search.toQuery),
  );
  const startId = search.from ?? "";
  const targetId = search.to ?? "";
  const startInputValue = search.fromQuery ?? "";
  const targetInputValue = search.toQuery ?? "";
  const activeInputValue =
    activeField === "from" ? startInputValue : targetInputValue;
  const activeSelectedId = activeField === "from" ? search.from : search.to;
  const passiveSelectedId = activeField === "from" ? search.to : search.from;
  const activeSelected = pals.find((pal) => pal.id === activeSelectedId);
  const visiblePals = useMemo(
    () => filterPals(pals, activeInputValue),
    [activeInputValue],
  );
  const result = useMemo(
    () => (startId && targetId ? findLineage(startId, targetId) : null),
    [startId, targetId],
  );
  const activeFieldName = activeField === "from" ? "Starting Pal" : "Target Pal";
  const hasPlannerState = Boolean(
    search.from || search.to || search.fromQuery || search.toQuery,
  );

  const handleBrowserSelection = (palId: PalId) => {
    if (activeField === "from") {
      onFromSelectionChange(palId);
    } else {
      onToSelectionChange(palId);
    }

    setIsBrowserOpen(false);
  };

  const openBrowserForField = (field: "from" | "to") => {
    setActiveField(field);
    setIsBrowserOpen(true);
  };

  const handleFieldChange = (value: string) => {
    if (value === "from" || value === "to") {
      setActiveField(value);
    }
  };

  return (
    <main className="workspace">
      <section className="planner-panel" aria-labelledby="planner-title">
        <div className="planner-head">
          <div>
            <span className="section-kicker">SHORTEST PASSIVE PATH</span>
            <h1 id="planner-title">Passive transfer path</h1>
          </div>
          <p>Select the Pal carrying the passives, then the Pal you want them on.</p>
        </div>

        <div className="route-controls-shell">
          <div className="route-controls">
            <PalPicker
              label="Starting Pal"
              description="HAS PASSIVES"
              selectedId={search.from}
              inputValue={startInputValue}
              onInputChange={(value) => {
                openBrowserForField("from");
                onFromInputChange(value);
              }}
              onActivate={() => openBrowserForField("from")}
              isActive={activeField === "from"}
              isBrowserOpen={isBrowserOpen}
              pals={pals}
              placeholder="Search starting Pal"
            />
            <Button
              className="swap-button"
              onPress={onSwap}
              isDisabled={!hasPlannerState}
              aria-label="Swap starting and target Pals"
            >
              <SwapIcon />
            </Button>
            <PalPicker
              label="Target Pal"
              description="NEEDS PASSIVES"
              selectedId={search.to}
              inputValue={targetInputValue}
              onInputChange={(value) => {
                openBrowserForField("to");
                onToInputChange(value);
              }}
              onActivate={() => openBrowserForField("to")}
              isActive={activeField === "to"}
              isBrowserOpen={isBrowserOpen}
              pals={pals}
              placeholder="Search target Pal"
            />
          </div>

          <section
            className={`picker-browser-shell${isBrowserOpen ? " is-open" : ""}`}
            aria-label={`${activeFieldName} browser`}
          >
            <div className="picker-browser-dock">
              <div className="picker-browser-dock-copy">
                <span className="picker-browser-kicker">
                  {isBrowserOpen
                    ? activeField === "from"
                      ? "CHOOSING THE CARRIER"
                      : "CHOOSING THE TARGET"
                    : "PAL BROWSER"}
                </span>
                <strong>{activeFieldName}</strong>
                <small>
                  {isBrowserOpen
                    ? `${visiblePals.length} pals in view. Pick one to update the planner.`
                    : activeSelected
                      ? `${activeSelected.name} is selected. Open the browser to change it.`
                      : "Open the browser to browse the full catalog and choose a Pal."}
                </small>
              </div>

              <div className="picker-browser-dock-controls">
                <span className="picker-browser-count">
                  {visiblePals.length} {visiblePals.length === 1 ? "pal" : "pals"}
                </span>
                <RadioGroup
                  className="field-mode-group"
                  aria-label="Choose which planner field to browse"
                  value={activeField}
                  onChange={handleFieldChange}
                >
                  <Radio className="field-mode-chip" value="from">
                    Starting
                  </Radio>
                  <Radio className="field-mode-chip" value="to">
                    Target
                  </Radio>
                </RadioGroup>
                <Button
                  className={`picker-browser-toggle${isBrowserOpen ? " is-open" : ""}`}
                  aria-expanded={isBrowserOpen}
                  aria-controls="pal-browser-viewport"
                  onPress={() => setIsBrowserOpen((open) => !open)}
                >
                  <span>{isBrowserOpen ? "Collapse" : "Browse"}</span>
                  <ChevronIcon />
                </Button>
              </div>
            </div>

            <div
              id="pal-browser-viewport"
              className="picker-browser-viewport"
              aria-hidden={!isBrowserOpen}
            >
              <div className="picker-browser-viewport-inner">
                <div className="picker-browser">
                  <ListBox<Pal>
                    aria-label={`${activeFieldName} options`}
                    className="picker-browser-grid"
                    items={visiblePals}
                    layout="grid"
                    onSelectionChange={(keys) => {
                      if (keys === "all") return;

                      const nextKey = [...keys][0];
                      if (typeof nextKey === "string") {
                        handleBrowserSelection(nextKey);
                      }
                    }}
                    selectionMode="single"
                    selectedKeys={activeSelectedId ? new Set([activeSelectedId]) : new Set()}
                    renderEmptyState={() => (
                      <div className="picker-empty">
                        <strong>No matching Pal</strong>
                        <span>Try a different name, variant, or number.</span>
                      </div>
                    )}
                  >
                    {(pal) => (
                      <ListBoxItem
                        id={pal.id}
                        textValue={pal.name}
                        className="picker-browser-option"
                      >
                        {({ isSelected }) => (
                          <>
                            <div className="picker-browser-option-top">
                              <span className="picker-option-badge">
                                {formatPalNumber(pal.number)}
                              </span>
                              {isSelected ? (
                                <span className="picker-browser-chip is-selected">
                                  <CheckIcon />
                                  Selected
                                </span>
                              ) : passiveSelectedId === pal.id ? (
                                <span className="picker-browser-chip">
                                  {activeField === "from" ? "Target chosen" : "Start chosen"}
                                </span>
                              ) : null}
                            </div>

                            <div className="picker-browser-option-body">
                              <div className="picker-option-media">
                                <img src={pal.image} alt="" loading="lazy" />
                              </div>
                              <span className="picker-browser-option-copy">
                                <strong>{pal.name}</strong>
                                <small>{formatPalMeta(pal.id)}</small>
                              </span>
                              <span
                                className={`picker-browser-check${isSelected ? " is-visible" : ""}`}
                                aria-hidden="true"
                              >
                                <CheckIcon />
                              </span>
                            </div>
                          </>
                        )}
                      </ListBoxItem>
                    )}
                  </ListBox>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

      <LineageResults result={result} startId={startId} targetId={targetId} />
    </main>
  );
}

function LineageResults({
  result,
  startId,
  targetId,
}: {
  result: LineageResult | null;
  startId: PalId;
  targetId: PalId;
}) {
  if (!result) {
    const detail = startId
      ? "Choose the target Pal to calculate the path."
      : targetId
        ? "Choose the Pal that already has the passives."
        : "Choose a starting Pal and target Pal above.";
    return (
      <section className="route-stage is-empty" aria-live="polite">
        <RouteIcon />
        <div>
          <h2>Your path appears here</h2>
          <p>{detail}</p>
        </div>
      </section>
    );
  }

  if (result.status === "same-pal") {
    return (
      <RouteStatus
        icon={<CheckCircleIcon />}
        title="No transfer needed"
        detail="The starting and target species are the same."
      />
    );
  }

  if (result.status === "no-route" || result.status === "invalid-input") {
    return (
      <RouteStatus
        icon={<AlertIcon />}
        title="No path found"
        detail={result.reason}
        warning
      />
    );
  }

  return (
    <section className="route-stage has-results" aria-live="polite">
      <div className="results-head">
        <div>
          <span className="section-kicker">YOUR SHORTEST PATH</span>
          <h2>
            {result.steps.length} {result.steps.length === 1 ? "pairing" : "pairings"}
          </h2>
        </div>
        <p>Each partner is assumed available. Continue with an offspring that inherited the passives you want.</p>
      </div>

      <div className="route-scroll">
        <ol className="lineage-list">
          {result.steps.map((step, index) => {
            const from = breedingRepository.getPal(step.from);
            const partner = breedingRepository.getPal(step.partner);
            const outcome = breedingRepository.getPal(step.result);
            const stepNumber = String(index + 1).padStart(2, "0");
            const genderLocked = Boolean(step.fromGender && step.partnerGender);

            return (
              <li
                className="lineage-step"
                key={`${step.from}-${step.partner}-${step.result}`}
                style={{ animationDelay: `${index * 72}ms` }}
              >
                <span className="step-number">{stepNumber}</span>
                <article className={`step-card${genderLocked ? " is-locked" : ""}`}>
                  <div className="step-equation">
                    <RoutePal pal={from} role={index === 0 ? "Carrier" : "Offspring"} gender={step.fromGender} />
                    <span className="equation-symbol">+</span>
                    <RoutePal pal={partner} role="Partner" gender={step.partnerGender} />
                    <ArrowIcon />
                    <RoutePal
                      pal={outcome}
                      role={index === result.steps.length - 1 ? "Target" : "Offspring"}
                      outcome
                    />
                  </div>
                  <div className="step-rule">
                    {genderLocked ? <LockIcon /> : <CheckIcon />}
                    <span>
                      {genderLocked
                        ? `${genderName(step.fromGender)} carrier + ${genderName(step.partnerGender)} partner`
                        : "Female + male, either orientation"}
                    </span>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function RoutePal({
  pal,
  role,
  gender,
  outcome = false,
}: {
  pal: Pal | undefined;
  role: string;
  gender?: PalGender;
  outcome?: boolean;
}) {
  if (!pal) return null;

  return (
    <div className={`route-pal${outcome ? " is-outcome" : ""}`}>
      <img src={pal.image} alt="" loading="lazy" />
      <span>
        <small>{role}</small>
        <strong>{pal.name}</strong>
        {gender && <em>{genderName(gender)}</em>}
      </span>
    </div>
  );
}

function RouteStatus({
  icon,
  title,
  detail,
  warning = false,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <section className={`route-stage route-status${warning ? " is-warning" : ""}`} aria-live="polite">
      {icon}
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
    </section>
  );
}

function genderName(gender: PalGender | undefined) {
  return gender === "F" ? "Female" : "Male";
}

function RouteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="7" r="2.5" /><path d="M8.5 17h2.2c3.1 0 2.4-10 5-10H16" /></svg>;
}

function SwapIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h12l-3-3M17 17H5l3 3" /></svg>;
}

function ArrowIcon() {
  return <svg className="arrow-icon" viewBox="0 0 32 24" aria-hidden="true"><path d="M2 12h26M21 5l7 7-7 7" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10" width="13" height="10" rx="2" /><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>;
}

function AlertIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17.5v.1" /></svg>;
}

function CheckCircleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16.5 9" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>;
}
