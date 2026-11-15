import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The snapshot and the refresh's file cache are read at request time with fs, so tracing can't see them.
  outputFileTracingIncludes: {
    "/**": ["./data/snapshot.json", "./data/cache/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
