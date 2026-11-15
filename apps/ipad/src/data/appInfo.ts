import { ContentPackage, canInstallFromFiles } from "./contentPackage";

export interface AppVersion {
  version: string;
  build: string | null;
}

/** "1.2.0 (14)", or just the version when there is no build number. */
export function formatAppVersion({ version, build }: AppVersion): string {
  return build ? `${version} (${build})` : version;
}

/**
 * The version of the app that is running: from the app bundle on an iPad,
 * or package.json's version in a browser during development.
 */
export async function getAppVersion(): Promise<AppVersion> {
  if (canInstallFromFiles()) {
    try {
      const { version, build } = await ContentPackage.appInfo();
      if (version) return { version, build: build || null };
    } catch {
      // An older native build without appInfo; fall back below.
    }
  }
  return { version: __APP_VERSION__, build: null };
}
