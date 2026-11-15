import { useSyncExternalStore } from "react";
import { provisioningVersion, subscribeProvisioning } from "@/data/provisioning";

/** Re-renders whenever the MDM's managed configuration changes. */
export function useProvisioning(): number {
  return useSyncExternalStore(subscribeProvisioning, provisioningVersion);
}
