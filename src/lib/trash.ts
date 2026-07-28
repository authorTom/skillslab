// Recycle bin: soft-delete, restore and purge. Server-only — purging removes
// uploads from disk, which is how storage is actually reclaimed.

import {
  addTrashRow,
  deleteResource,
  deleteSkill,
  deleteTrashRow,
  expiredTrash,
  getSkillById,
  getTrashRow,
  isFileReferenced,
  listResources,
  listTrash,
  restoreResourceSnapshot,
  restoreSkillSnapshot,
  setSkillThumbnail,
  trashFiles,
  type Resource,
  type ResourceSnapshot,
  type Skill,
  type SkillSnapshot,
  type ThumbnailSnapshot,
  type TrashRow,
} from "./data";
import { removePublicFile, resourceFilePaths } from "./files";
import { RESOURCE_TYPE_LABELS } from "./resource-types";
import { categoryPath } from "./taxonomy";

export type RestoreResult = { ok: true; message: string } | { ok: false; error: string };

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
    thumbnail: skill.thumbnail,
    created_at: skill.created_at,
    resources: resources.map((r) => ({
      type: r.type,
      title: r.title,
      content: r.content,
      position: r.position,
    })),
  };
  const files = [
    ...(skill.thumbnail ? [skill.thumbnail] : []),
    ...resources.flatMap((r) => resourceFilePaths(r.type, r.content)),
  ];
  const detail = [
    categoryPath(skill.group_name, skill.category_name),
    resources.length === 1 ? "1 resource" : `${resources.length} resources`,
  ].join(" · ");

  addTrashRow("skill", skill.title, detail, snapshot, files);
  deleteSkill(skill.id);
}

/** Soft-deletes a single resource. */
export function trashResource(resource: Resource) {
  const skill = getSkillById(resource.skill_id);
  addTrashRow(
    "resource",
    resource.title,
    `${RESOURCE_TYPE_LABELS[resource.type]} · ${skill?.title ?? "Unknown course"}`,
    resourceSnapshot(resource, skill?.title ?? ""),
    resourceFilePaths(resource.type, resource.content)
  );
  deleteResource(resource.id);
}

/**
 * Keeps the pre-edit version of a resource that an edit orphaned files from, so
 * a replaced PDF or a dropped storyboard frame can still be recovered. Only the
 * files the live resource no longer uses are attached — the rest stay in use.
 */
export function trashResourceVersion(resource: Resource, orphanedFiles: string[]) {
  if (orphanedFiles.length === 0) return;
  const skill = getSkillById(resource.skill_id);
  addTrashRow(
    "resource",
    resource.title,
    `Previous version · ${RESOURCE_TYPE_LABELS[resource.type]} · ${skill?.title ?? "Unknown course"}`,
    resourceSnapshot(resource, skill?.title ?? ""),
    orphanedFiles
  );
}

/** Keeps a replaced or removed skill thumbnail. */
export function trashThumbnail(skill: Skill) {
  if (!skill.thumbnail) return;
  const snapshot: ThumbnailSnapshot = {
    skill_id: skill.id,
    skill_title: skill.title,
    thumbnail: skill.thumbnail,
  };
  addTrashRow("thumbnail", `Thumbnail — ${skill.title}`, "Course thumbnail", snapshot, [
    skill.thumbnail,
  ]);
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
    const { skill_id, thumbnail } = snapshot as ThumbnailSnapshot;
    const skill = getSkillById(skill_id)!;
    // Whatever thumbnail is in place now takes this one's place in the bin.
    if (skill.thumbnail && skill.thumbnail !== thumbnail) trashThumbnail(skill);
    setSkillThumbnail(skill_id, thumbnail);
  } else {
    restoreResourceSnapshot(snapshot as ResourceSnapshot);
  }

  deleteTrashRow(id);
  return { ok: true, message: `“${row.label}” was restored.` };
}

/* ------------------------------- purging ------------------------------ */

/** Permanently removes one bin entry and frees any uploads only it was holding. */
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
  for (const publicPath of trashFiles(row)) {
    // A file shared with a live resource or another bin entry stays put.
    if (!isFileReferenced(publicPath, row.id)) removePublicFile(publicPath);
  }
  deleteTrashRow(row.id);
}
