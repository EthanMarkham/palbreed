import { useMemo, useState } from "react";
import "./App.css";
import { breedingRepository } from "./data/breedingRepository";
import type { PalId } from "./domain/pal";
import { findLineage } from "./services/lineageFinder";
import AdSlot from "./components/ads/AdSlot";

function App() {
  const pals = breedingRepository.allPals();
  const [startId, setStartId] = useState<PalId>("");
  const [targetId, setTargetId] = useState<PalId>("");
  const result = useMemo(
    () => startId && targetId ? findLineage(startId, targetId) : null,
    [startId, targetId],
  );

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">PALWORLD BREEDING PLANNER</p>
        <h1>Build the lineage, not the guesswork.</h1>
        <p>Choose a Pal you have and the Pal you want. Every result is calculated from the bundled breeding data.</p>
      </header>

      <section className="planner" aria-label="Breeding lineage planner">
        <PalField id="start-pal" label="Starting Pal" value={startId} onChange={setStartId} pals={pals} />
        <span className="planner-arrow" aria-hidden="true">→</span>
        <PalField id="target-pal" label="Target Pal" value={targetId} onChange={setTargetId} pals={pals} />
      </section>

      {result?.status === "same-pal" && <Status title="Already there" detail="Your starting Pal is the selected target." />}
      {result?.status === "no-route" && <Status title="No route found" detail={result.reason} />}
      {result?.status === "invalid-input" && <Status title="Try again" detail={result.reason} />}
      {result?.status === "found" && (
        <section className="results" aria-live="polite">
          <div className="section-heading"><p className="eyebrow">SHORTEST LINEAGE</p><h2>{result.steps.length} breeding {result.steps.length === 1 ? "step" : "steps"}</h2></div>
          <ol className="lineage-list">
            {result.steps.map((step, index) => {
              const from = breedingRepository.getPal(step.from);
              const outcome = breedingRepository.getPal(step.result);
              const partners = step.partners.map((id) => breedingRepository.getPal(id)).filter(Boolean);
              return <li className="lineage-card" key={`${step.from}-${step.result}`}>
                <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
                <PalSummary pal={from} />
                <span className="breed-symbol" aria-label="breed with">×</span>
                <div className="partner-list">{partners.map((partner) => partner && <PalSummary pal={partner} compact key={partner.id} />)}</div>
                <span className="breed-symbol" aria-hidden="true">→</span>
                <PalSummary pal={outcome} emphasis />
              </li>;
            })}
          </ol>
          <AdSlot placement="results-inline" />
        </section>
      )}
    </main>
  );
}

function PalField({ id, label, value, onChange, pals }: { id: string; label: string; value: PalId; onChange: (value: PalId) => void; pals: readonly { id: PalId; name: string }[] }) {
  return <label className="pal-field" htmlFor={id}><span>{label}</span><select id={id} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select a Pal</option>{pals.map((pal) => <option key={pal.id} value={pal.id}>{pal.name}</option>)}</select></label>;
}

function PalSummary({ pal, compact = false, emphasis = false }: { pal: ReturnType<typeof breedingRepository.getPal>; compact?: boolean; emphasis?: boolean }) {
  if (!pal) return null;
  return <div className={`pal-summary${compact ? " compact" : ""}${emphasis ? " outcome" : ""}`}>{pal.image ? <img src={pal.image} alt="" loading="lazy" /> : <span className="pal-placeholder" /> }<div><strong>{pal.name}</strong>{pal.elements.length > 0 && <small>{pal.elements.join(" · ")}</small>}</div></div>;
}

function Status({ title, detail }: { title: string; detail: string }) { return <section className="status"><h2>{title}</h2><p>{detail}</p></section>; }

export default App;
