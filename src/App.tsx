import { useMemo, useState } from "react";
import "./App.css";
import AdSlot from "./components/ads/AdSlot";
import { breedingRepository } from "./data/breedingRepository";
import type { Pal, PalId } from "./domain/pal";
import { findLineage } from "./services/lineageFinder";

function App() {
  const pals = breedingRepository.allPals();
  const [startId, setStartId] = useState<PalId>("");
  const [targetId, setTargetId] = useState<PalId>("");
  const result = useMemo(() => startId && targetId ? findLineage(startId, targetId) : null, [startId, targetId]);

  return <main className="site-shell">
    <nav className="topbar" aria-label="Primary navigation">
      <a className="brand" href="#planner"><span className="brand-mark">P</span><span>Palbreed</span></a>
      <span className="version-pill">BREEDING PLANNER</span>
      <a className="nav-link" href="#how-it-works">How it works</a>
    </nav>

    <section className="hero" id="planner">
      <div className="hero-copy">
        <p className="eyebrow">PALWORLD BREEDING ROUTES</p>
        <h1>Plan the fastest path<br /><em>to any Pal.</em></h1>
        <p className="hero-description">Choose the Pal you already have and the Pal you want. We map the shortest known breeding lineage, one intentional step at a time.</p>
      </div>
      <div className="hero-orb" aria-hidden="true"><span>✦</span></div>
    </section>

    <section className="planner-card" aria-label="Breeding lineage planner">
      <div className="planner-heading"><div><p className="eyebrow">START A SEARCH</p><h2>Build a breeding route</h2></div><span className="data-badge"><i /> Static lookup</span></div>
      <div className="planner-fields">
        <PalField id="start-pal" label="I have" value={startId} onChange={setStartId} pals={pals} />
        <div className="swap-mark" aria-hidden="true">→</div>
        <PalField id="target-pal" label="I want" value={targetId} onChange={setTargetId} pals={pals} />
      </div>
      <p className="planner-help">Results use the breeding table bundled with this version of the planner.</p>
    </section>

    {result?.status === "same-pal" && <Status title="You already have this Pal" detail="Pick a different target to calculate a route." />}
    {result?.status === "no-route" && <Status title="No route found" detail={result.reason} />}
    {result?.status === "invalid-input" && <Status title="Choose two Pals" detail={result.reason} />}
    {result?.status === "found" && <section className="results" aria-live="polite">
      <div className="results-heading"><div><p className="eyebrow">YOUR ROUTE</p><h2>{result.steps.length} {result.steps.length === 1 ? "step" : "steps"} to the target</h2></div><span className="route-chip">Shortest route</span></div>
      <ol className="lineage-list">
        {result.steps.map((step, index) => {
          const from = breedingRepository.getPal(step.from);
          const outcome = breedingRepository.getPal(step.result);
          const partners = step.partners.map((id) => breedingRepository.getPal(id)).filter((pal): pal is Pal => Boolean(pal));
          return <li className="lineage-card" key={`${step.from}-${step.result}`}>
            <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
            <PalSummary pal={from} label="Current" />
            <span className="breed-symbol" aria-label="breed with">×</span>
            <div className="partner-list">{partners.map((partner) => <PalSummary pal={partner} compact key={partner.id} label="Partner" />)}</div>
            <span className="breed-symbol" aria-hidden="true">→</span>
            <PalSummary pal={outcome} emphasis label="Result" />
          </li>;
        })}
      </ol>
      <AdSlot placement="results-inline" />
    </section>}

    <section className="how-it-works" id="how-it-works"><span>01</span><div><h2>Simple inputs. Clear lineage.</h2><p>Every route shows the current Pal, the required partner, and the resulting Pal in order.</p></div></section>
  </main>;
}

function PalField({ id, label, value, onChange, pals }: { id: string; label: string; value: PalId; onChange: (value: PalId) => void; pals: readonly Pal[] }) {
  return <label className="pal-field" htmlFor={id}><span>{label}</span><select id={id} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select a Pal</option>{pals.map((pal) => <option key={pal.id} value={pal.id}>{pal.name}</option>)}</select></label>;
}

function PalSummary({ pal, label, compact = false, emphasis = false }: { pal: Pal | undefined; label: string; compact?: boolean; emphasis?: boolean }) {
  if (!pal) return null;
  return <div className={`pal-summary${compact ? " compact" : ""}${emphasis ? " outcome" : ""}`}>{pal.image ? <img src={pal.image} alt="" loading="lazy" /> : <span className="pal-placeholder" /> }<div><small>{label}</small><strong>{pal.name}</strong>{pal.elements.length > 0 && <span>{pal.elements.join(" · ")}</span>}</div></div>;
}

function Status({ title, detail }: { title: string; detail: string }) { return <section className="status"><h2>{title}</h2><p>{detail}</p></section>; }

export default App;
