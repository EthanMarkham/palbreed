import { Link } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useMemo } from "react";
import PalAvatar from "../../components/PalAvatar";
import PalSelect from "../../components/PalSelect";
import PassiveSelector from "../../components/PassiveSelector";
import PathLoadingOverlay from "../../components/PathLoadingOverlay";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { PalId } from "../../domain/pal";
import type { OwnedPal } from "../../domain/inventory";
import type { PassiveGoal, PassiveId } from "../../domain/passive";
import {
  type BuilderInput,
  type BuilderObjective,
  type BuilderResult,
} from "../../services/builder/palBuilder";
import { usePalBuilder } from "../../services/builder/usePalBuilder";
import { inventoryService } from "../../services/inventory/inventoryService";
import { useInventory } from "../../services/inventory/useInventory";
import BuilderHistoryMenu from "./BuilderHistoryMenu";
import BuilderIvScores from "./BuilderIvScores";
import BuilderRouteTree from "./BuilderRouteTree";
import type { BuilderHistoryEntry } from "./builderHistory";
import {
  getBuilderObjective,
  getBuilderAllowsExtraPassives,
  getBuilderPassiveGoal,
  getBuilderPassiveIds,
  type BuilderSearchState,
} from "./builderSearch";

type BuilderPageProps = {
  search: BuilderSearchState;
  onTargetInputChange: (value: string) => void;
  onTargetChange: (value: PalId | undefined) => void;
  onPassivesChange: (value: readonly PassiveId[]) => void;
  onPassiveQueryChange: (value: string) => void;
  onAllowsExtraPassivesChange: (value: boolean) => void;
  onObjectiveChange: (value: BuilderObjective) => void;
  onHistorySelect: (entry: BuilderHistoryEntry) => void;
  onRun: () => void;
};

const EMPTY_INVENTORY: readonly OwnedPal[] = [];

export default function BuilderPage({
  search,
  onTargetInputChange,
  onTargetChange,
  onPassivesChange,
  onPassiveQueryChange,
  onAllowsExtraPassivesChange,
  onObjectiveChange,
  onHistorySelect,
  onRun,
}: BuilderPageProps) {
  const inventorySnapshot = useInventory();
  const profile = inventoryService.getActiveProfile();
  const inventory = profile?.pals ?? EMPTY_INVENTORY;
  const targetId = search.target;
  const passiveSelection = search.passives;
  const passiveExtras = search.extras;
  const requiredPassiveIds = useMemo(
    () => getBuilderPassiveIds({ passives: passiveSelection }),
    [passiveSelection],
  );
  const passiveGoal = useMemo(
    () => getBuilderPassiveGoal({ passives: passiveSelection, extras: passiveExtras }),
    [passiveExtras, passiveSelection],
  );
  const objective = getBuilderObjective(search);
  const allowsExtraPassives = getBuilderAllowsExtraPassives(search);
  const availablePassiveSlots = Math.max(0, 4 - requiredPassiveIds.length);
  const canAllowExtraPassives = requiredPassiveIds.length > 0 && availablePassiveSlots > 0;
  const solveInput = useMemo<BuilderInput | undefined>(() => {
    if (!search.run || !targetId || inventorySnapshot.status === "loading") return undefined;
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
  const displayedResult = result ?? (solve.status === "solving" ? solve.previousResult : undefined);
  const submitBuild = () => {
    if (!targetId || isSolving) return;
    if (search.run) solve.restart();
    else onRun();
  };

  return (
    <main className="workspace feature-workspace">
      <section className="feature-hero builder-hero">
        <div>
          <span className="section-kicker">BUILDER</span>
          <h1>Palworld breeding route planner</h1>
          <p>Choose a target Pal and passive skills. We'll find the best Palworld 1.0 route from your selected world.</p>
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
          />

          <div className="builder-settings">
            <label className="form-field">
              <span>Prioritize</span>
              <span className="select-control">
                <select value={objective} onChange={(event) => onObjectiveChange(event.target.value as BuilderObjective)}>
                  <option value="recommended">Balanced route</option>
                  <option value="fewest">Fewer breedings</option>
                  <option value="cleanest">Better hatch odds</option>
                  <option value="ivs">Maximize IVs</option>
                </select>
                <SelectChevron />
              </span>
            </label>
            <label className={`builder-check-option${!canAllowExtraPassives ? " is-disabled" : ""}`}>
              <input
                type="checkbox"
                checked={allowsExtraPassives}
                disabled={!canAllowExtraPassives}
                onChange={(event) => onAllowsExtraPassivesChange(event.target.checked)}
              />
              <span className="builder-check-control" aria-hidden="true" />
              <span>
                <strong>Allow extra passives</strong>
                <small>{requiredPassiveIds.length === 0
                  ? "Choose at least one passive to use this option."
                  : availablePassiveSlots > 0
                  ? `Accept up to ${availablePassiveSlots} additional passive${availablePassiveSlots === 1 ? "" : "s"} on the final Pal.`
                  : "All four passive slots are selected."}</small>
              </span>
            </label>
          </div>
          <button
            className="primary-button builder-run"
            type={isSolving ? "button" : "submit"}
            disabled={inventorySnapshot.status === "loading" || !targetId}
            onClick={isSolving ? solve.cancel : undefined}
            aria-label={isSolving ? "Finding a breeding route. Activate to cancel." : undefined}
            title={isSolving ? "Cancel search" : undefined}
          >
            {isSolving ? <span className="builder-stop-icon" aria-hidden="true" /> : <SparkIcon />}
            {isSolving ? "Cancel search" : "Find a breeding route"}
            {isSolving ? <span className="sr-only" role="status">Finding a breeding route. Activate to cancel.</span> : null}
          </button>
          <p className="model-note">Odds include inherited passives and any required offspring sex. Balanced routes also favor stronger known IVs; missing IVs use the neutral 50.5 average. Maximize IVs may add up to two breedings and caps estimated route cost; Mushroom Cake's 1.0 stat boost is recommended but not priced because its exact distribution is not published.</p>
        </form>

        <div className="feature-card builder-result-card" aria-live="polite">
          <div className="card-heading"><span>Your route</span><small>{inventory.length} Pals in the selected world</small></div>
          <div className="builder-result-content" aria-busy={isSolving}>
            <BuilderResultView
              result={displayedResult}
              solveError={solveError}
              targetId={targetId}
              passiveGoal={passiveGoal}
            />
            <AnimatePresence>
              {isSolving ? (
                <PathLoadingOverlay
                  key="route-loading"
                  context="breeding"
                  variant="panel"
                  message="Comparing possible parents and offspring..."
                />
              ) : null}
            </AnimatePresence>
          </div>
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
    return <div className="empty-state builder-empty"><span className="empty-glyph">◇</span><strong>Choose a Pal</strong><span>We'll find the best route from your selected world.</span></div>;
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
    ? "No passive preference"
    : passiveGoal?.requiredIds.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ") ?? "";
  const isIvMax = result.strategy === "iv-max";
  const isIvBalanced = result.strategy === "iv-balanced";
  const routeLabel = isIvMax ? "IV-FOCUSED ROUTE" : "BREEDING ROUTE";
  const routeDescription = isIvMax
    ? result.ivScores
      ? `Strongest modeled IV path within route limits · ${passiveSummary}`
      : `No imported IV data; showing the balanced path · ${passiveSummary}`
    : isIvBalanced
      ? `Balanced route and inherited IVs · ${passiveSummary}`
      : passiveSummary;
  return (
    <div className="build-result">
      <div className="build-summary">
        {target ? <PalAvatar pal={target} className="build-summary-avatar" /> : null}
        <div>
          <span className="result-eyebrow">
            {routeLabel}
          </span>
          <h2>{target?.name}</h2>
          <p>{routeDescription}</p>
        </div>
        <div className="build-metrics"><span><strong>{result.steps.length}</strong>breedings</span><span><strong>{formatEggs(result.expectedCakes)}</strong>eggs on average</span></div>
      </div>

      {result.ivScores ? (
        <div className="builder-route-iv-summary">
          <BuilderIvScores scores={result.ivScores} label="Estimated offspring IVs" />
          {isIvMax && result.ivBudget ? (
            <p>Compared with the balanced route and limited to {result.ivBudget.maxSteps} breedings and about {formatEggs(result.ivBudget.maxExpectedCakes)} expected eggs. Use Mushroom Cake for IV-focused hatches.</p>
          ) : null}
        </div>
      ) : null}

      {result.steps.length ? (
        <BuilderRouteTree steps={result.steps} />
      ) : <div className="status-banner is-success"><span>✓</span><p>You already have this Pal{passiveGoal?.kind === "any" ? "" : " with the passives you chose"} in this world.</p></div>}
    </div>
  );
}

function formatEggs(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.05) return rounded.toString();
  return value < 10 ? value.toFixed(1) : rounded.toString();
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" /><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" /></svg>;
}

function SelectChevron() {
  return <span className="select-indicator" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 10 4 4 4-4" /></svg></span>;
}
