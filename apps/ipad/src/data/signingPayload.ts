// The bytes a release signature covers. MUST stay byte-identical to
// signingPayload in src/lib/offline/signing.mjs at the repo root, which signs
// releases; tests/sign-release.test.ts there checks the two agree.
//
// Kept free of imports so that test can load it without this app's
// dependencies installed.

export interface SignablePayloadManifest {
  format: string;
  package_schema_version: number;
  content_schema_version: number;
  release_id: string;
  release_version: string;
  created_at: string;
  catalogue: { sha256: string; bytes: number };
  assets: { sha256: string; bytes: number }[];
}

export function signingPayload(manifest: SignablePayloadManifest): string {
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
