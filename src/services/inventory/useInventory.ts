import { useEffect, useSyncExternalStore } from "react";
import { inventoryService } from "./inventoryService";
import { startInventorySync } from "./inventorySync";

export function useInventory() {
  useEffect(() => {
    inventoryService.start();
    return startInventorySync();
  }, []);
  return useSyncExternalStore(
    inventoryService.subscribe,
    inventoryService.getSnapshot,
    inventoryService.getSnapshot,
  );
}
