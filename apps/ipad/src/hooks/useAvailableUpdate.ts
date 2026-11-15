import { useSyncExternalStore } from "react";
import { getAvailableUpdate, subscribeAvailableUpdate, type AvailableUpdate } from "@/data/autoCheck";

let cached: { raw: string; value: AvailableUpdate | null } = { raw: "", value: null };

/** The release the background check found, kept stable between renders. */
function snapshot(): AvailableUpdate | null {
  const value = getAvailableUpdate();
  const raw = value ? `${value.releaseId}:${value.version}` : "";
  if (raw !== cached.raw) cached = { raw, value };
  return cached.value;
}

export function useAvailableUpdate(): AvailableUpdate | null {
  return useSyncExternalStore(subscribeAvailableUpdate, snapshot);
}
