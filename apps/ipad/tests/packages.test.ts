import { describe, it, expect } from "vitest";
import type { ReleaseManifest } from "../src/data/types";

const SUPPORTED_PACKAGE_FORMAT = "skillslab-content";
const MAX_CONTENT_SCHEMA_VERSION = 1;

function validateManifest(manifest: ReleaseManifest): string[] {
  const errors: string[] = [];
  if (manifest.format !== SUPPORTED_PACKAGE_FORMAT) {
    errors.push(`Unsupported package format: "${manifest.format}".`);
  }
  if (manifest.content_schema_version > MAX_CONTENT_SCHEMA_VERSION) {
    errors.push(
      `Content schema version ${manifest.content_schema_version} requires a newer app (this app supports up to ${MAX_CONTENT_SCHEMA_VERSION}).`
    );
  }
  if (!manifest.release_id || !manifest.release_version) {
    errors.push("Manifest is missing release_id or release_version.");
  }
  if (!manifest.catalogue?.filename) {
    errors.push("Manifest is missing catalogue information.");
  }
  if (!Array.isArray(manifest.assets)) {
    errors.push("Manifest is missing assets list.");
  }
  return errors;
}

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
});
