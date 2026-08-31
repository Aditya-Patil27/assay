/**
 * Diff the TypeScript defense port against Python, span for span.
 *
 * scripts/check_agent_conformance.py writes what Python computes for every scoreable span
 * of every spliced document in the corpus. This replays the identical inputs through
 * lib/agent/defenses.ts and fails on any disagreement.
 *
 * Two implementations of one security control is how a live demo drifts into looking
 * right while being wrong. This is the thing that stops that happening quietly.
 *
 *   npm run check:agent
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sanitise, score } from "../lib/agent/defenses.ts";

const here = dirname(fileURLToPath(import.meta.url));
const rt = JSON.parse(
  readFileSync(join(here, "..", "public", "data", "agent_runtime.json"), "utf8"),
).payload;
const cases = JSON.parse(readFileSync(join(here, "agent-conformance.json"), "utf8"));

let spans = 0;
let docs = 0;
const fails = [];

for (const c of cases) {
  docs += 1;
  for (const s of c.spans) {
    spans += 1;
    const got = score(s.text, rt);
    if (got.score !== s.score) {
      fails.push(`score ${c.injection_id}/${c.scenario_id}: py=${s.score} ts=${got.score} :: ${JSON.stringify(s.text.slice(0, 70))}`);
    }
    const gotReasons = [...got.reasons].sort();
    if (JSON.stringify(gotReasons) !== JSON.stringify(s.reasons)) {
      fails.push(`reasons ${c.injection_id}/${c.scenario_id}: py=${JSON.stringify(s.reasons)} ts=${JSON.stringify(gotReasons)}`);
    }
  }
  const { clean, events } = sanitise(c.document, rt);
  if (clean !== c.clean) {
    fails.push(`sanitise ${c.injection_id}/${c.scenario_id}: redacted document differs`);
  }
  if (events.length !== c.redactions) {
    fails.push(`redactions ${c.injection_id}/${c.scenario_id}: py=${c.redactions} ts=${events.length}`);
  }
}

console.log(`checked ${docs} documents · ${spans} spans`);
if (fails.length) {
  console.error(`\n  ${fails.length} MISMATCH(ES) between the Python control and the TypeScript port:\n`);
  for (const f of fails.slice(0, 25)) console.error("   " + f);
  if (fails.length > 25) console.error(`   ... and ${fails.length - 25} more`);
  process.exit(1);
}
console.log("PASS: the TypeScript port agrees with Python on every span and every document");
