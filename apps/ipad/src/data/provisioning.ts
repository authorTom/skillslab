import { canInstallFromFiles, ContentPackage } from "./contentPackage";

/**
 * Where the server URL and the signing public key come from, so iPads can be
 * set up without typing on each one. Each is taken from the first of:
 *
 *   1. managed app configuration pushed by an MDM (keys `serverUrl` and
 *      `signingPublicKey`), read through the native plugin;
 *   2. defaults built into the app (VITE_SERVER_URL, VITE_SIGNING_PUBLIC_KEY);
 *   3. what was entered in the app.
 *
 * A value from 1 or 2 is shown read-only, and the signing key can't then be
 * cleared or replaced in the app. Managed configuration is read at launch and
 * again whenever the app returns to the foreground, as an MDM can change it
 * at any time. See docs/ipad-distribution.md.
 */

export type SettingSource = "managed" | "build" | "app";

export interface ResolvedSetting {
  value: string;
  /** Null when nothing is set anywhere. */
  source: SettingSource | null;
}

export interface ManagedConfig {
  serverUrl?: string;
  signingPublicKey?: string;
}

/** The first non-empty value, in priority order. */
export function resolveSetting(managed: string | undefined, build: string | undefined, app: string): ResolvedSetting {
  for (const [value, source] of [
    [managed, "managed"],
    [build, "build"],
    [app, "app"],
  ] as const) {
    const trimmed = value?.trim();
    if (trimmed) return { value: trimmed, source };
  }
  return { value: "", source: null };
}

/** Build-time defaults, read at call time so tests can stub them. */
export function buildDefaults(): ManagedConfig {
  return {
    serverUrl: import.meta.env.VITE_SERVER_URL?.trim() || undefined,
    signingPublicKey: import.meta.env.VITE_SIGNING_PUBLIC_KEY?.trim() || undefined,
  };
}

let managed: ManagedConfig = {};
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function getManagedConfig(): ManagedConfig {
  return managed;
}

/** Reads managed configuration from the device (nothing in a browser). */
export function loadManagedConfig(): Promise<void> {
  loading = (async () => {
    let next: ManagedConfig = {};
    if (canInstallFromFiles()) {
      try {
        const config = await ContentPackage.managedConfig();
        next = {
          serverUrl: config.serverUrl || undefined,
          signingPublicKey: config.signingPublicKey || undefined,
        };
      } catch {
        // An older native build without managedConfig: nothing managed.
      }
    }
    if (next.serverUrl !== managed.serverUrl || next.signingPublicKey !== managed.signingPublicKey) {
      managed = next;
      version++;
      listeners.forEach((listener) => listener());
    }
  })();
  return loading;
}

/**
 * Resolves once managed configuration has been read at least once, so a
 * signature check never runs on the in-app key before the MDM's has loaded.
 */
export function provisioningReady(): Promise<void> {
  return loading ?? loadManagedConfig();
}

/** Re-reads managed configuration each time the app comes back to the front. */
export function watchManagedConfig(): () => void {
  const onVisibility = () => {
    if (document.visibilityState === "visible") void loadManagedConfig();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}

/** For useSyncExternalStore: changes whenever managed configuration does. */
export function subscribeProvisioning(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function provisioningVersion(): number {
  return version;
}

/** Test hook: forget what was loaded. */
export function resetProvisioning(): void {
  managed = {};
  loading = null;
  version++;
}

export const SOURCE_LABELS: Record<SettingSource, string> = {
  managed: "Set by your organisation’s device management",
  build: "Built into this version of the app",
  app: "Entered on this iPad",
};
