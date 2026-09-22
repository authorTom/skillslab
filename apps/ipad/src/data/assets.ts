import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

export const CONTENT_DIR = "content";
export const ASSETS_SUBDIR = `${CONTENT_DIR}/assets`;

let contentBaseUrl = "";

/**
 * mkdir -p. The iOS Filesystem plugin rejects mkdir on an existing directory
 * even with `recursive: true`, so an existing directory counts as success.
 */
export async function ensureDir(path: string, directory: Directory): Promise<void> {
  try {
    await Filesystem.mkdir({ path, directory, recursive: true });
  } catch (err) {
    const stat = await Filesystem.stat({ path, directory }).catch(() => null);
    if (stat?.type !== "directory") throw err;
  }
}

export async function initAssets(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensureDir(ASSETS_SUBDIR, Directory.Documents);
    const result = await Filesystem.getUri({
      path: CONTENT_DIR,
      directory: Directory.Documents,
    });
    contentBaseUrl = Capacitor.convertFileSrc(result.uri);
  } catch {
    contentBaseUrl = "";
  }
}

export function assetUrl(assetPath: string | null): string {
  if (!assetPath) return "";
  if (contentBaseUrl) return `${contentBaseUrl}/${assetPath}`;
  return "";
}

export async function assetFileExists(assetPath: string): Promise<boolean> {
  try {
    await Filesystem.stat({
      path: `${CONTENT_DIR}/${assetPath}`,
      directory: Directory.Documents,
    });
    return true;
  } catch {
    return false;
  }
}
