import { Filesystem, Directory } from "@capacitor/filesystem";
import { closeCatalogue, openCatalogue } from "./catalogue";
import { initAssets, ensureDir, CONTENT_DIR, ASSETS_SUBDIR } from "./assets";
import { isSignatureEnforced, verifySignature } from "./signature";
import type { ReleaseManifest } from "./types";

const STAGING_DIR = "staging";
const STATE_FILE = `${CONTENT_DIR}/state.json`;
/** The installed release's manifest, for checking its files later. */
const MANIFEST_FILE = `${CONTENT_DIR}/manifest.json`;
const PREVIOUS_MANIFEST_FILE = `${CONTENT_DIR}/previous-manifest.json`;
const CATALOGUE_PLUGIN_PATH = "CapacitorDatabase/catalogueSQLite.db";

const SUPPORTED_PACKAGE_FORMAT = "skillslab-content";
const MAX_CONTENT_SCHEMA_VERSION = 1;

interface PackageState {
  current: { releaseId: string; version: string; createdAt: string } | null;
  previous: { releaseId: string; version: string; createdAt: string } | null;
}

export async function getPackageState(): Promise<PackageState> {
  try {
    const result = await Filesystem.readFile({
      path: STATE_FILE,
      directory: Directory.Documents,
      encoding: "utf8" as never,
    });
    return JSON.parse(result.data as string);
  } catch {
    return { current: null, previous: null };
  }
}

async function savePackageState(state: PackageState): Promise<void> {
  await Filesystem.writeFile({
    path: STATE_FILE,
    directory: Directory.Documents,
    data: JSON.stringify(state, null, 2),
    encoding: "utf8" as never,
    recursive: true,
  });
}

export function validateManifest(manifest: ReleaseManifest): string[] {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    return ["Manifest is not a JSON object."];
  }
  if (manifest.format !== SUPPORTED_PACKAGE_FORMAT) {
    errors.push(`Unsupported package format: "${manifest.format}".`);
  }
  if (manifest.content_schema_version > MAX_CONTENT_SCHEMA_VERSION) {
    errors.push(
      `Content schema version ${manifest.content_schema_version} requires a newer app (this app supports up to ${MAX_CONTENT_SCHEMA_VERSION}).`
    );
  }
  if (!manifest.release_id || !manifest.release_version) {
    errors.push("Manifest is missing release_id or release_version.");
  }
  if (!manifest.catalogue?.filename) {
    errors.push("Manifest is missing catalogue information.");
  }
  if (!Array.isArray(manifest.assets)) {
    errors.push("Manifest is missing assets list.");
  } else {
    // Asset paths become file paths on the iPad, and the signature covers
    // only each asset's hash, so a path must be the content-addressed name
    // the CMS gives it: assets/<sha256>[.ext]. That keeps every write inside
    // the content folder and ties the path to the signed hash.
    const bad = manifest.assets.find((a) => {
      const match = /^assets\/([0-9a-f]{64})(\.[^/\\.]*)?$/.exec(a?.path ?? "");
      return !match || match[1] !== a.sha256;
    });
    if (bad) {
      errors.push(`Manifest has an invalid asset path: "${bad?.path}".`);
    }
  }

  return errors;
}

export async function writeStagingFile(
  relativePath: string,
  data: string | Blob,
  encoding?: string
): Promise<void> {
  const path = `${STAGING_DIR}/${relativePath}`;
  await Filesystem.writeFile({
    path,
    directory: Directory.Documents,
    data: data as string,
    recursive: true,
    ...(encoding ? { encoding: encoding as never } : {}),
  });
}

export async function stagingFileExists(relativePath: string): Promise<boolean> {
  try {
    await Filesystem.stat({
      path: `${STAGING_DIR}/${relativePath}`,
      directory: Directory.Documents,
    });
    return true;
  } catch {
    return false;
  }
}

export async function cleanStaging(): Promise<void> {
  try {
    await Filesystem.rmdir({
      path: STAGING_DIR,
      directory: Directory.Documents,
      recursive: true,
    });
  } catch {
    // Directory might not exist
  }
}

/** Hex SHA-256 of a file in Documents, or null where Web Crypto is missing. */
async function stagedFileSha256(path: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const { data } = await Filesystem.readFile({ path, directory: Directory.Documents });
  let bytes: Uint8Array<ArrayBuffer>;
  if (typeof data === "string") {
    const bin = atob(data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new Uint8Array(await data.arrayBuffer());
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The manifest of the installed release, if it was installed by a version
 *  of the app that keeps one. */
export async function readInstalledManifest(): Promise<ReleaseManifest | null> {
  try {
    const result = await Filesystem.readFile({
      path: MANIFEST_FILE,
      directory: Directory.Documents,
      encoding: "utf8" as never,
    });
    return JSON.parse(result.data as string) as ReleaseManifest;
  } catch {
    return null;
  }
}

export interface ActivateOptions {
  /**
   * Reinstalling the release that is already active, to replace missing or
   * damaged files. The rollback backup and history are left as they are,
   * since overwriting them with the same release would lose the real
   * previous one.
   */
  repair?: boolean;
}

export async function activate(manifest: ReleaseManifest, options: ActivateOptions = {}): Promise<void> {
  const sigResult = await verifySignature(manifest);
  if (!sigResult.valid) {
    throw new Error(sigResult.reason);
  }

  // The signature vouches for the manifest's hashes, so the catalogue that
  // is about to replace the live one must match its hash. (Assets are only
  // size-checked: hashing large videos would mean reading them into memory.)
  const catalogueHash = await stagedFileSha256(`${STAGING_DIR}/catalogue.sqlite`);
  if (catalogueHash === null) {
    if (isSignatureEnforced()) {
      throw new Error("This device can’t verify the content catalogue.");
    }
  } else if (catalogueHash !== manifest.catalogue.sha256) {
    throw new Error("The content catalogue doesn’t match the package manifest.");
  }

  const state = await getPackageState();

  await closeCatalogue();

  // Back up current catalogue for rollback
  if (state.current && !options.repair) {
    try {
      await Filesystem.copy({
        from: CATALOGUE_PLUGIN_PATH,
        directory: Directory.Library,
        to: `${CONTENT_DIR}/previous-catalogue.sqlite`,
        toDirectory: Directory.Documents,
      });
    } catch {
      // No existing catalogue to back up (first import)
    }
  }

  // Ensure the plugin's database directory exists
  await ensureDir("CapacitorDatabase", Directory.Library);

  // Copy staged catalogue to the SQLite plugin's location
  await Filesystem.copy({
    from: `${STAGING_DIR}/catalogue.sqlite`,
    directory: Directory.Documents,
    to: CATALOGUE_PLUGIN_PATH,
    toDirectory: Directory.Library,
  });

  // Copy staged assets to the active content directory
  await ensureDir(ASSETS_SUBDIR, Directory.Documents);

  for (const asset of manifest.assets) {
    const stagingPath = `${STAGING_DIR}/${asset.path}`;
    const activePath = `${CONTENT_DIR}/${asset.path}`;
    try {
      await Filesystem.copy({
        from: stagingPath,
        directory: Directory.Documents,
        to: activePath,
        toDirectory: Directory.Documents,
      });
    } catch {
      // Asset might already exist from a previous release (content-addressed)
    }
  }

  if (!options.repair) {
    await Filesystem.copy({
      from: MANIFEST_FILE,
      directory: Directory.Documents,
      to: PREVIOUS_MANIFEST_FILE,
      toDirectory: Directory.Documents,
    }).catch(() => {});
  }
  await Filesystem.writeFile({
    path: MANIFEST_FILE,
    directory: Directory.Documents,
    data: JSON.stringify(manifest),
    encoding: "utf8" as never,
    recursive: true,
  });

  if (!options.repair) {
    const newState: PackageState = {
      current: {
        releaseId: manifest.release_id,
        version: manifest.release_version,
        createdAt: manifest.created_at,
      },
      previous: state.current,
    };
    await savePackageState(newState);
  }

  // Clean up staging
  await cleanStaging();

  // Reinitialise the asset URL base and reopen catalogue
  await initAssets();
  await openCatalogue();
}

export async function rollback(): Promise<void> {
  const state = await getPackageState();
  if (!state.previous) {
    throw new Error("No previous release to roll back to.");
  }

  await closeCatalogue();

  // Restore previous catalogue
  try {
    await Filesystem.copy({
      from: `${CONTENT_DIR}/previous-catalogue.sqlite`,
      directory: Directory.Documents,
      to: CATALOGUE_PLUGIN_PATH,
      toDirectory: Directory.Library,
    });
  } catch {
    throw new Error("Previous catalogue backup not found.");
  }

  // Its manifest too, if the app kept one; otherwise drop the newer one so
  // the content check falls back to the catalogue.
  await Filesystem.copy({
    from: PREVIOUS_MANIFEST_FILE,
    directory: Directory.Documents,
    to: MANIFEST_FILE,
    toDirectory: Directory.Documents,
  }).catch(() => Filesystem.deleteFile({ path: MANIFEST_FILE, directory: Directory.Documents }).catch(() => {}));

  // Update state (previous becomes current, no further rollback)
  const newState: PackageState = {
    current: state.previous,
    previous: null,
  };
  await savePackageState(newState);

  await initAssets();
  await openCatalogue();
}
