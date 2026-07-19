import type { PalGender } from "../domain/pal";

export default function GenderBadge({ gender }: { gender: PalGender }) {
  const label = gender === "F" ? "Female" : "Male";
  return <span className={`gender-badge is-${gender === "F" ? "female" : "male"}`}>{label}</span>;
}
