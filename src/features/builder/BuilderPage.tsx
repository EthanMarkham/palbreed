import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import PalSelect from "../../components/PalSelect";
import PassiveSelector from "../../components/PassiveSelector";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalId } from "../../domain/pal";
import type { OwnedPal } from "../../domain/inventory";
import type { PassiveGoal, PassiveId } from "../../domain/passive";
import {
  buildPal,
  type BuilderObjective,
  type BuilderParentPassives,
  type BuilderResult,
} from "../../services/builder/palBuilder";
import { inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";
import BuilderHistoryMenu from "./BuilderHistoryMenu";
import BuilderParentPreview from "./BuilderParentPreview";
import type { BuilderHistoryEntry } from "./builderHistory";
import {
  getBuilderExtras,
  getBuilderObjective,
  getBuilderPassiveGoal,
  getBuilderPassiveIds,
  type BuilderSearchState,
} from "./builderSearch";

type BuilderPageProps = {
  search: BuilderSearchState;
  onTargetInputChange: (value: string) => void;
  onTargetChange: (value: PalId | undefined) => void;
  onPassivesChange: (value: readonly PassiveId[]) => void;
  onAnyPassivesChange: (value: boolean) => void;
  onPassiveQueryChange: (value: string) => void;
  onObjectiveChange: (value: BuilderObjective) => void;
  onExtrasChange: (value: 0 | 1 | 2) => void;
  onHistorySelect: (entry: BuilderHistoryEntry) => void;
  onRun: () => void;
};

const EMPTY_INVENTORY: readonly OwnedPal[] = [];

export default function BuilderPage({
  search,
  onTargetInputChange,
  onTargetChange,
  onPassivesChange,
  onAnyPassivesChange,
  onPassiveQueryChange,
  onObjectiveChange,
  onExtrasChange,
  onHistorySelect,
  onRun,
}: BuilderPageProps) {
  const inventorySnapshot = useInventory();
  const profile = inventoryService.getActiveProfile();
  const inventory = profile?.pals ?? EMPTY_INVENTORY;
  const targetId = search.target;
  const requiredPassiveIds = useMemo(() => getBuilderPassiveIds(search), [search]);
  const passiveGoal = useMemo(() => getBuilderPassiveGoal(search), [search]);
  const allowedExtras = getBuilderExtras(search);
  const objective = getBuilderObjective(search);
  const result = useMemo<BuilderResult | undefined>(() => {
    if (!search.run || !targetId || !passiveGoal || inventorySnapshot.status === "loading") return undefined;
    return buildPal({
      inventory,
      targetId,
      passiveGoal,
      objective,
    });
  }, [
    inventorySnapshot.status,
    objective,
    inventory,
    passiveGoal,
    search.run,
    targetId,
  ]);

  return (
    <main className="workspace feature-workspace">
      <section className="feature-hero builder-hero">
        <div>
          <span className="section-kicker">PAL BUILDER</span>
          <h1>Design the Pal. Solve the bridge.</h1>
          <p>Set the final species and choose exact passives or Any. Palpath searches every continuous carrier state reachable from your imported world and explains any missing acquisition.</p>
        </div>
        <span className="hero-index">02</span>
      </section>

      <section className="builder-layout">
        <div className="feature-card builder-form-card">
          <div className="card-heading"><span>Build specification</span><BuilderHistoryMenu onSelect={onHistorySelect} /></div>
          <PalSelect
            label="Final Pal"
            value={targetId}
            onChange={onTargetChange}
            query={{ value: search.targetQuery ?? "", onChange: onTargetInputChange }}
          />
          <PassiveSelector
            label="Required passives"
            selected={requiredPassiveIds}
            onChange={onPassivesChange}
            query={search.passiveQuery ?? ""}
            onQueryChange={onPassiveQueryChange}
            allowAny
            anySelected={passiveGoal?.kind === "any"}
            onAnyChange={onAnyPassivesChange}
          />

          <div className="builder-settings">
            <label className="form-field">
              <span>Optimize for</span>
              <select value={objective} onChange={(event) => onObjectiveChange(event.target.value as BuilderObjective)}>
                <option value="recommended">Recommended balance</option>
                <option value="fewest">Fewest breedings</option>
                <option value="cleanest">Best estimated hatch odds</option>
              </select>
            </label>
            <label className="form-field">
              <span>Allowed extra passives</span>
              <select
                value={allowedExtras}
                disabled={passiveGoal?.kind === "any"}
                onChange={(event) => onExtrasChange(Number(event.target.value) as 0 | 1 | 2)}
              >
                <option value={0}>None / exact build</option>
                <option value={1}>Up to one</option>
                <option value={2}>Up to two</option>
              </select>
            </label>
          </div>
          <button className="primary-button builder-run" type="button" disabled={inventorySnapshot.status === "loading" || !targetId || !passiveGoal} onClick={onRun}>
            <SparkIcon />Build the optimal route
          </button>
          <p className="model-note">The search is exhaustive for a continuous carrier bred with imported partners. Any accepts all passive outcomes. Intermediate hatches may include one unrequested passive when it improves the route. Odds exclude gender selection and lucky random additions.</p>
        </div>

        <div className="feature-card builder-result-card" aria-live="polite">
          <div className="card-heading"><span>Build route</span><small>{inventory.length} inventory Pals considered</small></div>
          <BuilderResultView
            result={result}
            targetId={targetId}
            passiveGoal={passiveGoal}
          />
        </div>
      </section>
    </main>
  );
}

function BuilderResultView({
  result,
  targetId,
  passiveGoal,
}: {
  result?: BuilderResult;
  targetId?: PalId;
  passiveGoal?: PassiveGoal;
}) {
  if (!result) {
    return <div className="empty-state builder-empty"><span className="empty-glyph">◇</span><strong>Ready for a build</strong><span>Choose a final Pal, then select exact passives or Any.</span></div>;
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
            return <span key={id}><strong>{passive?.name ?? id}</strong><small>Import a world containing a carrier with this passive.</small></span>;
          })}
        </div>
        <Link className="secondary-button link-button" to="/">Review imported worlds</Link>
      </div>
    );
  }
  if (result.status === "no-route") {
    return <div className="empty-state is-error"><strong>No inventory-only build</strong><span>{result.reason}</span><Link to="/">Review imported worlds</Link></div>;
  }

  const target = targetId ? breedingRepository.getPal(targetId) : undefined;
  const passiveSummary = passiveGoal?.kind === "any"
    ? "Any passives, including none"
    : passiveGoal?.requiredIds.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ") ?? "";
  return (
    <div className="build-result">
      <div className="build-summary">
        {target ? <img src={target.image} alt="" /> : null}
        <div><span className="result-eyebrow">EXHAUSTIVE CARRIER SEARCH</span><h2>{target?.name}</h2><p>{passiveSummary}</p></div>
        <div className="build-metrics"><span><strong>{result.steps.length}</strong>breedings</span><span><strong>{formatCakes(result.expectedCakes)}</strong>expected cakes</span></div>
      </div>

      {result.steps.length ? (
        <div className="build-steps">
          {result.steps.map((step, index) => {
            const child = breedingRepository.getPal(step.result);
            const resultPassives = getResultPassiveSummary(step.resultPassives);
            return (
              <article key={`${step.firstParent.speciesId}-${step.secondParent.speciesId}-${index}`}>
                <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="build-equation">
                  <div className="build-parent-slot is-first"><BuilderParentPreview parent={step.firstParent} /></div>
                  <span className="build-equation-operator is-plus">+</span>
                  <div className="build-parent-slot is-second"><BuilderParentPreview parent={step.secondParent} /></div>
                  <span className="build-equation-operator is-arrow">→</span>
                  <strong className="build-equation-result">{child?.name}</strong>
                </div>
                <div className="passive-line">Result · {resultPassives}</div>
                <div className="odds-meter"><span style={{ width: `${Math.max(2, step.odds * 100)}%` }} /><small>{formatOdds(step.odds)} estimated / ~{formatCakes(step.expectedCakes)} cakes</small></div>
              </article>
            );
          })}
        </div>
      ) : <div className="status-banner is-success"><span>✓</span><p>You already own this completed build. No breeding is required.</p></div>}
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

function getResultPassiveSummary(passives: BuilderParentPassives) {
  if (passives.kind === "any") return "Any passive outcome accepted";
  const required = passives.ids.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ");
  if (passives.kind === "bounded") {
    return required
      ? `${required} + 0–${passives.maxExtras} others`
      : `0–${passives.maxExtras} passives accepted`;
  }
  return required || "No passives";
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" /><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></svg>;
}
