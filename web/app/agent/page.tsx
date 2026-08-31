import type { Metadata } from "next";

import { Block, Figure, PageHeader } from "@/components/Chrome";
import { AgenticPanel } from "@/components/Panels";
import { LiveAgent } from "@/components/LiveAgent";
import { ProviderTable } from "@/components/ProviderTable";
import { loadAgentRuntime, loadArtifacts, loadProviderRedteams } from "@/lib/load";

export const metadata: Metadata = { title: "Agent attack" };

export default async function Agent() {
  const { agentic } = await loadArtifacts();
  const [providers, runtime] = await Promise.all([loadProviderRedteams(), loadAgentRuntime()]);

  return (
    <>
      <PageHeader
        eyebrow="Surface 2 · agentic"
        title="Indirect prompt injection against a payment agent"
        lede="Injections are planted where a payment system genuinely ingests untrusted text: transaction memos, merchant display names, chargeback dispute evidence. Defenses are an injection classifier, tool scoping, and a human-in-the-loop threshold."
      />

      <Block title="Exploit rate by OWASP category">
        <Figure
          n={1}
          caption="Exploit rate per injection category, before and after the defense layer, scored by OWASP LLM Top 10 category. The aggregate row on top is the number that feeds the second row of the scorecard."
        >
          <AgenticPanel categories={agentic.payload} />
        </Figure>
      </Block>

      {runtime && (
        <Block
          title="Fire one at a live model, right now"
          lede="Everything above is the measured corpus — 288 trials, already run. This is the same machinery on a single trial of your choosing: pick a payload, pick the task the agent is doing, and fire it twice. The defense stack, the tool execution and the verdict all come from the same code that produced the table; only the model call happens on a server, because that is where the key has to live."
        >
          <LiveAgent runtime={{ scenarios: runtime.payload.scenarios, injections: runtime.payload.injections }} />
          <p className="mt-4 max-w-[72ch] text-[0.8125rem] leading-relaxed text-muted">
            The ledger is per-request and in memory. No real payment rail is touched, and the
            accounts are the fixture ledger every Python trial starts from. The TypeScript
            defense port is checked against the Python control on every span of all 144
            spliced documents by <code className="font-mono">npm run check:agent</code>.
          </p>
        </Block>
      )}

      {providers.length > 1 && (
        <Block
          title="Measured twice, on two vendors"
          lede="An exploit rate belongs to one model, so a defense validated once has been validated against one model's habits. The corpus was doubled and re-run on a second vendor; the honest reading is that the reduction clears significance on one model and on the pooled corpus, and does not clear it on the other."
        >
          <Figure
            n={2}
            caption="Two-sided Fisher exact test on each row's own 2×2 table. The p-values are computed during the build from the counts shown beside them — see lib/stats.ts — so they move if the counts do, and none of them is a number typed into the page."
          >
            <ProviderTable providers={providers} />
          </Figure>
        </Block>
      )}
    </>
  );
}
