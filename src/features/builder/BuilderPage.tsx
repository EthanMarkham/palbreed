import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";
import PalSelect from "../../components/PalSelect";
import PassiveSelector from "../../components/PassiveSelector";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalId } from "../../domain/pal";
import type { OwnedPal } from "../../domain/inventory";
import type { PassiveGoal, PassiveId } from "../../domain/passive";
import {
  type BuilderInput,
  type BuilderObjective,
  type BuilderParentPassives,
  type BuilderResult,
} from "../../services/builder/palBuilder";
import { usePalBuilder } from "../../services/builder/usePalBuilder";
import { inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";
import BuilderHistoryMenu from "./BuilderHistoryMenu";
import BuilderParentPreview from "./BuilderParentPreview";
import BuilderSolveAnimation from "./BuilderSolveAnimation";
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
  const passiveSelection = search.passives;
  const extrasSelection = search.extras;
  const requiredPassiveIds = useMemo(
    () => getBuilderPassiveIds({ passives: passiveSelection }),
    [passiveSelection],
  );
  const passiveGoal = useMemo(
    () => getBuilderPassiveGoal({ passives: passiveSelection, extras: extrasSelection }),
    [extrasSelection, passiveSelection],
  );
  const allowedExtras = getBuilderExtras(search);
  const objective = getBuilderObjective(search);
  const reduceMotion = useReducedMotion();
  const solveInput = useMemo<BuilderInput | undefined>(() => {
    if (!search.run || !targetId || !passiveGoal || inventorySnapshot.status === "loading") return undefined;
    return {
      inventory,
      targetId,
      passiveGoal,
      objective,
    };
  }, [
    inventorySnapshot.status,
    objective,
    inventory,
    passiveGoal,
    search.run,
    targetId,
  ]);
  const solve = usePalBuilder(solveInput);
  const isSolving = solve.status === "solving";
  const result = solve.status === "complete" ? solve.result : undefined;
  const solveError = solve.status === "error" ? solve.message : undefined;
  const submitBuild = () => {
    if (!targetId || !passiveGoal || isSolving) return;
    if (search.run) solve.restart();
    else onRun();
  };

  return (
    <main className="workspace feature-workspace">
      <section className="feature-hero builder-hero">
        <div>
          <span className="section-kicker">BUILDER</span>
          <h1>Plan your next Pal</h1>
          <p>Choose a Pal and the exact passives you want, or select Any if you're flexible. We'll look for a route using Pals in your selected world.</p>
        </div>
        <span className="hero-index">02</span>
      </section>

      <section className="builder-layout">
        <form
          className="feature-card builder-form-card"
          aria-busy={isSolving}
          onSubmit={(event) => { event.preventDefault(); submitBuild(); }}
        >
          <div className="card-heading"><span>Choose your build</span><BuilderHistoryMenu onSelect={onHistorySelect} /></div>
          <PalSelect
            label="Pal you want"
            value={targetId}
            onChange={onTargetChange}
            query={{ value: search.targetQuery ?? "", onChange: onTargetInputChange }}
          />
          <PassiveSelector
            label="Passives you want"
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
              <span>Prioritize</span>
              <span className="select-control">
                <select value={objective} onChange={(event) => onObjectiveChange(event.target.value as BuilderObjective)}>
                  <option value="recommended">Balanced route</option>
                  <option value="fewest">Fewer breedings</option>
                  <option value="cleanest">Better hatch odds</option>
                </select>
                <SelectChevron />
              </span>
            </label>
            <label className="form-field">
              <span>Other passives allowed</span>
              <span className="select-control">
                <select
                  value={allowedExtras}
                  disabled={passiveGoal?.kind === "any"}
                  onChange={(event) => onExtrasChange(Number(event.target.value) as 0 | 1 | 2)}
                >
                  <option value={0}>No others</option>
                  <option value={1}>Up to 1 other</option>
                  <option value={2}>Up to 2 others</option>
                </select>
                <SelectChevron />
              </span>
            </label>
          </div>
          <button
            className="primary-button builder-run"
            type={isSolving ? "button" : "submit"}
            disabled={inventorySnapshot.status === "loading" || !targetId || !passiveGoal}
            onClick={isSolving ? solve.cancel : undefined}
          >
            {isSolving ? <StopIcon /> : <SparkIcon />}
            {isSolving ? "Cancel search" : "Find a breeding route"}
          </button>
          <p className="model-note">Each step pairs a Pal from the route with one from your selected world. Intermediate Pals may have extra passives when that lowers the average Cake cost. Estimates use regular Cake and don't include sex or lucky random matches.</p>
        </form>

        <div className="feature-card builder-result-card" aria-live="polite">
          <div className="card-heading"><span>Your route</span><small>{inventory.length} Pals in the selected world</small></div>
          <AnimatePresence initial={false} mode="wait">
            {isSolving ? (
              <BuilderSolveAnimation key="solving" />
            ) : (
              <motion.div
                key={search.run ? `result-${targetId ?? "unknown"}-${search.passives ?? "none"}` : "ready"}
                className="builder-result-content"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(5px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: reduceMotion ? 0.01 : 0.34, ease: [0.22, 1, 0.36, 1] }}
              >
                <BuilderResultView
                  result={result}
                  solveError={solveError}
                  targetId={targetId}
                  passiveGoal={passiveGoal}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}

function BuilderResultView({
  result,
  solveError,
  targetId,
  passiveGoal,
}: {
  result?: BuilderResult;
  solveError?: string;
  targetId?: PalId;
  passiveGoal?: PassiveGoal;
}) {
  if (solveError) {
    return <div className="empty-state is-error"><strong>We couldn't finish that route</strong><span>{solveError}</span></div>;
  }
  if (!result) {
    return <div className="empty-state builder-empty"><span className="empty-glyph">◇</span><strong>Choose a Pal to get started</strong><span>Then pick the passives you want, or select Any if you're flexible.</span></div>;
  }
  if (result.status === "missing-passives") {
    return (
      <div className="gap-result">
        <span className="result-eyebrow">MISSING PASSIVES</span>
        <h2>Need {result.missingPassiveIds.length} more passive{result.missingPassiveIds.length === 1 ? "" : "s"}</h2>
        <p>{result.reason}</p>
        <div className="gap-list">
          {result.missingPassiveIds.map((id) => {
            const passive = passiveRepository.get(id);
            return <span key={id}><strong>{passive?.name ?? id}</strong><small>Add a Pal with this passive to your world, then refresh the import.</small></span>;
          })}
        </div>
        <Link className="secondary-button link-button" to="/">Open inventory</Link>
      </div>
    );
  }
  if (result.status === "no-route") {
    return <div className="empty-state is-error"><strong>No route from this world</strong><span>{result.reason}</span><Link to="/">Check inventory</Link></div>;
  }

  const target = targetId ? breedingRepository.getPal(targetId) : undefined;
  const passiveSummary = passiveGoal?.kind === "any"
    ? "Passives don't matter"
    : passiveGoal?.requiredIds.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ") ?? "";
  return (
    <div className="build-result">
      <div className="build-summary">
        {target ? <img src={target.image} alt="" /> : null}
        <div><span className="result-eyebrow">BREEDING ROUTE</span><h2>{target?.name}</h2><p>{passiveSummary}</p></div>
        <div className="build-metrics"><span><strong>{result.steps.length}</strong>breedings</span><span><strong>{formatCakes(result.expectedCakes)}</strong>cakes on average</span></div>
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
                <div className="passive-line">Offspring: {resultPassives}</div>
                <div className="odds-meter"><span style={{ width: `${Math.max(2, step.odds * 100)}%` }} /><small>{formatOdds(step.odds)} estimated chance · about {formatCakes(step.expectedCakes)} cakes</small></div>
              </article>
            );
          })}
        </div>
      ) : <div className="status-banner is-success"><span>✓</span><p>You already have this Pal{passiveGoal?.kind === "any" ? "" : " with the passives you chose"} in this world.</p></div>}
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
  if (passives.kind === "any") return "Any passives";
  const required = passives.ids.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ");
  if (passives.kind === "bounded") {
    const others = `up to ${passives.maxExtras} other passive${passives.maxExtras === 1 ? "" : "s"}`;
    return required ? `${required} + ${others}` : `Up to ${passives.maxExtras} passives`;
  }
  return required || "No passives";
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" /><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></svg>;
}

function StopIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>;
}

function SelectChevron() {
  return <span className="select-indicator" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 10 4 4 4-4" /></svg></span>;
}
