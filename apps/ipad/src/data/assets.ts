import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

export const CONTENT_DIR = "content";
export const ASSETS_SUBDIR = `${CONTENT_DIR}/assets`;

let contentBaseUrl = "";

export async function initAssets(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Filesystem.mkdir({ path: ASSETS_SUBDIR, directory: Directory.Documents, recursive: true });
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
