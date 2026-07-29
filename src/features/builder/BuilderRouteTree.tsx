import type { CSSProperties } from "react";
import PalAvatar from "../../components/PalAvatar";
import { breedingRepository } from "../../data/breedingRepository";
import type { BuilderStep } from "../../services/builder/palBuilder";
import BuilderParentPreview from "./BuilderParentPreview";

type BuilderRouteTreeProps = {
  steps: readonly BuilderStep[];
};

type RouteLink = {
  from: number;
  to: number;
  track: number;
  startOffset: number;
  endOffset: number;
  key: string;
};

const ROW_HEIGHT = 112;
const ROW_GAP = 10;
const ROW_PITCH = ROW_HEIGHT + ROW_GAP;
const ROW_MIDDLE = ROW_HEIGHT / 2;

export default function BuilderRouteTree({ steps }: BuilderRouteTreeProps) {
  if (!steps.length) return null;

  const stepIndexById = new Map(steps.map((step, index) => [step.id, index]));
  const { links, trackCount } = buildRouteLinks(steps, stepIndexById);
  const railWidth = Math.max(30, 18 + trackCount * 11);
  const railHeight = ROW_HEIGHT + (steps.length - 1) * ROW_PITCH;

  return (
    <div
      className="breeding-route"
      role="list"
      aria-label="Breeding route steps"
      style={{ "--route-rail-width": `${railWidth}px` } as CSSProperties}
    >
      <div className="breeding-route-rows">
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
      <RouteRail links={links} width={railWidth} height={railHeight} />
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
  const result = breedingRepository.getPal(step.result);
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
        <div className="breeding-route-result">
          <span className="breeding-route-result-portrait">
            {result ? <PalAvatar pal={result} className="breeding-route-result-avatar" /> : null}
            {isGoal ? <small>Goal</small> : null}
          </span>
          <strong>{result?.name ?? step.result}</strong>
        </div>
      </div>
      <div className="breeding-route-odds">
        <strong>{formatOdds(step.odds)} / {formatEggs(step.expectedCakes)} eggs</strong>
      </div>
    </article>
  );
}

function RouteRail({
  links,
  width,
  height,
}: {
  links: readonly RouteLink[];
  width: number;
  height: number;
}) {
  return (
    <svg
      className="breeding-route-rail"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="breeding-route-arrow"
          viewBox="0 0 6 6"
          refX="1"
          refY="3"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M6 0 0 3 6 6Z" />
        </marker>
      </defs>
      {links.map((link) => {
        const startY = link.from * ROW_PITCH + ROW_MIDDLE + link.startOffset;
        const endY = link.to * ROW_PITCH + ROW_MIDDLE + link.endOffset;
        const trackX = 14 + link.track * 11;
        return (
          <g key={link.key}>
            <path
              className="breeding-route-link"
              d={`M1 ${startY} H${trackX} V${endY} H1`}
              markerEnd="url(#breeding-route-arrow)"
              vectorEffect="non-scaling-stroke"
            />
            <circle className="breeding-route-link-dot" cx="2.5" cy={startY} r="2.5" />
            <text className="breeding-route-link-label" x={trackX + 2} y={startY - 5}>
              {String(link.from + 1).padStart(2, "0")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function buildRouteLinks(
  steps: readonly BuilderStep[],
  stepIndexById: ReadonlyMap<string, number>,
) {
  const unresolved = steps.flatMap((step, to) => (
    [step.firstParentStepId, step.secondParentStepId]
      .map((stepId, parentIndex) => {
        const from = stepId ? stepIndexById.get(stepId) : undefined;
        return from === undefined || from >= to
          ? undefined
          : { from, to, key: `${step.id}-${parentIndex}` };
      })
      .filter((link): link is Omit<RouteLink, "track" | "startOffset" | "endOffset"> => link !== undefined)
  )).sort((left, right) => left.from - right.from || left.to - right.to);

  const trackEnds: number[] = [];
  const links: RouteLink[] = unresolved.map((link) => {
    let track = trackEnds.findIndex((end) => end < link.from);
    if (track < 0) {
      track = trackEnds.length;
      trackEnds.push(link.to);
    } else {
      trackEnds[track] = link.to;
    }
    return { ...link, track, startOffset: 0, endOffset: 0 };
  });
  spreadLinkEndpoints(links, "from", "startOffset");
  spreadLinkEndpoints(links, "to", "endOffset");

  return { links, trackCount: trackEnds.length };
}

function spreadLinkEndpoints(
  links: RouteLink[],
  groupKey: "from" | "to",
  offsetKey: "startOffset" | "endOffset",
) {
  const grouped = new Map<number, RouteLink[]>();
  for (const link of links) {
    const group = grouped.get(link[groupKey]) ?? [];
    group.push(link);
    grouped.set(link[groupKey], group);
  }
  for (const group of grouped.values()) {
    group.forEach((link, index) => {
      link[offsetKey] = (index - (group.length - 1) / 2) * 9;
    });
  }
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
