import type { Metadata } from "next";

import { AdversarialGraph } from "@/components/AdversarialGraph";
import { Block, Figure, PageHeader } from "@/components/Chrome";
import { BackendAudit } from "@/components/BackendAudit";
import { Corpus, ServingLatency } from "@/components/System";
import {
  loadArtifacts,
  loadBackendAudit,
  loadDataProvenance,
  loadLatency,
} from "@/lib/load";

export const metadata: Metadata = { title: "System" };

export default async function SystemPage() {
  const { graph } = await loadArtifacts();
  const [latency, corpus, audit] = await Promise.all([
    loadLatency(),
    loadDataProvenance(),
    loadBackendAudit(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="The machine underneath the numbers"
        lede="Everything on the other routes is a result. This is what produced it: the pipeline as it actually runs, the serving path the detector was exported to, and the corpus every band was measured from. All three are committed artifacts the site reads, not claims it makes."
      />

      {audit && (
        <Block
          title="Every module, measured"
          lede="An inventory of the Python package behind all of this, walked out of the source with ast rather than written down: each module's real size, the first sentence of its own docstring, and the public API it exposes. It regenerates with the code, so it cannot drift into being a flattering description of a system that no longer exists."
        >
          <BackendAudit audit={audit.payload} />
        </Block>
      )}

      <Block
        title="The unrolled adversarial loop"
        lede="Attack → detect → score → retrain → attack is a feedback cycle, not a DAG. It becomes acyclic only when unrolled over rounds: round r's retrained detector is a distinct node feeding round r+1's attacker."
      >
        <Figure
          n={1}
          caption="The pipeline, banded one row per round. Dashed ochre edges are the unroll — the feedback the cycle is actually made of, drawn so it cannot be mistaken for ordinary flow."
        >
          <AdversarialGraph graph={graph.payload} />
        </Figure>
      </Block>

      {latency && (
        <Block
          title="Serving path"
          lede="A detector that only exists inside a notebook is not a payment control. These come from the exported ONNX graph on the same input shape the pipeline scores, so 'could this sit in an authorisation path' has a measured answer rather than an architectural diagram."
        >
          <Figure
            n={2}
            caption="Single-transaction scoring latency of the exported ONNX graph, over the run's full sample. This is the same graph the live demo loads into your browser."
          >
            <ServingLatency latency={latency.payload} />
          </Figure>
        </Block>
      )}

      {corpus && (
        <Block
          title="The corpus"
          lede="Straight off the loader's provenance record. The base rate is what makes PR-AUC rather than accuracy the metric the detector is judged on."
        >
          <Figure n={latency ? 3 : 2} caption="Real transactions, not synthetic — with the window and source named so the result can be reproduced.">
            <Corpus prov={corpus} />
          </Figure>
        </Block>
      )}
    </>
  );
}
