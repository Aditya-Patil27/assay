import type { Metadata } from "next";

import { Block, Figure, PageHeader } from "@/components/Chrome";
import { FeatureFrequencyPanel } from "@/components/FeatureFrequency";
import { AttackExamplePanel } from "@/components/Panels";
import { ShapPanel } from "@/components/ShapPanel";
import { ConstraintContract } from "@/components/System";
import { loadArtifacts, loadFeatureSchema } from "@/lib/load";

export const metadata: Metadata = { title: "Tabular attack" };

export default async function Attack() {
  const { detect, attack, examples } = await loadArtifacts();
  const schema = await loadFeatureSchema();

  const thresholdFor = (round: number) =>
    detect.payload.find((d) => d.round === round)?.threshold;

  return (
    <>
      <PageHeader
        eyebrow="Surface 1 · tabular"
        title="What the attacker is actually allowed to change"
        lede="Three projections constrain every perturbation: immutability (the victim's demographics and home geography cannot be forged), feasibility (values stay inside the band the network would ever see, and merchant choice moves category, terminal geography and distance together), and sparsity (touch as few features as possible)."
      />

      <Block
        title="Two worked evasions"
        lede="Each shows the detector's score before and after, and the complete list of features the attack moved."
      >
        <Figure
          n={1}
          caption="The frozen tier never appears in these lists, and the lists are short — that is the sparsity claim, stated as a count rather than implied."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {examples.payload.slice(0, 2).map((e) => (
              <AttackExamplePanel key={e.id} example={e} threshold={thresholdFor(e.round)} />
            ))}
          </div>
        </Figure>
      </Block>

      <Block
        title="Which features the attack reaches for"
        lede="The mix shifts as the detector retrains, but not in one direction — the amount levers are used more by round 2, not less. Read this as the search relocating under pressure rather than as the attacker being disarmed."
      >
        <Figure
          n={2}
          caption="Share of successful evasions in each round that touched a given feature, normalised by that round's successes. Raw counts would show every feature declining, because n_success falls by an order of magnitude across rounds."
        >
          <FeatureFrequencyPanel rounds={attack.payload} />
        </Figure>
      </Block>

      <Block
        title="What the detector leans on, round by round"
        lede="Only round 0 is published today, so there is no re-weighting trend to read here yet — the loop's later rounds are not written to detect/rounds.json."
      >
        <Figure
          n={3}
          caption="Mean absolute SHAP over the top features of each published detector round. Features marked ↑ are new to the top set that round; a feature entering the top set is the detector re-weighting away from whatever the attacker just exploited."
        >
          <ShapPanel rounds={detect.payload} />
        </Figure>
      </Block>

      {schema && (
        <Block
          title="The constraint contract"
          lede="This is the attack's search space, as the pipeline actually computed it. Every detector input gets a tier, and the bounds are the observed min/max of the training corpus — so 'feasible' is a measured property of the network rather than an assertion by whoever wrote the attack."
        >
          <Figure
            n={4}
            caption="The frozen tier is excluded outright, the coupled group can only move to a merchant the network was observed to contain, and the free tier is clipped to the band beside it."
          >
            <ConstraintContract schema={schema} />
          </Figure>
        </Block>
      )}
    </>
  );
}
