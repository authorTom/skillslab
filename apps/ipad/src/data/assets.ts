import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

const ASSETS_DIR = "content/assets";

let assetsBaseUrl = "";

export async function initAssets(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const result = await Filesystem.getUri({
      path: ASSETS_DIR,
      directory: Directory.Documents,
    });
    assetsBaseUrl = Capacitor.convertFileSrc(result.uri);
  } catch {
    assetsBaseUrl = "";
  }
}

export function assetUrl(filename: string | null): string {
  if (!filename) return "";
  if (assetsBaseUrl) return `${assetsBaseUrl}/${filename}`;
  return "";
}
