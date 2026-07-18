import { useEffect, useSyncExternalStore } from "react";
import { inventoryService } from "./inventoryService";

export function useInventory() {
  useEffect(() => inventoryService.start(), []);
  return useSyncExternalStore(
    inventoryService.subscribe,
    inventoryService.getSnapshot,
    inventoryService.getSnapshot,
  );
}
