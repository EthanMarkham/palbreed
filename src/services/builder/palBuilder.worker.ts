import {
  buildPal,
  type BuilderInput,
  type BuilderResult,
} from "./palBuilder";

export type BuilderWorkerRequest = {
  input: BuilderInput;
};

export type BuilderWorkerResponse =
  | { status: "complete"; result: BuilderResult }
  | { status: "error"; message: string };

type BuilderWorkerScope = {
  onmessage: ((event: MessageEvent<BuilderWorkerRequest>) => void) | null;
  postMessage: (response: BuilderWorkerResponse) => void;
};

const workerScope = globalThis as unknown as BuilderWorkerScope;

workerScope.onmessage = ({ data }) => {
  try {
    workerScope.postMessage({ status: "complete", result: buildPal(data.input) });
  } catch (error) {
    workerScope.postMessage({
      status: "error",
      message: error instanceof Error ? error.message : "Please try the search again.",
    });
  }
};
