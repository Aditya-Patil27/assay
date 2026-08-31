/**
 * Copy the ONNX Runtime WASM binaries and the exported detector into public/.
 *
 * onnxruntime-web defaults to fetching its .wasm from a public CDN. That is a live
 * external dependency in the middle of a judged demo: if the CDN is slow, blocked by a
 * conference network, or simply down, the page that is supposed to prove the model runs
 * shows a spinner instead. Serving them ourselves costs bandwidth and removes the risk.
 *
 * The WebGPU (jsep) build is deliberately not copied -- it is 27MB and this is a 20-input
 * gradient-boosted tree, which the plain SIMD build scores in microseconds.
 */
import { cp, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");

const jobs = [
  {
    from: join(web, "node_modules", "onnxruntime-web", "dist", "ort-wasm-simd-threaded.wasm"),
    to: join(web, "public", "ort", "ort-wasm-simd-threaded.wasm"),
  },
  {
    from: join(web, "node_modules", "onnxruntime-web", "dist", "ort-wasm-simd-threaded.mjs"),
    to: join(web, "public", "ort", "ort-wasm-simd-threaded.mjs"),
  },
  {
    from: join(web, "..", "models", "detector_round0.onnx"),
    to: join(web, "public", "models", "detector_round0.onnx"),
  },
];

for (const { from, to } of jobs) {
  if (!existsSync(from)) {
    // The detector is a build output, not a checked-in dependency. A clone that has never
    // trained one should still be able to build the site; /live degrades to a message.
    console.warn(`  skipped (absent): ${from}`);
    continue;
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to);
  console.log(`  ${(await stat(to)).size.toLocaleString("en-US").padStart(12)} bytes  ${to.slice(web.length + 1)}`);
}
