import fs from "fs";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ReleaseManifest } from "@/lib/offline/schema";

const TEST_DIR = path.join(__dirname, ".test-releases");

function writeManifest(id: string, version: string, createdAt: string) {
  const dir = path.join(TEST_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const manifest: ReleaseManifest = {
    format: "skillslab-content",
    package_schema_version: 1,
    content_schema_version: 1,
    release_id: id,
    release_version: version,
    created_at: createdAt,
    catalogue: { filename: "catalogue.sqlite", bytes: 100, sha256: "abc" },
    assets: [],
    total_uncompressed_bytes: 100,
    counts: { groups: 1, categories: 1, skills: 2, resources: 3, assets: 0 },
    min_app_content_schema_version: 1,
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

describe("releases module", () => {
  let releases: typeof import("@/lib/offline/releases");

  beforeEach(async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    // Dynamically import after mocking the RELEASES_DIR
    const { vi } = await import("vitest");
    vi.doMock("@/lib/offline/export", () => ({ RELEASES_DIR: TEST_DIR }));
    releases = await import("@/lib/offline/releases");
  });

  afterEach(async () => {
    const { vi } = await import("vitest");
    vi.restoreAllMocks();
    vi.resetModules();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("lists releases sorted newest first", () => {
    writeManifest("r1", "1.0.0", "2025-01-01T00:00:00Z");
    writeManifest("r2", "1.1.0", "2025-06-01T00:00:00Z");
    const list = releases.listReleases();
    expect(list).toHaveLength(2);
    expect(list[0].version).toBe("1.1.0");
    expect(list[1].version).toBe("1.0.0");
  });

  it("returns empty list when no releases exist", () => {
    expect(releases.listReleases()).toHaveLength(0);
  });

  it("marks a release as current", () => {
    writeManifest("r1", "1.0.0", "2025-01-01T00:00:00Z");
    releases.markCurrent("r1");
    const list = releases.listReleases();
    expect(list[0].current).toBe(true);
  });

  it("getCurrentRelease returns null when nothing is current", () => {
    writeManifest("r1", "1.0.0", "2025-01-01T00:00:00Z");
    expect(releases.getCurrentRelease()).toBeNull();
  });

  it("getCurrentRelease returns the marked release", () => {
    writeManifest("r1", "1.0.0", "2025-01-01T00:00:00Z");
    releases.markCurrent("r1");
    const current = releases.getCurrentRelease();
    expect(current).not.toBeNull();
    expect(current!.manifest.release_version).toBe("1.0.0");
  });

  it("deleteRelease removes the release directory", () => {
    writeManifest("r1", "1.0.0", "2025-01-01T00:00:00Z");
    expect(releases.deleteRelease("r1")).toBe(true);
    expect(releases.listReleases()).toHaveLength(0);
  });

  it("deleteRelease clears current marker if deleting the current release", () => {
    writeManifest("r1", "1.0.0", "2025-01-01T00:00:00Z");
    releases.markCurrent("r1");
    releases.deleteRelease("r1");
    expect(releases.getCurrentRelease()).toBeNull();
  });

  it("enforceRetention keeps only the specified number of non-current releases", () => {
    writeManifest("r1", "1.0.0", "2025-01-01T00:00:00Z");
    writeManifest("r2", "1.1.0", "2025-02-01T00:00:00Z");
    writeManifest("r3", "1.2.0", "2025-03-01T00:00:00Z");
    writeManifest("r4", "1.3.0", "2025-04-01T00:00:00Z");
    releases.markCurrent("r4");
    const removed = releases.enforceRetention(2);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toBe("r1");
    expect(releases.listReleases()).toHaveLength(3);
  });

  it("getRelease sanitises path traversal in id", () => {
    expect(releases.getRelease("../../etc/passwd")).toBeNull();
  });
});
