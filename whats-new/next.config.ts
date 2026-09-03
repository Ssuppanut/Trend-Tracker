import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subfolder of a larger repo. Pin the Turbopack /
  // file-tracing root to this folder so Next.js doesn't walk up and pick up
  // the parent project's lockfile or middleware.
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
