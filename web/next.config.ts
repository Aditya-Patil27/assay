import path from "node:path";

import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH || undefined;

const nextConfig: NextConfig = {
  // Fully static export: the judged demo is a URL, not a running server.
  output: "export",
  images: { unoptimized: true },
  // Pin the workspace root; without it Turbopack walks up and finds a stray lockfile.
  turbopack: { root: path.join(__dirname) },
  // GitHub Pages serves from a subpath; Vercel does not. Set BASE_PATH for the former.
  basePath,
  // Without this the export emits absolute /_next/... URLs, which resolve to the
  // filesystem root under file:// and leave a judge staring at unstyled HTML. Every page
  // lands at the top level of out/, so a document-relative prefix is safe -- and it means
  // the folder can be zipped, mailed, and double-clicked with no server at all. A
  // BASE_PATH deploy keeps the absolute form, which is what a subpath host needs.
  assetPrefix: basePath ?? ".",
};

export default nextConfig;
