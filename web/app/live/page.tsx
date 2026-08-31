import type { Metadata } from "next";

import { Block, PageHeader } from "@/components/Chrome";
import { LiveDetector } from "@/components/LiveDetector";
import { loadFeatureSchema, loadLatency, loadLiveSamples } from "@/lib/load";

export const metadata: Metadata = { title: "Live demo" };

export default async function Live() {
  const [samples, schema, latency] = await Promise.all([
    loadLiveSamples(),
    loadFeatureSchema(),
    loadLatency(),
  ]);

  const missing = !samples || !schema;

  return (
    <>
      <PageHeader
        eyebrow="Live"
        title="The detector, running in your browser"
        lede="Everything else on this site is a rendering of a run that already finished. This page is the run. The exported ONNX graph is downloaded into this tab and executed on WASM — so the scores below are the model's, not a re-implementation's, and no server is involved in producing them."
      />

      <Block title="Score a transaction, then try to evade it">
        {missing ? (
          <div className="card border border-rule p-5">
            <p className="text-sm font-medium">The demo artifacts are not present.</p>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
              /live needs <code className="font-mono">artifacts/live_samples.json</code> and{" "}
              <code className="font-mono">artifacts/feature_schema.json</code>. Run{" "}
              <code className="font-mono">python scripts/export_live_samples.py</code> from the
              repo root, then rebuild. The rest of the site is unaffected.
            </p>
          </div>
        ) : (
          <LiveDetector samples={samples.payload} schema={schema} />
        )}
      </Block>

      {latency && (
        <Block title="Why this is fast enough to be interactive">
          <p className="prose col">
            The same graph scores a single transaction in{" "}
            <strong>{latency.payload.p50_ms.toFixed(3)} ms at p50</strong> on{" "}
            {latency.payload.backend}, measured over{" "}
            {latency.payload.n_samples.toLocaleString("en-US")} samples — so a greedy sweep of
            nine candidate values across every free feature is a few hundred model calls and
            still finishes while you watch. That budget is the whole reason the attack can be
            run live rather than pre-rendered.
          </p>
        </Block>
      )}
    </>
  );
}
