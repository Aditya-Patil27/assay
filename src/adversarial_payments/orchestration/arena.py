"""The Red/Blue exchange.

Blue holds the line, Red reasons about how to breach it, Blue responds to how it was
breached, and it repeats. This module runs that exchange and records the transcript.

It is strictly additive: it *imports* the detector, attack engine and constraint projector
without modifying any of them, and writes its own artifact kind. If the exchange does not
land, the baseline loop in ``loop/flows.py`` still produces the headline number unchanged.

**On saturation.** If the attacker succeeds on every attempt, neither side has anything to
adapt to -- Red has no reason to pivot when its opening lever already works every time, and
Blue has no signal about which hole to close first. The arena detects that regime and says
so in the transcript, because a sequence of moves against a saturated target looks exactly
like adaptation and is not. Reporting an exchange as adaptive when it could not have been
would be the same failure as reporting an evasion that surrendered the money.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

import pandas as pd

from ..attack.engine import AttackConfig
from ..schema import FeatureSchema
from .orchestrators import BlueOrchestrator, Move, RedOrchestrator, RoundOutcome
from .repertoire import BluePlay, RedPlay, blue_play, red_play

#: A round in which the attacker succeeds at least this often teaches neither side anything.
SATURATION_ASR = 0.98


@dataclass
class Exchange:
    """One round of the exchange, with both sides' reasoning preserved."""

    round: int
    red: Move
    blue: Move
    outcome: RoundOutcome
    saturated: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "round": self.round,
            "red": self.red.as_dict(),
            "blue": self.blue.as_dict(),
            "asr": self.outcome.asr,
            "pr_auc": self.outcome.pr_auc,
            "mean_l0": self.outcome.mean_l0,
            "median_queries": self.outcome.median_queries,
            "value_retained": self.outcome.value_retained,
            "top_features": list(self.outcome.top_features),
            "saturated": self.saturated,
        }


@dataclass
class ArenaResult:
    exchanges: list[Exchange] = field(default_factory=list)
    #: True when every round was saturated, i.e. adaptation was unmeasurable throughout
    degenerate: bool = False
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "exchanges": [e.as_dict() for e in self.exchanges],
            "degenerate": self.degenerate,
            "notes": list(self.notes),
            "adaptivity_evidence": self.adaptivity_evidence(),
        }

    def adaptivity_evidence(self) -> dict[str, Any]:
        """Whether the transcript can actually support a claim of adaptation.

        Distinct plays alone prove nothing -- a fixed rotation produces distinct plays too.
        What counts is a side changing course in a round where it had a reason to.
        """
        red_plays = [e.red.play for e in self.exchanges]
        blue_plays = [e.blue.play for e in self.exchanges]
        informative = [e for e in self.exchanges if not e.saturated]
        pivots = sum(
            1
            for prev, cur in zip(self.exchanges, self.exchanges[1:])
            if cur.red.play != prev.red.play and not prev.saturated
        )
        return {
            "distinct_red_plays": len(set(red_plays)),
            "distinct_blue_plays": len(set(blue_plays)),
            "informative_rounds": len(informative),
            "red_pivots_after_informative_round": pivots,
            "supports_adaptivity_claim": bool(informative) and pivots > 0,
        }


def run_arena(
    *,
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    schema: FeatureSchema,
    fit_detector: Callable[[pd.DataFrame], Any],
    score_detector: Callable[[Any, pd.DataFrame, float], dict[str, float]],
    attack: Callable[..., dict[str, Any]],
    augment: Callable[[pd.DataFrame, pd.DataFrame, int], pd.DataFrame],
    # ``attack`` must return {"asr", "mean_l0", "median_queries", "adversarial", ...};
    # "adversarial" is the frame of rows that got through, which Blue then trains on.
    n_rounds: int = 3,
    base_config: AttackConfig | None = None,
    red: RedOrchestrator | None = None,
    blue: BlueOrchestrator | None = None,
    log: Callable[[str], None] = print,
) -> ArenaResult:
    """Run the exchange.

    Every capability is injected rather than imported-and-called, so this module never
    reaches into ``loop/flows.py`` internals and the caller keeps ownership of how the
    detector is trained and scored.
    """
    red = red or RedOrchestrator()
    blue = blue or BlueOrchestrator()
    base_config = base_config or AttackConfig()

    result = ArenaResult()
    history: list[RoundOutcome] = []
    current_train = train_df
    blue_move: Move | None = None
    # Rows the attacker got through last round. Blue trains on these; the arena never
    # reaches into the engine to recover them.
    last_adversarial: pd.DataFrame | None = None

    for r in range(n_rounds):
        # --- Blue acts first: it is defending something that already exists ---------
        if r == 0:
            blue_move = Move(
                side="blue",
                play="adversarial_retrain",
                reasoning="Round 0 establishes the undefended baseline; no response yet.",
                provenance="fallback",
            )
            defence: BluePlay = blue_play("adversarial_retrain")
        else:
            blue_move = blue.choose(history, r)
            defence = blue_play(blue_move.play)
            log(f"  blue plays {defence.name}: {blue_move.reasoning}")
            if defence.augment_weight and last_adversarial is not None and len(last_adversarial):
                current_train = augment(current_train, last_adversarial, defence.augment_weight)

        model = fit_detector(current_train)

        # --- Red responds to the detector it now faces ------------------------------
        red_move = red.choose(history, r)
        offence: RedPlay = red_play(red_move.play)
        log(f"  red plays  {offence.name}: {red_move.reasoning}")

        scores = score_detector(model, test_df, defence.threshold_delta)
        attack_result = attack(
            model=model,
            schema=offence.restrict(schema),
            config=offence.configure(base_config),
            threshold=scores["threshold"],
            value_floor=offence.value_floor,
        )

        outcome = RoundOutcome(
            round=r,
            red_play=offence.name,
            blue_play=defence.name,
            asr=float(attack_result["asr"]),
            pr_auc=float(scores["pr_auc"]),
            mean_l0=float(attack_result.get("mean_l0", 0.0)),
            median_queries=int(attack_result.get("median_queries", 0)),
            value_retained=attack_result.get("value_retained"),
            top_features=list(attack_result.get("top_features", [])),
        )

        last_adversarial = attack_result.get("adversarial")

        saturated = outcome.asr >= SATURATION_ASR
        if saturated:
            log(
                f"  ! round {r} saturated (ASR {outcome.asr:.1%}) -- neither side has a "
                "signal to adapt to"
            )

        result.exchanges.append(
            Exchange(round=r, red=red_move, blue=blue_move, outcome=outcome, saturated=saturated)
        )
        history.append(outcome)

    result.degenerate = bool(result.exchanges) and all(e.saturated for e in result.exchanges)
    if result.degenerate:
        result.notes.append(
            "Every round saturated: the attacker succeeded on essentially every attempt "
            "throughout. The sequence of plays in this transcript is therefore NOT evidence "
            "of adaptation -- neither orchestrator had a signal to respond to. Tighten the "
            "attack constraints or raise the value floor so the attacker sometimes fails, "
            "then re-run."
        )

    evidence = result.adaptivity_evidence()
    if not evidence["supports_adaptivity_claim"]:
        result.notes.append(
            "This transcript does not support a claim of adaptive behaviour: there is no "
            "round in which a side changed course after an informative result. Distinct "
            "plays alone do not demonstrate adaptation -- a fixed rotation produces those too."
        )

    provenances = {m.provenance for e in result.exchanges for m in (e.red, e.blue)}
    if provenances == {"fallback"}:
        result.notes.append(
            "Every move was chosen by the deterministic fallback, not by a model. No LLM "
            "reasoning occurred in this run."
        )

    return result


