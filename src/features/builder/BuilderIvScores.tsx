import type { BuilderIvGoal as BuilderIvScoreValues } from "../../services/builder/palBuilder";

export default function BuilderIvScores({
  scores,
  label,
  minimum = false,
}: {
  scores: BuilderIvScoreValues;
  label: string;
  minimum?: boolean;
}) {
  const entries = (["hp", "attack", "defense"] as const)
    .filter((stat) => scores[stat] !== undefined);
  return (
    <div className="builder-offspring-stats">
      <span>{label}</span>
      <dl>
        {entries.map((stat) => (
          <div key={stat}>
            <dt>{stat === "hp" ? "HP" : stat === "attack" ? "Attack" : "Defense"}</dt>
            <dd>{minimum ? "≥" : ""}{formatIv(scores[stat] ?? 0)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatIv(value: number) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 0.05 ? rounded.toString() : value.toFixed(1);
}
