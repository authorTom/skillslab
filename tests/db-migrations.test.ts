import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// db.ts resolves its data directory from the working directory at import
// time and caches the connection on globalThis, so each test gets a fresh
// directory, a fresh module and no cached connection.
declare global {
  var __clinicalSkillsDb: Database.Database | undefined;
}

let tmp: string;
let cwd: string;

async function openAppDb(): Promise<Database.Database> {
  vi.resetModules();
  globalThis.__clinicalSkillsDb = undefined;
  const { getDb } = await import("@/lib/db");
  return getDb();
}

function closeAppDb() {
  globalThis.__clinicalSkillsDb?.close();
  globalThis.__clinicalSkillsDb = undefined;
}

/**
 * Puts the database back into the shape it had before videos were allowed:
 * the CHECK constraints without 'video' / 'local_video', at `version`.
 */
function makeLegacy(dbPath: string, version: number) {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = OFF");
  for (const [table, from, to] of [
    ["media", "'image', 'pdf', 'video'", "'image', 'pdf'"],
    ["resources", "'pdf', 'image', 'storyboard', 'video', 'local_video'", "'pdf', 'image', 'storyboard', 'video'"],
  ]) {
    const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(table) as { sql: string };
    expect(sql).toContain(from);
    const legacySql = sql.replace(from, to).replace(`CREATE TABLE ${table}`, `CREATE TABLE ${table}_old`);
    db.exec(`
      ${legacySql};
      INSERT INTO ${table}_old SELECT * FROM ${table};
      DROP TABLE ${table};
      ALTER TABLE ${table}_old RENAME TO ${table};
    `);
  }
  db.pragma(`user_version = ${version}`);
  db.close();
}

function snapshot(db: Database.Database) {
  return {
    thumbnails: db.prepare("SELECT id, thumbnail_media_id FROM skills ORDER BY id").all(),
    tagLinks: db.prepare("SELECT media_id, tag_id FROM media_tag_links ORDER BY media_id, tag_id").all(),
    media: (db.prepare("SELECT COUNT(*) AS n FROM media").get() as { n: number }).n,
    resources: (db.prepare("SELECT COUNT(*) AS n FROM resources").get() as { n: number }).n,
  };
}

describe("media video migration", () => {
  beforeEach(() => {
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-db-"));
    process.chdir(tmp);
  });

  afterEach(() => {
    closeAppDb();
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // Version 2 without the wider constraints is what the earlier bug left
  // behind; version 1 is a database from before videos existed.
  for (const version of [2, 1]) {
    it(`widens the constraints of a version ${version} database and keeps its links`, async () => {
      const seeded = await openAppDb();
      const mediaId = (seeded.prepare("SELECT id FROM media ORDER BY id LIMIT 1").get() as { id: number }).id;
      const tagId = Number(seeded.prepare("INSERT INTO media_tags (slug, name) VALUES ('test', 'test')").run().lastInsertRowid);
      seeded.prepare("INSERT INTO media_tag_links (media_id, tag_id) VALUES (?, ?)").run(mediaId, tagId);
      seeded.prepare("UPDATE skills SET thumbnail_media_id = ?").run(mediaId);
      const before = snapshot(seeded);
      closeAppDb();

      makeLegacy(path.join(tmp, "data", "app.db"), version);

      const db = await openAppDb();
      const sqlOf = (name: string) =>
        (db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(name) as { sql: string }).sql;
      expect(sqlOf("media")).toContain("'video'");
      expect(sqlOf("resources")).toContain("'local_video'");
      expect(db.pragma("user_version", { simple: true })).toBe(2);
      expect(snapshot(db)).toEqual(before);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);

      expect(() =>
        db
          .prepare("INSERT INTO media (storage_name, filename, kind, mime) VALUES ('v.mp4', 'v.mp4', 'video', 'video/mp4')")
          .run()
      ).not.toThrow();
    });
  }
});
