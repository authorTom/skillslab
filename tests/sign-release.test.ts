import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  signingPayload,
  signManifest,
  verifyManifest,
  publicKeyBase64,
} from "../scripts/sign-release.mjs";

const SCRIPT = path.join(import.meta.dirname, "..", "scripts", "sign-release.mjs");

function makeManifest(overrides = {}) {
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

function keypairPem() {
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

describe("sign-release signingPayload", () => {
  // This exact layout is what apps/ipad/src/data/signature.ts verifies against.
  // If this test fails, the app and the signer have drifted and every signed
  // package will be rejected on device.
  it("matches the field order the iPad app verifies", () => {
    expect(signingPayload(makeManifest()).split("\n")).toEqual([
      "skillslab-content",
      "1",
      "1",
      "rel-001",
      "1.0.0",
      "2026-01-15T10:00:00Z",
      "abc123",
      "4096",
      "def456:2048",
    ]);
  });

  it("appends every asset as sha256:bytes in order", () => {
    const manifest = makeManifest({
      assets: [
        { media_id: 1, path: "a", mime: "image/jpeg", bytes: 100, sha256: "hash_a" },
        { media_id: 2, path: "b", mime: "video/mp4", bytes: 200, sha256: "hash_b" },
      ],
    });
    expect(signingPayload(manifest).split("\n").slice(-2)).toEqual([
      "hash_a:100",
      "hash_b:200",
    ]);
  });

  it("excludes the signature field itself", () => {
    const manifest = makeManifest();
    const withSig = { ...manifest, signature: "irrelevant" };
    expect(signingPayload(withSig)).toBe(signingPayload(manifest));
  });
});

describe("sign-release signing", () => {
  it("derives a 32-byte public key", () => {
    const raw = Buffer.from(publicKeyBase64(keypairPem()), "base64");
    expect(raw.length).toBe(32);
  });

  it("signs and verifies a manifest round trip", () => {
    const pem = keypairPem();
    const manifest = makeManifest();
    const signed = { ...manifest, signature: signManifest(manifest, pem) };

    expect(Buffer.from(signed.signature, "base64").length).toBe(64);
    expect(verifyManifest(signed, publicKeyBase64(pem))).toEqual({ valid: true });
  });

  it("rejects a tampered manifest", () => {
    const pem = keypairPem();
    const manifest = makeManifest();
    const signed = {
      ...manifest,
      assets: [{ ...manifest.assets[0], bytes: 9999 }],
      signature: signManifest(manifest, pem),
    };
    const result = verifyManifest(signed, publicKeyBase64(pem));
    expect(result.valid).toBe(false);
  });

  it("rejects an unsigned manifest", () => {
    const result = verifyManifest(makeManifest(), publicKeyBase64(keypairPem()));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("unsigned");
  });

  it("refuses a non-Ed25519 key", () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    expect(() => signManifest(makeManifest(), pem)).toThrow(/Ed25519/);
  });
});

describe("sign-release CLI", () => {
  it("signs a release directory in place and verifies it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-release-"));
    const keyPath = path.join(dir, "key.pem");
    try {
      fs.writeFileSync(keyPath, keypairPem());
      fs.writeFileSync(
        path.join(dir, "manifest.json"),
        JSON.stringify(makeManifest(), null, 2)
      );

      const pub = execFileSync("node", [SCRIPT, "--key", keyPath, "--print-public-key"], {
        encoding: "utf8",
      }).trim();

      execFileSync("node", [SCRIPT, "--key", keyPath, "--write", dir], { encoding: "utf8" });

      const written = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
      expect(written.signature).toBeTruthy();

      const out = execFileSync("node", [SCRIPT, "--verify", "--public-key", pub, dir], {
        encoding: "utf8",
      });
      expect(out).toContain("OK");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
