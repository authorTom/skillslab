// The media library. Server-only — it writes to the uploads directory.
//
// A media row owns its file; courses only ever reference one. That is what
// lets several courses share a single upload, and what makes a rename free:
// only `filename` changes, never the name on disk.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getDb, insertMediaFile, probeStoredFile, UPLOADS_DIR } from "./db";
import { listResources, type Resource, type ResourceType } from "./data";
import { mediaUrl, parseMediaRef } from "./media-refs";
import { MEDIA_EXTENSIONS, mediaKindFor, type MediaKind } from "./media-types";
import { parseStoryboardFrames } from "./storyboard";
import { slugify } from "./slug";

export type { MediaKind };

export interface Media {
  id: number;
  folder_id: number | null;
  /** Name on disk. Immutable — the id is the reference, this is just storage. */
  storage_name: string;
  /** Display and download name. Freely editable. */
  filename: string;
  title: string;
  alt: string;
  kind: MediaKind;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface MediaItem extends Media {
  folder_name: string | null;
  tags: string[];
  /** Public URL — the id resolves it, so this survives a rename. */
  url: string;
  /** True when the row's file has gone from disk. */
  missing: boolean;
}

export interface MediaFolder {
  id: number;
  slug: string;
  name: string;
  position: number;
  media_count: number;
}

export interface MediaTag {
  id: number;
  slug: string;
  name: string;
  media_count: number;
}

export type MediaSort = "recent" | "name" | "size";

export interface MediaFilter {
  /** Free-text over filename, title and alt text. */
  q?: string;
  kind?: MediaKind;
  /** A folder id, or "none" for files that aren't in one. */
  folder?: number | "none";
  tag?: number;
  sort?: MediaSort;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

const MEDIA_QUERY = `
  SELECT m.*, f.name AS folder_name
    FROM media m
    LEFT JOIN media_folders f ON f.id = m.folder_id`;

type MediaRow = Media & { folder_name: string | null };

const SORTS: Record<MediaSort, string> = {
  recent: "m.created_at DESC, m.id DESC",
  name: "m.filename COLLATE NOCASE",
  size: "m.bytes DESC",
};

export function listMedia(filter: MediaFilter = {}): MediaItem[] {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.q) {
    clauses.push("(m.filename LIKE ? OR m.title LIKE ? OR m.alt LIKE ?)");
    params.push(`%${filter.q}%`, `%${filter.q}%`, `%${filter.q}%`);
  }
  if (filter.kind) {
    clauses.push("m.kind = ?");
    params.push(filter.kind);
  }
  if (filter.folder === "none") {
    clauses.push("m.folder_id IS NULL");
  } else if (typeof filter.folder === "number") {
    clauses.push("m.folder_id = ?");
    params.push(filter.folder);
  }
  if (filter.tag) {
    clauses.push("EXISTS (SELECT 1 FROM media_tag_links l WHERE l.media_id = m.id AND l.tag_id = ?)");
    params.push(filter.tag);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = filter.limit ? `LIMIT ${Number(filter.limit)}` : "";
  const rows = getDb()
    .prepare(`${MEDIA_QUERY} ${where} ORDER BY ${SORTS[filter.sort ?? "recent"]} ${limit}`)
    .all(...params) as MediaRow[];
  return toItems(rows);
}

export function getMedia(id: number): MediaItem | undefined {
  const row = getDb().prepare(`${MEDIA_QUERY} WHERE m.id = ?`).get(id) as MediaRow | undefined;
  return row && toItems([row])[0];
}

/** The given ids, keyed by id, for resolving a batch of references at once. */
export function getMediaMap(ids: number[]): Map<number, MediaItem> {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) return new Map();
  const rows = getDb()
    .prepare(`${MEDIA_QUERY} WHERE m.id IN (${unique.map(() => "?").join(", ")})`)
    .all(...unique) as MediaRow[];
  return new Map(toItems(rows).map((item) => [item.id, item]));
}

function toItems(rows: MediaRow[]): MediaItem[] {
  const tags = tagsForAll(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    tags: tags.get(row.id) ?? [],
    url: mediaUrl(row.id, row.filename),
    missing: !fs.existsSync(storagePath(row.storage_name)),
  }));
}

/** Tag names per media id, in one query rather than one per row. */
function tagsForAll(ids: number[]): Map<number, string[]> {
  const grouped = new Map<number, string[]>();
  if (ids.length === 0) return grouped;
  const rows = getDb()
    .prepare(
      `SELECT l.media_id, t.name
         FROM media_tag_links l JOIN media_tags t ON t.id = l.tag_id
        WHERE l.media_id IN (${ids.map(() => "?").join(", ")})
        ORDER BY t.name COLLATE NOCASE`
    )
    .all(...ids) as { media_id: number; name: string }[];
  for (const row of rows) grouped.set(row.media_id, [...(grouped.get(row.media_id) ?? []), row.name]);
  return grouped;
}

export function storagePath(storageName: string): string {
  return path.join(UPLOADS_DIR, path.basename(storageName));
}

export function countMedia(): { files: number; bytes: number } {
  return getDb()
    .prepare("SELECT COUNT(*) AS files, COALESCE(SUM(bytes), 0) AS bytes FROM media")
    .get() as { files: number; bytes: number };
}

/* ------------------------------------------------------------------ */
/* Resolving references for the viewer                                 */
/* ------------------------------------------------------------------ */

export interface ResolvedFrame {
  media_id: number;
  src: string;
  alt: string;
  caption: string;
}

/** A resource with its library references turned into URLs for rendering. */
export interface ResolvedResource {
  id: number;
  skill_id: number;
  type: ResourceType;
  title: string;
  position: number;
  /** Vimeo URL for videos, file URL for a PDF or image, "" when missing. */
  src: string;
  alt: string;
  frames: ResolvedFrame[];
  /** True when a referenced library file has been deleted or lost. */
  broken: boolean;
}

/** Every media id a resource points at. */
export function resourceMediaIds(type: ResourceType, content: string): number[] {
  if (type === "video") return [];
  if (type === "storyboard") return parseStoryboardFrames(content).map((frame) => frame.media_id);
  const id = parseMediaRef(content);
  return id ? [id] : [];
}

export function resolveResources(resources: Resource[]): ResolvedResource[] {
  const media = getMediaMap(resources.flatMap((r) => resourceMediaIds(r.type, r.content)));

  return resources.map((resource) => {
    const base = {
      id: resource.id,
      skill_id: resource.skill_id,
      type: resource.type,
      title: resource.title,
      position: resource.position,
    };

    if (resource.type === "video") {
      return { ...base, src: resource.content, alt: "", frames: [], broken: false };
    }

    // A file deleted from the library, or lost from disk, is shown as
    // unavailable rather than as a broken image.
    if (resource.type === "storyboard") {
      const frames = parseStoryboardFrames(resource.content).flatMap((frame): ResolvedFrame[] => {
        const item = media.get(frame.media_id);
        return item && !item.missing
          ? [{ media_id: frame.media_id, src: item.url, alt: item.alt, caption: frame.caption }]
          : [];
      });
      return { ...base, src: "", alt: "", frames, broken: frames.length === 0 };
    }

    const item = media.get(parseMediaRef(resource.content) ?? 0);
    return {
      ...base,
      src: item?.url ?? "",
      alt: item?.alt ?? "",
      frames: [],
      broken: !item || item.missing,
    };
  });
}

export function resolveResource(resource: Resource): ResolvedResource {
  return resolveResources([resource])[0];
}

export function listResolvedResources(skillId: number): ResolvedResource[] {
  return resolveResources(listResources(skillId));
}

/* ------------------------------------------------------------------ */
/* Usage — who points at a file                                        */
/* ------------------------------------------------------------------ */

export type MediaUsage =
  | { kind: "resource"; resourceId: number; resourceTitle: string; skillId: number; skillTitle: string }
  | { kind: "thumbnail"; skillId: number; skillTitle: string }
  | { kind: "trash"; trashId: number; label: string };

/**
 * Every reference to every media item, in one pass. Storyboard frames live
 * inside JSON, so this reads the rows and parses them rather than trying to
 * pattern-match ids in SQL, where "4" would also match "42".
 */
export function mediaUsageIndex(): Map<number, MediaUsage[]> {
  const db = getDb();
  const index = new Map<number, MediaUsage[]>();
  const add = (id: number | null | undefined, usage: MediaUsage) => {
    if (!id) return;
    index.set(id, [...(index.get(id) ?? []), usage]);
  };

  const resources = db
    .prepare(
      `SELECT r.id, r.type, r.title, r.content, s.id AS skill_id, s.title AS skill_title
         FROM resources r JOIN skills s ON s.id = r.skill_id
        WHERE r.type <> 'video'`
    )
    .all() as {
    id: number;
    type: ResourceType;
    title: string;
    content: string;
    skill_id: number;
    skill_title: string;
  }[];
  for (const resource of resources) {
    for (const mediaId of new Set(resourceMediaIds(resource.type, resource.content))) {
      add(mediaId, {
        kind: "resource",
        resourceId: resource.id,
        resourceTitle: resource.title,
        skillId: resource.skill_id,
        skillTitle: resource.skill_title,
      });
    }
  }

  const skills = db
    .prepare("SELECT id, title, thumbnail_media_id FROM skills WHERE thumbnail_media_id IS NOT NULL")
    .all() as { id: number; title: string; thumbnail_media_id: number }[];
  for (const skill of skills) {
    add(skill.thumbnail_media_id, { kind: "thumbnail", skillId: skill.id, skillTitle: skill.title });
  }

  // Bin entries count too: a restored course has to find its files intact.
  const binned = db.prepare("SELECT id, kind, label, payload FROM trash WHERE kind <> 'media'").all() as {
    id: number;
    kind: string;
    label: string;
    payload: string;
  }[];
  for (const row of binned) {
    for (const mediaId of snapshotMediaIds(row.payload)) {
      add(mediaId, { kind: "trash", trashId: row.id, label: row.label });
    }
  }

  return index;
}

export function mediaUsage(id: number): MediaUsage[] {
  return mediaUsageIndex().get(id) ?? [];
}

/** Media ids inside a recycle-bin snapshot, whatever kind it is. */
export function snapshotMediaIds(payload: string): number[] {
  let snapshot: Record<string, unknown>;
  try {
    snapshot = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return [];
  }

  const ids: number[] = [];
  const thumbnail = Number(snapshot.thumbnail_media_id ?? 0);
  if (thumbnail > 0) ids.push(thumbnail);

  const fromResource = (entry: Record<string, unknown>) =>
    resourceMediaIds(String(entry.type ?? "") as ResourceType, String(entry.content ?? ""));

  if (typeof snapshot.content === "string") ids.push(...fromResource(snapshot));
  if (Array.isArray(snapshot.resources)) {
    for (const entry of snapshot.resources) ids.push(...fromResource(entry as Record<string, unknown>));
  }
  return ids;
}

export function usageLabel(usage: MediaUsage): string {
  switch (usage.kind) {
    case "resource":
      return `${usage.skillTitle} · ${usage.resourceTitle}`;
    case "thumbnail":
      return `${usage.skillTitle} · thumbnail`;
    case "trash":
      return `${usage.label} (in the recycle bin)`;
  }
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

export type UploadResult = { ok: true; media: MediaItem } | { ok: false; error: string };

/**
 * Stores an uploaded file and adds it to the library. `allowed` narrows what
 * the caller will accept — a thumbnail picker only wants images.
 */
export async function addUpload(
  file: File,
  options: { allowed?: string[]; folderId?: number | null; title?: string } = {}
): Promise<UploadResult> {
  const allowed = options.allowed ?? MEDIA_EXTENSIONS;
  const ext = path.extname(file.name).toLowerCase();
  if (!allowed.includes(ext) || !mediaKindFor(ext)) {
    return { ok: false, error: unsupportedMessage(file.name, allowed) };
  }

  const storageName = await storeUpload(file, ext);
  const db = getDb();
  const id = insertMediaFile(db, storageName, safeFilename(file.name, ext), options.title ?? "");
  if (options.folderId) {
    db.prepare("UPDATE media SET folder_id = ? WHERE id = ?").run(options.folderId, id);
  }
  return { ok: true, media: getMedia(id)! };
}

/**
 * Swaps the file behind a media item, keeping its id — so every course using
 * it picks up the new version. The old file is handed back for the caller to
 * put in the recycle bin.
 */
export async function replaceMediaFile(
  id: number,
  file: File
): Promise<{ ok: true; previous: Media } | { ok: false; error: string }> {
  const current = getMedia(id);
  if (!current) return { ok: false, error: "That file is no longer in the library." };

  const ext = path.extname(file.name).toLowerCase();
  const allowed = current.kind === "pdf" ? [".pdf"] : MEDIA_EXTENSIONS.filter((e) => e !== ".pdf");
  if (!allowed.includes(ext)) {
    return {
      ok: false,
      error:
        current.kind === "pdf"
          ? "A PDF can only be replaced by another PDF."
          : "An image can only be replaced by another image.",
    };
  }

  const storageName = await storeUpload(file, ext);
  const probed = probeStoredFile(storageName);
  // The item keeps the name it was given — a replacement is a new version of
  // this file, not a new file. Only the extension follows the upload.
  const base = current.filename.slice(0, -path.extname(current.filename).length);

  // The id stays put, so every course using this file follows the swap. The
  // caller bins `previous`, which still names the file that was there before.
  getDb()
    .prepare(
      `UPDATE media SET storage_name = ?, filename = ?, mime = ?, bytes = ?, width = ?, height = ?
        WHERE id = ?`
    )
    .run(
      storageName,
      safeFilename(base || file.name, ext),
      probed.mime,
      probed.bytes,
      probed.width,
      probed.height,
      id
    );

  return { ok: true, previous: current };
}

/** Writes an upload under a fresh, collision-proof name. Returns that name. */
async function storeUpload(file: File, ext: string): Promise<string> {
  const storageName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  await fs.promises.writeFile(storagePath(storageName), Buffer.from(await file.arrayBuffer()));
  return storageName;
}

export function updateMedia(
  id: number,
  fields: { filename: string; title: string; alt: string; folderId: number | null }
) {
  const current = getMedia(id);
  if (!current) return;
  const ext = path.extname(current.storage_name).toLowerCase();
  getDb()
    .prepare("UPDATE media SET filename = ?, title = ?, alt = ?, folder_id = ? WHERE id = ?")
    .run(safeFilename(fields.filename, ext), fields.title, fields.alt, fields.folderId, id);
}

export function moveMediaToFolder(ids: number[], folderId: number | null) {
  const update = getDb().prepare("UPDATE media SET folder_id = ? WHERE id = ?");
  getDb().transaction(() => {
    for (const id of ids) update.run(folderId, id);
  })();
}

/** Removes the row only. Callers bin the item first, via `trashMedia`. */
export function deleteMediaRow(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM media WHERE id = ?").run(id);
  pruneEmptyTags(db);
}

export function removeStorageFile(storageName: string) {
  fs.rmSync(storagePath(storageName), { force: true });
}

/** True while a library row still points at this file on disk. */
export function storageNameInUse(storageName: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM media WHERE storage_name = ?").get(storageName));
}

/**
 * Re-inserts a purged-from-nothing media row on restore, reusing its original
 * id when it is still free — which it always is, since AUTOINCREMENT never
 * recycles ids — so references from restored courses come back to life.
 */
export function restoreMediaRow(media: Media, tags: string[]): number {
  const db = getDb();
  const reuseId = !db.prepare("SELECT id FROM media WHERE id = ?").get(media.id);
  const columns = `${reuseId ? "id, " : ""}folder_id, storage_name, filename, title, alt, kind, mime, bytes, width, height, created_at`;
  const values = `${reuseId ? "?, " : ""}?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;
  const folderExists =
    media.folder_id && db.prepare("SELECT id FROM media_folders WHERE id = ?").get(media.folder_id);

  const id = Number(
    db
      .prepare(`INSERT INTO media (${columns}) VALUES (${values})`)
      .run(
        ...(reuseId ? [media.id] : []),
        folderExists ? media.folder_id : null,
        media.storage_name,
        media.filename,
        media.title,
        media.alt,
        media.kind,
        media.mime,
        media.bytes,
        media.width,
        media.height,
        media.created_at
      ).lastInsertRowid
  );
  setMediaTags(id, tags);
  return id;
}

/* ------------------------------------------------------------------ */
/* Folders and tags                                                    */
/* ------------------------------------------------------------------ */

export function listMediaFolders(): MediaFolder[] {
  return getDb()
    .prepare(
      `SELECT f.*, COUNT(m.id) AS media_count
         FROM media_folders f
         LEFT JOIN media m ON m.folder_id = f.id
        GROUP BY f.id
        ORDER BY f.position, f.name COLLATE NOCASE`
    )
    .all() as MediaFolder[];
}

export function getMediaFolder(id: number): MediaFolder | undefined {
  return listMediaFolders().find((folder) => folder.id === id);
}

export function countUnfiledMedia(): number {
  return (
    getDb().prepare("SELECT COUNT(*) AS n FROM media WHERE folder_id IS NULL").get() as { n: number }
  ).n;
}

export function createMediaFolder(name: string): number {
  const db = getDb();
  const next = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM media_folders").get() as {
    p: number;
  };
  return Number(
    db
      .prepare("INSERT INTO media_folders (slug, name, position) VALUES (?, ?, ?)")
      .run(uniqueSlugIn("media_folders", name), name, next.p).lastInsertRowid
  );
}

export function renameMediaFolder(id: number, name: string) {
  getDb()
    .prepare("UPDATE media_folders SET slug = ?, name = ? WHERE id = ?")
    .run(uniqueSlugIn("media_folders", name, id), name, id);
}

/** Deletes a folder; its files stay in the library, unfiled. */
export function deleteMediaFolder(id: number) {
  getDb().prepare("DELETE FROM media_folders WHERE id = ?").run(id);
}

export function listMediaTags(): MediaTag[] {
  return getDb()
    .prepare(
      `SELECT t.*, COUNT(l.media_id) AS media_count
         FROM media_tags t
         LEFT JOIN media_tag_links l ON l.tag_id = t.id
        GROUP BY t.id
        ORDER BY t.name COLLATE NOCASE`
    )
    .all() as MediaTag[];
}

/** Replaces a file's tags, creating any that are new. */
export function setMediaTags(mediaId: number, names: string[]) {
  const db = getDb();
  const find = db.prepare("SELECT id FROM media_tags WHERE name = ? COLLATE NOCASE");
  const create = db.prepare("INSERT INTO media_tags (slug, name) VALUES (?, ?)");
  const link = db.prepare("INSERT OR IGNORE INTO media_tag_links (media_id, tag_id) VALUES (?, ?)");

  db.transaction(() => {
    db.prepare("DELETE FROM media_tag_links WHERE media_id = ?").run(mediaId);
    for (const name of new Set(names.map((n) => n.trim()).filter(Boolean))) {
      const existing = find.get(name) as { id: number } | undefined;
      const tagId =
        existing?.id ??
        Number(create.run(uniqueSlugIn("media_tags", name), name).lastInsertRowid);
      link.run(mediaId, tagId);
    }
    pruneEmptyTags(db);
  })();
}

/** Adds one tag to several files at once, for the bulk bar. */
export function addTagToMedia(ids: number[], name: string) {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed || ids.length === 0) return;

  db.transaction(() => {
    const existing = db.prepare("SELECT id FROM media_tags WHERE name = ? COLLATE NOCASE").get(trimmed) as
      | { id: number }
      | undefined;
    const tagId =
      existing?.id ??
      Number(
        db
          .prepare("INSERT INTO media_tags (slug, name) VALUES (?, ?)")
          .run(uniqueSlugIn("media_tags", trimmed), trimmed).lastInsertRowid
      );
    const link = db.prepare("INSERT OR IGNORE INTO media_tag_links (media_id, tag_id) VALUES (?, ?)");
    for (const id of ids) link.run(id, tagId);
  })();
}

/** A tag with nothing left on it is noise in the sidebar. */
function pruneEmptyTags(db = getDb()) {
  db.exec("DELETE FROM media_tags WHERE id NOT IN (SELECT tag_id FROM media_tag_links)");
}

export function tagsFor(mediaId: number): string[] {
  return (
    getDb()
      .prepare(
        `SELECT t.name FROM media_tags t
           JOIN media_tag_links l ON l.tag_id = t.id
          WHERE l.media_id = ?
          ORDER BY t.name COLLATE NOCASE`
      )
      .all(mediaId) as { name: string }[]
  ).map((row) => row.name);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * A display name that is safe to put in a URL segment and a download header,
 * always carrying the extension of the file actually on disk.
 */
export function safeFilename(name: string, ext: string): string {
  const cleaned = path
    .basename(name.trim())
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  // The extension always follows the file on disk, so a rename can never make
  // the name claim a type the bytes aren't.
  const base = cleaned.toLowerCase().endsWith(ext) ? cleaned.slice(0, -ext.length) : cleaned;
  return `${base.trim() || "file"}${ext}`;
}

function unsupportedMessage(name: string, allowed: string[]): string {
  const list = allowed.map((ext) => ext.slice(1).toUpperCase()).join(", ");
  return `“${name}” isn't a supported file type. Accepted: ${list}.`;
}

function uniqueSlugIn(table: "media_folders" | "media_tags", name: string, excludeId?: number): string {
  const base = slugify(name) || "item";
  const taken = getDb().prepare(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`);
  let slug = base;
  let n = 2;
  while (taken.get(slug, excludeId ?? -1)) slug = `${base}-${n++}`;
  return slug;
}
