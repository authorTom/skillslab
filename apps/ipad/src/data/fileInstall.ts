import { listMedia } from "./catalogue";
import {
  ContentPackage,
  type CopyProgress,
  type FileProblem,
  type FileSpec,
  type OpenedPackage,
} from "./contentPackage";
import { activate, cleanStaging, getPackageState, readInstalledManifest, validateManifest } from "./packages";
import { verifySignature } from "./signature";
import type { ReleaseManifest } from "./types";

/**
 * Installing a content package from a file or folder (a USB drive, AirDrop,
 * Files, or the app's import folder), and checking the installed files.
 */

/** Room to leave free after installing; the native side refuses below it. */
export const SPACE_MARGIN = 200 * 1024 * 1024;

/** How the package relates to what's installed. */
export type InstallKind = "new" | "older" | "repair";

export interface PackageCandidate {
  id: string;
  name: string;
  manifest: ReleaseManifest;
  kind: InstallKind;
  /** Only what isn't already installed: assets are content-addressed, so
   *  files shared with the installed release are kept. */
  files: FileSpec[];
  copyBytes: number;
  freeBytes: number;
  /** For a repair, how many installed files are missing or damaged. */
  damagedCount: number;
}

/** The catalogue, then each asset once, as the manifest describes them. */
export function manifestFiles(manifest: ReleaseManifest): FileSpec[] {
  const files: FileSpec[] = [
    { path: "catalogue.sqlite", bytes: manifest.catalogue.bytes, sha256: manifest.catalogue.sha256 },
  ];
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (seen.has(asset.path)) continue;
    seen.add(asset.path);
    files.push({ path: asset.path, bytes: asset.bytes, sha256: asset.sha256 });
  }
  return files;
}

export function installKind(manifest: ReleaseManifest, current: { releaseId: string; createdAt: string } | null): InstallKind {
  if (current?.releaseId === manifest.release_id) return "repair";
  if (current?.createdAt && manifest.created_at && manifest.created_at < current.createdAt) return "older";
  return "new";
}

export function hasEnoughSpace(candidate: Pick<PackageCandidate, "copyBytes" | "freeBytes">): boolean {
  return candidate.freeBytes >= candidate.copyBytes + SPACE_MARGIN;
}

/**
 * Read and check an opened package's manifest, and work out what installing
 * it would copy. On any problem the package is closed and the error thrown.
 */
export async function prepareCandidate(opened: OpenedPackage): Promise<PackageCandidate> {
  try {
    let manifest: ReleaseManifest;
    try {
      manifest = JSON.parse(opened.manifest);
    } catch {
      throw new Error("The package’s manifest.json can’t be read.");
    }
    const errors = validateManifest(manifest);
    if (errors.length > 0) throw new Error(errors.join(" "));
    const signature = await verifySignature(manifest);
    if (!signature.valid) throw new Error(signature.reason);

    const state = await getPackageState();
    const kind = installKind(manifest, state.current);
    const [catalogue, ...assets] = manifestFiles(manifest);

    // A repair reads every installed file to find damage; otherwise a file
    // of the right size is taken as already installed.
    const { problems } = await ContentPackage.verify({
      directory: "content",
      files: assets,
      checkHashes: kind === "repair",
    });
    const needed = new Set(problems.map((p) => p.path));
    const files = [catalogue, ...assets.filter((a) => needed.has(a.path))];
    const { bytes: freeBytes } = await ContentPackage.freeSpace();

    return {
      id: opened.id,
      name: opened.name,
      manifest,
      kind,
      files,
      copyBytes: files.reduce((n, f) => n + f.bytes, 0),
      freeBytes,
      damagedCount: kind === "repair" ? needed.size : 0,
    };
  } catch (err) {
    await ContentPackage.close({ id: opened.id }).catch(() => {});
    throw err;
  }
}

/** Copy the package's files into staging, checking each, then activate. */
export async function installCandidate(
  candidate: PackageCandidate,
  onProgress: (progress: CopyProgress) => void
): Promise<void> {
  const listener = await ContentPackage.addListener("installProgress", onProgress);
  try {
    await cleanStaging();
    await ContentPackage.install({ id: candidate.id, files: candidate.files, directory: "staging" });
    await activate(candidate.manifest, { repair: candidate.kind === "repair" });
  } catch (err) {
    await cleanStaging();
    throw err;
  } finally {
    await listener.remove();
  }
}

export function closeCandidate(candidate: PackageCandidate): Promise<void> {
  return ContentPackage.close({ id: candidate.id }).catch(() => {});
}

export interface ContentProblem {
  path: string;
  problem: FileProblem;
  /** The media item's title or filename. */
  label: string;
}

const HASH_IN_PATH = /^assets\/([0-9a-f]{64})(?:\.|$)/;

/**
 * Check every installed media file against the installed manifest, or for
 * content installed before the app kept one, against the catalogue (asset
 * names are their SHA-256).
 */
export async function checkContent(
  onProgress: (progress: CopyProgress) => void
): Promise<{ checked: number; problems: ContentProblem[] }> {
  const media = await listMedia();
  const labels = new Map(media.map((m) => [m.asset, m.title || m.filename]));

  const manifest = await readInstalledManifest();
  let files: FileSpec[];
  // The catalogue records each upload's size, which can differ from the
  // exported file, so without a manifest only the hash is checked.
  const checkSizes = manifest !== null;
  if (manifest) {
    files = manifestFiles(manifest).slice(1);
  } else {
    const seen = new Set<string>();
    files = [];
    for (const m of media) {
      if (!m.asset || seen.has(m.asset)) continue;
      seen.add(m.asset);
      files.push({ path: m.asset, bytes: m.bytes, sha256: HASH_IN_PATH.exec(m.asset)?.[1] });
    }
  }

  const listener = await ContentPackage.addListener("verifyProgress", onProgress);
  try {
    const { problems } = await ContentPackage.verify({ directory: "content", files, checkHashes: true, checkSizes });
    return {
      checked: files.length,
      problems: problems.map((p) => ({ ...p, label: labels.get(p.path) ?? p.path.replace(/^assets\//, "") })),
    };
  } finally {
    await listener.remove();
  }
}
