/**
 * Ed25519 signature verification for content packages.
 *
 * The manifest may carry a `signature` field: a base64-encoded Ed25519
 * signature over the canonical signing payload (see `signingPayload`).
 *
 * When a public key is configured (via `setPublicKey`), activation will
 * reject any manifest that is unsigned or whose signature does not verify.
 * When no public key is configured, verification is skipped entirely so
 * the app works without signing infrastructure in place.
 *
 * The public key is a 32-byte Ed25519 key, stored as a base64 string.
 * Do not commit a real key to source control.
 */

import type { ReleaseManifest } from "./types";

const PUBLIC_KEY_STORAGE = "skillslab_signing_public_key";

export function getPublicKey(): string {
  try {
    return localStorage.getItem(PUBLIC_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setPublicKey(base64Key: string): void {
  try {
    if (base64Key) {
      localStorage.setItem(PUBLIC_KEY_STORAGE, base64Key);
    } else {
      localStorage.removeItem(PUBLIC_KEY_STORAGE);
    }
  } catch {
    // Storage unavailable
  }
}

export function isSignatureEnforced(): boolean {
  return getPublicKey().length > 0;
}

export function signingPayload(manifest: ReleaseManifest): string {
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

export interface SignedManifest extends ReleaseManifest {
  signature?: string;
}

export async function verifySignature(manifest: SignedManifest): Promise<
  | { valid: true }
  | { valid: false; reason: string }
> {
  const keyB64 = getPublicKey();
  if (!keyB64) {
    return { valid: true };
  }

  if (!manifest.signature) {
    return { valid: false, reason: "Package is unsigned but signature verification is enabled." };
  }

  try {
    const keyBytes = base64ToBytes(keyB64);
    if (keyBytes.length !== 32) {
      return { valid: false, reason: "Configured public key is not 32 bytes." };
    }

    const sigBytes = base64ToBytes(manifest.signature);
    if (sigBytes.length !== 64) {
      return { valid: false, reason: "Signature is not 64 bytes." };
    }

    const payload = new TextEncoder().encode(signingPayload(manifest));

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const ok = await crypto.subtle.verify("Ed25519", cryptoKey, sigBytes, payload);

    if (!ok) {
      return { valid: false, reason: "Signature verification failed." };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      reason: `Signature check error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}
