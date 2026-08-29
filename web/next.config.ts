import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static export: the judged demo is a URL, not a running server.
  output: "export",
  images: { unoptimized: true },
  // Pin the workspace root; without it Turbopack walks up and finds a stray lockfile.
  turbopack: { root: path.join(__dirname) },
  // GitHub Pages serves from a subpath; Vercel does not. Set BASE_PATH for the former.
  basePath: process.env.BASE_PATH || undefined,
};

export default nextConfig;
