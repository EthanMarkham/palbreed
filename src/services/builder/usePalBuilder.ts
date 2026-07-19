import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderInput, BuilderResult } from "./palBuilder";
import type {
  BuilderWorkerRequest,
  BuilderWorkerResponse,
} from "./palBuilder.worker";

export type BuilderSolveState =
  | { status: "idle" }
  | { status: "solving" }
  | { status: "complete"; result: BuilderResult }
  | { status: "error"; message: string };

type SettledAttempt = {
  input: BuilderInput;
  attempt: number;
  response: BuilderWorkerResponse;
};

export function usePalBuilder(input: BuilderInput | undefined): BuilderSolveState & {
  cancel: () => void;
  restart: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [cancelledInput, setCancelledInput] = useState<BuilderInput>();
  const [settled, setSettled] = useState<SettledAttempt>();
  const workerRef = useRef<Worker>();
  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = undefined;
    setCancelledInput(input);
  }, [input]);
  const restart = useCallback(() => {
    setCancelledInput(undefined);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!input || cancelledInput === input) return;

    let active = true;
    const worker = new Worker(new URL("./palBuilder.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    const request: BuilderWorkerRequest = { input };

    worker.onmessage = ({ data }: MessageEvent<BuilderWorkerResponse>) => {
      if (!active) return;
      setSettled({ input, attempt, response: data });
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = undefined;
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (!active) return;
      setSettled({
        input,
        attempt,
        response: {
          status: "error",
          message: event.message || "Please try the search again.",
        },
      });
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = undefined;
    };
    worker.postMessage(request);

    return () => {
      active = false;
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = undefined;
    };
  }, [attempt, cancelledInput, input]);

  if (!input || cancelledInput === input) return { status: "idle", cancel, restart };
  if (settled?.input !== input || settled.attempt !== attempt) {
    return { status: "solving", cancel, restart };
  }
  if (settled.response.status === "error") {
    return { status: "error", message: settled.response.message, cancel, restart };
  }
  return { status: "complete", result: settled.response.result, cancel, restart };
}
