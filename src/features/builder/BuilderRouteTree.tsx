import PalAvatar from "../../components/PalAvatar";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type {
  BuilderParent,
  BuilderParentPassives,
  BuilderStep,
} from "../../services/builder/palBuilder";
import BuilderParentPreview from "./BuilderParentPreview";

type BuilderRouteTreeProps = {
  steps: readonly BuilderStep[];
};

export default function BuilderRouteTree({ steps }: BuilderRouteTreeProps) {
  const rootStep = steps[steps.length - 1];
  if (!rootStep) return null;

  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const stepNumbers = new Map(steps.map((step, index) => [step.id, index + 1]));

  return (
    <div className="breeding-tree" role="tree" aria-label="Breeding route parent tree">
      <BreedingNode
        step={rootStep}
        stepsById={stepsById}
        stepNumbers={stepNumbers}
        isRoot
      />
    </div>
  );
}

function BreedingNode({
  step,
  parent,
  stepsById,
  stepNumbers,
  isRoot = false,
}: {
  step: BuilderStep;
  parent?: BuilderParent;
  stepsById: ReadonlyMap<string, BuilderStep>;
  stepNumbers: ReadonlyMap<string, number>;
  isRoot?: boolean;
}) {
  const result = breedingRepository.getPal(step.result);
  const stepNumber = stepNumbers.get(step.id) ?? 1;

  return (
    <section className={isRoot ? "breeding-tree-node is-root" : "breeding-tree-node"} role="treeitem">
      {isRoot ? (
        <div className="breeding-tree-target">
          {result ? <PalAvatar pal={result} className="breeding-tree-target-avatar" /> : null}
          <span>
            <small>FINAL HATCH</small>
            <strong>{result?.name ?? step.result}</strong>
            <em>{getResultPassiveSummary(step.resultPassives)}</em>
          </span>
        </div>
      ) : parent ? (
        <BuilderParentPreview parent={parent} />
      ) : null}

      <div className="breeding-tree-step">
        <span>Breed {String(stepNumber).padStart(2, "0")}</span>
        <strong>{formatOdds(step.odds)} / {formatEggs(step.expectedCakes)} eggs</strong>
      </div>

      <div className="breeding-tree-parents" role="group" aria-label={`Parents for breed ${stepNumber}`}>
        <ParentBranch
          parent={step.firstParent}
          parentStepId={step.firstParentStepId}
          stepsById={stepsById}
          stepNumbers={stepNumbers}
        />
        <ParentBranch
          parent={step.secondParent}
          parentStepId={step.secondParentStepId}
          stepsById={stepsById}
          stepNumbers={stepNumbers}
        />
      </div>
    </section>
  );
}

function ParentBranch({
  parent,
  parentStepId,
  stepsById,
  stepNumbers,
}: {
  parent: BuilderParent;
  parentStepId?: string;
  stepsById: ReadonlyMap<string, BuilderStep>;
  stepNumbers: ReadonlyMap<string, number>;
}) {
  const parentStep = parentStepId ? stepsById.get(parentStepId) : undefined;

  return (
    <div className="breeding-tree-branch">
      {parentStep ? (
        <BreedingNode
          step={parentStep}
          parent={parent}
          stepsById={stepsById}
          stepNumbers={stepNumbers}
        />
      ) : (
        <div className="breeding-tree-leaf" role="treeitem">
          <BuilderParentPreview parent={parent} />
        </div>
      )}
    </div>
  );
}

function formatOdds(value: number) {
  if (value >= 0.1) return `${Math.round(value * 100)}%`;
  return `${(value * 100).toFixed(1)}%`;
}

function formatEggs(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.05) return rounded.toString();
  return value < 10 ? value.toFixed(1) : rounded.toString();
}

function getResultPassiveSummary(passives: BuilderParentPassives) {
  if (passives.kind === "any") return "Any passives";
  const required = passives.ids.map((id) => passiveRepository.get(id)?.name ?? id).join(" / ");
  return required || (passives.kind === "bounded" ? "Any passives" : "No passives");
}
