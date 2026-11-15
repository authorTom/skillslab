// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReleaseManifest } from "../src/data/types";

const nativeVerify = vi.fn();
vi.mock("@/data/contentPackage", () => ({
  canInstallFromFiles: () => true,
  ContentPackage: { verifySignature: (o: unknown) => nativeVerify(o) },
}));

import { setPublicKey, signingPayload, verifySignature } from "../src/data/signature";

const KEY = Buffer.alloc(32, 1).toString("base64");
const SIGNATURE = Buffer.alloc(64, 2).toString("base64");

const manifest: ReleaseManifest & { signature: string } = {
  format: "skillslab-content",
  package_schema_version: 1,
  content_schema_version: 1,
  release_id: "rel-001",
  release_version: "1.0.0",
  created_at: "2026-01-15T10:00:00Z",
  catalogue: { filename: "catalogue.sqlite", bytes: 4096, sha256: "abc123" },
  assets: [],
  total_uncompressed_bytes: 4096,
  counts: { groups: 0, categories: 0, skills: 0, resources: 0, assets: 0 },
  min_app_content_schema_version: 1,
  signature: SIGNATURE,
};

describe("signature verification on a device", () => {
  const subtle = vi.spyOn(crypto.subtle, "verify");

  beforeEach(() => {
    localStorage.clear();
    nativeVerify.mockReset();
    subtle.mockClear();
    setPublicKey(KEY);
  });
  afterEach(() => vi.clearAllMocks());

  it("asks CryptoKit, not WebCrypto, with the canonical payload", async () => {
    nativeVerify.mockResolvedValue({ valid: true });
    expect(await verifySignature(manifest)).toEqual({ valid: true });
    expect(nativeVerify).toHaveBeenCalledWith({
      payload: signingPayload(manifest),
      signature: SIGNATURE,
      publicKey: KEY,
    });
    expect(subtle).not.toHaveBeenCalled();
  });

  it("refuses a signature CryptoKit rejects", async () => {
    nativeVerify.mockResolvedValue({ valid: false });
    expect(await verifySignature(manifest)).toEqual({ valid: false, reason: "Signature verification failed." });
  });

  it("refuses, with the plugin's reason, when the native check errors", async () => {
    nativeVerify.mockRejectedValue({ code: "BAD_KEY", message: "Configured public key is not a 32-byte Ed25519 key." });
    expect(await verifySignature(manifest)).toMatchObject({ valid: false, reason: expect.stringContaining("32-byte") });
  });

  it("still refuses unsigned packages without asking", async () => {
    const { signature: _omit, ...unsigned } = manifest;
    void _omit;
    expect((await verifySignature(unsigned)).valid).toBe(false);
    expect(nativeVerify).not.toHaveBeenCalled();
  });
});
