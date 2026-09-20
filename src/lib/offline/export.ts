import crypto from "crypto";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getDb, DATA_DIR, UPLOADS_DIR } from "../db";
import { parseMediaRef } from "../media-refs";
import { parseStoryboardFrames } from "../storyboard";
import {
  CONTENT_SCHEMA_VERSION,
  PACKAGE_FORMAT,
  PACKAGE_SCHEMA_VERSION,
  READER_SCHEMA_SQL,
  type ManifestAsset,
  type ReleaseManifest,
  type VimeoPolicy,
} from "./schema";

export const RELEASES_DIR = path.join(DATA_DIR, "releases");

export interface ExportOptions {
  version: string;
  vimeoPolicy: VimeoPolicy;
}

export interface ExportResult {
  ok: true;
  releaseId: string;
  version: string;
  archivePath: string;
  manifest: ReleaseManifest;
}

export interface ExportError {
  ok: false;
  errors: string[];
}

interface AssetEntry {
  id: number;
  storage_name: string;
  filename: string;
  kind: string;
  mime: string;
  bytes: number;
}

export async function buildRelease(options: ExportOptions): Promise<ExportResult | ExportError> {
  const releaseId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const stagingDir = path.join(RELEASES_DIR, `.staging-${releaseId}`);
  const assetsDir = path.join(stagingDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  try {
    const result = buildReleaseInStaging(releaseId, options, stagingDir, assetsDir);
    if (!result.ok) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      return result;
    }

    const finalDir = path.join(RELEASES_DIR, releaseId);
    fs.renameSync(stagingDir, finalDir);

    return {
      ...result,
      archivePath: finalDir,
    };
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
}

function buildReleaseInStaging(
  releaseId: string,
  options: ExportOptions,
  stagingDir: string,
  assetsDir: string
): (ExportResult | ExportError) {
  const db = getDb();
  const errors: string[] = [];

  const groups = db.prepare("SELECT * FROM skill_groups ORDER BY position, name COLLATE NOCASE").all() as {
    id: number; slug: string; name: string; description: string; position: number;
  }[];

  const categories = db.prepare(
    `SELECT * FROM categories ORDER BY (group_id IS NULL), group_id, position, name COLLATE NOCASE`
  ).all() as {
    id: number; group_id: number | null; slug: string; name: string; description: string; position: number;
  }[];

  const skills = db.prepare(
    `SELECT s.id, s.slug, s.title, s.category_id, s.description, s.thumbnail_media_id, s.created_at
     FROM skills s ORDER BY s.title COLLATE NOCASE`
  ).all() as {
    id: number; slug: string; title: string; category_id: number | null; description: string;
    thumbnail_media_id: number | null; created_at: string;
  }[];

  const resources = db.prepare(
    `SELECT r.id, r.skill_id, r.type, r.title, r.content, r.position
     FROM resources r ORDER BY r.skill_id, r.position, r.id`
  ).all() as {
    id: number; skill_id: number; type: string; title: string; content: string; position: number;
  }[];

  const neededMediaIds = new Set<number>();
  const vimeoResources: { id: number; title: string; skillTitle: string }[] = [];

  for (const resource of resources) {
    if (resource.type === "video") {
      const skill = skills.find((s) => s.id === resource.skill_id);
      vimeoResources.push({ id: resource.id, title: resource.title, skillTitle: skill?.title ?? "" });
      continue;
    }
    if (resource.type === "storyboard") {
      for (const frame of parseStoryboardFrames(resource.content)) {
        neededMediaIds.add(frame.media_id);
      }
    } else if (resource.type === "local_video" || resource.type === "pdf" || resource.type === "image") {
      const mediaId = parseMediaRef(resource.content);
      if (mediaId) neededMediaIds.add(mediaId);
    }
  }

  for (const skill of skills) {
    if (skill.thumbnail_media_id) neededMediaIds.add(skill.thumbnail_media_id);
  }

  if (options.vimeoPolicy === "strict" && vimeoResources.length > 0) {
    for (const v of vimeoResources) {
      errors.push(`Vimeo-only resource "${v.title}" in "${v.skillTitle}" cannot be included in an offline release (strict mode).`);
    }
    return { ok: false, errors };
  }

  const mediaRows = neededMediaIds.size > 0
    ? db.prepare(
        `SELECT id, storage_name, filename, kind, mime, bytes FROM media
         WHERE id IN (${[...neededMediaIds].map(() => "?").join(",")})`
      ).all(...neededMediaIds) as AssetEntry[]
    : [];
  const mediaById = new Map(mediaRows.map((m) => [m.id, m]));

  for (const mediaId of neededMediaIds) {
    const media = mediaById.get(mediaId);
    if (!media) {
      errors.push(`Referenced media id ${mediaId} does not exist in the database.`);
      continue;
    }
    const filePath = path.join(UPLOADS_DIR, media.storage_name);
    if (!fs.existsSync(filePath)) {
      errors.push(`File missing for media "${media.filename}" (id ${mediaId}): ${media.storage_name}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const assets: ManifestAsset[] = [];
  const assetPaths = new Map<number, string>();

  for (const media of mediaRows) {
    const sourcePath = path.join(UPLOADS_DIR, media.storage_name);
    const ext = path.extname(media.storage_name).toLowerCase();
    const hash = hashFile(sourcePath);
    const assetName = `${hash}${ext}`;
    const destPath = path.join(assetsDir, assetName);

    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(sourcePath, destPath);
    }

    const stat = fs.statSync(destPath);
    assets.push({
      media_id: media.id,
      path: `assets/${assetName}`,
      mime: media.mime,
      bytes: stat.size,
      sha256: hash,
    });
    assetPaths.set(media.id, `assets/${assetName}`);
  }

  const cataloguePath = path.join(stagingDir, "catalogue.sqlite");
  buildCatalogue(cataloguePath, releaseId, options, groups, categories, skills, resources, assetPaths, mediaRows);

  const catalogueHash = hashFile(cataloguePath);
  const catalogueBytes = fs.statSync(cataloguePath).size;

  let totalBytes = catalogueBytes;
  for (const asset of assets) totalBytes += asset.bytes;

  const createdAt = new Date().toISOString();
  const manifest: ReleaseManifest = {
    format: PACKAGE_FORMAT,
    package_schema_version: PACKAGE_SCHEMA_VERSION,
    content_schema_version: CONTENT_SCHEMA_VERSION,
    release_id: releaseId,
    release_version: options.version,
    created_at: createdAt,
    catalogue: {
      filename: "catalogue.sqlite",
      bytes: catalogueBytes,
      sha256: catalogueHash,
    },
    assets,
    total_uncompressed_bytes: totalBytes,
    counts: {
      groups: groups.length,
      categories: categories.length,
      skills: skills.length,
      resources: resources.length,
      assets: assets.length,
    },
    min_app_content_schema_version: CONTENT_SCHEMA_VERSION,
  };

  fs.writeFileSync(path.join(stagingDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  return {
    ok: true,
    releaseId,
    version: options.version,
    archivePath: stagingDir,
    manifest,
  };
}

function buildCatalogue(
  cataloguePath: string,
  releaseId: string,
  options: ExportOptions,
  groups: { id: number; slug: string; name: string; description: string; position: number }[],
  categories: { id: number; group_id: number | null; slug: string; name: string; description: string; position: number }[],
  skills: { id: number; slug: string; title: string; category_id: number | null; description: string; thumbnail_media_id: number | null; created_at: string }[],
  resources: { id: number; skill_id: number; type: string; title: string; content: string; position: number }[],
  assetPaths: Map<number, string>,
  mediaRows: AssetEntry[]
) {
  const cat = new Database(cataloguePath);
  cat.pragma("journal_mode = WAL");
  cat.pragma("foreign_keys = ON");
  cat.exec(READER_SCHEMA_SQL);

  const insertMeta = cat.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
  insertMeta.run("content_schema_version", String(CONTENT_SCHEMA_VERSION));
  insertMeta.run("release_id", releaseId);
  insertMeta.run("release_version", options.version);
  insertMeta.run("created_at", new Date().toISOString());

  const insertGroup = cat.prepare("INSERT INTO groups (id, slug, name, description, position) VALUES (?, ?, ?, ?, ?)");
  for (const g of groups) insertGroup.run(g.id, g.slug, g.name, g.description, g.position);

  const insertCategory = cat.prepare("INSERT INTO categories (id, group_id, slug, name, description, position) VALUES (?, ?, ?, ?, ?, ?)");
  for (const c of categories) insertCategory.run(c.id, c.group_id, c.slug, c.name, c.description, c.position);

  const insertSkill = cat.prepare(
    "INSERT INTO skills (id, slug, title, category_id, description, thumbnail_asset, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  for (const s of skills) {
    const thumbnailAsset = s.thumbnail_media_id ? assetPaths.get(s.thumbnail_media_id) ?? null : null;
    insertSkill.run(s.id, s.slug, s.title, s.category_id, s.description, thumbnailAsset, s.created_at);
  }

  const insertResource = cat.prepare(
    "INSERT INTO resources (id, skill_id, type, title, content, asset, requires_internet, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertFrame = cat.prepare(
    "INSERT INTO storyboard_frames (resource_id, position, asset, alt, caption) VALUES (?, ?, ?, ?, ?)"
  );

  for (const r of resources) {
    if (r.type === "video") {
      if (options.vimeoPolicy === "permissive") {
        insertResource.run(r.id, r.skill_id, "video", r.title, r.content, null, 1, r.position);
      }
      continue;
    }

    if (r.type === "storyboard") {
      insertResource.run(r.id, r.skill_id, "storyboard", r.title, "", null, 0, r.position);
      const frames = parseStoryboardFrames(r.content);
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const mediaItem = mediaRows.find((m) => m.id === frame.media_id);
        const asset = assetPaths.get(frame.media_id) ?? "";
        insertFrame.run(r.id, i, asset, mediaItem?.filename ?? "", frame.caption);
      }
      continue;
    }

    const mediaId = parseMediaRef(r.content);
    const asset = mediaId ? assetPaths.get(mediaId) ?? null : null;
    const type = r.type === "local_video" ? "video" : r.type;
    insertResource.run(r.id, r.skill_id, type, r.title, "", asset, 0, r.position);
  }

  const insertMedia = cat.prepare(
    "INSERT INTO media (id, filename, title, alt, kind, mime, bytes, asset) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const m of mediaRows) {
    const asset = assetPaths.get(m.id) ?? "";
    insertMedia.run(m.id, m.filename, "", "", m.kind, m.mime, m.bytes, asset);
  }

  cat.pragma("journal_mode = DELETE");
  cat.close();
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytesRead: number;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}
