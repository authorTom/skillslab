import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { imageSize } from "./image-size";
import { mediaRef } from "./media-refs";
import { MEDIA_EXTENSIONS, MIME_TYPES, mediaKindFor } from "./media-types";
import { slugify } from "./slug";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

/** Bumped when a one-way schema migration has to run exactly once. */
const SCHEMA_VERSION = 2;
/** The version migrateToMediaLibrary brings a database to. */
const MEDIA_LIBRARY_VERSION = 1;

declare global {
  var __clinicalSkillsDb: Database.Database | undefined;
}

export function getDb(): Database.Database {
  if (globalThis.__clinicalSkillsDb) return globalThis.__clinicalSkillsDb;

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    -- The media library. Every uploaded file is a row here, and courses point
    -- at it by id, so one file can serve any number of courses.
    --
    -- "storage_name" is the name on disk and never changes; "filename" is the
    -- editable display and download name. Keeping them apart is what makes a
    -- rename safe — no file moves and no reference can be left dangling.
    CREATE TABLE IF NOT EXISTS media_folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER REFERENCES media_folders(id) ON DELETE SET NULL,
      storage_name TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      alt TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('image', 'pdf', 'video')),
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS media_tag_links (
      media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES media_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (media_id, tag_id)
    );

    -- Two-level taxonomy: a group holds categories, a category holds courses.
    -- Both levels are optional, so a course can sit in a category with no group,
    -- or in no category at all.
    CREATE TABLE IF NOT EXISTS skill_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES skill_groups(id) ON DELETE SET NULL,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      thumbnail_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- A resource's content is a Vimeo URL for videos, "media:<id>" for a PDF or
    -- image, and a JSON array of {media_id, caption} steps for a storyboard.
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'storyboard', 'video', 'local_video')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    -- Recycle bin. Deleted items are snapshotted here as a JSON restore blob.
    -- Only a binned media item still owns a file on disk; purging it is what
    -- reclaims the storage. Courses and resources reference library files
    -- rather than owning them, so deleting one never removes a file.
    CREATE TABLE IF NOT EXISTS trash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('skill', 'resource', 'thumbnail', 'media')),
      label TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrate(db);
  migrateToMediaLibrary(db);
  migrateMediaVideoKind(db);
  seedIfEmpty(db);
  globalThis.__clinicalSkillsDb = db;
  return db;
}

/* ------------------------------------------------------------------ */
/* Media rows                                                          */
/* ------------------------------------------------------------------ */

/**
 * Records a file that is already sitting in the uploads directory as a library
 * item, reading its size and dimensions from disk. A file that has since gone
 * missing still gets a row — the library shows it so the admin can see, and
 * clear up, what a course is pointing at.
 */
export function insertMediaFile(
  db: Database.Database,
  storageName: string,
  filename: string,
  title = ""
): number {
  const file = probeStoredFile(storageName);
  return Number(
    db
      .prepare(
        `INSERT INTO media (storage_name, filename, title, kind, mime, bytes, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(storageName, filename, title, file.kind, file.mime, file.bytes, file.width, file.height)
      .lastInsertRowid
  );
}

export interface StoredFile {
  kind: "image" | "pdf" | "video";
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

/** What can be learned about a file in the uploads directory by reading it. */
export function probeStoredFile(storageName: string): StoredFile {
  const ext = path.extname(storageName).toLowerCase();
  const kind = mediaKindFor(ext) ?? "image";
  const file = path.join(UPLOADS_DIR, storageName);

  let bytes = 0;
  let size: { width: number; height: number } | null = null;
  try {
    bytes = fs.statSync(file).size;
    if (kind === "image") size = imageSize(readHeader(file), ext);
  } catch {
    // Missing or unreadable — the row is still worth having.
  }

  return {
    kind,
    mime: MIME_TYPES[ext] ?? "application/octet-stream",
    bytes,
    width: size?.width ?? null,
    height: size?.height ?? null,
  };
}

/** First 64 KB of a file — every format's dimensions live in its header. */
function readHeader(file: string, length = 65_536): Buffer {
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(handle, buffer, 0, length, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(handle);
  }
}

/* ------------------------------------------------------------------ */
/* Migrations for databases created by earlier versions.              */
/* ------------------------------------------------------------------ */

const columnsOf = (db: Database.Database, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

function migrate(db: Database.Database) {
  const skillColumns = columnsOf(db, "skills");

  // Databases that stored the category as free text on the skill itself.
  if (!skillColumns.includes("category_id")) {
    db.exec(
      "ALTER TABLE skills ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL"
    );
  }
  if (skillColumns.includes("category")) migrateCategoryText(db);

  // Databases from before the media library, where the thumbnail was a path.
  if (!skillColumns.includes("thumbnail_media_id")) {
    db.exec(
      "ALTER TABLE skills ADD COLUMN thumbnail_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL"
    );
  }
}

/**
 * Turns the old free-text `skills.category` into rows in `categories` (left
 * ungrouped — groups are the admin's to arrange), then retires the column.
 */
function migrateCategoryText(db: Database.Database) {
  const names = (
    db.prepare("SELECT DISTINCT category FROM skills WHERE category <> ''").all() as {
      category: string;
    }[]
  ).map((r) => r.category);

  if (names.length > 0) {
    const find = db.prepare("SELECT id FROM categories WHERE name = ? COLLATE NOCASE");
    const insert = db.prepare(
      "INSERT INTO categories (group_id, slug, name, position) VALUES (NULL, ?, ?, ?)"
    );
    const assign = db.prepare("UPDATE skills SET category_id = ? WHERE category = ? COLLATE NOCASE");
    const nextPosition = db.prepare(
      "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories WHERE group_id IS NULL"
    );

    db.transaction(() => {
      for (const name of names) {
        const existing = find.get(name) as { id: number } | undefined;
        const id =
          existing?.id ??
          Number(
            insert.run(
              uniqueSlugFor(db, "categories", name),
              name,
              (nextPosition.get() as { p: number }).p
            ).lastInsertRowid
          );
        assign.run(id, name);
      }
    })();
  }

  // The data now lives in `categories`; keeping the column would let stale text
  // reappear. Older SQLite builds can't drop a column — blank it out instead.
  dropColumn(db, "skills", "category");
}

function dropColumn(db: Database.Database, table: string, column: string) {
  try {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  } catch {
    db.exec(`UPDATE ${table} SET ${column} = ''`);
  }
}

/* ------------------------------------------------------------------ */
/* Migration into the media library                                    */
/* ------------------------------------------------------------------ */

/**
 * Before the media library, every upload was owned by whatever referenced it:
 * a `/files/…` path in `skills.thumbnail`, in `resources.content`, or in a
 * storyboard's frames. This gives each of those files a row in `media` and
 * repoints the references at it, then adopts anything else sitting in the
 * uploads directory so the library shows the whole of what is on disk.
 *
 * One-way, and guarded by the schema version so it runs exactly once.
 */
function migrateToMediaLibrary(db: Database.Database) {
  // Pinned to its own version, not SCHEMA_VERSION: when that moved on to 2,
  // this re-ran on every version-1 database and stamped it 2, so the video
  // migration after it never ran.
  if (Number(db.pragma("user_version", { simple: true })) >= MEDIA_LIBRARY_VERSION) return;

  const hasLegacyThumbnail = columnsOf(db, "skills").includes("thumbnail");
  const byPath = new Map<string, number>();
  /** Media id for a `/files/<name>` path, importing it on first sight. */
  const adopt = (publicPath: string, title: string): number | null => {
    const name = legacyStorageName(publicPath);
    if (!name) return null;
    const existing = byPath.get(name);
    if (existing) return existing;
    const id = insertMediaFile(db, name, name, title);
    byPath.set(name, id);
    return id;
  };

  db.transaction(() => {
    if (hasLegacyThumbnail) {
      const skills = db
        .prepare("SELECT id, title, thumbnail FROM skills WHERE thumbnail <> ''")
        .all() as { id: number; title: string; thumbnail: string }[];
      const setThumbnail = db.prepare("UPDATE skills SET thumbnail_media_id = ? WHERE id = ?");
      for (const skill of skills) {
        const id = adopt(skill.thumbnail, `${skill.title} thumbnail`);
        if (id) setThumbnail.run(id, skill.id);
      }
    }

    const resources = db
      .prepare("SELECT id, type, title, content FROM resources WHERE type <> 'video'")
      .all() as { id: number; type: string; title: string; content: string }[];
    const setContent = db.prepare("UPDATE resources SET content = ? WHERE id = ?");
    for (const resource of resources) {
      if (resource.type === "storyboard") {
        const frames = legacyFrames(resource.content)
          .map((frame, i) => ({
            media_id: adopt(frame.src, `${resource.title} — step ${i + 1}`),
            caption: frame.caption,
          }))
          .filter((frame): frame is { media_id: number; caption: string } => frame.media_id !== null);
        setContent.run(JSON.stringify(frames), resource.id);
      } else {
        const id = adopt(resource.content, resource.title);
        if (id) setContent.run(mediaRef(id), resource.id);
      }
    }

    migrateTrash(db, adopt);
    if (hasLegacyThumbnail) dropColumn(db, "skills", "thumbnail");
    adoptLooseUploads(db, byPath);
  })();

  db.pragma(`user_version = ${MEDIA_LIBRARY_VERSION}`);
}

/** The `<name>` of a legacy `/files/<name>` path, or null if it isn't one. */
function legacyStorageName(publicPath: string): string | null {
  if (!publicPath.startsWith("/files/")) return null;
  const name = path.basename(publicPath.slice("/files/".length));
  return name && mediaKindFor(path.extname(name).toLowerCase()) ? name : null;
}

/** Frames as they were stored before the library: paths, or {src, caption}. */
function legacyFrames(content: string): { src: string; caption: string }[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((frame) => {
        if (typeof frame === "string") return { src: frame, caption: "" };
        const record = frame as Record<string, unknown> | null;
        return { src: String(record?.src ?? ""), caption: String(record?.caption ?? "") };
      })
      .filter((frame) => frame.src);
  } catch {
    return [];
  }
}

/**
 * Rewrites recycle-bin snapshots so a restore produces media references. The
 * old `files` column goes: those uploads now belong to the library, and only a
 * binned media item still holds a file of its own.
 */
function migrateTrash(db: Database.Database, adopt: (path: string, title: string) => number | null) {
  const rows = db.prepare("SELECT id, kind, label, payload FROM trash").all() as {
    id: number;
    kind: string;
    label: string;
    payload: string;
  }[];
  const update = db.prepare("UPDATE trash SET payload = ? WHERE id = ?");

  for (const row of rows) {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(row.payload) as Record<string, unknown>;
    } catch {
      continue; // Unreadable snapshot — the purge will clear it.
    }

    if (typeof payload.thumbnail === "string" && payload.thumbnail) {
      payload.thumbnail_media_id = adopt(payload.thumbnail, `${row.label} thumbnail`);
      delete payload.thumbnail;
    }
    if (typeof payload.content === "string") {
      payload.content = rewriteSnapshotContent(payload, row.label, adopt);
    }
    if (Array.isArray(payload.resources)) {
      payload.resources = payload.resources.map((entry) => {
        const resource = entry as Record<string, unknown>;
        return { ...resource, content: rewriteSnapshotContent(resource, row.label, adopt) };
      });
    }
    update.run(JSON.stringify(payload), row.id);
  }

  rebuildTrashTable(db);
}

/**
 * The bin's `kind` is a CHECK constraint, which SQLite can only widen by
 * rebuilding the table. The same pass drops the old `files` column, since a
 * course or resource no longer owns the uploads it points at.
 */
function rebuildTrashTable(db: Database.Database) {
  const table = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trash'")
    .get() as { sql: string } | undefined;
  if (!table || table.sql.includes("'media'")) return;

  db.exec(`
    CREATE TABLE trash_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('skill', 'resource', 'thumbnail', 'media')),
      label TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO trash_new (id, kind, label, detail, payload, deleted_at)
      SELECT id, kind, label, detail, payload, deleted_at FROM trash;
    DROP TABLE trash;
    ALTER TABLE trash_new RENAME TO trash;
  `);
}

function rewriteSnapshotContent(
  snapshot: Record<string, unknown>,
  label: string,
  adopt: (path: string, title: string) => number | null
): string {
  const type = String(snapshot.type ?? "");
  const content = String(snapshot.content ?? "");
  if (type === "video") return content;
  if (type === "storyboard") {
    return JSON.stringify(
      legacyFrames(content)
        .map((frame, i) => ({ media_id: adopt(frame.src, `${label} — step ${i + 1}`), caption: frame.caption }))
        .filter((frame) => frame.media_id !== null)
    );
  }
  const id = adopt(content, label);
  return id ? mediaRef(id) : content;
}

/** Adds any supported file already in the uploads directory to the library. */
function adoptLooseUploads(db: Database.Database, byPath: Map<string, number>) {
  let names: string[];
  try {
    names = fs.readdirSync(UPLOADS_DIR);
  } catch {
    return;
  }
  const known = db.prepare("SELECT id FROM media WHERE storage_name = ?");
  for (const name of names) {
    if (!MEDIA_EXTENSIONS.includes(path.extname(name).toLowerCase())) continue;
    if (byPath.has(name) || known.get(name)) continue;
    insertMediaFile(db, name, name);
  }
}

/** Slug for `name` that no row in `table` holds yet. */
function uniqueSlugFor(
  db: Database.Database,
  table: "skills" | "categories" | "skill_groups",
  name: string
): string {
  const base = slugify(name);
  const taken = db.prepare(`SELECT id FROM ${table} WHERE slug = ?`);
  let slug = base;
  let n = 2;
  while (taken.get(slug)) slug = `${base}-${n++}`;
  return slug;
}

/* ------------------------------------------------------------------ */
/* Migration: widen media.kind CHECK to accept 'video'                */
/* ------------------------------------------------------------------ */

/**
 * Widens media.kind to accept 'video' and resources.type to accept
 * 'local_video'. SQLite can only change a CHECK constraint by rebuilding the
 * table, so this follows its documented procedure: foreign keys off, rebuild
 * in a transaction, check the keys, foreign keys back on. Dropping `media`
 * with foreign keys on would null every course thumbnail and delete every
 * tag link pointing at it.
 *
 * It looks at the tables rather than trusting user_version, because an
 * earlier bug stamped databases as version 2 without running it.
 */
function migrateMediaVideoKind(db: Database.Database) {
  const needsMedia = !tableSql(db, "media").includes("'video'");
  const needsResources = !tableSql(db, "resources").includes("'local_video'");

  if (needsMedia || needsResources) {
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        if (needsMedia) {
          db.exec(`
            CREATE TABLE media_v2 (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              folder_id INTEGER REFERENCES media_folders(id) ON DELETE SET NULL,
              storage_name TEXT NOT NULL UNIQUE,
              filename TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              alt TEXT NOT NULL DEFAULT '',
              kind TEXT NOT NULL CHECK (kind IN ('image', 'pdf', 'video')),
              mime TEXT NOT NULL,
              bytes INTEGER NOT NULL DEFAULT 0,
              width INTEGER,
              height INTEGER,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO media_v2 (id, folder_id, storage_name, filename, title, alt, kind, mime, bytes, width, height, created_at)
              SELECT id, folder_id, storage_name, filename, title, alt, kind, mime, bytes, width, height, created_at FROM media;
            DROP TABLE media;
            ALTER TABLE media_v2 RENAME TO media;
          `);
        }
        if (needsResources) {
          db.exec(`
            CREATE TABLE resources_v2 (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
              type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'storyboard', 'video', 'local_video')),
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              position INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO resources_v2 (id, skill_id, type, title, content, position)
              SELECT id, skill_id, type, title, content, position FROM resources;
            DROP TABLE resources;
            ALTER TABLE resources_v2 RENAME TO resources;
          `);
        }
        const broken = db.pragma("foreign_key_check") as unknown[];
        if (broken.length > 0) {
          throw new Error(`Media migration left ${broken.length} broken foreign key reference(s).`);
        }
      })();
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }

  if (Number(db.pragma("user_version", { simple: true })) < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
}

function tableSql(db: Database.Database, name: string): string {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { sql: string } | undefined;
  return row?.sql ?? "";
}

/* ------------------------------------------------------------------ */
/* Seed data: a few example skills with demo resources so the app     */
/* is explorable on first run. All replaceable via the admin section. */
/* ------------------------------------------------------------------ */

function seedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM skills").get() as { n: number };
  if (count.n > 0) return;

  const storyboardFrames = seedStoryboardFrames(db);
  const guidePdf = seedPdf(db, "venepuncture-guide.pdf", "Venepuncture: Procedure Guide", [
    "This is a sample seeded document to demonstrate the PDF viewer.",
    "Replace it with your own materials via the admin section.",
    "",
    "1. Confirm patient identity and obtain informed consent.",
    "2. Perform hand hygiene and assemble equipment.",
    "3. Apply the tourniquet and select a suitable vein.",
    "4. Cleanse the site and allow it to dry.",
    "5. Insert the needle at 15-30 degrees, bevel up.",
    "6. Collect samples in the correct order of draw.",
    "7. Release the tourniquet, withdraw and apply pressure.",
    "8. Label samples at the bedside and dispose of sharps safely.",
  ]);
  const blsPdf = seedPdf(db, "bls-algorithm.pdf", "Basic Life Support: Algorithm Summary", [
    "Sample seeded document. Replace via the admin section.",
    "",
    "1. Confirm scene safety.",
    "2. Check for response and normal breathing.",
    "3. Call for help and request a defibrillator.",
    "4. Start chest compressions at 100-120 per minute.",
    "5. Give 30 compressions to 2 ventilations.",
    "6. Attach the AED as soon as it arrives and follow prompts.",
  ]);
  const vitalsImage = seedVitalsImage(db);

  // A starter taxonomy: two groups, each holding a couple of categories.
  const insertGroup = db.prepare(
    "INSERT INTO skill_groups (slug, name, description, position) VALUES (?, ?, ?, ?)"
  );
  const insertCategory = db.prepare(
    "INSERT INTO categories (group_id, slug, name, position) VALUES (?, ?, ?, ?)"
  );
  const seedGroup = (name: string, description: string, position: number) =>
    Number(insertGroup.run(slugify(name), name, description, position).lastInsertRowid);
  const seedCategory = (name: string, groupId: number, position: number) =>
    Number(insertCategory.run(groupId, slugify(name), name, position).lastInsertRowid);

  const coreSkills = seedGroup(
    "Core clinical skills",
    "Everyday procedures and assessments practised in the skills lab.",
    0
  );
  const emergencyCare = seedGroup(
    "Emergency care",
    "Recognising and responding to the acutely unwell patient.",
    1
  );
  const categoryIds: Record<string, number> = {
    Procedures: seedCategory("Procedures", coreSkills, 0),
    Assessment: seedCategory("Assessment", coreSkills, 1),
    Emergency: seedCategory("Emergency", emergencyCare, 0),
  };

  const insertSkill = db.prepare(
    "INSERT INTO skills (slug, title, category_id, description, thumbnail_media_id) VALUES (?, ?, ?, ?, ?)"
  );
  const insertResource = db.prepare(
    "INSERT INTO resources (skill_id, type, title, content, position) VALUES (?, ?, ?, ?, ?)"
  );
  const seed = (
    slug: string,
    title: string,
    category: string,
    description: string,
    initials: string
  ) =>
    insertSkill.run(
      slug,
      title,
      categoryIds[category] ?? null,
      description,
      seedThumbnail(db, slug, title, category, initials)
    ).lastInsertRowid;

  const venepuncture = seed(
    "venepuncture",
    "Venepuncture",
    "Procedures",
    "Safe collection of venous blood samples, including patient preparation, vein selection, order of draw and post-procedure care.",
    "Ve"
  );
  insertResource.run(venepuncture, "video", "Demonstration video", "https://vimeo.com/76979871", 0);
  insertResource.run(venepuncture, "storyboard", "Step-by-step storyboard", JSON.stringify(storyboardFrames), 1);
  insertResource.run(venepuncture, "pdf", "Procedure guide (PDF)", mediaRef(guidePdf), 2);

  const cannulation = seed(
    "peripheral-iv-cannulation",
    "Peripheral IV Cannulation",
    "Procedures",
    "Insertion of a peripheral intravenous cannula: site selection, aseptic technique, securing the device and documentation.",
    "IV"
  );
  insertResource.run(cannulation, "video", "Demonstration video", "https://vimeo.com/76979871", 0);

  const bls = seed(
    "basic-life-support",
    "Basic Life Support",
    "Emergency",
    "Adult basic life support: recognising cardiac arrest, high-quality chest compressions, rescue breaths and safe defibrillator use.",
    "BLS"
  );
  insertResource.run(bls, "pdf", "Algorithm summary (PDF)", mediaRef(blsPdf), 0);

  const vitals = seed(
    "vital-signs-measurement",
    "Vital Signs Measurement",
    "Assessment",
    "Accurate measurement and interpretation of temperature, pulse, respiratory rate, blood pressure and oxygen saturation.",
    "VS"
  );
  insertResource.run(vitals, "image", "Equipment overview", mediaRef(vitalsImage), 0);

  seed(
    "urinary-catheterisation",
    "Urinary Catheterisation",
    "Procedures",
    "Aseptic insertion of a urethral catheter, including consent, positioning, catheter selection and ongoing care.",
    "UC"
  );

  seed(
    "wound-assessment-dressing",
    "Wound Assessment & Dressing",
    "Assessment",
    "Systematic wound assessment, dressing selection and aseptic dressing technique for acute and chronic wounds.",
    "WA"
  );
}

const THUMBNAIL_PALETTES: Record<string, { bg: string; shape: string; accent: string }> = {
  Procedures: { bg: "#ccfbf1", shape: "#99f6e4", accent: "#0f766e" },
  Emergency: { bg: "#ffe4e6", shape: "#fecdd3", accent: "#be123c" },
  Assessment: { bg: "#e0f2fe", shape: "#bae6fd", accent: "#0369a1" },
};

function seedThumbnail(
  db: Database.Database,
  slug: string,
  title: string,
  category: string,
  initials: string
): number {
  const palette = THUMBNAIL_PALETTES[category] ?? THUMBNAIL_PALETTES.Procedures;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <rect width="800" height="450" fill="${palette.bg}"/>
  <circle cx="660" cy="60" r="180" fill="${palette.shape}"/>
  <circle cx="90" cy="420" r="130" fill="${palette.shape}"/>
  <circle cx="400" cy="225" r="110" fill="${palette.accent}"/>
  <text x="400" y="252" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="bold" fill="#ffffff">${initials}</text>
</svg>`;
  return saveSeedFile(db, `seed-thumb-${slug}.svg`, svg, `${title} thumbnail`);
}

/** Writes a seeded file and records it in the library. Returns its media id. */
function saveSeedFile(
  db: Database.Database,
  name: string,
  data: Buffer | string,
  title: string
): number {
  fs.writeFileSync(path.join(UPLOADS_DIR, name), data);
  return insertMediaFile(db, name, name, title);
}

function seedStoryboardFrames(db: Database.Database): { media_id: number; caption: string }[] {
  const steps = [
    ["1", "Prepare", "Confirm identity, gain consent and perform hand hygiene"],
    ["2", "Tourniquet", "Apply the tourniquet and palpate to select a vein"],
    ["3", "Cleanse", "Clean the site for 30 seconds and allow to dry"],
    ["4", "Insert", "Insert the needle at 15–30° with the bevel up"],
    ["5", "Collect", "Draw samples following the correct order of draw"],
    ["6", "Complete", "Release, withdraw, apply pressure and label samples"],
  ];
  return steps.map(([n, title, caption], i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#f0fdfa"/>
  <rect x="24" y="24" width="752" height="452" rx="16" fill="#ffffff" stroke="#99f6e4" stroke-width="2"/>
  <circle cx="120" cy="180" r="56" fill="#0d9488"/>
  <text x="120" y="202" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="60" font-weight="bold" fill="#ffffff">${n}</text>
  <text x="64" y="330" font-family="Helvetica, Arial, sans-serif" font-size="42" font-weight="bold" fill="#134e4a">${title}</text>
  <text x="64" y="440" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#a8a29e">Sample storyboard frame — replace via the admin section</text>
</svg>`;
    return {
      media_id: saveSeedFile(db, `seed-venepuncture-step-${i + 1}.svg`, svg, `Venepuncture step ${i + 1}`),
      caption,
    };
  });
}

function seedVitalsImage(db: Database.Database): number {
  const items = [
    ["Thermometer", "Temperature"],
    ["Watch / monitor", "Pulse & respirations"],
    ["Sphygmomanometer", "Blood pressure"],
    ["Pulse oximeter", "Oxygen saturation"],
  ];
  const boxes = items
    .map(([name, use], i) => {
      const x = 60 + (i % 2) * 350;
      const y = 130 + Math.floor(i / 2) * 160;
      return `<rect x="${x}" y="${y}" width="310" height="120" rx="12" fill="#ffffff" stroke="#99f6e4" stroke-width="2"/>
  <text x="${x + 24}" y="${y + 52}" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="bold" fill="#134e4a">${name}</text>
  <text x="${x + 24}" y="${y + 86}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#57534e">${use}</text>`;
    })
    .join("\n  ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="480" viewBox="0 0 780 480">
  <rect width="780" height="480" fill="#f0fdfa"/>
  <text x="60" y="80" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="bold" fill="#134e4a">Vital signs equipment</text>
  ${boxes}
  <text x="60" y="450" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#a8a29e">Sample image — replace via the admin section</text>
</svg>`;
  return saveSeedFile(db, "seed-vitals-equipment.svg", svg, "Vital signs equipment");
}

/** Builds a minimal but valid one-page PDF with the given title and lines. */
function seedPdf(
  db: Database.Database,
  name: string,
  title: string,
  lines: string[]
): number {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let text = `BT /F1 20 Tf 72 720 Td (${esc(title)}) Tj ET\n`;
  lines.forEach((line, i) => {
    text += `BT /F1 12 Tf 72 ${680 - i * 22} Td (${esc(line)}) Tj ET\n`;
  });

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return saveSeedFile(db, name, Buffer.from(pdf, "latin1"), title);
}
