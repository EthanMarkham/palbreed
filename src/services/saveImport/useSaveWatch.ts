import { useSyncExternalStore } from "react";
import { saveWatchService } from "./saveWatchService";

export function useSaveWatch() {
  return useSyncExternalStore(
    saveWatchService.subscribe,
    saveWatchService.getSnapshot,
    saveWatchService.getSnapshot,
  );
}
