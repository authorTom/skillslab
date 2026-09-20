import fs from "fs";
import path from "path";
import { RELEASES_DIR, type ExportResult } from "./export";
import type { ReleaseManifest } from "./schema";

export interface ReleaseSummary {
  id: string;
  version: string;
  createdAt: string;
  counts: ReleaseManifest["counts"];
  totalBytes: number;
  current: boolean;
}

const CURRENT_FILE = path.join(RELEASES_DIR, ".current");

function readCurrentId(): string | null {
  try {
    return fs.readFileSync(CURRENT_FILE, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

function writeCurrentId(id: string): void {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  fs.writeFileSync(CURRENT_FILE, id);
}

function readManifest(releaseDir: string): ReleaseManifest | null {
  const p = path.join(releaseDir, "manifest.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export function listReleases(): ReleaseSummary[] {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
  const currentId = readCurrentId();
  const entries = fs.readdirSync(RELEASES_DIR, { withFileTypes: true });
  const releases: ReleaseSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const manifest = readManifest(path.join(RELEASES_DIR, entry.name));
    if (!manifest) continue;
    releases.push({
      id: manifest.release_id,
      version: manifest.release_version,
      createdAt: manifest.created_at,
      counts: manifest.counts,
      totalBytes: manifest.total_uncompressed_bytes,
      current: manifest.release_id === currentId,
    });
  }

  releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return releases;
}

export function getRelease(id: string): { manifest: ReleaseManifest; dir: string } | null {
  const sanitised = id.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(RELEASES_DIR, sanitised);
  if (!fs.existsSync(dir)) return null;
  const manifest = readManifest(dir);
  if (!manifest) return null;
  return { manifest, dir };
}

export function getCurrentRelease(): { manifest: ReleaseManifest; dir: string } | null {
  const id = readCurrentId();
  if (!id) return null;
  return getRelease(id);
}

export function markCurrent(result: ExportResult): void;
export function markCurrent(id: string): void;
export function markCurrent(idOrResult: string | ExportResult): void {
  const id = typeof idOrResult === "string" ? idOrResult : idOrResult.releaseId;
  const release = getRelease(id);
  if (!release) throw new Error(`Release ${id} not found`);
  writeCurrentId(id);
}

export function deleteRelease(id: string): boolean {
  const release = getRelease(id);
  if (!release) return false;
  const currentId = readCurrentId();
  if (currentId === id) {
    try { fs.unlinkSync(CURRENT_FILE); } catch {}
  }
  fs.rmSync(release.dir, { recursive: true, force: true });
  return true;
}

export function enforceRetention(keep: number = 5): string[] {
  const releases = listReleases();
  const currentId = readCurrentId();
  const removed: string[] = [];
  const candidates = releases.filter((r) => r.id !== currentId);
  const toRemove = candidates.slice(keep);
  for (const r of toRemove) {
    deleteRelease(r.id);
    removed.push(r.id);
  }
  return removed;
}
