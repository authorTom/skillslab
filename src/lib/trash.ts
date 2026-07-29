// Recycle bin: soft-delete, restore and purge. Server-only — purging a library
// file removes it from disk, which is how storage is actually reclaimed.
//
// Courses and resources reference library files rather than owning them, so
// binning one never touches a file. Only a binned media item still holds one.

import {
  addTrashRow,
  deleteResource,
  deleteSkill,
  deleteTrashRow,
  expiredTrash,
  getSkillById,
  getTrashRow,
  listResources,
  listTrash,
  mediaExists,
  restoreResourceSnapshot,
  restoreSkillSnapshot,
  setSkillThumbnail,
  type Resource,
  type ResourceSnapshot,
  type Skill,
  type SkillSnapshot,
  type ThumbnailSnapshot,
  type TrashRow,
} from "./data";
import { formatBytes } from "./files";
import {
  deleteMediaRow,
  removeStorageFile,
  restoreMediaRow,
  storageNameInUse,
  tagsFor,
  type Media,
  type MediaItem,
} from "./media";
import { MEDIA_KIND_LABELS } from "./media-types";
import { RESOURCE_TYPE_LABELS } from "./resource-types";
import { categoryPath } from "./taxonomy";

export type RestoreResult = { ok: true; message: string } | { ok: false; error: string };

/** A binned library file, kept with its tags so a restore is complete. */
export interface MediaSnapshot {
  media: Media;
  tags: string[];
}

/* ----------------------------- moving in ------------------------------ */

/** Soft-deletes a skill: it and all its resources become one restorable entry. */
export function trashSkill(skill: Skill) {
  const resources = listResources(skill.id);
  const snapshot: SkillSnapshot = {
    id: skill.id,
    slug: skill.slug,
    title: skill.title,
    category: skill.category_name ?? "",
    group: skill.group_name ?? "",
    description: skill.description,
    thumbnail_media_id: skill.thumbnail_media_id,
    created_at: skill.created_at,
    resources: resources.map((r) => ({
      type: r.type,
      title: r.title,
      content: r.content,
      position: r.position,
    })),
  };
  const detail = [
    categoryPath(skill.group_name, skill.category_name),
    resources.length === 1 ? "1 resource" : `${resources.length} resources`,
  ].join(" · ");

  addTrashRow("skill", skill.title, detail, snapshot);
  deleteSkill(skill.id);
}

/** Soft-deletes a single resource. Its files stay in the library. */
export function trashResource(resource: Resource) {
  const skill = getSkillById(resource.skill_id);
  addTrashRow(
    "resource",
    resource.title,
    `${RESOURCE_TYPE_LABELS[resource.type]} · ${skill?.title ?? "Unknown course"}`,
    resourceSnapshot(resource, skill?.title ?? "")
  );
  deleteResource(resource.id);
}

/** Keeps a note of a replaced or removed course thumbnail. */
export function trashThumbnail(skill: Skill) {
  if (!skill.thumbnail_media_id) return;
  const snapshot: ThumbnailSnapshot = {
    skill_id: skill.id,
    skill_title: skill.title,
    thumbnail_media_id: skill.thumbnail_media_id,
  };
  addTrashRow("thumbnail", `Thumbnail — ${skill.title}`, "Course thumbnail", snapshot);
}

/**
 * Removes a file from the library. The row goes, but the file stays on disk
 * until the bin entry is purged, so a mistaken delete is recoverable.
 */
export function trashMedia(media: MediaItem) {
  const snapshot: MediaSnapshot = { media: mediaRecord(media), tags: tagsFor(media.id) };
  addTrashRow(
    "media",
    media.filename,
    `${MEDIA_KIND_LABELS[media.kind]} · ${formatBytes(media.bytes)}`,
    snapshot
  );
  deleteMediaRow(media.id);
}

/**
 * Keeps the file a "replace" swapped out. The live item keeps its id and its
 * place in every course; this entry holds the old file, so restoring it adds
 * that version back to the library as an item of its own.
 */
export function trashReplacedMedia(previous: Media, tags: string[]) {
  addTrashRow(
    "media",
    previous.filename,
    `Previous version · ${MEDIA_KIND_LABELS[previous.kind]} · ${formatBytes(previous.bytes)}`,
    { media: previous, tags } satisfies MediaSnapshot
  );
}

function mediaRecord(media: MediaItem): Media {
  const { id, folder_id, storage_name, filename, title, alt, kind, mime, bytes, width, height, created_at } =
    media;
  return { id, folder_id, storage_name, filename, title, alt, kind, mime, bytes, width, height, created_at };
}

function resourceSnapshot(resource: Resource, skillTitle: string): ResourceSnapshot {
  return {
    skill_id: resource.skill_id,
    skill_title: skillTitle,
    type: resource.type,
    title: resource.title,
    content: resource.content,
    position: resource.position,
  };
}

/* ------------------------------ restoring ----------------------------- */

export function restoreTrashItem(id: number): RestoreResult {
  const row = getTrashRow(id);
  if (!row) return { ok: false, error: "That item is no longer in the recycle bin." };

  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    return { ok: false, error: "This item's saved data is unreadable and can't be restored." };
  }

  if (row.kind === "media") {
    const { media, tags } = payload as MediaSnapshot;
    restoreMediaRow(media, tags ?? []);
    deleteTrashRow(id);
    return { ok: true, message: `“${row.label}” is back in the media library.` };
  }

  if (row.kind === "skill") {
    restoreSkillSnapshot(payload as SkillSnapshot);
    deleteTrashRow(id);
    return { ok: true, message: `“${row.label}” and its resources were restored.` };
  }

  const snapshot = payload as ResourceSnapshot | ThumbnailSnapshot;
  if (!getSkillById(snapshot.skill_id)) {
    return {
      ok: false,
      error: `“${row.label}” belongs to a course that no longer exists. Restore “${snapshot.skill_title || "the course"}” first.`,
    };
  }

  if (row.kind === "thumbnail") {
    const { skill_id, thumbnail_media_id } = snapshot as ThumbnailSnapshot;
    if (!mediaExists(thumbnail_media_id)) {
      return {
        ok: false,
        error: `“${row.label}” points at a file that has been deleted from the media library.`,
      };
    }
    const skill = getSkillById(skill_id)!;
    // Whatever thumbnail is in place now takes this one's place in the bin.
    if (skill.thumbnail_media_id && skill.thumbnail_media_id !== thumbnail_media_id) {
      trashThumbnail(skill);
    }
    setSkillThumbnail(skill_id, thumbnail_media_id);
  } else {
    restoreResourceSnapshot(snapshot as ResourceSnapshot);
  }

  deleteTrashRow(id);
  return { ok: true, message: `“${row.label}” was restored.` };
}

/* ------------------------------- purging ------------------------------ */

/** Permanently removes one bin entry, and its file when it holds one. */
export function purgeTrashItem(id: number): boolean {
  const row = getTrashRow(id);
  if (!row) return false;
  purgeRow(row);
  return true;
}

/** Empties the bin. Returns how many entries were removed. */
export function purgeAllTrash(): number {
  const rows = listTrash();
  for (const row of rows) purgeRow(row);
  return rows.length;
}

/** Purges entries past the retention window. Returns how many were removed. */
export function purgeExpiredTrash(): number {
  const rows = expiredTrash();
  for (const row of rows) purgeRow(row);
  return rows.length;
}

function purgeRow(row: TrashRow) {
  const media = binnedMedia(row);
  // A "replace" leaves the id in use by the live item, so check the file, not
  // the row: another entry or the library itself may still need it.
  if (media && !storageInUse(media.storage_name, row.id)) removeStorageFile(media.storage_name);
  deleteTrashRow(row.id);
}

/** The library file a bin entry is holding, if it is a media entry. */
export function binnedMedia(row: TrashRow): Media | null {
  if (row.kind !== "media") return null;
  try {
    return (JSON.parse(row.payload) as MediaSnapshot).media ?? null;
  } catch {
    return null;
  }
}

/** Bytes a bin entry would free if purged. */
export function trashedBytes(row: TrashRow): number {
  return binnedMedia(row)?.bytes ?? 0;
}

/** True while the live library, or another bin entry, still needs this file. */
function storageInUse(storageName: string, excludeTrashId: number): boolean {
  return (
    storageNameInUse(storageName) ||
    listTrash().some(
      (row) => row.id !== excludeTrashId && binnedMedia(row)?.storage_name === storageName
    )
  );
}
