// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  getPublicKey,
  setPublicKey,
  isSignatureEnforced,
  signingPayload,
  verifySignature,
} from "../src/data/signature";
import type { ReleaseManifest } from "../src/data/types";

function makeManifest(overrides?: Partial<ReleaseManifest>): ReleaseManifest {
  return {
    format: "skillslab-content",
    package_schema_version: 1,
    content_schema_version: 1,
    release_id: "rel-001",
    release_version: "1.0.0",
    created_at: "2026-01-15T10:00:00Z",
    catalogue: { filename: "catalogue.sqlite", bytes: 4096, sha256: "abc123" },
    assets: [
      { media_id: 1, path: "assets/def456.jpg", mime: "image/jpeg", bytes: 2048, sha256: "def456" },
    ],
    total_uncompressed_bytes: 6144,
    counts: { groups: 1, categories: 2, skills: 3, resources: 4, assets: 1 },
    min_app_content_schema_version: 1,
    ...overrides,
  };
}

describe("signature", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("public key storage", () => {
    it("returns empty string when no key is set", () => {
      expect(getPublicKey()).toBe("");
    });

    it("stores and retrieves a key", () => {
      setPublicKey("dGVzdGtleQ==");
      expect(getPublicKey()).toBe("dGVzdGtleQ==");
    });

    it("clears the key when set to empty string", () => {
      setPublicKey("dGVzdGtleQ==");
      setPublicKey("");
      expect(getPublicKey()).toBe("");
    });
  });

  describe("isSignatureEnforced", () => {
    it("returns false when no key is configured", () => {
      expect(isSignatureEnforced()).toBe(false);
    });

    it("returns true when a key is configured", () => {
      setPublicKey("dGVzdGtleQ==");
      expect(isSignatureEnforced()).toBe(true);
    });
  });

  describe("signingPayload", () => {
    it("produces a deterministic newline-separated payload", () => {
      const manifest = makeManifest();
      const payload = signingPayload(manifest);
      const lines = payload.split("\n");

      expect(lines[0]).toBe("skillslab-content");
      expect(lines[1]).toBe("1");
      expect(lines[2]).toBe("1");
      expect(lines[3]).toBe("rel-001");
      expect(lines[4]).toBe("1.0.0");
      expect(lines[5]).toBe("2026-01-15T10:00:00Z");
      expect(lines[6]).toBe("abc123");
      expect(lines[7]).toBe("4096");
      expect(lines[8]).toBe("def456:2048");
      expect(lines).toHaveLength(9);
    });

    it("includes all assets in order", () => {
      const manifest = makeManifest({
        assets: [
          { media_id: 1, path: "assets/aaa.jpg", mime: "image/jpeg", bytes: 100, sha256: "hash_a" },
          { media_id: 2, path: "assets/bbb.png", mime: "image/png", bytes: 200, sha256: "hash_b" },
          { media_id: 3, path: "assets/ccc.mp4", mime: "video/mp4", bytes: 300, sha256: "hash_c" },
        ],
      });
      const payload = signingPayload(manifest);
      const lines = payload.split("\n");

      expect(lines[8]).toBe("hash_a:100");
      expect(lines[9]).toBe("hash_b:200");
      expect(lines[10]).toBe("hash_c:300");
    });
  });

  describe("verifySignature", () => {
    it("passes when no public key is configured", async () => {
      const manifest = makeManifest();
      const result = await verifySignature(manifest);
      expect(result.valid).toBe(true);
    });

    it("passes unsigned manifests when no key is configured", async () => {
      const manifest = makeManifest({ signature: undefined });
      const result = await verifySignature(manifest);
      expect(result.valid).toBe(true);
    });

    it("rejects unsigned manifest when key is configured", async () => {
      setPublicKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
      const manifest = makeManifest({ signature: undefined });
      const result = await verifySignature(manifest);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("unsigned");
      }
    });

    it("rejects when public key is not 32 bytes", async () => {
      setPublicKey("dG9vc2hvcnQ=");
      const manifest = makeManifest({ signature: "AAAA" });
      const result = await verifySignature(manifest);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("32 bytes");
      }
    });

    it("rejects when signature is not 64 bytes", async () => {
      setPublicKey("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
      const manifest = makeManifest({ signature: "dG9vc2hvcnQ=" });
      const result = await verifySignature(manifest);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toMatch(/64 bytes|error/i);
      }
    });
  });
});
