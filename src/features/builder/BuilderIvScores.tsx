import type { BuilderIvScores as BuilderIvScoreValues } from "../../services/builder/palBuilder";

export default function BuilderIvScores({
  scores,
  label,
}: {
  scores: BuilderIvScoreValues;
  label: string;
}) {
  return (
    <div className="builder-offspring-stats">
      <span>{label}</span>
      <dl>
        <div><dt>HP</dt><dd>{formatIv(scores.hp)}</dd></div>
        <div><dt>Attack</dt><dd>{formatIv(scores.attack)}</dd></div>
        <div><dt>Defense</dt><dd>{formatIv(scores.defense)}</dd></div>
      </dl>
    </div>
  );
}

function formatIv(value: number) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 0.05 ? rounded.toString() : value.toFixed(1);
}
