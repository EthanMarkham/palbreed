import type { BuilderStep } from "../../services/builder/palBuilder";
import BuilderOffspringPreview from "./BuilderOffspringPreview";
import BuilderParentPreview from "./BuilderParentPreview";

type BuilderRouteTreeProps = {
  steps: readonly BuilderStep[];
};

export default function BuilderRouteTree({ steps }: BuilderRouteTreeProps) {
  if (!steps.length) return null;

  const stepIndexById = new Map(steps.map((step, index) => [step.id, index]));

  return (
    <div
      className="breeding-route"
      role="list"
      aria-label="Breeding route steps"
    >
      {steps.map((step, index) => (
        <BreedingRow
          key={step.id}
          step={step}
          index={index}
          isGoal={index === steps.length - 1}
          stepIndexById={stepIndexById}
        />
      ))}
    </div>
  );
}

function BreedingRow({
  step,
  index,
  isGoal,
  stepIndexById,
}: {
  step: BuilderStep;
  index: number;
  isGoal: boolean;
  stepIndexById: ReadonlyMap<string, number>;
}) {
  const stepNumber = index + 1;
  const firstSource = getSourceStepNumber(step.firstParentStepId, stepIndexById);
  const secondSource = getSourceStepNumber(step.secondParentStepId, stepIndexById);

  return (
    <article
      className="breeding-route-row"
      role="listitem"
      aria-label={`Breed ${stepNumber}: ${formatOdds(step.odds)}, ${formatEggs(step.expectedCakes)} eggs`}
    >
      <span className="breeding-route-number" aria-hidden="true">
        {String(stepNumber).padStart(2, "0")}
      </span>
      <div className="breeding-route-formula">
        <BuilderParentPreview parent={step.firstParent} sourceStepNumber={firstSource} />
        <span className="breeding-route-operator" aria-hidden="true">+</span>
        <BuilderParentPreview parent={step.secondParent} sourceStepNumber={secondSource} />
        <span className="breeding-route-operator is-arrow" aria-hidden="true">→</span>
        <BuilderOffspringPreview step={step} isGoal={isGoal} />
      </div>
      <div className="breeding-route-odds">
        <strong>{formatOdds(step.odds)} / {formatEggs(step.expectedCakes)} eggs</strong>
      </div>
    </article>
  );
}

function getSourceStepNumber(
  stepId: string | undefined,
  stepIndexById: ReadonlyMap<string, number>,
) {
  const index = stepId ? stepIndexById.get(stepId) : undefined;
  return index === undefined ? undefined : index + 1;
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
