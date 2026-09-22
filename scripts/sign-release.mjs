#!/usr/bin/env node
/**
 * Sign a release package manifest with an Ed25519 private key.
 *
 * The iPad app verifies packages against a public key configured in
 * Settings > Manage Updates > Signature Verification. Nothing else in this
 * repository produces a signature, so this is the counterpart to the
 * verification in apps/ipad/src/data/signature.ts.
 *
 * The signing payload MUST stay byte-identical to `signingPayload` in
 * apps/ipad/src/data/signature.ts. tests/sign-release.test.ts pins the
 * format so the two cannot drift apart silently.
 *
 * Usage:
 *   # derive the base64 public key to paste into the app
 *   node scripts/sign-release.mjs --key signing-key.pem --print-public-key
 *
 *   # sign, printing the signature without touching the manifest
 *   node scripts/sign-release.mjs --key signing-key.pem <release-dir|manifest.json>
 *
 *   # sign and write the signature into manifest.json
 *   node scripts/sign-release.mjs --key signing-key.pem --write <release-dir>
 *
 *   # check an already-signed manifest against a public key
 *   node scripts/sign-release.mjs --verify --public-key <base64> <release-dir>
 *
 * Generate a keypair with:
 *   openssl genpkey -algorithm Ed25519 -out signing-key.pem
 *
 * Never commit a private key. For production, generate on a secure machine
 * and keep the private key in a secrets manager or HSM.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Canonical signing payload. Mirrors `signingPayload` in
 * apps/ipad/src/data/signature.ts — keep the two in lockstep.
 */
export function signingPayload(manifest) {
  return [
    manifest.format,
    String(manifest.package_schema_version),
    String(manifest.content_schema_version),
    manifest.release_id,
    manifest.release_version,
    manifest.created_at,
    manifest.catalogue.sha256,
    String(manifest.catalogue.bytes),
    ...manifest.assets.map((a) => `${a.sha256}:${a.bytes}`),
  ].join("\n");
}

/** Raw 32-byte Ed25519 public key, base64 encoded — the form the app expects. */
export function publicKeyBase64(privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  const spki = crypto.createPublicKey(key).export({ type: "spki", format: "der" });
  return Buffer.from(spki.subarray(-32)).toString("base64");
}

/** Base64 Ed25519 signature over the manifest's canonical payload. */
export function signManifest(manifest, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Expected an Ed25519 private key, got ${key.asymmetricKeyType}.`);
  }
  const payload = Buffer.from(signingPayload(manifest), "utf8");
  return crypto.sign(null, payload, key).toString("base64");
}

export function verifyManifest(manifest, publicKeyB64) {
  if (!manifest.signature) {
    return { valid: false, reason: "Package is unsigned but signature verification is enabled." };
  }
  const keyBytes = Buffer.from(publicKeyB64, "base64");
  if (keyBytes.length !== 32) {
    return { valid: false, reason: "Configured public key is not 32 bytes." };
  }
  const sigBytes = Buffer.from(manifest.signature, "base64");
  if (sigBytes.length !== 64) {
    return { valid: false, reason: "Signature is not 64 bytes." };
  }
  const key = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"), // Ed25519 SPKI prefix
      keyBytes,
    ]),
    format: "der",
    type: "spki",
  });
  const payload = Buffer.from(signingPayload(manifest), "utf8");
  return crypto.verify(null, payload, key, sigBytes)
    ? { valid: true }
    : { valid: false, reason: "Signature verification failed." };
}

function resolveManifestPath(target) {
  const stat = fs.statSync(target);
  return stat.isDirectory() ? path.join(target, "manifest.json") : target;
}

function parseArgs(argv) {
  const opts = { write: false, verify: false, printPublicKey: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--key") opts.key = argv[++i];
    else if (arg === "--public-key") opts.publicKey = argv[++i];
    else if (arg === "--manifest") rest.push(argv[++i]);
    else if (arg === "--write") opts.write = true;
    else if (arg === "--verify") opts.verify = true;
    else if (arg === "--print-public-key") opts.printPublicKey = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else rest.push(arg);
  }
  opts.target = rest[0];
  return opts;
}

function usage() {
  console.log(
    [
      "Sign a release manifest with an Ed25519 private key.",
      "",
      "  --key <pem>            Ed25519 private key (PEM)",
      "  --print-public-key     Print the base64 public key for the app, then exit",
      "  --write                Write the signature into manifest.json",
      "  --verify               Verify instead of sign (needs --public-key)",
      "  --public-key <base64>  Public key to verify against",
      "",
      "Target may be a release directory or a manifest.json path.",
    ].join("\n")
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    usage();
    return;
  }

  if (opts.printPublicKey) {
    if (!opts.key) throw new Error("--print-public-key requires --key <pem>");
    console.log(publicKeyBase64(fs.readFileSync(opts.key, "utf8")));
    return;
  }

  if (!opts.target) {
    usage();
    process.exitCode = 1;
    return;
  }

  const manifestPath = resolveManifestPath(opts.target);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (opts.verify) {
    if (!opts.publicKey) throw new Error("--verify requires --public-key <base64>");
    const result = verifyManifest(manifest, opts.publicKey);
    if (result.valid) {
      console.log(`OK: signature valid for ${manifest.release_id}`);
      return;
    }
    console.error(`FAILED: ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  if (!opts.key) throw new Error("Signing requires --key <pem>");

  const signature = signManifest(manifest, fs.readFileSync(opts.key, "utf8"));

  if (!opts.write) {
    console.log(signature);
    return;
  }

  // `signature` is not part of the signing payload, so writing it back in
  // leaves the payload unchanged and the signature self-consistent.
  manifest.signature = signature;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Signed ${manifestPath}`);
}

// Compare as URLs: this repo's path contains a space, so a raw string
// comparison against process.argv[1] would never match.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
