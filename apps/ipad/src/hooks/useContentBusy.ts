import { useSyncExternalStore } from "react";
import { isContentBusy, onContentBusyChange } from "@/data/contentLock";

/** Whether a download, install, rollback or content check is running. */
export function useContentBusy(): boolean {
  return useSyncExternalStore(onContentBusyChange, isContentBusy);
}
