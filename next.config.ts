import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker image.
  output: "standalone",
  experimental: {
    serverActions: {
      // Uploads (PDFs, storyboard image batches, MP4 videos) go through
      // server actions, so the default 1 MB body limit is far too small.
      bodySizeLimit: "500mb",
    },
  },
  async headers() {
    return [
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
