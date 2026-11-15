import { Network } from "@capacitor/network";
import { getPackageState } from "./packages";
import { provisioningReady } from "./provisioning";
import { getServerUrl } from "./settings";
import { checkForUpdate, UP_TO_DATE } from "./updater";

/**
 * A quiet check for new content on launch and on returning to the
 * foreground, so nobody has to remember to open Content updates.
 *
 * It only looks: nothing is ever downloaded automatically. It never runs
 * more than once every CHECK_INTERVAL_MS, never runs offline or without a
 * server, never holds up opening the installed content, and says nothing
 * when it fails. When a newer release is found, the home screen shows a
 * "new content available" link to Content updates until it is installed.
 */

export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const LAST_CHECK = "skillslab_auto_check_at";
const AVAILABLE = "skillslab_update_available";

export interface AvailableUpdate {
  releaseId: string;
  version: string;
}

const listeners = new Set<() => void>();
let running: Promise<void> | null = null;

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the indicator just won't persist.
  }
}

function setAvailable(update: AvailableUpdate | null): void {
  const next = update ? JSON.stringify(update) : null;
  if ((next ?? "") === read(AVAILABLE)) return;
  write(AVAILABLE, next);
  listeners.forEach((listener) => listener());
}

/** The newer release the last check found, if it still isn't installed. */
export function getAvailableUpdate(): AvailableUpdate | null {
  const raw = read(AVAILABLE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AvailableUpdate;
    return parsed.releaseId ? parsed : null;
  } catch {
    return null;
  }
}

export function subscribeAvailableUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Clears the indicator once the release it pointed at is installed. */
export async function syncAvailableUpdate(): Promise<void> {
  const available = getAvailableUpdate();
  if (!available) return;
  const state = await getPackageState().catch(() => null);
  if (state?.current?.releaseId === available.releaseId) setAvailable(null);
}

/**
 * Checks the server if one is configured, the device is online and the last
 * check was long enough ago. Never throws.
 */
export function autoCheckForUpdate(now: number = Date.now()): Promise<void> {
  running ??= (async () => {
    try {
      await provisioningReady();
      if (!getServerUrl()) return;
      const last = Number(read(LAST_CHECK)) || 0;
      if (now - last < CHECK_INTERVAL_MS) return;
      if (!(await Network.getStatus()).connected) return;

      write(LAST_CHECK, String(now));
      const result = await checkForUpdate();
      if (result.available) {
        setAvailable({ releaseId: result.manifest.release_id, version: result.manifest.release_version });
      } else if (result.reason === UP_TO_DATE) {
        setAvailable(null);
      }
      // Any other outcome (server down, bad certificate…) is left for the
      // Content updates screen to explain when someone opens it.
    } catch {
      // Silent by design.
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Runs the check now and whenever the app returns to the foreground. Started
 * after the installed content has opened, so it never delays it.
 */
export function startAutoCheck(): () => void {
  void syncAvailableUpdate().then(() => autoCheckForUpdate());
  const onVisibility = () => {
    if (document.visibilityState === "visible") void autoCheckForUpdate();
  };
  document.addEventListener("visibilitychange", onVisibility);
  return () => document.removeEventListener("visibilitychange", onVisibility);
}
