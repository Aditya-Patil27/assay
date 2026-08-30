import { AdversarialGraph } from "@/components/AdversarialGraph";
import { Figure, KeyResult, PlaceholderBanner, Provenance, Section } from "@/components/Chrome";
import { CoevolutionChart } from "@/components/CoevolutionChart";
import { FeasibilityPanel } from "@/components/FeasibilityPanel";
import { FeatureFrequencyPanel } from "@/components/FeatureFrequency";
import { AgenticPanel, AttackExamplePanel } from "@/components/Panels";
import { Scorecard } from "@/components/Scorecard";
import { ShapPanel } from "@/components/ShapPanel";
import { loadArtifacts, loadFeasibility, placeholderSources, provenance } from "@/lib/load";

const CONTENTS = [
  { href: "#coevolution", label: "Co-evolution across rounds" },
  { href: "#feasibility", label: "Why this attack success rate means something" },
  { href: "#scorecard", label: "Framework scorecard" },
  { href: "#graph", label: "The unrolled adversarial loop" },
  { href: "#tabular", label: "Surface 1 — what the attacker changed" },
  { href: "#agentic", label: "Surface 2 — indirect prompt injection" },
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

      {/* Running head. A journal masthead rather than a hero: venue on the left, the date
          the numbers below were produced on the right. */}
      <div className="border-b border-rule">
        <div className="wrap flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 text-[0.8125rem] text-muted">
          <p>Mastercard Innovation Challenge 2026 — AI red teaming for payment security</p>
          <p className="font-mono">{newest.slice(0, 10)}</p>
        </div>
      </div>

      <header className="wrap pb-14 pt-12 md:pt-20">
        <h1 className="max-w-[19ch] font-serif text-[2.5rem] leading-[1.06] tracking-[-0.02em] sm:text-[3.25rem] md:max-w-[16ch] md:text-[4rem]">
          An attack that keeps working, and costs more every round.
        </h1>

        <div className="col mt-10">
          <p className="text-sm font-medium">Abstract</p>
          <p className="prose mt-3">
            A constraint-aware red team evades a payment fraud detector by moving only what a
            real attacker controls. The detector retrains on those evasions. Repeat. Three
            rounds in, the attacker still succeeds on every attempt — so what we report is the
            price it pays to do so, and the audit showing that an unconstrained attacker&apos;s
            identical-looking score is mostly made of transactions that could never occur.
          </p>
        </div>

        <nav aria-label="Contents" className="col mt-10">
          <p className="text-sm font-medium">Contents</p>
          <ol className="mt-3 border-y border-rule">
            {CONTENTS.map((c, i) => (
              <li key={c.href} className="border-b border-rule last:border-b-0">
                <a
                  href={c.href}
                  className="flex items-baseline gap-4 py-2.5 text-sm transition-colors hover:text-attack focus:outline-none focus-visible:text-attack"
                >
                  <span className="w-5 shrink-0 font-mono text-muted">{i + 1}</span>
                  <span className="underline-offset-[3px] hover:underline">{c.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Key results, in order. The first two are the finding; the last two are what the
            finding cost. A 4-up tile grid cannot say that. */}
        <dl className="mt-14 border-b border-rule">
          <KeyResult
            label="Attack success rate, round 0"
            value={`${(first.asr * 100).toFixed(1)}%`}
            sub="against the undefended detector"
            tone="attack"
          />
          <KeyResult
            label={`Attack success rate, round ${last.round}`}
            value={`${(last.asr * 100).toFixed(1)}%`}
            sub={
              asrDrop === 0
                ? `unchanged after ${last.round} adversarial retrains`
                : `after ${last.round} adversarial retrains — down ${asrDrop.toFixed(0)}%`
            }
            tone={asrDrop === 0 ? "attack" : "defend"}
          />
          <KeyResult
            label="Attack effort"
            value={`+${l0Rise.toFixed(2)}`}
            sub={`mean features touched (L0) ${first.mean_l0.toFixed(2)} → ${last.mean_l0.toFixed(2)}; ${first.median_queries} → ${last.median_queries} median queries`}
            tone="defend"
          />
          <KeyResult
            label="Detection cost"
            value={detectRoundsPublished ? `−${prAucDrop.toFixed(1)}%` : "not measured"}
            sub={
              detectRoundsPublished
                ? `PR-AUC ${detectFirst.pr_auc.toFixed(3)} → ${detectLast.pr_auc.toFixed(3)}`
                : "per-round PR-AUC is not published to an artifact yet"
            }
          />
        </dl>
      </header>

      <Section
        id="coevolution"
        n={1}
        title="Co-evolution across rounds"
        lede="Attack success does not collapse — it is 100% at every round. Three rounds of adversarial retraining at this dosage moved the attacker's cost, not its success rate. Round r's retrained detector is what round r+1's attacker faces, and it faces a harder search each time: more features touched, more queries spent, and still a way through."
      >
        <Figure
          n={1}
          caption="Attack success rate and detector PR-AUC by round, with the per-round cost table beneath. The two series share no unit, so they carry separate axes, stroke patterns and dot shapes — the argument survives a projector that mangles colour. A round whose detector was never trained is drawn absent, not zero."
        >
          <CoevolutionChart detect={detect.payload} attack={attack.payload} />
        </Figure>
      </Section>

      {feasibility && (
        <Section
          id="feasibility"
          n={2}
          title="Why this attack success rate means something and an unconstrained one does not"
          lede="Both attackers below report the same success rate against the same detector. Only one of them produced transactions that could actually happen. This is the check we run against ourselves before reporting any number."
        >
          <Figure
            n={2}
            caption="The same headline number, audited two ways. The unconstrained attacker's successes are decomposed into the share that settle at a merchant absent from the network and the share that forged an attribute a real attacker inherits from the victim and cannot touch."
          >
            <FeasibilityPanel audit={feasibility.payload} placeholder={feasibility.placeholder} />
          </Figure>
        </Section>
      )}

      <Section
        id="scorecard"
        n={3}
        title="Framework scorecard"
        lede="The same loop — attack, measure, defend, re-measure — applied to a tabular detector and to a payment agent. Two surfaces is what makes this a framework rather than a project."
      >
        <Figure
          n={3}
          caption="Attack success before and after the defense, per surface, with what the defense cost in each case. This table is the terminal node both tracks feed."
        >
          <Scorecard rows={scorecard.payload} />
        </Figure>
      </Section>

      <Section
        id="graph"
        n={4}
        title="The unrolled adversarial loop"
        lede="Attack → detect → score → retrain → attack is a feedback cycle, not a DAG. It becomes acyclic only when unrolled over rounds: round r's retrained detector is a distinct node feeding round r+1's attacker. Those unroll edges are drawn dashed, and the graph is honest about being a cycle underneath."
      >
        <Figure
          n={4}
          caption="The pipeline, banded one row per round. Dashed ochre edges are the unroll — the feedback the cycle is actually made of, drawn so it cannot be mistaken for ordinary flow."
        >
          <AdversarialGraph graph={graph.payload} />
        </Figure>
      </Section>

      <Section
        id="tabular"
        n={5}
        title="Surface 1 — what the attacker actually changed"
        lede="Three projections constrain every perturbation: immutability (the victim's demographics and home geography cannot be forged), feasibility (values stay inside the band the network would ever see, and merchant choice moves category, terminal geography and distance together), and sparsity (touch as few features as possible)."
      >
        <Figure
          n={5}
          caption="Two worked evasions, each showing the detector's score before and after and the complete list of features the attack moved. The frozen tier never appears in these lists, and the lists are short — that is the sparsity claim, stated as a count rather than implied."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {examples.payload.slice(0, 2).map((e) => (
              <AttackExamplePanel key={e.id} example={e} threshold={thresholdFor(e.round)} />
            ))}
          </div>
        </Figure>

        <div className="mt-14">
          <h3 className="col font-serif text-[1.375rem] leading-snug md:text-[1.5rem]">
            Which features the attack reaches for
          </h3>
          <p className="prose col mt-3 text-muted">
            The mix shifts as the detector retrains, but not in one direction — the amount
            levers are used <em>more</em> by round 2, not less. Read Figure 6 as the search
            relocating under pressure rather than as the attacker being disarmed.
          </p>
          <Figure
            n={6}
            className="mt-7"
            caption="Share of successful evasions in each round that touched a given feature, normalised by that round's successes. Raw counts would show every feature declining, because n_success falls by an order of magnitude across rounds."
          >
            <FeatureFrequencyPanel rounds={attack.payload} />
          </Figure>
        </div>

        <div className="mt-14">
          <h3 className="col font-serif text-[1.375rem] leading-snug md:text-[1.5rem]">
            What the detector leans on, round by round
          </h3>
          <p className="prose col mt-3 text-muted">
            Only round 0 is published today, so there is no re-weighting trend to read here yet
            — the loop&apos;s later rounds are not written to{" "}
            <code className="font-mono text-[0.9em]">detect/rounds.json</code>.
          </p>
          <Figure
            n={7}
            className="mt-7"
            caption="Mean absolute SHAP over the top features of each published detector round. Features marked ↑ are new to the top set that round; a feature entering the top set is the detector re-weighting away from whatever the attacker just exploited."
          >
            <ShapPanel rounds={detect.payload} />
          </Figure>
        </div>
      </Section>

      <Section
        id="agentic"
        n={6}
        title="Surface 2 — indirect prompt injection against a payment agent"
        lede="Injections are planted where a payment system genuinely ingests untrusted text: transaction memos, merchant display names, chargeback dispute evidence. Defenses are an injection classifier, tool scoping, and a human-in-the-loop threshold."
      >
        <Figure
          n={8}
          caption="Exploit rate per injection category, before and after the defense layer, scored by OWASP LLM Top 10 category. The aggregate row on top is the number that feeds the second row of Figure 3."
        >
          <AgenticPanel categories={agentic.payload} />
        </Figure>
      </Section>

      <Provenance shas={shas} newest={newest} />
    </main>
  );
}
