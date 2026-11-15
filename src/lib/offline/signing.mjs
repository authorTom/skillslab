// Ed25519 signing of release manifests: the one implementation the server
// (lib/offline/export.ts, when RELEASE_SIGNING_KEY_FILE is set) and the
// command-line signer (scripts/sign-release.mjs) both use.
//
// Plain JavaScript with JSDoc types so the script can import it under plain
// Node, without a build step.
//
// The signing payload MUST stay byte-identical to `signingPayload` in
// apps/ipad/src/data/signature.ts, which the iPad app verifies against.
// tests/sign-release.test.ts pins the format and checks the two agree.

import crypto from "node:crypto";

/**
 * @typedef {{
 *   format: string;
 *   package_schema_version: number;
 *   content_schema_version: number;
 *   release_id: string;
 *   release_version: string;
 *   created_at: string;
 *   catalogue: { sha256: string; bytes: number };
 *   assets: { sha256: string; bytes: number }[];
 *   signature?: string;
 * }} SignableManifest
 */

/** DER prefix that turns a raw 32-byte Ed25519 public key into SPKI. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * The bytes that are signed: the manifest's identity and every file's hash
 * and size, one per line. `signature` itself is not part of it.
 * @param {SignableManifest} manifest
 * @returns {string}
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

/**
 * Parses a PEM private key, insisting on Ed25519.
 * @param {string | Buffer} privateKeyPem
 * @returns {crypto.KeyObject}
 */
export function loadPrivateKey(privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Expected an Ed25519 private key, got ${key.asymmetricKeyType}.`);
  }
  return key;
}

/**
 * Raw 32-byte Ed25519 public key, base64 encoded: the form the app expects.
 * @param {string | Buffer | crypto.KeyObject} privateKey PEM, or a key from loadPrivateKey
 * @returns {string}
 */
export function publicKeyBase64(privateKey) {
  const key = privateKey instanceof crypto.KeyObject ? privateKey : loadPrivateKey(privateKey);
  const spki = crypto.createPublicKey(key).export({ type: "spki", format: "der" });
  return Buffer.from(spki.subarray(-32)).toString("base64");
}

/**
 * Base64 Ed25519 signature over the manifest's canonical payload.
 * @param {SignableManifest} manifest
 * @param {string | Buffer | crypto.KeyObject} privateKey PEM, or a key from loadPrivateKey
 * @returns {string}
 */
export function signManifest(manifest, privateKey) {
  const key = privateKey instanceof crypto.KeyObject ? privateKey : loadPrivateKey(privateKey);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`Expected an Ed25519 private key, got ${key.asymmetricKeyType}.`);
  }
  const payload = Buffer.from(signingPayload(manifest), "utf8");
  return crypto.sign(null, payload, key).toString("base64");
}

/**
 * Checks a manifest's signature against a base64 public key.
 * @param {SignableManifest} manifest
 * @param {string} publicKeyB64
 * @returns {{ valid: true } | { valid: false; reason: string }}
 */
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
    key: Buffer.concat([ED25519_SPKI_PREFIX, keyBytes]),
    format: "der",
    type: "spki",
  });
  const payload = Buffer.from(signingPayload(manifest), "utf8");
  return crypto.verify(null, payload, key, sigBytes)
    ? { valid: true }
    : { valid: false, reason: "Signature verification failed." };
}
