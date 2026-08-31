"""Prove the TypeScript defense port agrees with Python, span for span.

The /agent live route runs the defense stack in Node, because that is where the model key
lives. Two implementations of one security control is exactly how a demo drifts into
looking right while being wrong -- so this emits Python's verdict for every scoreable span
of every spliced document in the corpus, and web/scripts/check-agent-port.mjs replays the
same inputs through the TypeScript and diffs them.

A mismatch is a failure, not a warning: if the port disagrees anywhere, the numbers the
live page shows are not the numbers the paper reports.

    python scripts/check_agent_conformance.py       # writes the expectations
    node web/scripts/check-agent-port.mjs           # checks the port against them
"""

from __future__ import annotations

import json
from pathlib import Path

from adversarial_payments.agentic.defenses import InjectionClassifier, _spans
from adversarial_payments.agentic.injections import INJECTIONS, SCENARIOS
from adversarial_payments.config import ROOT

OUT = ROOT / "web" / "scripts" / "agent-conformance.json"


def main() -> int:
    clf = InjectionClassifier()
    cases: list[dict] = []

    for injection in INJECTIONS:
        for scenario in SCENARIOS:
            if scenario.channel != injection.channel:
                continue
            document = f"{scenario.document}\n{injection.payload}"
            clean, events = clf.sanitise(document)
            cases.append(
                {
                    "injection_id": injection.id,
                    "scenario_id": scenario.id,
                    "document": document,
                    "spans": [
                        {
                            "text": span,
                            "score": clf.score(span).score,
                            "reasons": sorted(clf.score(span).reasons),
                        }
                        for span in _spans(document)
                    ],
                    "clean": clean,
                    "redactions": len(events),
                }
            )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cases, indent=1), encoding="utf-8")

    spans = sum(len(c["spans"]) for c in cases)
    flagged = sum(1 for c in cases for s in c["spans"] if s["score"] >= 0.5)
    print(f"wrote {OUT.relative_to(ROOT).as_posix()}")
    print(f"  {len(cases)} spliced documents · {spans} spans · {flagged} over threshold")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
