import type { NextConfig } from "next";
import { MAX_UPLOAD_MB } from "./src/lib/media-types";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker image.
  output: "standalone",
  experimental: {
    serverActions: {
      // Uploads (PDFs, storyboard image batches, MP4 videos) go through
      // server actions, so the default 1 MB body limit is far too small.
      // The extra megabyte covers multipart boundaries and field headers.
      bodySizeLimit: `${MAX_UPLOAD_MB + 1}mb`,
    },
    // src/proxy.ts skips Server Action calls, but a form posted without
    // JavaScript still passes through it, and the proxy would otherwise cut
    // its body off at 10 MB.
    proxyClientMaxBodySize: `${MAX_UPLOAD_MB + 1}mb`,
  },
  async headers() {
    return [
      {
        // Every response. The Content-Security-Policy is per-request (it
        // carries a nonce), so src/proxy.ts sends it; HSTS is left to the
        // reverse proxy that terminates TLS (Caddy, in compose.yaml).
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Older browsers' equivalent of the CSP's frame-ancestors 'self'.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        // The iPad app's webview runs at capacitor://localhost, so its
        // release checks and downloads are cross-origin. These routes only
        // serve published release content and take no credentials.
        source: "/api/offline/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "If-None-Match" },
          { key: "Access-Control-Expose-Headers", value: "ETag" },
        ],
      },
    ];
  },
};

export default nextConfig;
