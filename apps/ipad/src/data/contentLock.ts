import { canInstallFromFiles, ContentPackage } from "./contentPackage";

/**
 * One content operation at a time. Downloading, installing from a file,
 * rolling back and checking the installed files all share the staging
 * folder, the live catalogue or the native copier, so two at once would
 * break each other. While one runs the iPad is kept from auto-locking,
 * which would suspend the app and the transfer with it.
 */

export const CONTENT_BUSY = "Another content update is still running. Wait for it to finish, then try again.";

let running = false;
const listeners = new Set<() => void>();

export function isContentBusy(): boolean {
  return running;
}

/** Called whenever an operation starts or finishes. Returns an unsubscribe. */
export function onContentBusyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setRunning(value: boolean) {
  running = value;
  for (const listener of listeners) listener();
  if (canInstallFromFiles()) void ContentPackage.keepAwake({ on: value }).catch(() => {});
}

/** Run `operation` exclusively, or throw CONTENT_BUSY if another is running. */
export async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  if (running) throw new Error(CONTENT_BUSY);
  setRunning(true);
  try {
    return await operation();
  } finally {
    setRunning(false);
  }
}
