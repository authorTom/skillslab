// Upload helpers. Server-only — touches the filesystem.

import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "./db";
import { parseStoryboardFrames } from "./storyboard";
import type { ResourceType } from "./data";

/** Every upload a resource of this type owns (videos are remote, so none). */
export function resourceFilePaths(type: ResourceType, content: string): string[] {
  if (type === "video") return [];
  if (type === "storyboard") return parseStoryboardFrames(content).map((frame) => frame.src);
  return content ? [content] : [];
}

/** Resolves a `/files/…` path to disk, refusing anything outside the uploads dir. */
export function resolvePublicFile(publicPath: string): string | null {
  if (!publicPath.startsWith("/files/")) return null;
  const resolved = path.resolve(UPLOADS_DIR, publicPath.slice("/files/".length));
  return resolved.startsWith(UPLOADS_DIR + path.sep) ? resolved : null;
}

export function removePublicFile(publicPath: string) {
  const resolved = resolvePublicFile(publicPath);
  if (resolved) fs.rmSync(resolved, { force: true });
}

/** Size on disk in bytes, or 0 if the file is missing. */
export function publicFileSize(publicPath: string): number {
  const resolved = resolvePublicFile(publicPath);
  if (!resolved) return 0;
  try {
    return fs.statSync(resolved).size;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 || Number.isInteger(value) ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
