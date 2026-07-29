import { useEffect } from "react";
import { saveWatchService } from "./saveWatchService";

export default function SaveWatchRuntime() {
  useEffect(() => {
    saveWatchService.start();
    return () => saveWatchService.stop();
  }, []);
  return null;
}
