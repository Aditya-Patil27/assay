import { AdversarialGraph } from "@/components/AdversarialGraph";
import {
  LegendKey,
  Panel,
  PlaceholderBanner,
  Provenance,
  Section,
  Stat,
} from "@/components/Chrome";
import { CoevolutionChart } from "@/components/CoevolutionChart";
import { AgenticPanel, AttackExamplePanel } from "@/components/Panels";
import { Scorecard } from "@/components/Scorecard";
import { loadArtifacts, placeholderSources, provenance } from "@/lib/load";

export default async function Home() {
  const artifacts = await loadArtifacts();
  const { scorecard, graph, detect, attack, examples, agentic } = artifacts;

  const first = attack.payload[0];
  const last = attack.payload[attack.payload.length - 1];
  const detectFirst = detect.payload[0];
  const detectLast = detect.payload[detect.payload.length - 1];
  const prAucDrop = (1 - detectLast.pr_auc / detectFirst.pr_auc) * 100;

  return (
    <main>
      <PlaceholderBanner sources={placeholderSources(artifacts)} />

      {/* Headline */}
      <header className="px-4 pb-12 pt-12 sm:px-6 md:px-10 md:pt-24">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted sm:text-xs">
            Mastercard Innovation Challenge 2026 · AI red teaming for payment security
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl">
            An attack that works, then stops working.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted md:text-base">
            A constraint-aware red team evades a payment fraud detector by moving only what a
            real attacker controls. The detector retrains on those evasions. Repeat. We report
            what the attack costs the defender — measured on two different attack surfaces, in
            one framework.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="ASR · round 0"
              value={`${(first.asr * 100).toFixed(1)}%`}
              sub="undefended detector"
              tone="attack"
            />
            <Stat
              label={`ASR · round ${last.round}`}
              value={`${(last.asr * 100).toFixed(1)}%`}
              sub={`after ${last.round} adversarial retrains`}
              tone="defend"
            />
            <Stat
              label="Detection cost"
              value={`−${prAucDrop.toFixed(1)}%`}
              sub={`PR-AUC ${detectFirst.pr_auc.toFixed(3)} → ${detectLast.pr_auc.toFixed(3)}`}
            />
            <Stat
              label="Attack effort"
              value={`${first.mean_l0.toFixed(1)} → ${last.mean_l0.toFixed(1)}`}
              sub="mean features touched (L0)"
            />
          </div>
        </div>
      </header>

      <Section
        id="scorecard"
        eyebrow="Terminal node"
        title="Framework scorecard"
        lede="The same loop — attack, measure, defend, re-measure — applied to a tabular detector and to a payment agent. Two surfaces is what makes this a framework rather than a project."
      >
        <Scorecard rows={scorecard.payload} />
      </Section>

      <Section
        id="coevolution"
        eyebrow="Result"
        title="Co-evolution across rounds"
        lede="Attack success collapses while detection quality holds. If PR-AUC had fallen with it, we would have bought robustness by breaking the detector — which is the failure mode this chart exists to rule out."
      >
        <Panel>
          <CoevolutionChart detect={detect.payload} attack={attack.payload} />
        </Panel>
      </Section>

      <Section
        id="graph"
        eyebrow="Architecture"
        title="The unrolled adversarial loop"
        lede="Attack → detect → score → retrain → attack is a feedback cycle, not a DAG. It becomes acyclic only when unrolled over rounds: round r's retrained detector is a distinct node feeding round r+1's attacker."
      >
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
          <LegendKey
            swatch={<span className="h-px w-6 bg-line" aria-hidden="true" />}
            label="flow — ordinary dependency"
          />
          <LegendKey
            swatch={
              <span
                className="h-0 w-6 border-t-2 border-dashed border-warn"
                aria-hidden="true"
              />
            }
            label="unroll — the feedback edge, round r into round r+1"
          />
        </div>
        <AdversarialGraph graph={graph.payload} />
      </Section>

      <Section
        id="tabular"
        eyebrow="Surface 1 · tabular"
        title="What the attacker actually changed"
        lede="Three projections constrain every perturbation: immutability (the victim's demographics and home geography cannot be forged), feasibility (values stay inside the band the network would ever see, and merchant choice moves category, terminal geography and distance together), and sparsity (touch as few features as possible)."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {examples.payload.slice(0, 2).map((e) => (
            <AttackExamplePanel key={e.id} example={e} />
          ))}
        </div>
      </Section>

      <Section
        id="agentic"
        eyebrow="Surface 2 · agentic"
        title="Indirect prompt injection against a payment agent"
        lede="Injections are planted where a payment system genuinely ingests untrusted text: transaction memos, merchant display names, chargeback dispute evidence. Defenses are an injection classifier, tool scoping, and a human-in-the-loop threshold."
      >
        <AgenticPanel categories={agentic.payload} />
      </Section>

      <Provenance {...provenance(artifacts)} />
    </main>
  );
}
