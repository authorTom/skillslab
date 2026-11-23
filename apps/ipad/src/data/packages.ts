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

async function fileExists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Documents });
    return true;
  } catch {
    return false;
  }
}

/**
 * Move each staged asset into the content folder, replacing any damaged copy
 * there, and check that every asset the release needs is present. Moving
 * rather than copying means a large video needs room on the iPad once, not
 * twice.
 */
async function placeAssets(manifest: ReleaseManifest): Promise<void> {
  await ensureDir(ASSETS_SUBDIR, Directory.Documents);
  const paths = [...new Set(manifest.assets.map((a) => a.path))];
  for (const path of paths) {
    const staged = `${STAGING_DIR}/${path}`;
    const active = `${CONTENT_DIR}/${path}`;
    if (await fileExists(staged)) {
      await Filesystem.deleteFile({ path: active, directory: Directory.Documents }).catch(() => {});
      await Filesystem.rename({
        from: staged,
        to: active,
        directory: Directory.Documents,
        toDirectory: Directory.Documents,
      });
    } else if (!(await fileExists(active))) {
      throw new Error(`${path} is missing from the content, so it wasn’t installed. Try again.`);
    }
  }
}

/**
 * The files in the assets folder that no kept release uses. Returns nothing
 * when `keep` is null, which means a kept release's file list is unknown and
 * nothing can safely be deleted.
 */
export function assetsToPrune(fileNames: string[], keep: ReleaseManifest[] | null): string[] {
  if (!keep) return [];
  const used = new Set(keep.flatMap((m) => m.assets.map((a) => a.path.replace(/^assets\//, ""))));
  return fileNames.filter((name) => !used.has(name));
}

/** The previous release's manifest, if it's on the iPad and really is that release's. */
async function readPreviousManifest(releaseId: string): Promise<ReleaseManifest | null> {
  try {
    const result = await Filesystem.readFile({
      path: PREVIOUS_MANIFEST_FILE,
      directory: Directory.Documents,
      encoding: "utf8" as never,
    });
    const manifest = JSON.parse(result.data as string) as ReleaseManifest;
    return manifest.release_id === releaseId && Array.isArray(manifest.assets) ? manifest : null;
  } catch {
    return null;
  }
}

/**
 * Delete assets used by neither the active release nor the one kept for
 * rollback. Without this, every replaced video would stay on the iPad for
 * good.
 */
async function pruneAssets(
  active: ReleaseManifest,
  previous: PackageState["previous"]
): Promise<void> {
  try {
    let keep: ReleaseManifest[] | null = [active];
    if (previous) {
      const previousManifest = await readPreviousManifest(previous.releaseId);
      keep = previousManifest ? [active, previousManifest] : null;
    }
    const { files } = await Filesystem.readdir({ path: ASSETS_SUBDIR, directory: Directory.Documents });
    const names = files.filter((f) => f.type !== "directory").map((f) => f.name);
    for (const name of assetsToPrune(names, keep)) {
      await Filesystem.deleteFile({ path: `${ASSETS_SUBDIR}/${name}`, directory: Directory.Documents }).catch(
        () => {}
      );
    }
  } catch {
    // Pruning only frees space; the install has already succeeded.
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

  // Put every asset in place before touching the live catalogue. Assets are
  // content-addressed, so new files sit harmlessly beside the old release's,
  // and a missing or unmovable file stops the install here, with the
  // installed content still intact.
  await placeAssets(manifest);

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

  if (!options.repair) {
    // Without the outgoing manifest, an older previous-manifest.json would be
    // left describing the wrong release; drop it instead.
    await Filesystem.copy({
      from: MANIFEST_FILE,
      directory: Directory.Documents,
      to: PREVIOUS_MANIFEST_FILE,
      toDirectory: Directory.Documents,
    }).catch(() =>
      Filesystem.deleteFile({ path: PREVIOUS_MANIFEST_FILE, directory: Directory.Documents }).catch(() => {})
    );
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

  // Free the space held by releases that can no longer be shown or rolled
  // back to. Best effort: a file left behind only costs space.
  await pruneAssets(manifest, options.repair ? state.previous : state.current);

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
