import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Uploads (PDFs, storyboard image batches) go through server actions,
      // so the default 1 MB body limit is far too small.
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
