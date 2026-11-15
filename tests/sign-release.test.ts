import { describe, it, expect, vi, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
// The one signing implementation, shared by the server and the CLI script.
import {
  signingPayload,
  signManifest,
  verifyManifest,
  publicKeyBase64,
} from "@/lib/offline/signing.mjs";
import * as cli from "../scripts/sign-release.mjs";
// The iPad app's copy, which verifies what the server signs.
import { signingPayload as ipadSigningPayload } from "../apps/ipad/src/data/signature";
import type { ReleaseManifest } from "@/lib/offline/schema";

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

  it("is byte-identical to the payload the iPad app builds", () => {
    const manifests = [
      makeManifest(),
      makeManifest({ assets: [] }),
      makeManifest({
        release_version: "2.0.0 – Ünïcode",
        assets: Array.from({ length: 5 }, (_, i) => ({
          media_id: i, path: `assets/${i}`, mime: "image/png", bytes: i * 1000, sha256: `h${i}`,
        })),
      }),
    ];
    for (const manifest of manifests) {
      expect(ipadSigningPayload(manifest)).toBe(signingPayload(manifest));
    }
  });

  it("is what the CLI script signs with", () => {
    expect(cli.signingPayload).toBe(signingPayload);
    expect(cli.signManifest).toBe(signManifest);
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
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining("unsigned") });
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

describe("server-side signing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-signing-"));
  const keyFile = path.join(dir, "release-signing-key.pem");
  const pem = keypairPem();
  fs.writeFileSync(keyFile, pem);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function load() {
    vi.resetModules();
    return import("@/lib/offline/release-signing");
  }

  it("is off without RELEASE_SIGNING_KEY_FILE", async () => {
    vi.stubEnv("RELEASE_SIGNING_KEY_FILE", "");
    const signing = await load();
    expect(signing.signingStatus()).toEqual({ state: "off" });
    expect(signing.signatureFor(makeManifest() as ReleaseManifest)).toBeNull();
  });

  it("shows only the public key, and signs what the iPad will verify", async () => {
    vi.stubEnv("RELEASE_SIGNING_KEY_FILE", keyFile);
    const signing = await load();
    const status = signing.signingStatus();
    expect(status).toEqual({ state: "ready", publicKey: publicKeyBase64(pem) });
    expect(JSON.stringify(status)).not.toContain("PRIVATE KEY");

    const manifest = makeManifest() as ReleaseManifest;
    const signature = signing.signatureFor(manifest)!;
    expect(verifyManifest({ ...manifest, signature }, publicKeyBase64(pem))).toEqual({ valid: true });
    expect(signing.releaseSignature({ ...manifest, signature }, status)).toBe("signed");
    expect(signing.releaseSignature(manifest, status)).toBe("unsigned");
    const other = signManifest(manifest, keypairPem());
    expect(signing.releaseSignature({ ...manifest, signature: other }, status)).toBe("other-key");
  });

  it("refuses to sign, without revealing the key, when the file is unusable", async () => {
    const rsa = path.join(dir, "rsa.pem");
    fs.writeFileSync(
      rsa,
      crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" })
    );
    const garbage = path.join(dir, "garbage.pem");
    fs.writeFileSync(garbage, "-----BEGIN PRIVATE KEY-----\nsecret-material\n-----END PRIVATE KEY-----\n");

    for (const [file, expected] of [
      [path.join(dir, "missing.pem"), "doesn't exist"],
      [rsa, "Ed25519"],
      [garbage, "isn't an Ed25519 private key"],
    ]) {
      vi.stubEnv("RELEASE_SIGNING_KEY_FILE", file);
      const signing = await load();
      const status = signing.signingStatus();
      expect(status.state).toBe("error");
      expect(JSON.stringify(status)).toContain(expected);
      expect(JSON.stringify(status)).not.toContain("secret-material");
      expect(() => signing.signatureFor(makeManifest() as ReleaseManifest)).toThrow(expected);
    }
  });

  it("signs a real release as it is built, before it is published", async () => {
    // A fresh data/ in a temporary directory: getDb() seeds the demo courses.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "skillslab-build-"));
    const cwd = process.cwd();
    process.chdir(root);
    try {
      vi.stubEnv("RELEASE_SIGNING_KEY_FILE", keyFile);
      vi.resetModules();
      delete globalThis.__clinicalSkillsDb;
      const { buildRelease } = await import("@/lib/offline/export");
      const result = await buildRelease({ version: "1.0.0", vimeoPolicy: "permissive" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const written = JSON.parse(fs.readFileSync(path.join(result.archivePath, "manifest.json"), "utf8"));
      expect(written.signature).toBeTruthy();
      expect(verifyManifest(written, publicKeyBase64(pem))).toEqual({ valid: true });

      // A key that can't be used fails the build and publishes nothing.
      vi.stubEnv("RELEASE_SIGNING_KEY_FILE", path.join(dir, "missing.pem"));
      await expect(buildRelease({ version: "1.0.1", vimeoPolicy: "permissive" })).rejects.toThrow("doesn't exist");
      const published = fs.readdirSync(path.join(root, "data", "releases")).filter((n) => !n.startsWith("."));
      expect(published).toEqual([result.releaseId]);
    } finally {
      globalThis.__clinicalSkillsDb?.close();
      delete globalThis.__clinicalSkillsDb;
      process.chdir(cwd);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
