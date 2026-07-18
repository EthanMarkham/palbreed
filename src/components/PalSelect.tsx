import { breedingRepository } from "../data/breedingRepository";
import type { PalId } from "../domain/pal";

type PalSelectProps = {
  label: string;
  value?: PalId;
  onChange: (value: PalId | undefined) => void;
  optional?: boolean;
  optionalLabel?: string;
};

const pals = breedingRepository.allPals();

export default function PalSelect({
  label,
  value,
  onChange,
  optional = false,
  optionalLabel = "Any owned Pal",
}: PalSelectProps) {
  const selected = value ? breedingRepository.getPal(value) : undefined;
  return (
    <label className="form-field pal-select-field">
      <span>{label}</span>
      <span className="select-with-pal">
        {selected ? <img src={selected.image} alt="" /> : <span className="select-placeholder-mark">?</span>}
        <select value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
          <option value="" disabled={!optional}>{optional ? optionalLabel : "Choose a Pal"}</option>
          {pals.map((pal) => <option key={pal.id} value={pal.id}>{pal.name}</option>)}
        </select>
      </span>
    </label>
  );
}
