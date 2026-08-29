import { AdversarialGraph } from "@/components/AdversarialGraph";
import { Panel, PlaceholderBanner, Provenance, Section, Stat } from "@/components/Chrome";
import { CoevolutionChart } from "@/components/CoevolutionChart";
import { FeatureFrequencyPanel } from "@/components/FeatureFrequency";
import { AgenticPanel, AttackExamplePanel } from "@/components/Panels";
import { Scorecard } from "@/components/Scorecard";
import { ShapPanel } from "@/components/ShapPanel";
import { loadArtifacts, placeholderSources, provenance } from "@/lib/load";

const NAV = [
  { href: "#coevolution", label: "Co-evolution" },
  { href: "#scorecard", label: "Scorecard" },
  { href: "#graph", label: "Unrolled loop" },
  { href: "#tabular", label: "Tabular attack" },
  { href: "#agentic", label: "Agent attack" },
];

export default async function Home() {
  const artifacts = await loadArtifacts();
  const { scorecard, graph, detect, attack, examples, agentic } = artifacts;

  const first = attack.payload[0];
  const last = attack.payload[attack.payload.length - 1];
  const detectFirst = detect.payload[0];
  const detectLast = detect.payload[detect.payload.length - 1];
  const prAucDrop = (1 - detectLast.pr_auc / detectFirst.pr_auc) * 100;
  const asrDrop = (1 - last.asr / first.asr) * 100;

  const thresholdFor = (round: number) =>
    detect.payload.find((d) => d.round === round)?.threshold;

  const { shas, newest } = provenance(artifacts);

  return (
    <main>
      <PlaceholderBanner sources={placeholderSources(artifacts)} />

      {/* Headline */}
      <header className="px-4 pb-12 pt-12 sm:px-6 md:px-10 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted sm:text-xs">
            Mastercard Innovation Challenge 2026 · AI red teaming for payment security
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
            An attack that works, then stops working.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            A constraint-aware red team evades a payment fraud detector by moving only what a
            real attacker controls. The detector retrains on those evasions. Repeat. We report
            what the attack costs the defender — measured on two different attack surfaces, in
            one framework.
          </p>

          <nav aria-label="Sections" className="mt-8 flex flex-wrap gap-2">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-[11px] text-muted transition-colors hover:border-defend hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-defend"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="ASR · round 0"
              value={`${(first.asr * 100).toFixed(1)}%`}
              sub="undefended detector"
              tone="attack"
            />
            <Stat
              label={`ASR · round ${last.round}`}
              value={`${(last.asr * 100).toFixed(1)}%`}
              sub={`after ${last.round} adversarial retrains · −${asrDrop.toFixed(0)}%`}
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
              sub={`mean features touched (L0) · ${first.median_queries} → ${last.median_queries} median queries`}
            />
          </div>
        </div>
      </header>

      <Section
        id="coevolution"
        eyebrow="The result"
        title="Co-evolution across rounds"
        lede="Attack success collapses while detection quality holds. If PR-AUC had fallen with it, we would have bought robustness by breaking the detector — which is the failure mode this chart exists to rule out. Round r's retrained detector is what round r+1's attacker faces."
      >
        <Panel>
          <CoevolutionChart detect={detect.payload} attack={attack.payload} />
        </Panel>
      </Section>

      <Section
        id="scorecard"
        eyebrow="Terminal node"
        title="Framework scorecard"
        lede="The same loop — attack, measure, defend, re-measure — applied to a tabular detector and to a payment agent. Two surfaces is what makes this a framework rather than a project."
      >
        <Scorecard rows={scorecard.payload} />
      </Section>

      <Section
        id="graph"
        eyebrow="Architecture"
        title="The unrolled adversarial loop"
        lede="Attack → detect → score → retrain → attack is a feedback cycle, not a DAG. It becomes acyclic only when unrolled over rounds: round r's retrained detector is a distinct node feeding round r+1's attacker. Those unroll edges are drawn dashed, and the graph is honest about being a cycle underneath."
      >
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
            <AttackExamplePanel key={e.id} example={e} threshold={thresholdFor(e.round)} />
          ))}
        </div>

        <div className="mt-10 grid gap-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              Which features the attack reaches for
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              Share of successful evasions in each round that touched a given feature, normalised
              by that round&apos;s successes. The mix shifts as the detector retrains: the cheap
              levers stop paying, and the attacker is pushed onto features it controls less
              freely.
            </p>
            <Panel className="mt-5">
              <FeatureFrequencyPanel rounds={attack.payload} />
            </Panel>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold tracking-tight">
              What the detector leans on, round by round
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              Mean absolute SHAP over the top features of each retrained detector. Features
              marked ↑ are new to the top set that round — the detector re-weighting away from
              whatever the previous round&apos;s attacker exploited.
            </p>
            <div className="mt-5">
              <ShapPanel rounds={detect.payload} />
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="agentic"
        eyebrow="Surface 2 · agentic"
        title="Indirect prompt injection against a payment agent"
        lede="Injections are planted where a payment system genuinely ingests untrusted text: transaction memos, merchant display names, chargeback dispute evidence. Defenses are an injection classifier, tool scoping, and a human-in-the-loop threshold. Scored by OWASP LLM Top 10 category, before and after."
      >
        <AgenticPanel categories={agentic.payload} />
      </Section>

      <Provenance shas={shas} newest={newest} />
    </main>
  );
}
