import path from "node:path";

import type { NextConfig } from "next";

/**
 * A running Next application, not a static export.
 *
 * This used to be `output: "export"`. That made the deliverable a folder of HTML you
 * could zip and mail, which is a real virtue -- but it also meant the site could never do
 * anything. No route can hold an API key, so the agentic prompt-injection demo had no way
 * to reach a model, and the whole page was a rendering of a run that had already
 * finished. Dropping the export buys server routes; the tabular detector still runs
 * entirely in the browser via WASM, so the expensive half of the demo costs nothing to
 * serve and cannot fail in front of a judge on a cold start.
 *
 * assetPrefix and basePath are gone with it: those existed for GitHub Pages' subpath, and
 * this deploys to a domain root.
 */
const nextConfig: NextConfig = {
  // Pin the workspace root; without it Turbopack walks up and finds a stray lockfile.
  turbopack: { root: path.join(__dirname) },
  // onnxruntime-web ships .wasm binaries that must not be parsed as modules.
  outputFileTracingIncludes: {
    "/**": ["./public/models/**"],
  },
};

export default nextConfig;
