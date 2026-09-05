import type { Metadata } from "next";

import { PageHeader } from "@/components/Chrome";
import { LineageGraph } from "@/components/LineageGraph";
import {
  loadAgentRuntime,
  loadAttackExamples,
  loadAttackRounds,
  loadFeatureSchema,
  loadRedteamGroq,
} from "@/lib/load";
import { buildAgenticLineage, buildTabularLineage } from "@/lib/lineage";

export const metadata: Metadata = { title: "Lineage" };

/**
 * The second-brain view: which entry point leads to which attack, and what happened to it.
 *
 * Everything below is assembled at build time from the committed artifacts -- lib/lineage.ts
 * does the node/edge math as pure functions, this page only loads JSON and hands plain data
 * to the client graph. Either half degrades to a note rather than a fabricated figure if the
 * artifacts it needs are missing from this build.
 */
export default async function Lineage() {
  const [runtime, redteam, schema, examples, rounds] = await Promise.all([
    loadAgentRuntime(),
    loadRedteamGroq(),
    loadFeatureSchema(),
    loadAttackExamples(),
    loadAttackRounds(),
  ]);

  const agentic =
    runtime && redteam
      ? buildAgenticLineage(
          { scenarios: runtime.payload.scenarios, injections: runtime.payload.injections },
          redteam.payload,
        )
      : null;

  const tabular = schema
    ? buildTabularLineage(
        schema,
        examples.payload,
        rounds.payload.at(-1)?.per_feature_freq ?? {},
      )
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Lineage"
        title="Which entry point leads to which attack"
        lede="This is the structure of the measured corpus and the worked examples that survived it, not a causal model: an edge means a scenario reads a channel, an injection was planted there, or an evasion touched a feature -- never that one caused the next."
      />

      <LineageGraph agentic={agentic} tabular={tabular} />
    </>
  );
}
