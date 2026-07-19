import { useEffect, useSyncExternalStore } from "react";
import {
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
    builderHistoryService.start();
  }, []);

  return entries;
}
