import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button, Dialog, DialogTrigger, OverlayArrow, Popover } from "react-aria-components";
import PalAvatar from "../../components/PalAvatar";
import { breedingRepository } from "../../data/breedingRepository";
import { getPalBaseStats } from "../../data/palStatsRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { BuilderStep } from "../../services/builder/palBuilder";
import BuilderIvScores from "./BuilderIvScores";

export default function BuilderOffspringPreview({
  step,
  isGoal,
}: {
  step: BuilderStep;
  isGoal: boolean;
}) {
  const species = breedingRepository.getPal(step.result);
  const name = species?.name ?? step.result;
  const stats = getPalBaseStats(step.result);
  const passiveNames = step.resultPassives.kind === "any"
    ? []
    : step.resultPassives.ids.map((id) => passiveRepository.get(id)?.name ?? id);
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const keepOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
    setIsOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setIsOpen(false), 120);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setIsOpen(open);
      }}
    >
      <Button
        className="breeding-route-result"
        aria-label={`View offspring details for ${name}`}
        onHoverStart={keepOpen}
        onHoverEnd={scheduleClose}
      >
        <span className="breeding-route-result-portrait">
          {species ? <PalAvatar pal={species} className="breeding-route-result-avatar" /> : null}
          {isGoal ? <small>Goal</small> : null}
        </span>
        <strong>{name}</strong>
      </Button>
      <Popover
        className="builder-parent-popover"
        placement="top"
        isNonModal
        onMouseEnter={keepOpen}
        onMouseLeave={scheduleClose}
      >
        {({ isExiting }) => (
          <>
            <OverlayArrow className="builder-parent-popover-arrow">
              <svg viewBox="0 0 8 8" aria-hidden="true"><path d="M0 0 L4 4 L8 0" /></svg>
            </OverlayArrow>
            <motion.div
              className="builder-detail-popover-surface"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 7 }}
              animate={reduceMotion
                ? { opacity: 1 }
                : isExiting
                  ? { opacity: 0, scale: 0.9, y: 5 }
                  : { opacity: 1, scale: 1, y: 0 }}
              transition={isExiting
                ? { duration: 0.12, ease: "easeIn" }
                : { type: "spring", stiffness: 430, damping: 29, mass: 0.72 }}
              style={{ transformOrigin: "50% 100%" }}
            >
              <Dialog className="builder-parent-dialog" aria-labelledby={titleId}>
                <div className="builder-parent-popover-meta">
                  <span className="builder-parent-popover-eyebrow">OFFSPRING</span>
                  {species ? (
                    <span className="builder-parent-popover-number">
                      No. {String(species.number).padStart(3, "0")}
                    </span>
                  ) : null}
                </div>
                <strong className="builder-parent-popover-name" id={titleId}>{name}</strong>
                {stats ? (
                  <div className="builder-offspring-stats">
                    <span>Base stats</span>
                    <dl>
                      <div><dt>HP</dt><dd>{stats.hp}</dd></div>
                      <div><dt>Attack</dt><dd>{stats.attack}</dd></div>
                      <div><dt>Defense</dt><dd>{stats.defense}</dd></div>
                    </dl>
                  </div>
                ) : null}
                {step.resultIvScores ? (
                  <BuilderIvScores scores={step.resultIvScores} label="Expected IVs" />
                ) : null}
                <dl className="builder-parent-popover-facts">
                  <div><dt>Breed chance</dt><dd>{formatOdds(step.odds)}</dd></div>
                  <div><dt>Eggs on average</dt><dd>{formatEggs(step.expectedCakes)}</dd></div>
                </dl>
                <div className="builder-parent-popover-passives">
                  <span>Expected passives</span>
                  {step.resultPassives.kind === "any" ? (
                    <p>Unrestricted</p>
                  ) : passiveNames.length ? (
                    <>
                      <ul>{passiveNames.map((passive) => <li key={passive}>{passive}</li>)}</ul>
                      {step.resultPassives.kind === "bounded" && step.resultPassives.maxExtras > 0 ? (
                        <p>May include up to {step.resultPassives.maxExtras} additional passive{step.resultPassives.maxExtras === 1 ? "" : "s"}.</p>
                      ) : null}
                    </>
                  ) : step.resultPassives.kind === "bounded" ? (
                    <p>Up to {step.resultPassives.maxExtras} unrestricted passive{step.resultPassives.maxExtras === 1 ? "" : "s"}</p>
                  ) : (
                    <p>None</p>
                  )}
                </div>
              </Dialog>
            </motion.div>
          </>
        )}
      </Popover>
    </DialogTrigger>
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
