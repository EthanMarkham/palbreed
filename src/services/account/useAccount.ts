import { useEffect, useSyncExternalStore } from "react";
import { accountService } from "./accountService";

export function useAccount() {
  useEffect(() => accountService.start(), []);
  return useSyncExternalStore(
    accountService.subscribe,
    accountService.getSnapshot,
    accountService.getSnapshot,
  );
}
