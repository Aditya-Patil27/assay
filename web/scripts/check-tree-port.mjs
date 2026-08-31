/**
 * Diff the JavaScript tree walker against the ONNX graph, row for row.
 *
 * scripts/check_tree_port.py writes what onnxruntime computes for every row the demo can
 * display. This replays them through lib/trees.ts. Anything beyond float32 rounding is a
 * failure, not a warning: the whole justification for dropping the runtime is that the
 * answer does not change.
 *
 *   npm run check:trees
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { scoreRow } from "../lib/trees.ts";

const here = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(
  readFileSync(join(here, "..", "public", "data", "detector_trees.json"), "utf8"),
).payload;
const cases = JSON.parse(readFileSync(join(here, "tree-conformance.json"), "utf8"));

// float32 has ~7 significant digits; a probability agreeing to 1e-6 is the same number.
const TOL = 1e-6;
let worst = 0;
let worstId = "";
const fails = [];

for (const c of cases) {
  const got = scoreRow(model, c.values);
  const d = Math.abs(got - c.p);
  if (d > worst) {
    worst = d;
    worstId = c.id;
  }
  if (d > TOL) fails.push(`${c.id}: onnx=${c.p} js=${got} delta=${d.toExponential(2)}`);
}

console.log(`checked ${cases.length} rows · worst delta ${worst.toExponential(2)} (${worstId})`);
if (fails.length) {
  console.error(`\n  ${fails.length} row(s) disagree beyond ${TOL}:\n`);
  for (const f of fails.slice(0, 15)) console.error("   " + f);
  process.exit(1);
}
console.log(`PASS: the JavaScript walker matches ONNX on every row within ${TOL}`);
