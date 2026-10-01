import { describe, it, expect } from "vitest";
import { validateManifest } from "../src/data/packages";
import type { ReleaseManifest } from "../src/data/types";

function makeManifest(overrides: Partial<ReleaseManifest> = {}): ReleaseManifest {
  return {
    format: "skillslab-content",
    package_schema_version: 1,
    content_schema_version: 1,
    release_id: "test-123",
    release_version: "1.0.0",
    created_at: "2025-01-01T00:00:00Z",
    catalogue: { filename: "catalogue.sqlite", bytes: 1024, sha256: "abc" },
    assets: [],
    total_uncompressed_bytes: 1024,
    counts: { groups: 1, categories: 2, skills: 5, resources: 10, assets: 3 },
    min_app_content_schema_version: 1,
    ...overrides,
  };
}

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    expect(validateManifest(makeManifest())).toEqual([]);
  });

  it("rejects wrong package format", () => {
    const errors = validateManifest(makeManifest({ format: "something-else" }));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Unsupported package format");
  });

  it("rejects future content schema version", () => {
    const errors = validateManifest(makeManifest({ content_schema_version: 99 }));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("requires a newer app");
  });

  it("rejects missing release_id", () => {
    const errors = validateManifest(makeManifest({ release_id: "" }));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("missing release_id");
  });

  it("rejects missing catalogue", () => {
    const errors = validateManifest(
      makeManifest({ catalogue: { filename: "", bytes: 0, sha256: "" } })
    );
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("missing catalogue");
  });

  it("collects multiple errors", () => {
    const errors = validateManifest(
      makeManifest({
        format: "wrong",
        content_schema_version: 99,
        release_id: "",
      })
    );
    expect(errors.length).toBe(3);
  });

  it("rejects a manifest that isn't an object", () => {
    expect(validateManifest(null as unknown as ReleaseManifest)).toEqual(["Manifest is not a JSON object."]);
  });

  it("accepts content-addressed asset paths", () => {
    const sha = "a".repeat(64);
    const assets = [
      { media_id: 1, path: `assets/${sha}.mp4`, mime: "video/mp4", bytes: 10, sha256: sha },
      { media_id: 2, path: `assets/${sha}`, mime: "application/octet-stream", bytes: 10, sha256: sha },
    ];
    expect(validateManifest(makeManifest({ assets }))).toEqual([]);
  });

  it.each([
    "../Library/CapacitorDatabase/catalogueSQLite.db",
    `assets/../../${"a".repeat(64)}.pdf`,
    `assets/${"b".repeat(64)}.pdf`,
    `assets/sub/${"a".repeat(64)}.pdf`,
  ])("rejects asset path %s", (path) => {
    const assets = [{ media_id: 1, path, mime: "application/pdf", bytes: 10, sha256: "a".repeat(64) }];
    const errors = validateManifest(makeManifest({ assets }));
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("invalid asset path");
  });
});
