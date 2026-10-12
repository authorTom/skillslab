import crypto from "crypto";
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
const dbPath = () => path.join(tmp, "data", "app.db");
const uploadsDir = () => path.join(tmp, "data", "uploads");

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

/** The tables every installation made before this fix has. */
const CONTENT_TABLES = [
  "media_folders",
  "media",
  "media_tags",
  "media_tag_links",
  "skill_groups",
  "categories",
  "skills",
  "resources",
  "trash",
];

/** Opens the raw file, outside the app, to inspect or reshape it. */
function withRawDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(dbPath());
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Drops whatever an installation made before this fix wouldn't have. */
function asCreatedByEarlierVersion(db: Database.Database) {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  for (const { name } of tables) {
    if (!CONTENT_TABLES.includes(name)) db.exec(`DROP TABLE ${name}`);
  }
}

function counts(db: Database.Database): Record<string, number> {
  return Object.fromEntries(
    CONTENT_TABLES.map((table) => [
      table,
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
    ])
  );
}

/** Every row of every content table, plus the bytes of every uploaded file. */
function fullSnapshot(db: Database.Database) {
  const rows = Object.fromEntries(
    CONTENT_TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])
  );
  const files = Object.fromEntries(
    fs
      .readdirSync(uploadsDir())
      .sort()
      .map((name) => [
        name,
        crypto.createHash("sha256").update(fs.readFileSync(path.join(uploadsDir(), name))).digest("hex"),
      ])
  );
  return { rows, files };
}

const DEMO_COUNTS = {
  media_folders: 0,
  media: 15,
  media_tags: 0,
  media_tag_links: 0,
  skill_groups: 2,
  categories: 3,
  skills: 6,
  resources: 6,
  trash: 0,
};

/**
 * What an admin leaves behind after deleting every course from a seeded
 * installation: courses binned, categories gone, one group kept, the library
 * still holding the demo files plus an upload of their own, one of which they
 * replaced.
 */
function deleteEveryCourse(db: Database.Database) {
  const skills = db.prepare("SELECT * FROM skills").all() as { id: number; title: string }[];
  const bin = db.prepare("INSERT INTO trash (kind, label, payload) VALUES ('skill', ?, ?)");
  for (const skill of skills) bin.run(skill.title, JSON.stringify(skill));
  db.exec(`
    DELETE FROM skills;
    DELETE FROM categories;
    DELETE FROM skill_groups WHERE slug <> 'core-clinical-skills';
  `);

  fs.writeFileSync(path.join(uploadsDir(), "seed-venepuncture-step-1.svg"), "<svg>replaced by the admin</svg>");
  fs.writeFileSync(path.join(uploadsDir(), "own-poster.png"), "not really a png");
  db.prepare(
    "INSERT INTO media (storage_name, filename, kind, mime, bytes) VALUES ('own-poster.png', 'Poster.png', 'image', 'image/png', 16)"
  ).run();
}

/**
 * The state the first failed restart in production started from: as above,
 * but with the demo library files purged, so a reseed gets past the media
 * inserts and fails on the group slug instead.
 */
function deleteEveryCourseAndPurgeDemoFiles(db: Database.Database) {
  deleteEveryCourse(db);
  const demo = db
    .prepare("SELECT storage_name FROM media WHERE storage_name <> 'own-poster.png'")
    .all() as { storage_name: string }[];
  for (const { storage_name } of demo) fs.rmSync(path.join(uploadsDir(), storage_name));
  db.exec("DELETE FROM media WHERE storage_name <> 'own-poster.png'");
}

function deleteEverything(db: Database.Database) {
  for (const table of [...CONTENT_TABLES].reverse()) db.exec(`DELETE FROM ${table}`);
  for (const name of fs.readdirSync(uploadsDir())) fs.rmSync(path.join(uploadsDir(), name));
}

function expectHealthy(db: Database.Database) {
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(db.pragma("foreign_key_check")).toEqual([]);
  expect(db.pragma("user_version", { simple: true })).toBe(2);
}

describe("demo catalogue seeding", () => {
  beforeEach(() => {
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-seed-"));
    process.chdir(tmp);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeAppDb();
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("seeds a new installation once, however often it restarts", async () => {
    const db = await openAppDb();
    expect(counts(db)).toEqual(DEMO_COUNTS);
    expect(fs.readdirSync(uploadsDir())).toHaveLength(DEMO_COUNTS.media);
    expectHealthy(db);
    const first = fullSnapshot(db);
    closeAppDb();

    for (let restart = 0; restart < 3; restart++) {
      const reopened = await openAppDb();
      expect(fullSnapshot(reopened)).toEqual(first);
      expectHealthy(reopened);
      closeAppDb();
    }
  });

  for (const origin of ["before", "after"] as const) {
    const prepare = (db: Database.Database) => {
      if (origin === "before") asCreatedByEarlierVersion(db);
    };

    describe(`a database created ${origin} this fix`, () => {
      for (const [state, reshape] of [
        ["no courses but its library and bin", deleteEveryCourse],
        ["no courses and the demo files purged", deleteEveryCourseAndPurgeDemoFiles],
      ] as const) {
        it(`starts with ${state} left exactly as it was`, async () => {
          await openAppDb();
          closeAppDb();
          const before = withRawDb((raw) => {
            reshape(raw);
            prepare(raw);
            return fullSnapshot(raw);
          });

          for (let restart = 0; restart < 2; restart++) {
            const db = await openAppDb();
            expect(fullSnapshot(db)).toEqual(before);
            expectHealthy(db);
            closeAppDb();
          }
        });
      }

      it("stays empty when everything was deliberately deleted", async () => {
        await openAppDb();
        closeAppDb();
        withRawDb((raw) => {
          deleteEverything(raw);
          prepare(raw);
        });

        const db = await openAppDb();
        expect(Object.values(counts(db)).every((n) => n === 0)).toBe(true);
        expect(fs.readdirSync(uploadsDir())).toEqual([]);
        expectHealthy(db);
      });
    });
  }

  it("serves pages and files from a database with no courses", async () => {
    await openAppDb();
    closeAppDb();
    withRawDb((raw) => {
      deleteEveryCourse(raw);
      asCreatedByEarlierVersion(raw);
    });

    // The two ways in: server-rendered pages read through data.ts, and the
    // /files route handler calls getDb itself.
    vi.resetModules();
    globalThis.__clinicalSkillsDb = undefined;
    const { listSkills, listGroups } = await import("@/lib/data");
    const { GET } = await import("@/app/files/[...path]/route");

    expect(listSkills()).toEqual([]);
    expect(listGroups().map((g) => g.slug)).toEqual(["core-clinical-skills"]);
    const response = await GET(new Request("http://localhost/files/own-poster.png"), {
      params: Promise.resolve({ path: ["own-poster.png"] }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("not really a png");
  });

  it("rolls back a seed that fails part-way, then seeds cleanly on the next start", async () => {
    const write = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, ...rest) => {
      if (String(file).includes("bls-algorithm")) throw new Error("disk full");
      return write(file, ...rest);
    });

    await expect(openAppDb()).rejects.toThrow("disk full");
    expect(globalThis.__clinicalSkillsDb).toBeUndefined();
    withRawDb((raw) => {
      expect(Object.values(counts(raw)).every((n) => n === 0)).toBe(true);
    });
    expect(fs.readdirSync(uploadsDir())).toEqual([]);

    vi.mocked(fs.writeFileSync).mockRestore();
    const db = await openAppDb();
    expect(counts(db)).toEqual(DEMO_COUNTS);
    expectHealthy(db);
  });

  it("never overwrites a file already in the uploads directory", async () => {
    // A new database beside an uploads directory that outlived the old one.
    fs.mkdirSync(uploadsDir(), { recursive: true });
    const theirs = path.join(uploadsDir(), "bls-algorithm.pdf");
    fs.writeFileSync(theirs, "%PDF-1.4 their own document");

    const db = await openAppDb();
    expect(fs.readFileSync(theirs, "utf8")).toBe("%PDF-1.4 their own document");
    expect(counts(db)).toMatchObject({ skills: 6, resources: 6, skill_groups: 2, categories: 3 });

    // The demo course points at a file of its own, not theirs.
    const ref = (
      db
        .prepare(
          "SELECT r.content FROM resources r JOIN skills s ON s.id = r.skill_id WHERE s.slug = 'basic-life-support'"
        )
        .get() as { content: string }
    ).content;
    const media = db
      .prepare("SELECT storage_name, filename FROM media WHERE id = ?")
      .get(Number(ref.replace("media:", ""))) as { storage_name: string; filename: string };
    expect(media.storage_name).not.toBe("bls-algorithm.pdf");
    expect(fs.readFileSync(path.join(uploadsDir(), media.storage_name), "latin1")).toMatch(/^%PDF-1\.4\n/);
    expectHealthy(db);
  });
});
