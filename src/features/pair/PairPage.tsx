import { useMemo, useState } from "react";
import PalSelect from "../../components/PalSelect";
import { breedingRepository } from "../../data/breedingRepository";
import type { PalId } from "../../domain/pal";

export default function PairPage() {
  const [first, setFirst] = useState<PalId>();
  const [second, setSecond] = useState<PalId>();
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
        <span className="hero-index">01</span>
      </section>

      <section className="feature-grid pair-layout">
        <div className="feature-card pair-input-card">
          <div className="card-heading"><span>Parents</span><small>Order does not matter</small></div>
          <div className="pair-selects">
            <PalSelect label="Parent A" value={first} onChange={setFirst} />
            <span className="pair-plus" aria-hidden="true">+</span>
            <PalSelect label="Parent B" value={second} onChange={setSecond} />
          </div>
          {first && second ? (
            <button className="secondary-button compact-button" type="button" onClick={() => { setFirst(second); setSecond(first); }}>
              Swap parents
            </button>
          ) : null}
        </div>

        <div className="feature-card outcome-card" aria-live="polite">
          <div className="card-heading"><span>Offspring</span><small>Palworld 1.0</small></div>
          {!first || !second ? <EmptyOutcome /> : outcomes.length ? outcomes.map((outcome) => {
            const child = breedingRepository.getPal(outcome.childId);
            const genders = breedingRepository.getGenderRequirement(first, second, outcome.childId);
            return child ? (
              <article className="baby-result" key={`${outcome.childId}-${genders?.firstGender ?? "any"}-${genders?.secondGender ?? "any"}`}>
                <div className="baby-orbit"><img src={child.image} alt="" /></div>
                <div>
                  <span className="result-eyebrow">BREEDING RESULT</span>
                  <h2>{child.name}</h2>
                  <p>{genders
                    ? `Requires Parent A ${formatGender(genders.firstGender)} and Parent B ${formatGender(genders.secondGender)}.`
                    : "No parent gender restriction."}</p>
                </div>
              </article>
            ) : null;
          }) : <div className="empty-state"><strong>No offspring found</strong><span>This pair is unavailable in the loaded 1.0 data.</span></div>}
        </div>
      </section>
    </main>
  );
}

function EmptyOutcome() {
  return <div className="empty-state"><span className="empty-glyph">✦</span><strong>Two parents make a plan</strong><span>Select both sides to reveal the exact offspring.</span></div>;
}

function formatGender(gender: "F" | "M") {
  return gender === "F" ? "female" : "male";
}
