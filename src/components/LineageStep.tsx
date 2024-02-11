import React from "react";
import { getPalByName } from "../logic/breedingCalc";

type LineageStepProps = {
  prevPal: string;
  nextPal: string;
  parentOptions: string[] | null;
};

const LineageStep: React.FC<LineageStepProps> = ({ prevPal, nextPal, parentOptions }) => {
  const pal = getPalByName(prevPal);
  const next = getPalByName(nextPal);

  return (
    <div className="flex flex-row items-center w-full mb-4 p-4 bg-gray-800 rounded-lg shadow-md">
      {pal && (
        <div className="flex flex-col items-center text-white mx-4">
          {pal.image && <img src={pal.image} alt={pal.name} className="rounded-full h-16 w-16 mb-2" />}
          <p className="text-lg font-bold mb-2">{pal.name}</p>
        </div>
      )}

      {parentOptions && parentOptions.length > 0 && next && (
        <div className="flex items-center mx-4">
          <i className="fas fa-arrow-right text-white"></i>
        </div>
      )}

      {parentOptions && parentOptions.length > 0 && (
        <div className="flex flex-col items-center text-white mx-4">
          {parentOptions.map((parentName: string) => {
            const parent = getPalByName(parentName);
            return (
              <p key={parent.name} className="text-sm">
                {parent.name}
              </p>
            );
          })}
        </div>
      )}

      {parentOptions && parentOptions.length > 0 && next && (
        <div className="flex items-center mx-4">
          <i className="fas fa-arrow-right text-white"></i>
        </div>
      )}

      {next && (
        <div className="flex flex-col items-center text-white mx-4">
          {next.image && <img src={next.image} alt={next.name} className="rounded-full h-16 w-16 mb-2" />}
          <p className="text-lg font-bold mb-2">{next.name}</p>
        </div>
      )}
    </div>
  );
};

export default LineageStep;
