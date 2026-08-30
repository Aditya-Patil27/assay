import { AdversarialGraph } from "@/components/AdversarialGraph";
import { Panel, PlaceholderBanner, Provenance, Section, Stat } from "@/components/Chrome";
import { CoevolutionChart } from "@/components/CoevolutionChart";
import { FeasibilityPanel } from "@/components/FeasibilityPanel";
import { FeatureFrequencyPanel } from "@/components/FeatureFrequency";
import { AgenticPanel, AttackExamplePanel } from "@/components/Panels";
import { Scorecard } from "@/components/Scorecard";
import { ShapPanel } from "@/components/ShapPanel";
import { loadArtifacts, loadFeasibility, placeholderSources, provenance } from "@/lib/load";

const NAV = [
  { href: "#coevolution", label: "Co-evolution" },
  { href: "#feasibility", label: "Feasibility" },
  { href: "#scorecard", label: "Scorecard" },
  { href: "#graph", label: "Unrolled loop" },
  { href: "#tabular", label: "Tabular attack" },
  { href: "#agentic", label: "Agent attack" },
];

export default async function Home() {
  const artifacts = await loadArtifacts();
  const feasibility = await loadFeasibility();
  const { scorecard, graph, detect, attack, examples, agentic } = artifacts;

  const first = attack.payload[0];
  const last = attack.payload[attack.payload.length - 1];
  const detectFirst = detect.payload[0];
  const detectLast = detect.payload[detect.payload.length - 1];
  // Only meaningful once more than one detector round is published. detect/rounds.json
  // currently holds round 0 alone, so a delta here would be 0.0% -- a number that reads
  // like "the defense cost nothing" when it actually means "we did not measure it".
  const detectRoundsPublished = detect.payload.length > 1;
  const prAucDrop = (1 - detectLast.pr_auc / detectFirst.pr_auc) * 100;
  const asrDrop = (1 - last.asr / first.asr) * 100;
  const l0Rise = last.mean_l0 - first.mean_l0;

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
            An attack that keeps working, and costs more every round.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted md:text-lg">
            A constraint-aware red team evades a payment fraud detector by moving only what a
            real attacker controls. The detector retrains on those evasions. Repeat. Three
            rounds in, the attacker still succeeds on every attempt — so what we report is the
            price it pays to do so, and the audit showing that an unconstrained attacker&apos;s
            identical-looking score is mostly made of transactions that could never occur.
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
              sub={
                asrDrop === 0
                  ? `unchanged after ${last.round} adversarial retrains`
                  : `after ${last.round} adversarial retrains · −${asrDrop.toFixed(0)}%`
              }
              tone={asrDrop === 0 ? "attack" : "defend"}
            />
            <Stat
              label="Attack effort"
              value={`+${l0Rise.toFixed(2)}`}
              sub={`mean features touched (L0) ${first.mean_l0.toFixed(2)} → ${last.mean_l0.toFixed(2)} · ${first.median_queries} → ${last.median_queries} median queries`}
              tone="defend"
            />
            <Stat
              label="Detection cost"
              value={detectRoundsPublished ? `−${prAucDrop.toFixed(1)}%` : "not measured"}
              sub={
                detectRoundsPublished
                  ? `PR-AUC ${detectFirst.pr_auc.toFixed(3)} → ${detectLast.pr_auc.toFixed(3)}`
                  : "per-round PR-AUC is not published to an artifact yet"
              }
            />
          </div>
        </div>
      </header>

      <Section
        id="coevolution"
        eyebrow="The result"
        title="Co-evolution across rounds"
        lede="Attack success does not collapse — it is 100% at every round. Three rounds of adversarial retraining at this dosage moved the attacker's cost, not its success rate. Round r's retrained detector is what round r+1's attacker faces, and it faces a harder search each time: more features touched, more queries spent, and still a way through."
      >
        <Panel>
          <CoevolutionChart detect={detect.payload} attack={attack.payload} />
        </Panel>
      </Section>

      {feasibility && (
        <Section
          id="feasibility"
          eyebrow="The measurement"
          title="Why this ASR means something and an unconstrained one does not"
          lede="Both attackers below report the same success rate against the same detector. Only one of them produced transactions that could actually happen. This is the check we run against ourselves before reporting any number."
        >
          <FeasibilityPanel
            audit={feasibility.payload}
            placeholder={feasibility.placeholder}
          />
        </Section>
      )}

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
              by that round&apos;s successes. The mix shifts as the detector retrains, but not in
              one direction — the amount levers are used more by round 2, not less. Read this as
              the search relocating under pressure rather than as the attacker being disarmed.
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
              Mean absolute SHAP over the top features of each published detector round. Features
              marked ↑ are new to the top set that round. Only round 0 is published today, so
              there is no re-weighting trend to read here yet — the loop&apos;s later rounds are
              not written to <code className="font-mono text-xs">detect/rounds.json</code>.
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
