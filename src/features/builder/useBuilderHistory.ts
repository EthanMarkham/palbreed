import { useEffect, useSyncExternalStore } from "react";
import {
  BUILDER_HISTORY_STORAGE_KEY,
  builderHistoryService,
  type BuilderHistoryEntry,
} from "./builderHistory";

const EMPTY_HISTORY: readonly BuilderHistoryEntry[] = [];

export function useBuilderHistory(): readonly BuilderHistoryEntry[] {
  const entries = useSyncExternalStore(
    builderHistoryService.subscribe,
    builderHistoryService.getSnapshot,
    () => EMPTY_HISTORY,
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === BUILDER_HISTORY_STORAGE_KEY) {
        builderHistoryService.reload();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return entries;
}
