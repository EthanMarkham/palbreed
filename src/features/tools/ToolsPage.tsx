import { useMemo } from "react";
import PalSelect from "../../components/PalSelect";
import { breedingRepository } from "../../data/breedingRepository";
import type { LineageResult, PalGender, PalId } from "../../domain/pal";
import { findLineage } from "../../services/lineageFinder";
import type { ToolsPalField, ToolsSearchState } from "./toolsSearch";

type ToolsPageProps = {
  search: ToolsSearchState;
  onInputChange: (field: ToolsPalField, value: string) => void;
  onSelectionChange: (field: ToolsPalField, value: PalId | undefined) => void;
  onSwapPath: () => void;
  onSwapParents: () => void;
};

export default function ToolsPage({
  search,
  onInputChange,
  onSelectionChange,
  onSwapPath,
  onSwapParents,
}: ToolsPageProps) {
  const pathResult = useMemo(
    () => search.from && search.to ? findLineage(search.from, search.to) : null,
    [search.from, search.to],
  );
  const outcomes = useMemo(
    () => search.first && search.second
      ? breedingRepository.getOutcomes(search.first, search.second)
      : [],
    [search.first, search.second],
  );

  return (
    <main className="workspace feature-workspace tools-workspace">
      <section className="feature-hero">
        <div>
          <span className="section-kicker">TOOLS</span>
          <h1>Check a breeding path or pairing</h1>
          <p>These tools use Palworld 1.0 breeding data. They don't use the Pals in your imported world.</p>
        </div>
        <span className="hero-index">03</span>
      </section>

      <section className="feature-card finder-card path-finder-card" aria-labelledby="path-finder-title">
        <div className="card-heading">
          <span id="path-finder-title">Breeding path</span>
          <small>Find the shortest route between two Pals</small>
        </div>
        <div className="finder-controls">
          <PalSelect
            label="Starting Pal"
            value={search.from}
            onChange={(value) => onSelectionChange("from", value)}
            query={{ value: search.fromQuery ?? "", onChange: (value) => onInputChange("from", value) }}
          />
          <SwapButton label="Swap starting and target Pals" onClick={onSwapPath} disabled={!search.from && !search.to} />
          <PalSelect
            label="Pal you want"
            value={search.to}
            onChange={(value) => onSelectionChange("to", value)}
            query={{ value: search.toQuery ?? "", onChange: (value) => onInputChange("to", value) }}
          />
        </div>
        <PathResult result={pathResult} />
      </section>

      <section className="feature-card finder-card" aria-labelledby="parent-finder-title">
        <div className="card-heading">
          <span id="parent-finder-title">Pair result</span>
          <small>See what two Pals produce</small>
        </div>
        <div className="parent-finder-layout">
          <div className="finder-controls parent-finder-controls">
            <PalSelect
              label="Parent 1"
              value={search.first}
              onChange={(value) => onSelectionChange("first", value)}
              query={{ value: search.firstQuery ?? "", onChange: (value) => onInputChange("first", value) }}
            />
            <SwapButton label="Swap parents" onClick={onSwapParents} disabled={!search.first && !search.second} />
            <PalSelect
              label="Parent 2"
              value={search.second}
              onChange={(value) => onSelectionChange("second", value)}
              query={{ value: search.secondQuery ?? "", onChange: (value) => onInputChange("second", value) }}
            />
          </div>
          <ParentResult first={search.first} second={search.second} outcomes={outcomes} />
        </div>
      </section>
    </main>
  );
}

function PathResult({ result }: { result: LineageResult | null }) {
  if (!result) {
    return <FinderPlaceholder title="Choose a starting Pal and a target" copy="We'll show the shortest breeding path between them." />;
  }
  if (result.status === "same-pal") {
    return <FinderStatus kind="success" title="No breeding needed" copy="You chose the same Pal for both." />;
  }
  if (result.status !== "found") {
    return <FinderStatus kind="error" title="No path found" copy={result.reason} />;
  }

  return (
    <div className="finder-result" aria-live="polite">
      <div className="finder-summary">
        <strong>{result.steps.length}</strong>
        <span>{result.steps.length === 1 ? "pairing" : "pairings"}<small>Shortest path in the Palworld 1.0 table</small></span>
      </div>
      <div className="finder-step-list">
        {result.steps.map((step, index) => (
          <article className="finder-step" key={`${step.from}-${step.partner}-${step.result}-${index}`}>
            <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
            <FinderPal palId={step.from} gender={step.fromGender} />
            <span className="operator" aria-hidden="true">+</span>
            <FinderPal palId={step.partner} gender={step.partnerGender} />
            <span className="operator" aria-hidden="true">→</span>
            <FinderPal palId={step.result} featured />
          </article>
        ))}
      </div>
    </div>
  );
}

function FinderPal({ palId, gender, featured = false }: { palId: PalId; gender?: PalGender; featured?: boolean }) {
  const pal = breedingRepository.getPal(palId);
  if (!pal) return null;
  return (
    <span className={`finder-pal${featured ? " is-featured" : ""}`}>
      <img src={pal.image} alt="" />
      <span><strong>{pal.name}</strong>{gender ? <small>{gender === "F" ? "Female" : "Male"}</small> : null}</span>
    </span>
  );
}

function ParentResult({ first, second, outcomes }: {
  first?: PalId;
  second?: PalId;
  outcomes: ReturnType<typeof breedingRepository.getOutcomes>;
}) {
  if (!first || !second) {
    return <FinderPlaceholder title="Choose two parents" copy="We'll show their offspring and any sex requirement." />;
  }
  if (!outcomes.length) {
    return <FinderStatus kind="error" title="No offspring found" copy="This pairing isn't in the Palworld 1.0 data." />;
  }

  return (
    <div className="parent-results" aria-live="polite">
      {outcomes.map((outcome) => {
        const child = breedingRepository.getPal(outcome.childId);
        if (!child) return null;
        const genders = breedingRepository.getGenderRequirement(first, second, outcome.childId);
        return (
          <article className="parent-result" key={`${outcome.childId}-${genders?.firstGender ?? "any"}-${genders?.secondGender ?? "any"}`}>
            <span className="parent-result-media"><img src={child.image} alt="" /></span>
            <span>
              <small>OFFSPRING</small>
              <strong>{child.name}</strong>
              <em>{genders
                ? `Parent 1: ${formatGender(genders.firstGender)} · Parent 2: ${formatGender(genders.secondGender)}`
                : "Use one female and one male"}</em>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function FinderPlaceholder({ title, copy }: { title: string; copy: string }) {
  return <div className="finder-placeholder"><span aria-hidden="true">◇</span><strong>{title}</strong><small>{copy}</small></div>;
}

function FinderStatus({ kind, title, copy }: { kind: "success" | "error"; title: string; copy: string }) {
  return <div className={`finder-status is-${kind}`} role={kind === "error" ? "alert" : "status"}><span>{kind === "success" ? "✓" : "!"}</span><strong>{title}</strong><small>{copy}</small></div>;
}

function SwapButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button className="finder-swap" type="button" onClick={onClick} disabled={disabled} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7-3 3 3 3" /><path d="M4 10h13a3 3 0 0 1 3 3v1" /><path d="m17 17 3-3-3-3" /></svg>
    </button>
  );
}

function formatGender(gender: PalGender) {
  return gender === "F" ? "female" : "male";
}
