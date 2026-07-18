import { useMemo } from "react";
import PalSelect from "../../components/PalSelect";
import { breedingRepository } from "../../data/breedingRepository";
import type { PalId } from "../../domain/pal";
import type { PairSearchState } from "./pairSearch";

type PairPageProps = {
  search: PairSearchState;
  onFirstInputChange: (value: string) => void;
  onSecondInputChange: (value: string) => void;
  onFirstSelectionChange: (value: PalId | undefined) => void;
  onSecondSelectionChange: (value: PalId | undefined) => void;
  onSwap: () => void;
};

export default function PairPage({
  search,
  onFirstInputChange,
  onSecondInputChange,
  onFirstSelectionChange,
  onSecondSelectionChange,
  onSwap,
}: PairPageProps) {
  const first = search.first;
  const second = search.second;
  const outcomes = useMemo(
    () => first && second ? breedingRepository.getOutcomes(first, second) : [],
    [first, second],
  );

  return (
    <main className="workspace feature-workspace">
      <section className="feature-hero">
        <div>
          <span className="section-kicker">PAIR CHECKER</span>
          <h1>Choose the parents. Meet the baby.</h1>
          <p>Every result uses the loaded Palworld 1.0 breeding table, including gender-specific exceptions.</p>
        </div>
        <span className="hero-index">02</span>
      </section>

      <section className="feature-grid pair-layout">
        <div className="feature-card pair-input-card">
          <div className="card-heading"><span>Parents</span><small>Order does not matter</small></div>
          <div className="pair-selects">
            <PalSelect
              label="Parent A"
              value={first}
              onChange={onFirstSelectionChange}
              query={{ value: search.firstQuery ?? "", onChange: onFirstInputChange }}
            />
            <span className="pair-plus" aria-hidden="true">+</span>
            <PalSelect
              label="Parent B"
              value={second}
              onChange={onSecondSelectionChange}
              query={{ value: search.secondQuery ?? "", onChange: onSecondInputChange }}
            />
          </div>
          {first && second ? (
            <button className="secondary-button compact-button" type="button" onClick={onSwap}>
              Swap parents
            </button>
          ) : null}
        </div>

        <div className="feature-card outcome-card" aria-live="polite">
          <div className="card-heading"><span>Offspring</span><small>Palworld 1.0</small></div>
          <PairOutcomes first={first} second={second} outcomes={outcomes} />
        </div>
      </section>
    </main>
  );
}

function PairOutcomes({
  first,
  second,
  outcomes,
}: {
  first?: PalId;
  second?: PalId;
  outcomes: ReturnType<typeof breedingRepository.getOutcomes>;
}) {
  if (!first || !second) return <EmptyOutcome />;
  if (!outcomes.length) {
    return (
      <div className="empty-state">
        <strong>No offspring found</strong>
        <span>This pair is unavailable in the loaded 1.0 data.</span>
      </div>
    );
  }

  return outcomes.map((outcome) => {
    const child = breedingRepository.getPal(outcome.childId);
    if (!child) return null;

    const genders = breedingRepository.getGenderRequirement(first, second, outcome.childId);
    const key = `${outcome.childId}-${genders?.firstGender ?? "any"}-${genders?.secondGender ?? "any"}`;
    return (
      <article className="baby-result" key={key}>
        <div className="baby-orbit"><img src={child.image} alt="" /></div>
        <div>
          <span className="result-eyebrow">BREEDING RESULT</span>
          <h2>{child.name}</h2>
          <p>
            {genders
              ? `Requires Parent A ${formatGender(genders.firstGender)} and Parent B ${formatGender(genders.secondGender)}.`
              : "No parent gender restriction."}
          </p>
        </div>
      </article>
    );
  });
}

function EmptyOutcome() {
  return <div className="empty-state"><span className="empty-glyph">✦</span><strong>Two parents make a plan</strong><span>Select both sides to reveal the exact offspring.</span></div>;
}

function formatGender(gender: "F" | "M") {
  return gender === "F" ? "female" : "male";
}
