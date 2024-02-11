import "./App.css";
import PalSelector from "./components/PalSelector";
import { palDex } from "./data/data.json";
import { useEffect, useMemo, useState } from "react";
import LineageStep from "./components/LineageStep";
import { PalName, getBreedingPath } from "./logic/breedingCalc";

function App() {
  const [pal1, setPal1] = useState<(typeof palDex)[PalName] | null>(null);
  const [pal2, setPal2] = useState<(typeof palDex)[PalName] | null>(null);

  const onChange: React.ChangeEventHandler<HTMLSelectElement> = (event) => {
    const searchTarget = event.target.value;
    const dataRef = event.target.getAttribute("data-ref");
    const pal = palDex[searchTarget as PalName];

    if (!pal) {
      alert("here");
      return;
    }

    switch (dataRef) {
      case "1":
        setPal1(pal);
        break;
      case "2":
        setPal2(pal);
        break;
      default:
        break;
    }
  };

  const shortestPath = useMemo(() => {
    if (pal1 && pal2) {
      return getBreedingPath(pal1, pal2);
    }
  }, [pal1, pal2]);

  useEffect(() => {
    console.log({ from: pal1?.name, to: pal2?.name, shortestPath });
  }, [shortestPath]);

  return (
    <>
      <div className="flex flex-row w-96 justify-around bg-gray-600 border-gray-800 p-2 rounded-lg">
        <PalSelector onChange={onChange} palDex={palDex} label="Starting From" dataReference={1} />

        <PalSelector onChange={onChange} palDex={palDex} dataReference={2} label="Ending At" />
      </div>
      <br />
      {shortestPath &&
        shortestPath.map((step, index) => (
          <LineageStep
            key={index}
            prevPal={shortestPath[index - 1]?.pal || pal1!!.name}
            nextPal={step.pal}
            parentOptions={step.breedingOptions}
          />
        ))}
    </>
  );
}

export default App;
