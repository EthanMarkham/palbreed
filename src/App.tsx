import { useMemo, useState } from "react";
import "./App.css";
import AdSlot from "./components/ads/AdSlot";
import PalPicker from "./components/PalPicker";
import { breedingRepository } from "./data/breedingRepository";
import type { LineageResult, Pal, PalGender, PalId } from "./domain/pal";
import { findLineage } from "./services/lineageFinder";

type CalculatorMode = "lineage" | "pair";

const metadata = breedingRepository.metadata;

function App() {
  const pals = breedingRepository.allPals();
  const [mode, setMode] = useState<CalculatorMode>("lineage");
  const [startId, setStartId] = useState<PalId>("");
  const [targetId, setTargetId] = useState<PalId>("");
  const [firstParentId, setFirstParentId] = useState<PalId>("");
  const [secondParentId, setSecondParentId] = useState<PalId>("");
  const [firstGender, setFirstGender] = useState<PalGender>("F");
  const [secondGender, setSecondGender] = useState<PalGender>("M");
  const lineageResult = useMemo(
    () => startId && targetId ? findLineage(startId, targetId) : null,
    [startId, targetId],
  );

  const swapRoute = () => {
    setStartId(targetId);
    setTargetId(startId);
  };
  const swapParents = () => {
    setFirstParentId(secondParentId);
    setSecondParentId(firstParentId);
    setFirstGender(secondGender);
    setSecondGender(firstGender);
  };

  return (
    <div className="site-frame">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="Breedpath home">
          <span className="brand-mark">BP</span>
          <span className="brand-name">BREEDPATH</span>
        </a>
        <div className="data-signal">
          <span className="signal-dot" />
          <span>Live 1.0 table</span>
          <strong>{metadata.palCount} Pals</strong>
        </div>
      </header>

      <main className="app-shell" id="top">
        <section className="hero-grid">
          <div className="hero-copy">
            <div className="release-pill">
              <span>PALWORLD 1.0</span>
              <span className="release-divider" />
              <span>DATA VERIFIED</span>
            </div>
            <h1>The shortest path to your <em>next Pal.</em></h1>
            <p className="hero-lede">
              Plan breeding chains and check exact egg outcomes against the complete 1.0 table. No legacy recipes, no guesswork.
            </p>
            <div className="hero-metrics" aria-label="Dataset summary">
              <Metric value={metadata.palCount.toString()} label="Breedable forms" />
              <Metric value={metadata.parentPairCount.toLocaleString()} label="Pair outcomes" />
              <Metric value="01" label="Gender lock" accent />
            </div>
          </div>

          <section className="calculator-card" aria-label="Palworld breeding calculator">
            <div className="calculator-head">
              <div>
                <span className="section-kicker">BREEDING CONSOLE</span>
                <h2>{mode === "lineage" ? "Build a route" : "Check a pair"}</h2>
              </div>
              <span className="version-tag">v{metadata.gameVersion}</span>
            </div>

            <div className="mode-tabs" role="tablist" aria-label="Calculator mode">
              <ModeTab active={mode === "lineage"} onClick={() => setMode("lineage")} icon={<RouteIcon />}>
                Lineage
              </ModeTab>
              <ModeTab active={mode === "pair"} onClick={() => setMode("pair")} icon={<EggIcon />}>
                Check pair
              </ModeTab>
            </div>

            {mode === "lineage" ? (
              <div className="tool-body" role="tabpanel">
                <PalPicker
                  label="Starting Pal"
                  eyebrow="YOU HAVE"
                  value={startId}
                  onChange={setStartId}
                  pals={pals}
                  placeholder="Choose your Pal"
                />
                <div className="tool-connector">
                  <span>ROUTE TO</span>
                  <button type="button" onClick={swapRoute} disabled={!startId && !targetId}>
                    <SwapIcon />
                    Swap
                  </button>
                </div>
                <PalPicker
                  label="Target Pal"
                  eyebrow="YOU WANT"
                  value={targetId}
                  onChange={setTargetId}
                  pals={pals}
                  placeholder="Choose a target"
                />
                <div className="tool-hint">
                  <ShieldIcon />
                  <span>Shortest route, including exact gender locks when required.</span>
                </div>
              </div>
            ) : (
              <div className="tool-body pair-tool" role="tabpanel">
                <div className="pair-parent">
                  <PalPicker
                    label="First parent"
                    eyebrow="PARENT A"
                    value={firstParentId}
                    onChange={setFirstParentId}
                    pals={pals}
                    placeholder="Choose first parent"
                  />
                  <GenderSwitch label="First parent gender" value={firstGender} onChange={setFirstGender} />
                </div>
                <button className="parent-swap" type="button" onClick={swapParents} aria-label="Swap parents">
                  <SwapIcon />
                </button>
                <div className="pair-parent">
                  <PalPicker
                    label="Second parent"
                    eyebrow="PARENT B"
                    value={secondParentId}
                    onChange={setSecondParentId}
                    pals={pals}
                    placeholder="Choose second parent"
                  />
                  <GenderSwitch label="Second parent gender" value={secondGender} onChange={setSecondGender} />
                </div>
                <PairOutcome
                  firstId={firstParentId}
                  secondId={secondParentId}
                  firstGender={firstGender}
                  secondGender={secondGender}
                />
              </div>
            )}
          </section>
        </section>

        {mode === "lineage" && <LineageResults result={lineageResult} />}

        <RuleSpotlight />

        <footer className="site-footer">
          <div>
            <span className="brand-name">BREEDPATH</span>
            <p>Built around the Palworld 1.0 breeding table.</p>
          </div>
          <p>Source updated {formatDate(metadata.sourceUpdatedAt)}</p>
        </footer>
      </main>
    </div>
  );
}

function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`metric${accent ? " is-accent" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button type="button" role="tab" aria-selected={active} className={active ? "is-active" : ""} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

function GenderSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PalGender;
  onChange: (value: PalGender) => void;
}) {
  return (
    <div className="gender-field">
      <span>{label}</span>
      <div className="gender-switch" role="group" aria-label={label}>
        <button type="button" aria-pressed={value === "F"} className={value === "F" ? "is-active" : ""} onClick={() => onChange("F")}>
          <b>F</b> Female
        </button>
        <button type="button" aria-pressed={value === "M"} className={value === "M" ? "is-active" : ""} onClick={() => onChange("M")}>
          <b>M</b> Male
        </button>
      </div>
    </div>
  );
}

function PairOutcome({
  firstId,
  secondId,
  firstGender,
  secondGender,
}: {
  firstId: PalId;
  secondId: PalId;
  firstGender: PalGender;
  secondGender: PalGender;
}) {
  if (!firstId || !secondId) {
    return (
      <div className="pair-outcome is-empty">
        <EggIcon />
        <div>
          <strong>Egg result waits here</strong>
          <span>Select both parents and their genders.</span>
        </div>
      </div>
    );
  }

  const first = breedingRepository.getPal(firstId);
  const second = breedingRepository.getPal(secondId);
  if (firstGender === secondGender) {
    return (
      <div className="pair-outcome is-warning" role="status">
        <AlertIcon />
        <div>
          <strong>One female + one male required</strong>
          <span>Change either {first?.name ?? "parent"} or {second?.name ?? "parent"} before breeding.</span>
        </div>
      </div>
    );
  }

  const outcomes = breedingRepository.getGenderedOutcomes(firstId, secondId);
  const childId = breedingRepository.getChildForGenders(firstId, secondId, firstGender, secondGender);
  const child = childId ? breedingRepository.getPal(childId) : undefined;
  const alternate = outcomes.find((outcome) => outcome.childId !== childId);
  const alternateChild = alternate ? breedingRepository.getPal(alternate.childId) : undefined;

  if (!child) {
    return (
      <div className="pair-outcome is-warning" role="status">
        <AlertIcon />
        <div><strong>No egg result found</strong><span>This pair is not present in the loaded 1.0 table.</span></div>
      </div>
    );
  }

  return (
    <div className={`pair-result${outcomes.length ? " is-locked" : ""}`} aria-live="polite">
      <div className="pair-result-label">
        <span>{outcomes.length ? "GENDER-LOCKED OUTCOME" : "EGG OUTCOME"}</span>
        <small>{genderName(firstGender)} {first?.name} + {genderName(secondGender)} {second?.name}</small>
      </div>
      <PalResult pal={child} />
      <p>
        {outcomes.length
          ? `This exact gender direction is required. Reversing the genders changes the species.`
          : "This species result is fixed for the pair; either parent can be the female."}
      </p>
      {alternate && alternateChild && (
        <div className="alternate-outcome">
          <span>Reverse genders</span>
          <strong>{genderName(alternate.firstGender)} + {genderName(alternate.secondGender)}</strong>
          <ArrowIcon />
          <img src={alternateChild.image} alt="" />
          <strong>{alternateChild.name}</strong>
        </div>
      )}
    </div>
  );
}

function LineageResults({ result }: { result: LineageResult | null }) {
  if (!result) return null;
  if (result.status === "same-pal") {
    return <StatusCard icon={<CheckCircleIcon />} title="You already have the target" detail="Choose a different target to build a breeding route." />;
  }
  if (result.status === "no-route" || result.status === "invalid-input") {
    return <StatusCard icon={<AlertIcon />} title="No route available" detail={result.reason} warning />;
  }

  return (
    <section className="route-results" aria-live="polite">
      <div className="results-head">
        <div>
          <span className="section-kicker">SHORTEST LINEAGE</span>
          <h2>Your route, step by step.</h2>
        </div>
        <div className="step-count"><strong>{result.steps.length}</strong><span>{result.steps.length === 1 ? "step" : "steps"}</span></div>
      </div>
      <ol className="lineage-list">
        {result.steps.map((step, index) => {
          const from = breedingRepository.getPal(step.from);
          const partner = breedingRepository.getPal(step.partners[0]);
          const outcome = breedingRepository.getPal(step.result);
          const restricted = Boolean(step.fromGender && step.partnerGenders?.[0]);
          return (
            <li className="lineage-step" key={`${step.from}-${step.result}-${index}`}>
              <div className="timeline-marker">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <article className={`lineage-card${restricted ? " is-locked" : ""}`}>
                <div className="lineage-card-head">
                  <span>BREEDING STEP {String(index + 1).padStart(2, "0")}</span>
                  <span className={`rule-chip${restricted ? " is-locked" : ""}`}>
                    {restricted ? <LockIcon /> : <CheckIcon />}
                    {restricted ? "Exact genders" : "Any orientation"}
                  </span>
                </div>
                <div className="breeding-equation">
                  <BreedingPal pal={from} role="Starting parent" gender={step.fromGender} />
                  <span className="equation-symbol">+</span>
                  <BreedingPal pal={partner} role="Breed with" gender={step.partnerGenders?.[0]} />
                  <ArrowIcon />
                  <BreedingPal pal={outcome} role="Egg hatches into" outcome />
                </div>
                <div className="lineage-card-foot">
                  <ShieldIcon />
                  <span>
                    {restricted
                      ? `${from?.name} must be ${genderName(step.fromGender)} and ${partner?.name} must be ${genderName(step.partnerGenders?.[0])}.`
                      : "Use one female and one male; which species carries either gender does not change this result."}
                  </span>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
      <AdSlot placement="results-inline" />
    </section>
  );
}

function BreedingPal({
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
    <div className={`breeding-pal${outcome ? " is-outcome" : ""}`}>
      <div className="breeding-pal-image"><img src={pal.image} alt="" loading="lazy" /></div>
      <div>
        <span>{role}</span>
        <strong>{pal.name}</strong>
        {gender && <small className={`gender-badge gender-${gender.toLocaleLowerCase()}`}>{genderName(gender)} required</small>}
      </div>
    </div>
  );
}

function PalResult({ pal }: { pal: Pal }) {
  return (
    <div className="pal-result">
      <div><img src={pal.image} alt="" /></div>
      <span><small>YOUR EGG HATCHES INTO</small><strong>{pal.name}</strong></span>
      <CheckCircleIcon />
    </div>
  );
}

function StatusCard({
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
    <section className={`status-card${warning ? " is-warning" : ""}`}>
      {icon}
      <div><h2>{title}</h2><p>{detail}</p></div>
    </section>
  );
}

function RuleSpotlight() {
  const katress = breedingRepository.getPal("katress");
  const wixen = breedingRepository.getPal("wixen");
  const katressIgnis = breedingRepository.getPal("katress-ignis");
  const wixenNoct = breedingRepository.getPal("wixen-noct");

  return (
    <section className="rule-spotlight">
      <div className="rule-copy">
        <span className="section-kicker">THE 1.0 EXCEPTION</span>
        <h2>One pair. Two outcomes. Gender decides.</h2>
        <p>
          Katress and Wixen are the only parent pair where species outcome changes with gender direction. Breedpath flags it everywhere it appears.
        </p>
        <div className="rule-proof"><ShieldIcon /><span>All other pairs only require one female and one male.</span></div>
      </div>
      <div className="rule-map" aria-label="Katress and Wixen gender outcomes">
        <RuleRow first={katress} firstGender="F" second={wixen} secondGender="M" child={katressIgnis} />
        <RuleRow first={katress} firstGender="M" second={wixen} secondGender="F" child={wixenNoct} />
      </div>
    </section>
  );
}

function RuleRow({
  first,
  firstGender,
  second,
  secondGender,
  child,
}: {
  first: Pal | undefined;
  firstGender: PalGender;
  second: Pal | undefined;
  secondGender: PalGender;
  child: Pal | undefined;
}) {
  if (!first || !second || !child) return null;
  return (
    <div className="rule-row">
      <RulePal pal={first} gender={firstGender} />
      <span className="equation-symbol">+</span>
      <RulePal pal={second} gender={secondGender} />
      <ArrowIcon />
      <RulePal pal={child} outcome />
    </div>
  );
}

function RulePal({ pal, gender, outcome = false }: { pal: Pal; gender?: PalGender; outcome?: boolean }) {
  return (
    <div className={`rule-pal${outcome ? " is-outcome" : ""}`}>
      <img src={pal.image} alt="" loading="lazy" />
      <span><strong>{pal.name}</strong>{gender && <small>{genderName(gender)}</small>}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function genderName(gender?: PalGender) {
  return gender === "F" ? "Female" : "Male";
}

function RouteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="2.5" /><circle cx="18" cy="7" r="2.5" /><path d="M8.5 17h2.2c3.1 0 2.4-10 5-10H16" /></svg>;
}

function EggIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c3.5 0 6.5 6.2 6.5 10.5a6.5 6.5 0 0 1-13 0C5.5 9.7 8.5 3.5 12 3.5Z" /></svg>;
}

function SwapIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h12l-3-3M17 17H5l3 3" /></svg>;
}

function ArrowIcon() {
  return <svg className="arrow-icon" viewBox="0 0 32 24" aria-hidden="true"><path d="M2 12h26M21 5l7 7-7 7" /></svg>;
}

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5.5 5.5v5.2c0 4.4 2.7 8.1 6.5 9.8 3.8-1.7 6.5-5.4 6.5-9.8V5.5L12 3Z" /><path d="m9 12 2 2 4-5" /></svg>;
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
