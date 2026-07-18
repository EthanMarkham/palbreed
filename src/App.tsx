import { useMemo, useState } from "react";
import "./App.css";
import PalPicker from "./components/PalPicker";
import { breedingRepository } from "./data/breedingRepository";
import type { LineageResult, Pal, PalGender, PalId } from "./domain/pal";
import { findLineage } from "./services/lineageFinder";

const metadata = breedingRepository.metadata;
const pals = breedingRepository.allPals();

function App() {
  const [startId, setStartId] = useState<PalId>("");
  const [targetId, setTargetId] = useState<PalId>("");
  const result = useMemo(
    () => startId && targetId ? findLineage(startId, targetId) : null,
    [startId, targetId],
  );

  const swapRoute = () => {
    setStartId(targetId);
    setTargetId(startId);
  };

  return (
    <div className="site-frame">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Palpath home">
          <span className="brand-mark">PP</span>
          <span className="brand-name">PALPATH</span>
        </a>
        <span className="version-label">Palworld {metadata.gameVersion}</span>
      </header>

      <main className="workspace" id="top">
        <section className="planner-panel" aria-labelledby="planner-title">
          <div className="planner-head">
            <div>
              <span className="section-kicker">SHORTEST PASSIVE PATH</span>
              <h1 id="planner-title">Passive transfer path</h1>
            </div>
            <p>Select the Pal carrying the passives, then the Pal you want them on.</p>
          </div>

          <div className="route-controls">
            <PalPicker
              label="Starting Pal"
              description="HAS PASSIVES"
              value={startId}
              onChange={setStartId}
              pals={pals}
              placeholder="Search starting Pal"
            />
            <button
              className="swap-button"
              type="button"
              onClick={swapRoute}
              disabled={!startId && !targetId}
              aria-label="Swap starting and target Pals"
            >
              <SwapIcon />
            </button>
            <PalPicker
              label="Target Pal"
              description="NEEDS PASSIVES"
              value={targetId}
              onChange={setTargetId}
              pals={pals}
              placeholder="Search target Pal"
            />
          </div>
        </section>

        <LineageResults result={result} startId={startId} targetId={targetId} />
      </main>
    </div>
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

export default App;
