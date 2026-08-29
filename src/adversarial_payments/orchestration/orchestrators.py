"""Red and Blue orchestrators.

Each side sees what happened last round and chooses its next move from its repertoire. That
choice is what makes this an exchange between two adversaries rather than a script that
retrains three times.

The reasoning is the artifact, not decoration. Across a handful of rounds, "the strategy
adapted" and "the strategy followed a fixed schedule" produce identical-looking sequences,
so a claim of adaptivity is only worth what the transcript can show: Red pivoting to timing
*because* Blue hardened the amount lever. Every move therefore records why it was chosen and
where that reasoning came from.

Provenance is never fudged. A move decided by the deterministic fallback is labelled
``fallback`` even though it carries a written rationale, because presenting a rule's
rationale as a model's reasoning would be the same species of dishonesty as writing a
placeholder number into a result file.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Literal

from ..agentic.client import CacheMissError, LLMClient
from .repertoire import BLUE_PLAYS, RED_PLAYS, Side, blue_play, catalogue, red_play

Provenance = Literal["llm", "llm-cached", "fallback"]


@dataclass
class Move:
    """One orchestrator's decision for one round."""

    side: Side
    play: str
    reasoning: str
    provenance: Provenance

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RoundOutcome:
    """What the arena observed after both sides played. Fed back in as context."""

    round: int
    red_play: str
    blue_play: str
    asr: float
    pr_auc: float
    mean_l0: float
    median_queries: int
    value_retained: float | None = None
    top_features: list[str] = field(default_factory=list)

    def summarise(self) -> str:
        bits = [
            f"round {self.round}: red played {self.red_play}, blue played {self.blue_play}",
            f"  attack success rate: {self.asr:.1%}",
            f"  detector PR-AUC: {self.pr_auc:.4f}",
            f"  mean features touched: {self.mean_l0:.2f}",
            f"  median queries per success: {self.median_queries}",
        ]
        if self.value_retained is not None:
            bits.append(f"  attacker value retained: {self.value_retained:.1%}")
        if self.top_features:
            bits.append(f"  features the attack leaned on: {', '.join(self.top_features)}")
        return "\n".join(bits)


SYSTEM = {
    "red": (
        "You are the red-team orchestrator in an adversarial evaluation of a payment fraud "
        "detector. Each round you choose ONE attack strategy from the repertoire. You are "
        "modelling a real card-fraud operation: you cannot forge the victim's identity, and "
        "every lever costs you something -- money surrendered, time waited, or queries spent "
        "against a monitored endpoint. Choose the strategy most likely to breach the CURRENT "
        "detector given what just happened. If the defender closed the lever you used last "
        "round, pivot rather than repeating."
    ),
    "blue": (
        "You are the blue-team orchestrator defending a payment fraud detector. Each round "
        "you choose ONE defensive response from the repertoire. Your constraint is that "
        "every defence costs something: retraining risks overfitting to one attack shape, "
        "and tightening the threshold declines more legitimate customers. Choose the "
        "response that best closes the hole the attacker just used, without buying "
        "robustness by breaking detection quality."
    ),
}


class Orchestrator:
    """Chooses a play per round, by LLM where available and by rule where not."""

    def __init__(
        self,
        side: Side,
        *,
        client: LLMClient | None = None,
        temperature: float = 0.0,
    ) -> None:
        self.side = side
        self.client = client if client is not None else LLMClient()
        self.temperature = temperature
        self.valid = {p.name for p in (RED_PLAYS if side == "red" else BLUE_PLAYS)}

    # -- prompting -------------------------------------------------------------------

    def _messages(self, history: list[RoundOutcome], round_index: int) -> list[dict[str, Any]]:
        if history:
            context = "\n\n".join(o.summarise() for o in history)
        else:
            context = "No rounds have been played yet. This is the opening move."

        user = (
            f"Round {round_index}.\n\n"
            f"What has happened so far:\n{context}\n\n"
            f"Your repertoire:\n{catalogue(self.side)}\n\n"
            "Choose exactly one play. Respond with JSON only, no prose around it:\n"
            '{"play": "<name from the repertoire>", "reasoning": "<two sentences: why this '
            'play, and what specifically about the last round led you to it>"}'
        )
        return [
            {"role": "system", "content": SYSTEM[self.side]},
            {"role": "user", "content": user},
        ]

    # -- decision --------------------------------------------------------------------

    def choose(self, history: list[RoundOutcome], round_index: int) -> Move:
        try:
            response = self.client.chat(
                self._messages(history, round_index), temperature=self.temperature
            )
        except (CacheMissError, RuntimeError) as exc:
            return self._fallback(history, round_index, why=f"no model available ({type(exc).__name__})")

        parsed = _parse(response.content)
        if parsed is None or parsed.get("play") not in self.valid:
            got = None if parsed is None else parsed.get("play")
            return self._fallback(
                history, round_index, why=f"model returned an unusable play ({got!r})"
            )

        provenance: Provenance = "llm-cached" if response.cached else "llm"
        return Move(
            side=self.side,
            play=parsed["play"],
            reasoning=str(parsed.get("reasoning", "")).strip() or "(model gave no rationale)",
            provenance=provenance,
        )

    # -- the rule, used when the model is unavailable ---------------------------------

    def _fallback(self, history: list[RoundOutcome], round_index: int, *, why: str) -> Move:
        """Deterministic counter-play.

        Deliberately simple and deliberately labelled. It exists so the arena still runs
        without credentials, not so we can claim reasoning that never happened.
        """
        if self.side == "red":
            play, rationale = _red_rule(history)
        else:
            play, rationale = _blue_rule(history)
        return Move(
            side=self.side,
            play=play,
            reasoning=f"[deterministic fallback: {why}] {rationale}",
            provenance="fallback",
        )


def _red_rule(history: list[RoundOutcome]) -> tuple[str, str]:
    if not history:
        return "amount_probe", "Opening with the cheapest lever to see what the detector concedes."
    last = history[-1]
    used = {o.red_play for o in history}
    if last.asr < 0.25:
        return "combined_sweep", "The previous play mostly failed, so widen the search."
    for candidate in ("merchant_pivot", "timing_shift", "velocity_pacing", "low_and_slow"):
        if candidate not in used:
            return candidate, f"Rotating to an unused lever after {last.red_play}."
    return "combined_sweep", "Repertoire exhausted; falling back to the broad sweep."


def _blue_rule(history: list[RoundOutcome]) -> tuple[str, str]:
    if not history:
        return "adversarial_retrain", "Standard first response: train on what got through."
    last = history[-1]
    if last.asr > 0.75:
        return "retrain_and_tighten", "Attack success is very high; apply the strongest response."
    if last.asr > 0.4:
        return "targeted_retrain", "Concentrate on the region the attacker just exploited."
    return "threshold_tighten", "Attack success is already low; a cheap threshold move suffices."


_JSON = re.compile(r"\{.*\}", re.DOTALL)


def _parse(content: str) -> dict[str, Any] | None:
    """Pull the JSON object out of a model reply, tolerating fences and stray prose."""
    if not content:
        return None
    match = _JSON.search(content)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


class RedOrchestrator(Orchestrator):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__("red", **kwargs)

    def play_for(self, move: Move):
        return red_play(move.play)


class BlueOrchestrator(Orchestrator):
    def __init__(self, **kwargs: Any) -> None:
        super().__init__("blue", **kwargs)

    def play_for(self, move: Move):
        return blue_play(move.play)
