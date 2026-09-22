/// <reference types="vite/client" />

// pdf.js ships types for its main entry only; the legacy build (used for
// older iPadOS WebKit) has the same API.
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
