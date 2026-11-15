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
 *
 * On an iPad the check runs natively with CryptoKit (SignatureVerifier.swift
 * in the content-package plugin), which works on every supported iOS
 * version. WebCrypto's Ed25519 needs iOS 17, so it is only the fallback for
 * running the app in a desktop browser with `vite` during development.
 */

import { canInstallFromFiles, ContentPackage } from "./contentPackage";
import { buildDefaults, getManagedConfig, provisioningReady, resolveSetting, type ResolvedSetting } from "./provisioning";
import type { ReleaseManifest } from "./types";
import { signingPayload } from "./signingPayload";

export { signingPayload };

const PUBLIC_KEY_STORAGE = "skillslab_signing_public_key";

function storedPublicKey(): string {
  try {
    return localStorage.getItem(PUBLIC_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

/** The public key in use, and where it came from (see provisioning.ts). */
export function getPublicKeySetting(): ResolvedSetting {
  return resolveSetting(getManagedConfig().signingPublicKey, buildDefaults().signingPublicKey, storedPublicKey());
}

export function getPublicKey(): string {
  return getPublicKeySetting().value;
}

/** True when the key can be set or cleared in the app. */
export function canEditPublicKey(): boolean {
  const { source } = getPublicKeySetting();
  return source === null || source === "app";
}

/**
 * Sets or clears the key entered in the app. Refused when the key comes from
 * managed configuration or the build, so enforcement can't be switched off
 * on the device.
 */
export function setPublicKey(base64Key: string): void {
  if (!canEditPublicKey()) {
    throw new Error("The signing key is set by your organisation and can’t be changed on this iPad.");
  }
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


export interface SignedManifest extends ReleaseManifest {
  signature?: string;
}

export async function verifySignature(manifest: SignedManifest): Promise<
  | { valid: true }
  | { valid: false; reason: string }
> {
  // Never check against the in-app key before the MDM's has been read.
  await provisioningReady();
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

    if (canInstallFromFiles()) {
      return await verifyNatively(manifest, keyB64, manifest.signature);
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

async function verifyNatively(
  manifest: ReleaseManifest,
  publicKey: string,
  signature: string
): Promise<{ valid: true } | { valid: false; reason: string }> {
  try {
    const { valid } = await ContentPackage.verifySignature({
      payload: signingPayload(manifest),
      signature,
      publicKey,
    });
    return valid ? { valid: true } : { valid: false, reason: "Signature verification failed." };
  } catch (err) {
    const message = (err as { message?: string } | null)?.message;
    return { valid: false, reason: message || "Signature check error: unknown" };
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
