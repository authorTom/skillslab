import type { KeyObject } from "crypto";
import fs from "fs";
import { loadPrivateKey, publicKeyBase64, signManifest, verifyManifest } from "./signing.mjs";
import type { ReleaseManifest } from "./schema";

// Server-side release signing. When RELEASE_SIGNING_KEY_FILE names an Ed25519
// private key (PEM), every release is signed as it is built.
//
// The key never leaves this module: nothing here logs it, returns it or puts
// it in an error message. Only the public half is shown, on /admin/releases,
// for copying into the iPad app's configuration.

export type SigningStatus =
  | { state: "off" }
  | { state: "ready"; publicKey: string }
  | { state: "error"; message: string };

/** The key file named by the environment, if any. */
export function signingKeyFile(): string {
  return process.env.RELEASE_SIGNING_KEY_FILE?.trim() ?? "";
}

/**
 * Reads the key afresh each time, so a replaced key file takes effect without
 * a restart. The file is tiny.
 */
function loadKey(): { key: KeyObject } | { error: string } | null {
  const file = signingKeyFile();
  if (!file) return null;
  let pem: Buffer;
  try {
    // A path from the environment, read at runtime: nothing for the build to trace.
    pem = fs.readFileSync(/*turbopackIgnore: true*/ file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      error:
        code === "ENOENT"
          ? `The signing key file ${file} doesn't exist.`
          : code === "EACCES"
            ? `The app can't read the signing key file ${file}. Check its owner and permissions.`
            : `The signing key file ${file} couldn't be read (${code ?? "unknown error"}).`,
    };
  }
  try {
    return { key: loadPrivateKey(pem) };
  } catch (error) {
    // Messages from crypto describe the format problem, never the key itself.
    const detail = error instanceof Error && /Ed25519/.test(error.message) ? ` ${error.message}` : "";
    return { error: `The signing key file ${file} isn't an Ed25519 private key in PEM format.${detail}` };
  } finally {
    pem.fill(0);
  }
}

export function signingStatus(): SigningStatus {
  const loaded = loadKey();
  if (!loaded) return { state: "off" };
  if ("error" in loaded) return { state: "error", message: loaded.error };
  return { state: "ready", publicKey: publicKeyBase64(loaded.key) };
}

/**
 * The signature for a release about to be finalised: null when signing isn't
 * configured. Throws when it is configured but the key can't be used, so a
 * misconfigured server never quietly publishes unsigned releases.
 */
export function signatureFor(manifest: ReleaseManifest): string | null {
  const loaded = loadKey();
  if (!loaded) return null;
  if ("error" in loaded) throw new Error(loaded.error);
  return signManifest(manifest, loaded.key);
}

export type ReleaseSignature = "signed" | "unsigned" | "other-key";

/** Whether a built release is signed, and by the key now configured. */
export function releaseSignature(manifest: ReleaseManifest, status: SigningStatus): ReleaseSignature {
  if (!manifest.signature) return "unsigned";
  if (status.state !== "ready") return "signed";
  return verifyManifest(manifest, status.publicKey).valid ? "signed" : "other-key";
}
