import type { Metadata } from "next";

import { Block, Figure, PageHeader } from "@/components/Chrome";
import { CoevolutionChart } from "@/components/CoevolutionChart";
import { AdversarialDetectionPanel } from "@/components/AdversarialDetectionPanel";
import { FeasibilityPanel } from "@/components/FeasibilityPanel";
import { Scorecard } from "@/components/Scorecard";
import { loadAdversarialDetection, loadArtifacts, loadFeasibility } from "@/lib/load";

export const metadata: Metadata = { title: "Results" };

export default async function Results() {
  const { scorecard, detect, attack } = await loadArtifacts();
  const feasibility = await loadFeasibility();
  const detection = await loadAdversarialDetection();

  return (
    <>
      <PageHeader
        eyebrow="Results"
        title="Three rounds of retraining moved the cost, not the success rate"
        lede="Attack success does not collapse — it is 100% at every round. Round r's retrained detector is what round r+1's attacker faces, and it faces a harder search each time: more features touched, more queries spent, and still a way through."
      />

      <Block title="Co-evolution across rounds">
        <Figure
          n={1}
          caption="Attack success rate and detector PR-AUC by round, with the per-round cost table beneath. The two series share no unit, so they carry separate axes, stroke patterns and dot shapes — the argument survives a projector that mangles colour. A round whose detector was never trained is drawn absent, not zero."
        >
          <CoevolutionChart detect={detect.payload} attack={attack.payload} />
        </Figure>
      </Block>

      <Block
        title="Framework scorecard"
        lede="The same loop — attack, measure, defend, re-measure — applied to a tabular detector and to a payment agent. Two surfaces is what makes this a framework rather than a project."
      >
        <Figure
          n={2}
          caption="Attack success before and after the defense, per surface, with what the defense cost in each case. This table is the terminal node both tracks feed."
        >
          <Scorecard rows={scorecard.payload} />
        </Figure>
      </Block>

      {feasibility && (
        <Block
          title="Why this attack success rate means something"
          lede="Both attackers below report the same success rate against the same detector. Only one of them produced transactions that could actually happen. This is the check we run against ourselves before reporting any number."
        >
          <Figure
            n={3}
            caption="The same headline number, audited two ways. The unconstrained attacker's successes are decomposed into the share that settle at a merchant absent from the network and the share that forged an attribute a real attacker inherits from the victim and cannot touch."
          >
            <FeasibilityPanel audit={feasibility.payload} placeholder={feasibility.placeholder} />
          </Figure>
        </Block>
      )}

      {detection && (
        <Block
          title="So what do you do about the 100%"
          lede="Retraining never stops the next search. It does change what the detector catches from searches that already happened. Half the successful evasions were folded into training; the other half were never shown to the model, and recall is reported on that half only."
        >
          <Figure
            n={4}
            caption="A second-stage detector retrained on half of the evasions, scored on the half it never saw, at the same false-positive budget. The trained-on recall is printed beside it because that is the memorisation ceiling a less careful report would quote. Real-fraud recall and legitimate declines at the same operating point, so a detector that catches attacks by declining everyone would show up here as what it is."
          >
            <AdversarialDetectionPanel result={detection.payload} />
          </Figure>
        </Block>
      )}
    </>
  );
}
