import { spawn, spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const SCRIPTS = path.resolve(__dirname, "..", "scripts");

let root: string;
let backups: string;

function run(script: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], {
    cwd: root,
    env: { ...process.env, BACKUP_DIR: backups },
    encoding: "utf8",
  });
  return { code: result.status, out: result.stdout + result.stderr };
}

function write(file: string, contents: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

const data = (...parts: string[]) => path.join(root, "data", ...parts);

function rows(): string[] {
  const db = new Database(data("app.db"), { readonly: true });
  try {
    return (db.prepare("SELECT title FROM skills ORDER BY id").all() as { title: string }[]).map((r) => r.title);
  } finally {
    db.close();
  }
}

/** A data/ folder like the app's: a WAL database, uploads and a release. */
function seed() {
  fs.mkdirSync(data(), { recursive: true });
  const db = new Database(data("app.db"));
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE skills (id INTEGER PRIMARY KEY, title TEXT)");
  db.prepare("INSERT INTO skills (title) VALUES (?)").run("Venepuncture");
  // Left in the WAL, not yet checkpointed into app.db: copying the file by
  // hand would miss it.
  db.prepare("INSERT INTO skills (title) VALUES (?)").run("Cannulation");
  write(data("uploads", "a1.pdf"), "guide v1");
  write(data("releases", "r1", "manifest.json"), '{"release_id":"r1"}');
  write(data("releases", "r1", "assets", "clip.mp4"), "video");
  write(data("releases", ".current"), "r1");
  write(data("releases", ".staging-r2", "manifest.json"), "half-built");
  return db;
}

describe("backup and restore scripts", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-backup-"));
    backups = path.join(root, "mounted-backups");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("round-trips the database, uploads and releases", () => {
    const live = seed();
    const backup = run("backup.mjs");
    live.close();
    expect(backup.code).toBe(0);

    const [snapshot] = fs.readdirSync(backups);
    const dir = path.join(backups, snapshot);
    expect(fs.readdirSync(dir).sort()).toEqual(["app.db", "releases", "snapshot.json", "uploads"]);
    expect(fs.existsSync(path.join(dir, "releases", ".staging-r2"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "snapshot.json"), "utf8")).files).toEqual({
      uploads: 1,
      releases: 3,
    });

    // Things change after the backup...
    const db = new Database(data("app.db"));
    db.prepare("DELETE FROM skills").run();
    db.close();
    write(data("uploads", "a1.pdf"), "guide v2");
    write(data("uploads", "b2.png"), "new");
    fs.rmSync(data("releases"), { recursive: true });

    // ...and the restore brings back exactly the snapshot.
    const restore = run("restore.mjs", snapshot);
    expect(restore.code, restore.out).toBe(0);
    expect(rows()).toEqual(["Venepuncture", "Cannulation"]);
    expect(fs.readFileSync(data("uploads", "a1.pdf"), "utf8")).toBe("guide v1");
    expect(fs.existsSync(data("uploads", "b2.png"))).toBe(false);
    expect(fs.readFileSync(data("releases", ".current"), "utf8")).toBe("r1");
    expect(fs.readFileSync(data("releases", "r1", "assets", "clip.mp4"), "utf8")).toBe("video");

    // What was replaced is kept aside, not deleted.
    const [aside] = fs.readdirSync(data()).filter((n) => n.startsWith(".pre-restore-"));
    expect(fs.readFileSync(data(aside, "uploads", "b2.png"), "utf8")).toBe("new");
  });

  it("lists snapshots when given no name, and rejects an incomplete one", () => {
    seed().close();
    run("backup.mjs");
    const [snapshot] = fs.readdirSync(backups);
    expect(run("restore.mjs").out).toContain(snapshot);

    fs.mkdirSync(path.join(backups, "2020-01-01T00-00-00.partial"));
    const result = run("restore.mjs", "2020-01-01T00-00-00.partial");
    expect(result.code).toBe(1);
    expect(result.out).toContain("not a complete snapshot");
  });

  it("keeps only BACKUP_KEEP snapshots", () => {
    seed().close();
    for (const name of ["2020-01-01T00-00-00", "2020-01-02T00-00-00"]) {
      write(path.join(backups, name, "snapshot.json"), "{}");
    }
    const result = spawnSync(process.execPath, [path.join(SCRIPTS, "backup.mjs")], {
      cwd: root,
      env: { ...process.env, BACKUP_DIR: backups, BACKUP_KEEP: "2" },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const left = fs.readdirSync(backups).sort();
    expect(left).toHaveLength(2);
    expect(left[0]).toBe("2020-01-02T00-00-00");
  });

  it("refuses to restore while another process has the database open, unless forced", async () => {
    seed().close();
    run("backup.mjs");
    const [snapshot] = fs.readdirSync(backups);

    // Stand-in for the running app: a separate process holding a connection.
    const holder = spawn(
      process.execPath,
      [
        "-e",
        `const D = require(${JSON.stringify(require.resolve("better-sqlite3"))});
         const db = new D("data/app.db"); db.prepare("SELECT 1").get();
         console.log("open"); setInterval(() => {}, 1000);`,
      ],
      { cwd: root }
    );
    await new Promise<void>((resolve) => holder.stdout.once("data", () => resolve()));

    try {
      const refused = run("restore.mjs", snapshot);
      expect(refused.code).toBe(1);
      expect(refused.out).toContain("has the database open");
      expect(fs.readdirSync(data()).some((n) => n.startsWith(".pre-restore-"))).toBe(false);

      const forced = run("restore.mjs", snapshot, "--force");
      expect(forced.code, forced.out).toBe(0);
    } finally {
      const exited = new Promise((resolve) => holder.once("exit", resolve));
      holder.kill();
      await exited;
    }

    const again = run("restore.mjs", snapshot);
    expect(again.code, again.out).toBe(0);
  });
});
