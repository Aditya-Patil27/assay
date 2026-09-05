// web/components/WhatBroke.tsx
/**
 * The four errors this repository has reported about itself, each linked to the commit
 * that fixed it. Razorpay scores "failure recovery" explicitly; a project whose thesis is
 * that unattacked numbers are decoration has to put its own corrections where a judge
 * lands, not in a changelog.
 */
import { Reveal } from "@/components/Reveal";

const REPO = "https://github.com/Aditya-Patil27/assay";

const ERRORS = [
  {
    broke: "We promised attack success would collapse under adversarial retraining. It did not: 1.000 at every round.",
    fixed: "Re-ran all three detector rounds on the full corpus and corrected every caption. The honest headline became attacker cost, +116 median queries.",
    sha: "83f4971",
  },
  {
    broke: "We explained the flat ASR by under-dosed adversarial training.",
    fixed: "A 5000× dosage sweep refuted that: ASR unmoved in every arm, at a cost of 22.3% of PR-AUC. The explanation was withdrawn. The sweep is committed but unflagged, so it shows amber on /audit.",
    sha: "727a5c2",
  },
  {
    broke: "The decision threshold was fitted on the test split until 2026-08-30, which made evasion free and every earlier ASR incomparable.",
    fixed: "Named the split the published detector actually uses, added a tripwire that fails the build if it recurs, and re-measured.",
    sha: "f501f10",
  },
  {
    broke: "A trainer that never ran was reported as if it had.",
    fixed: "Reported the error in the document rather than deleting it from the history.",
    sha: "c3b809d",
  },
  {
    broke: "The second-stage detection script did not run: a refactor moved the trainer into a shared module and left one call behind, so the committed result predated the code that claimed to produce it.",
    fixed: "Caught on submission day by re-running it to give it a provenance flag. Fixed the call, re-ran, reproduced 68.9% held-out recall to the digit, and the artifact now carries placeholder: false.",
    sha: "1374030",
  },
];

export function WhatBroke() {
  return (
    <Reveal as="section" id="what-broke" className="wrap py-14">
      <p data-stagger="0" className="mono-label text-[0.75rem] text-attack">
        Failure recovery
      </p>
      <h2 data-stagger="0" className="display mt-3 text-[1.75rem] md:text-[2rem]">
        What broke, and how we recovered
      </h2>
      <p data-stagger="1" className="prose col mt-3">
        Five errors, all still in the history. A metric nobody could retract is not a metric.
      </p>
      <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ERRORS.map((e, i) => (
          <li
            key={e.sha}
            data-stagger={String(i + 2)}
            className="card flex flex-col border border-rule p-5"
          >
            <span className="mono-label text-[0.75rem] text-muted">{i + 1} · broke</span>
            <p className="mt-1 text-[0.9375rem] leading-relaxed">{e.broke}</p>
            <span className="mono-label mt-4 text-[0.75rem] text-defend">recovered</span>
            <p className="mt-1 flex-1 text-[0.875rem] leading-relaxed text-muted">{e.fixed}</p>
            <a
              href={`${REPO}/commit/${e.sha}`}
              className="mt-4 font-mono text-[0.75rem] text-defend hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              commit {e.sha} <span className="nudge">→</span>
            </a>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}
