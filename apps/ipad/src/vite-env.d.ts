/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default CMS server URL built into the app (see provisioning.ts). */
  readonly VITE_SERVER_URL?: string;
  /** Base64 Ed25519 public key built into the app; required for release builds. */
  readonly VITE_SIGNING_PUBLIC_KEY?: string;
}

// pdf.js ships types for its main entry only; the legacy build (used for
// older iPadOS WebKit) has the same API.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}

/** package.json's version, from vite.config.ts. */
declare const __APP_VERSION__: string;
