import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button, Dialog, DialogTrigger, OverlayArrow, Popover } from "react-aria-components";
import PalAvatar from "../../components/PalAvatar";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { BuilderParent } from "../../services/builder/palBuilder";
import { getBuilderParentLocationLabel } from "./builderParentLocation";

export default function BuilderParentPreview({
  parent,
  sourceStepNumber,
}: {
  parent: BuilderParent;
  sourceStepNumber?: number;
}) {
  const species = breedingRepository.getPal(parent.speciesId);
  const name = species?.name ?? parent.speciesId;
  const genderLabel = getGenderLabel(parent.gender);
  const passiveNames = parent.passives.kind !== "any"
    ? parent.passives.ids.map((id) => passiveRepository.get(id)?.name ?? id)
    : [];
  const location = getBuilderParentLocationLabel(parent);
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
        className="builder-parent-trigger"
        aria-label={`View details for ${name}`}
        onHoverStart={keepOpen}
        onHoverEnd={scheduleClose}
      >
        <span className="builder-parent-portrait">
          {species ? <PalAvatar pal={species} className="builder-parent-avatar" /> : null}
          <span className="builder-parent-info"><InfoIcon /></span>
        </span>
        <strong>{name}</strong>
        {parent.origin === "planned" ? (
          <small>{sourceStepNumber ? `From ${String(sourceStepNumber).padStart(2, "0")}` : "Breed first"}</small>
        ) : null}
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
                  <span className="builder-parent-popover-eyebrow">
                    {parent.origin === "inventory" ? "FROM YOUR WORLD" : "BRED IN THIS ROUTE"}
                  </span>
                  {species ? <span className="builder-parent-popover-number">No. {String(species.number).padStart(3, "0")}</span> : null}
                </div>
                <strong className="builder-parent-popover-name" id={titleId}>{name}</strong>
                <div className="builder-parent-popover-location">
                  <span>Where to find</span>
                  <strong>{location}</strong>
                </div>
                <dl className="builder-parent-popover-facts">
                  <div><dt>Required sex</dt><dd>{genderLabel}</dd></div>
                  {parent.level !== undefined ? <div><dt>Level</dt><dd>{parent.level}</dd></div> : null}
                </dl>
                <div className="builder-parent-popover-passives">
                  <span>Passives</span>
                  {parent.passives.kind === "any" ? (
                    <p>Unrestricted</p>
                  ) : passiveNames.length ? (
                    <ul>{passiveNames.map((passive) => <li key={passive}>{passive}</li>)}</ul>
                  ) : parent.passives.kind === "bounded" ? (
                    <p>Unrestricted</p>
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

function getGenderLabel(gender: BuilderParent["gender"]) {
  return gender === "F" ? "Female" : "Male";
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.1v4M8 4.7h.01" />
    </svg>
  );
}
