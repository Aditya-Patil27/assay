"""The moves each orchestrator can play.

The existing loop runs one attack and one defence on a fixed schedule, which makes
"co-evolution" a generous description of retraining three times. This module gives each
side a repertoire so that a round is a *choice* rather than a step, and the transcript can
show Red countering what Blue just did.

A Red play is expressed as a **restricted schema plus an attack config**, never as a change
to the search itself. That keeps `attack/engine.py` untouched: restricting
``FeatureSchema.mutable`` narrows what the attacker may reach for, and the engine needs no
knowledge that a strategy exists. Blue plays are expressed as choices about what to train
on and where to put the threshold, for the same reason.

Every play here is one an actual fraud operation would recognise. `low_and_slow` exists
because a real attacker facing rate limits spends queries carefully; `merchant_pivot`
exists because choosing a different shop is the one lever that moves four features at once.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Literal

from ..attack.engine import AttackConfig
from ..schema import COUPLED, FeatureSchema

Side = Literal["red", "blue"]


# --- red ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RedPlay:
    """One attacker strategy.

    ``levers`` names the mutable features this play is allowed to touch. Empty means "all
    of them". ``uses_merchant_swap`` controls whether the coupled merchant group stays
    reachable -- that group is a single attacker decision that moves four features, so it
    is opt-in per play rather than always available.
    """

    name: str
    summary: str
    levers: frozenset[str] = field(default_factory=frozenset)
    uses_merchant_swap: bool = False
    config_overrides: dict[str, int] = field(default_factory=dict)
    value_floor: float = 0.5
    #: what this play costs the attacker, for the LLM's benefit when choosing
    cost: Literal["cheap", "moderate", "expensive"] = "moderate"

    def restrict(self, schema: FeatureSchema) -> FeatureSchema:
        """Return a schema exposing only this play's levers."""
        mutable = frozenset(self.levers) & schema.mutable if self.levers else schema.mutable
        groups = schema.coupled_groups if self.uses_merchant_swap else ()
        return replace(schema, mutable=mutable, coupled_groups=groups)

    def configure(self, base: AttackConfig) -> AttackConfig:
        return replace(base, **self.config_overrides)


RED_PLAYS: tuple[RedPlay, ...] = (
    RedPlay(
        name="amount_probe",
        summary=(
            "Move only the charge amount and its derived ratios. The classic lever: cheap, "
            "few queries, and usually the first thing an undefended model gives up."
        ),
        levers=frozenset({"amt", "log_amt", "amt_ratio_to_card_mean"}),
        config_overrides={"budget": 1, "grid": 15, "restarts": 2},
        cost="cheap",
    ),
    RedPlay(
        name="merchant_pivot",
        summary=(
            "Hit a different merchant instead. One attacker decision that simultaneously "
            "changes category, terminal geography and distance-from-home. Expensive to "
            "search but hard for the defender to regularise away, because the features "
            "move together in ways that are legitimate for real customers too."
        ),
        uses_merchant_swap=True,
        config_overrides={"budget": 1, "merchant_samples": 48, "restarts": 3},
        cost="moderate",
    ),
    RedPlay(
        name="timing_shift",
        summary=(
            "Transact at a different hour or day. Cheap for the attacker -- waiting costs "
            "nothing -- and effective against detectors leaning on night-time signals."
        ),
        levers=frozenset({"hour", "day_of_week", "is_night", "hours_since_last_txn"}),
        config_overrides={"budget": 2, "grid": 11, "restarts": 2},
        cost="cheap",
    ),
    RedPlay(
        name="velocity_pacing",
        summary=(
            "Slow the burst. Spread charges so per-card velocity counters look ordinary. "
            "Costs the operation time, which is the scarcest thing it has once a card is "
            "known to be compromised."
        ),
        levers=frozenset({"txn_count_1h", "txn_count_24h", "hours_since_last_txn"}),
        config_overrides={"budget": 2, "restarts": 3},
        cost="moderate",
    ),
    RedPlay(
        name="combined_sweep",
        summary=(
            "Everything at once, high restart count. Most likely to succeed and the "
            "loudest: high L0, many queries, easiest for a monitoring system to notice."
        ),
        uses_merchant_swap=True,
        config_overrides={"budget": 4, "restarts": 5, "merchant_samples": 32},
        cost="expensive",
    ),
    RedPlay(
        name="low_and_slow",
        summary=(
            "Every lever available but a hard query ceiling, as if probing a live endpoint "
            "behind rate limiting. Lower success rate, far smaller footprint."
        ),
        uses_merchant_swap=True,
        config_overrides={"budget": 3, "restarts": 1, "max_queries": 600, "grid": 5},
        cost="cheap",
    ),
)


# --- blue --------------------------------------------------------------------------


@dataclass(frozen=True)
class BluePlay:
    """One defender strategy.

    Blue's levers are what it trains on and where it puts the decision threshold. Both are
    things `loop/flows.py` already does, so no defence here requires new training
    machinery -- only a different choice about the same machinery.
    """

    name: str
    summary: str
    #: multiply Red's successful evasions this many times when augmenting (0 = no augmentation)
    augment_weight: int = 1
    #: shift the decision threshold by this fraction (negative = catch more, at precision's cost)
    threshold_delta: float = 0.0
    cost: Literal["cheap", "moderate", "expensive"] = "moderate"


BLUE_PLAYS: tuple[BluePlay, ...] = (
    BluePlay(
        name="adversarial_retrain",
        summary=(
            "Add Red's successful evasions to the training set, labelled fraud, and "
            "retrain. The standard response and the honest baseline."
        ),
        augment_weight=1,
        cost="moderate",
    ),
    BluePlay(
        name="targeted_retrain",
        summary=(
            "Same, but oversample the evasions threefold so the model weights the breached "
            "region harder. Faster to close a specific hole; risks overfitting to one "
            "attack shape and leaving the neighbouring one open."
        ),
        augment_weight=3,
        cost="moderate",
    ),
    BluePlay(
        name="threshold_tighten",
        summary=(
            "Do not retrain. Lower the decision threshold so marginal transactions are "
            "declined. Instant and free, and it buys recall with precision -- more "
            "legitimate customers declined. Use when the breach is near the boundary."
        ),
        augment_weight=0,
        threshold_delta=-0.15,
        cost="cheap",
    ),
    BluePlay(
        name="retrain_and_tighten",
        summary=(
            "Both: augment and move the threshold. Strongest single response and the most "
            "expensive in false positives. The defence to reach for when a cheap attack "
            "is succeeding often."
        ),
        augment_weight=2,
        threshold_delta=-0.08,
        cost="expensive",
    ),
)


# --- lookup ------------------------------------------------------------------------

RED_BY_NAME = {p.name: p for p in RED_PLAYS}
BLUE_BY_NAME = {p.name: p for p in BLUE_PLAYS}


def red_play(name: str) -> RedPlay:
    if name not in RED_BY_NAME:
        raise KeyError(f"unknown red play {name!r}; known: {sorted(RED_BY_NAME)}")
    return RED_BY_NAME[name]


def blue_play(name: str) -> BluePlay:
    if name not in BLUE_BY_NAME:
        raise KeyError(f"unknown blue play {name!r}; known: {sorted(BLUE_BY_NAME)}")
    return BLUE_BY_NAME[name]


def catalogue(side: Side) -> str:
    """The repertoire as prompt text, so an orchestrator chooses from what exists."""
    plays: tuple[RedPlay, ...] | tuple[BluePlay, ...] = (
        RED_PLAYS if side == "red" else BLUE_PLAYS
    )
    lines = []
    for p in plays:
        extra = ""
        if isinstance(p, RedPlay):
            reach = sorted(p.levers) if p.levers else ["all mutable features"]
            if p.uses_merchant_swap:
                reach = reach + [f"merchant swap ({', '.join(sorted(COUPLED))})"]
            extra = f" | reaches: {', '.join(reach)}"
        lines.append(f"- {p.name} [{p.cost}]{extra}\n    {p.summary}")
    return "\n".join(lines)
