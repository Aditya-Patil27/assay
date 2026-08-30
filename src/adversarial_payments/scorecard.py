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
    if len(detect_rounds) > 1:
        pr0, prn = detect_rounds[0].pr_auc, detect_rounds[-1].pr_auc
        rel = (prn - pr0) / pr0 if pr0 else 0.0
        cost = f"PR-AUC {pr0:.3f} -> {prn:.3f} ({rel:+.1%}) over {len(detect_rounds)} rounds"
    elif detect_rounds:
        # A single round cannot express a change. Differencing it against itself yields
        # "+0.0%", which reads as "the defence cost nothing" when it means "we did not
        # measure it" -- the same missing-value-as-confident-zero error as plotting an
        # absent round at the axis.
        cost = (
            f"PR-AUC {detect_rounds[0].pr_auc:.3f} at round {detect_rounds[0].round}; "
            f"delta not measured (only one detector round published)"
        )
    else:
        cost = "PR-AUC delta not measured"

    return ScorecardRow(
        surface=TABULAR_SURFACE,
        attack_success_before=round(first.asr, 4),
        attack_success_after=round(last.asr, 4),
        defense_cost=cost,
        primary_metric="Attack Success Rate (constrained evasion)",
    )


def _fisher_two_sided(a: int, b: int, c: int, d: int) -> float:
    """Two-sided Fisher exact p for the 2x2 table [[a, b], [c, d]].

    Written out rather than pulled from scipy because it is twenty lines and scipy is not
    a dependency. It exists because an exploit rate falling to zero over seventy-odd
    trials looks conclusive and frequently is not: three successes going to none is a
    result you would get by chance roughly a quarter of the time.
    """
    from math import comb

    n = a + b + c + d
    if n == 0 or (a + c) == 0:
        return 1.0

    def pr(x: int) -> float:
        y, u, v = (a + b) - x, (a + c) - x, (c + d) - ((a + c) - x)
        if min(x, y, u, v) < 0:
            return 0.0
        return comb(a + b, x) * comb(c + d, u) / comb(n, a + c)

    observed = pr(a)
    return min(1.0, sum(t for i in range(a + c + 1) if (t := pr(i)) <= observed + 1e-12))


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

    n_before = sum(int(r["success_before"]) for r in rows)
    n_after = sum(int(r["success_after"]) for r in rows)
    before = n_before / attempts
    after = n_after / attempts

    # Name the model. An exploit rate is a property of the model under test, and a row
    # that omits it invites the reader to attach the number to whatever they assume.
    models = sorted({str(r.get("model") or "") for r in rows} - {""})
    model = "+".join(models) if models else "unspecified model"

    p = _fisher_two_sided(n_before, attempts - n_before, n_after, attempts - n_after)
    verdict = (
        f"significant at p={p:.3f}"
        if p < 0.05
        else f"NOT significant (Fisher p={p:.3f}) -- {n_before}/{attempts} to "
        f"{n_after}/{attempts} is within chance"
    )

    return ScorecardRow(
        surface=AGENTIC_SURFACE,
        attack_success_before=round(before, 4),
        attack_success_after=round(after, 4),
        defense_cost=f"{verdict}; model {model}",
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
