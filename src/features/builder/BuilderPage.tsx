import { useState } from "react";
import { Link } from "@tanstack/react-router";
import PalSelect from "../../components/PalSelect";
import PassiveSelector from "../../components/PassiveSelector";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalGender, PalId } from "../../domain/pal";
import type { PassiveId } from "../../domain/passive";
import { buildPal, type BuilderObjective, type BuilderResult } from "../../services/builder/palBuilder";
import { createId, inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";

export default function BuilderPage() {
  const inventorySnapshot = useInventory();
  const profile = inventoryService.getActiveProfile();
  const [targetId, setTargetId] = useState<PalId>();
  const [requiredPassiveIds, setRequiredPassiveIds] = useState<readonly PassiveId[]>([]);
  const [allowedExtras, setAllowedExtras] = useState<0 | 1 | 2>(0);
  const [objective, setObjective] = useState<BuilderObjective>("recommended");
  const [result, setResult] = useState<BuilderResult>();
  const [hatchGender, setHatchGender] = useState<PalGender>("F");

  const runBuilder = () => {
    if (!targetId || inventorySnapshot.status === "loading") return;
    setResult(buildPal({
      inventory: profile.pals,
      targetId,
      requiredPassiveIds,
      allowedExtras,
      objective,
    }));
  };

  const logHatch = () => {
    if (!targetId || inventorySnapshot.status === "loading") return;
    inventoryService.upsertPal({
      id: createId(),
      speciesId: targetId,
      gender: hatchGender,
      passiveIds: requiredPassiveIds,
      location: "manual",
      source: "session",
      included: true,
    });
    setResult(buildPal({
      inventory: inventoryService.getActiveProfile().pals,
      targetId,
      requiredPassiveIds,
      allowedExtras,
      objective,
    }));
  };

  return (
    <main className="workspace feature-workspace">
      <section className="feature-hero builder-hero">
        <div>
          <span className="section-kicker">PAL BUILDER</span>
          <h1>Design the Pal. Solve the bridge.</h1>
          <p>Set the final species and passives. Palpath searches every continuous carrier state reachable from your included inventory and explains any missing acquisition.</p>
        </div>
        <span className="hero-index">03</span>
      </section>

      <section className="builder-layout">
        <div className="feature-card builder-form-card">
          <div className="card-heading"><span>Build specification</span><small>Up to four passives</small></div>
          <PalSelect label="Final Pal" value={targetId} onChange={(value) => { setTargetId(value); setResult(undefined); }} />
          <PassiveSelector label="Required passives" selected={requiredPassiveIds} onChange={(value) => { setRequiredPassiveIds(value); setResult(undefined); }} />

          <div className="builder-settings">
            <label className="form-field">
              <span>Optimize for</span>
              <select value={objective} onChange={(event) => setObjective(event.target.value as BuilderObjective)}>
                <option value="recommended">Recommended balance</option>
                <option value="fewest">Fewest breedings</option>
                <option value="cleanest">Best estimated hatch odds</option>
              </select>
            </label>
            <label className="form-field">
              <span>Allowed extra passives</span>
              <select value={allowedExtras} onChange={(event) => setAllowedExtras(Number(event.target.value) as 0 | 1 | 2)}>
                <option value={0}>None / exact build</option>
                <option value={1}>Up to one</option>
                <option value={2}>Up to two</option>
              </select>
            </label>
          </div>
          <button className="primary-button builder-run" type="button" disabled={inventorySnapshot.status === "loading" || !targetId || !requiredPassiveIds.length} onClick={runBuilder}>
            <SparkIcon />Build the optimal route
          </button>
          <p className="model-note">The species/passive search is exhaustive for a continuous carrier bred with owned partners. Extra-passive tolerance applies to the final hatch; intermediate carriers stay clean. Hatch odds are estimates from reverse-engineered inheritance distributions and exclude gender selection and lucky random additions.</p>
        </div>

        <div className="feature-card builder-result-card" aria-live="polite">
          <div className="card-heading"><span>Build route</span><small>{profile.pals.filter(({ included }) => included).length} inventory Pals considered</small></div>
          <BuilderResultView
            result={result}
            targetId={targetId}
            requiredPassiveIds={requiredPassiveIds}
            hatchGender={hatchGender}
            setHatchGender={setHatchGender}
            onLogHatch={logHatch}
          />
        </div>
      </section>
    </main>
  );
}

function BuilderResultView({
  result,
  targetId,
  requiredPassiveIds,
  hatchGender,
  setHatchGender,
  onLogHatch,
}: {
  result?: BuilderResult;
  targetId?: PalId;
  requiredPassiveIds: readonly PassiveId[];
  hatchGender: PalGender;
  setHatchGender: (gender: PalGender) => void;
  onLogHatch: () => void;
}) {
  if (!result) {
    return <div className="empty-state builder-empty"><span className="empty-glyph">◇</span><strong>Ready for a build</strong><span>Choose a final Pal and the exact passives you care about.</span></div>;
  }
  if (result.status === "missing-passives") {
    return (
      <div className="gap-result">
        <span className="result-eyebrow">BRIDGE THE GAP</span>
        <h2>{result.missingPassiveIds.length} acquisition{result.missingPassiveIds.length === 1 ? "" : "s"} needed</h2>
        <p>{result.reason}</p>
        <div className="gap-list">
          {result.missingPassiveIds.map((id) => {
            const passive = passiveRepository.get(id);
            return <span key={id}><strong>{passive?.name ?? id}</strong><small>Add any owned carrier with this passive.</small></span>;
          })}
        </div>
        <Link className="secondary-button link-button" to="/inventory">Open inventory to add carriers</Link>
      </div>
    );
  }
  if (result.status === "no-route") {
    return <div className="empty-state is-error"><strong>No inventory-only build</strong><span>{result.reason}</span><Link to="/inventory">Review included Pals</Link></div>;
  }

  const target = targetId ? breedingRepository.getPal(targetId) : undefined;
  return (
    <div className="build-result">
      <div className="build-summary">
        {target ? <img src={target.image} alt="" /> : null}
        <div><span className="result-eyebrow">EXACT CARRIER SEARCH</span><h2>{target?.name}</h2><p>{requiredPassiveIds.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ")}</p></div>
        <div className="build-metrics"><span><strong>{result.steps.length}</strong>breedings</span><span><strong>{formatCakes(result.expectedCakes)}</strong>expected cakes</span></div>
      </div>

      {result.steps.length ? (
        <div className="build-steps">
          {result.steps.map((step, index) => {
            const from = breedingRepository.getPal(step.from);
            const partner = breedingRepository.getPal(step.partner);
            const child = breedingRepository.getPal(step.result);
            return (
              <article key={`${step.from}-${step.partner}-${index}`}>
                <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="build-equation"><strong>{from?.name}</strong><span>+</span><strong>{partner?.name}</strong><span>→</span><strong>{child?.name}</strong></div>
                <div className="passive-line">{step.passiveIds.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ")}</div>
                <div className="odds-meter"><span style={{ width: `${Math.max(2, step.odds * 100)}%` }} /><small>{formatOdds(step.odds)} estimated / ~{formatCakes(step.expectedCakes)} cakes</small></div>
              </article>
            );
          })}
        </div>
      ) : <div className="status-banner is-success"><span>✓</span><p>You already own this completed build. No breeding is required.</p></div>}

      <div className="hatch-adapter">
        <div><strong>I hatched the final Pal</strong><span>Add the result to this session and immediately make it available to every planner.</span></div>
        <select value={hatchGender} onChange={(event) => setHatchGender(event.target.value as PalGender)} aria-label="Hatched Pal gender"><option value="F">Female</option><option value="M">Male</option></select>
        <button type="button" className="secondary-button compact-button" onClick={onLogHatch}>Log hatch</button>
      </div>
    </div>
  );
}

function formatOdds(value: number) {
  if (value >= 0.1) return `${Math.round(value * 100)}%`;
  return `${(value * 100).toFixed(1)}%`;
}

function formatCakes(value: number) {
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" /><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></svg>;
}
