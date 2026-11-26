import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

declare global {
  var __clinicalSkillsDb: Database.Database | undefined;
}

let tmp: string;
let cwd: string;

describe("offline export of key points and chapters", () => {
  beforeEach(() => {
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-export-"));
    process.chdir(tmp);
    vi.resetModules();
    globalThis.__clinicalSkillsDb = undefined;
    vi.stubEnv("RELEASE_SIGNING_KEY_FILE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.__clinicalSkillsDb?.close();
    globalThis.__clinicalSkillsDb = undefined;
    process.chdir(cwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes them into the reader catalogue", async () => {
    const { getDb, insertMediaFile, UPLOADS_DIR } = await import("@/lib/db");
    const { addResource } = await import("@/lib/data");
    const { buildRelease } = await import("@/lib/offline/export");
    const db = getDb();

    fs.writeFileSync(path.join(UPLOADS_DIR, "demo.mp4"), "not really a video");
    const mediaId = insertMediaFile(db, "demo.mp4", "demo.mp4");
    const skill = db.prepare("SELECT id FROM skills WHERE slug = 'venepuncture'").get() as { id: number };
    addResource(skill.id, "local_video", "Demo", `media:${mediaId}`, "0:00 Start\n1:05 Tourniquet");

    const result = await buildRelease({ version: "9.9.9", vimeoPolicy: "permissive" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.content_schema_version).toBe(1);

    const catalogue = new Database(path.join(result.archivePath, "catalogue.sqlite"), { readonly: true });
    try {
      const row = catalogue.prepare("SELECT equipment, red_flags FROM skills WHERE slug = 'venepuncture'").get() as {
        equipment: string;
        red_flags: string;
      };
      expect(row.equipment).toContain("Tourniquet");
      expect(row.red_flags).not.toBe("");

      const video = catalogue.prepare("SELECT chapters FROM resources WHERE type = 'local_video'").get() as {
        chapters: string;
      };
      expect(JSON.parse(video.chapters)).toEqual([
        { time: 0, title: "Start" },
        { time: 65, title: "Tourniquet" },
      ]);
      const other = catalogue.prepare("SELECT chapters FROM resources WHERE type = 'pdf' LIMIT 1").get() as {
        chapters: string;
      };
      expect(other.chapters).toBe("[]");
    } finally {
      catalogue.close();
    }
  });
});
