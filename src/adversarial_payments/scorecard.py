"""The terminal node: one table both attack surfaces feed.

Spec section 4.7 -- *surface x attack success before x after x defense cost*. Two rows is
the entire "this is a framework, not two projects in two tabs" claim, so the row that is
missing is worth flagging rather than filling in.

P2 writes the tabular row from its own measurements. The agentic row belongs to P3 and is
either handed over directly or derived from ``artifacts/agentic/redteam.json`` once that
file is real. Nothing here invents a number for a track it does not own.
"""

from __future__ import annotations

from typing import Sequence

from . import artifacts as A
from .artifacts import AttackRound, DetectRound, ScorecardRow

TABULAR_SURFACE = "Tabular detector"
AGENTIC_SURFACE = "Payment agent"


def tabular_row(
    attack_rounds: Sequence[AttackRound],
    detect_rounds: Sequence[DetectRound],
) -> ScorecardRow:
    """ASR at round 0 vs the final round, priced in PR-AUC given up."""
    if not attack_rounds:
        raise ValueError("no attack rounds; run the loop before writing the scorecard")

    first, last = attack_rounds[0], attack_rounds[-1]
    if detect_rounds:
        pr0, prn = detect_rounds[0].pr_auc, detect_rounds[-1].pr_auc
        rel = (prn - pr0) / pr0 if pr0 else 0.0
        cost = f"PR-AUC {pr0:.3f} -> {prn:.3f} ({rel:+.1%}) over {len(detect_rounds)} rounds"
    else:
        cost = "PR-AUC delta not measured"

    return ScorecardRow(
        surface=TABULAR_SURFACE,
        attack_success_before=round(first.asr, 4),
        attack_success_after=round(last.asr, 4),
        defense_cost=cost,
        primary_metric="Attack Success Rate (constrained evasion)",
    )


def agentic_row_from_artifact() -> ScorecardRow | None:
    """Derive P3's row from their own real artifact, or return None.

    Only reads; the numbers are P3's measurements. If their artifact is still a seeded
    placeholder this returns ``None`` and the caller records the gap instead of
    manufacturing an exploit rate.
    """
    try:
        data = A.read("agentic_redteam")
    except (FileNotFoundError, ValueError):
        return None
    if data.get("placeholder", True):
        return None

    rows = data.get("payload") or []
    attempts = sum(int(r["attempts"]) for r in rows)
    if not attempts:
        return None

    before = sum(int(r["success_before"]) for r in rows) / attempts
    after = sum(int(r["success_after"]) for r in rows) / attempts
    return ScorecardRow(
        surface=AGENTIC_SURFACE,
        attack_success_before=round(before, 4),
        attack_success_after=round(after, 4),
        defense_cost="(defense cost pending from P3)",
        primary_metric="Exploit rate (OWASP LLM Top 10)",
    )


def build(
    attack_rounds: Sequence[AttackRound],
    detect_rounds: Sequence[DetectRound],
    *,
    agentic: ScorecardRow | None = None,
) -> tuple[list[ScorecardRow], list[str]]:
    """Assemble the scorecard, returning the rows and any gaps worth reporting."""
    rows = [tabular_row(attack_rounds, detect_rounds)]
    notes: list[str] = []

    agentic = agentic or agentic_row_from_artifact()
    if agentic is None:
        notes.append(
            "agentic row absent: P3 has not delivered a row and "
            "artifacts/agentic/redteam.json is still placeholder"
        )
    else:
        rows.append(agentic)

    return rows, notes


def write(
    attack_rounds: Sequence[AttackRound],
    detect_rounds: Sequence[DetectRound],
    *,
    agentic: ScorecardRow | None = None,
    placeholder: bool = False,
) -> tuple[list[ScorecardRow], list[str]]:
    rows, notes = build(attack_rounds, detect_rounds, agentic=agentic)
    A.write("scorecard", rows, placeholder=placeholder)
    return rows, notes
