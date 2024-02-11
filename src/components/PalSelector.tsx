import React, { ChangeEvent } from "react";
import { PalDex } from "../logic/breedingCalc";

interface PalSelectorProps {
  label: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  palDex: PalDex;
  dataReference: number;
}

const PalSelector: React.FC<PalSelectorProps> = ({
  onChange,
  palDex,
  label,
  dataReference,
}) => {
  return (
    <div className="">
      <label>{label}</label>
      <select
        onChange={onChange}
        data-ref={dataReference}
        className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
      >
        {Object.values(palDex).sort((a, b) => a.name > b.name ? 1 : -1).map((pal, index) => (
          <option key={index}>{pal.name}</option>
        ))}
      </select>
    </div>
  );
};

export default PalSelector;
