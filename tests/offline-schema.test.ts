import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { READER_SCHEMA_SQL, CONTENT_SCHEMA_VERSION } from "@/lib/offline/schema";

describe("reader schema", () => {
  it("creates all expected tables", () => {
    const db = new Database(":memory:");
    db.exec(READER_SCHEMA_SQL);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("metadata");
    expect(names).toContain("groups");
    expect(names).toContain("categories");
    expect(names).toContain("skills");
    expect(names).toContain("resources");
    expect(names).toContain("storyboard_frames");
    expect(names).toContain("media");
    db.close();
  });

  it("enforces foreign keys between categories and groups", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(READER_SCHEMA_SQL);
    expect(() => {
      db.prepare("INSERT INTO categories (id, group_id, slug, name, position) VALUES (1, 999, 'x', 'x', 0)").run();
    }).toThrow();
    db.close();
  });

  it("enforces foreign keys between resources and skills", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(READER_SCHEMA_SQL);
    expect(() => {
      db.prepare(
        "INSERT INTO resources (id, skill_id, type, title, position) VALUES (1, 999, 'pdf', 'x', 0)"
      ).run();
    }).toThrow();
    db.close();
  });

  it("stores and retrieves metadata", () => {
    const db = new Database(":memory:");
    db.exec(READER_SCHEMA_SQL);
    db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)").run(
      "content_schema_version",
      String(CONTENT_SCHEMA_VERSION)
    );
    const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get("content_schema_version") as {
      value: string;
    };
    expect(row.value).toBe(String(CONTENT_SCHEMA_VERSION));
    db.close();
  });
});
