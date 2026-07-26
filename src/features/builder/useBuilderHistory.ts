import { useEffect, useSyncExternalStore } from "react";
import {
  builderHistoryService,
  type BuilderHistoryEntry,
  type PopularBuilderSearch,
} from "./builderHistory";

const EMPTY_HISTORY: readonly BuilderHistoryEntry[] = [];
const EMPTY_POPULAR: readonly PopularBuilderSearch[] = [];

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

export function usePopularBuilderSearches(): readonly PopularBuilderSearch[] {
  const entries = useSyncExternalStore(
    builderHistoryService.subscribe,
    builderHistoryService.getPopularSnapshot,
    () => EMPTY_POPULAR,
  );

  useEffect(() => {
    builderHistoryService.start();
  }, []);

  return entries;
}
