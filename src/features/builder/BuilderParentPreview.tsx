import { useId } from "react";
import { Button, Dialog, DialogTrigger, OverlayArrow, Popover } from "react-aria-components";
import { breedingRepository } from "../../data/breedingRepository";
import { passiveRepository } from "../../data/passiveRepository";
import type { BuilderParent } from "../../services/builder/palBuilder";

export default function BuilderParentPreview({ parent }: { parent: BuilderParent }) {
  const species = breedingRepository.getPal(parent.speciesId);
  const name = species?.name ?? parent.speciesId;
  const genderLabel = getGenderLabel(parent.gender);
  const passiveNames = parent.passives.kind !== "any"
    ? parent.passives.ids.map((id) => passiveRepository.get(id)?.name ?? id)
    : [];
  const passiveSummary = getPassiveSummary(parent, passiveNames);
  const titleId = useId();

  return (
    <DialogTrigger>
      <Button className="builder-parent-trigger" aria-label={`View details for ${name}`}>
        <span className="builder-parent-name"><strong>{name}</strong><InfoIcon /></span>
        <small>
          <span>{parent.level === undefined ? "Lv —" : `Lv ${parent.level}`}</span>
          <span>{genderLabel}</span>
          <span>{passiveSummary}</span>
        </small>
      </Button>
      <Popover className="builder-parent-popover" placement="top">
        <OverlayArrow className="builder-parent-popover-arrow">
          <svg viewBox="0 0 8 8" aria-hidden="true"><path d="M0 0 L4 4 L8 0" /></svg>
        </OverlayArrow>
        <Dialog className="builder-parent-dialog" aria-labelledby={titleId}>
          <span className="builder-parent-popover-eyebrow">
            {parent.origin === "inventory" ? "FROM YOUR WORLD" : "BRED IN THIS ROUTE"}
          </span>
          <strong className="builder-parent-popover-name" id={titleId}>{name}</strong>
          <dl className="builder-parent-popover-facts">
            <div><dt>Level</dt><dd>{parent.level ?? "Unknown"}</dd></div>
            <div><dt>Sex</dt><dd>{genderLabel}</dd></div>
          </dl>
          <div className="builder-parent-popover-passives">
            <span>Passives</span>
            {parent.passives.kind === "any" ? (
              <p>Any passives are fine</p>
            ) : passiveNames.length ? (
              <>
                <ul>{passiveNames.map((passive) => <li key={passive}>{passive}</li>)}</ul>
                {parent.passives.kind === "bounded"
                  ? <p>Up to {formatOtherPassives(parent.passives.maxExtras)} are fine</p>
                  : null}
              </>
            ) : parent.passives.kind === "bounded" ? (
              <p>{formatAnyBoundedPassives(parent.passives.maxExtras)} {parent.passives.maxExtras === 1 ? "is" : "are"} fine</p>
            ) : (
              <p>None</p>
            )}
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function getGenderLabel(gender: BuilderParent["gender"]) {
  return gender === "F" ? "Female" : "Male";
}

function getPassiveSummary(parent: BuilderParent, passiveNames: readonly string[]) {
  if (parent.passives.kind === "any") return "Any passives";
  if (parent.passives.kind === "bounded") {
    const required = passiveNames.length === 0
      ? ""
      : passiveNames.length === 1
        ? `${passiveNames[0]} · `
        : `${passiveNames[0]} +${passiveNames.length - 1} · `;
    return required
      ? `${required}up to ${formatOtherPassives(parent.passives.maxExtras)}`
      : formatAnyBoundedPassives(parent.passives.maxExtras);
  }
  if (passiveNames.length === 0) return "No passives";
  if (passiveNames.length === 1) return passiveNames[0];
  return `${passiveNames[0]} +${passiveNames.length - 1}`;
}

function formatOtherPassives(count: number) {
  return `${count} other passive${count === 1 ? "" : "s"}`;
}

function formatAnyBoundedPassives(count: number) {
  return count === 1 ? "Any single passive" : `Any combination of up to ${count} passives`;
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.1v4M8 4.7h.01" />
    </svg>
  );
}
