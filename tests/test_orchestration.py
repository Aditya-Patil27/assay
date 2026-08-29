"""Tests for the Red/Blue exchange.

The tests that matter here are the ones about honesty, not mechanics. An arena that runs is
easy; an arena that refuses to claim adaptation it cannot demonstrate is the point.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from adversarial_payments.agentic.client import CacheMissError
from adversarial_payments.orchestration.arena import SATURATION_ASR, run_arena
from adversarial_payments.orchestration.orchestrators import (
    BlueOrchestrator,
    Move,
    RedOrchestrator,
    RoundOutcome,
    _parse,
)
from adversarial_payments.orchestration.repertoire import (
    BLUE_PLAYS,
    RED_PLAYS,
    blue_play,
    catalogue,
    red_play,
)
from adversarial_payments.schema import FEATURES, FeatureSchema


@pytest.fixture
def schema() -> FeatureSchema:
    rng = np.random.default_rng(0)
    return FeatureSchema.fit(pd.DataFrame({c: rng.normal(size=200) for c in FEATURES}))


# --- repertoire --------------------------------------------------------------------


def test_red_plays_never_expose_frozen_features(schema):
    for play in RED_PLAYS:
        restricted = play.restrict(schema)
        assert not (restricted.mutable & schema.frozen), play.name


def test_restrict_narrows_rather_than_widens(schema):
    for play in RED_PLAYS:
        assert play.restrict(schema).mutable <= schema.mutable, play.name


def test_plays_without_merchant_swap_drop_the_coupled_group(schema):
    amount = red_play("amount_probe")
    assert amount.restrict(schema).coupled_groups == ()
    pivot = red_play("merchant_pivot")
    assert pivot.restrict(schema).coupled_groups == schema.coupled_groups


def test_every_play_name_is_unique():
    names = [p.name for p in RED_PLAYS] + [p.name for p in BLUE_PLAYS]
    assert len(names) == len(set(names))


def test_catalogue_lists_every_play():
    for play in RED_PLAYS:
        assert play.name in catalogue("red")
    for play in BLUE_PLAYS:
        assert play.name in catalogue("blue")


def test_unknown_play_is_rejected():
    with pytest.raises(KeyError, match="unknown red play"):
        red_play("teleport")
    with pytest.raises(KeyError, match="unknown blue play"):
        blue_play("pray")


# --- parsing -----------------------------------------------------------------------


@pytest.mark.parametrize(
    "content",
    [
        '{"play": "amount_probe", "reasoning": "cheapest first"}',
        'Sure!\n```json\n{"play": "amount_probe", "reasoning": "cheapest first"}\n```',
        'I think:\n{"play": "amount_probe", "reasoning": "cheapest first"}\nHope that helps.',
    ],
)
def test_parse_tolerates_fences_and_prose(content):
    assert _parse(content)["play"] == "amount_probe"


@pytest.mark.parametrize("content", ["", "no json here", "{broken", None])
def test_parse_returns_none_rather_than_guessing(content):
    assert _parse(content or "") is None


# --- orchestrator provenance -------------------------------------------------------


class _DeadClient:
    """A client with no model behind it, like a run with no credentials."""

    def chat(self, messages, *, tools=None, temperature=0.0):
        raise CacheMissError("no cached response")


class _ScriptedClient:
    def __init__(self, content: str, cached: bool = False):
        self.content, self.cached = content, cached

    def chat(self, messages, *, tools=None, temperature=0.0):
        from adversarial_payments.agentic.client import ChatResponse

        return ChatResponse(content=self.content, provenance="test", cached=self.cached)


def test_fallback_is_labelled_fallback_not_llm():
    move = RedOrchestrator(client=_DeadClient()).choose([], 0)
    assert move.provenance == "fallback"
    assert "deterministic fallback" in move.reasoning
    assert move.play in {p.name for p in RED_PLAYS}


def test_a_model_choice_is_labelled_llm():
    client = _ScriptedClient('{"play": "timing_shift", "reasoning": "amount was hardened"}')
    move = RedOrchestrator(client=client).choose([], 1)
    assert move.provenance == "llm"
    assert move.play == "timing_shift"
    assert move.reasoning == "amount was hardened"


def test_cached_model_choice_is_labelled_distinctly():
    client = _ScriptedClient('{"play": "timing_shift", "reasoning": "x"}', cached=True)
    assert RedOrchestrator(client=client).choose([], 1).provenance == "llm-cached"


def test_an_invented_play_falls_back_rather_than_being_used():
    client = _ScriptedClient('{"play": "nuke_the_bank", "reasoning": "why not"}')
    move = RedOrchestrator(client=client).choose([], 1)
    assert move.provenance == "fallback"
    assert move.play in {p.name for p in RED_PLAYS}


def test_blue_rule_escalates_with_attack_success():
    blue = BlueOrchestrator(client=_DeadClient())
    hot = RoundOutcome(0, "amount_probe", "adversarial_retrain", 0.9, 0.83, 2.0, 40)
    cold = RoundOutcome(0, "amount_probe", "adversarial_retrain", 0.1, 0.83, 2.0, 40)
    assert blue.choose([hot], 1).play == "retrain_and_tighten"
    assert blue.choose([cold], 1).play == "threshold_tighten"


# --- the arena's honesty guards ----------------------------------------------------


def _harness(asr: float, schema: FeatureSchema):
    frame = pd.DataFrame({c: np.zeros(10) for c in FEATURES})
    adversarial = frame.head(3)

    def fit_detector(train):
        return object()

    def score_detector(model, test, delta):
        return {"pr_auc": 0.83, "threshold": 0.5 + delta}

    def attack(*, model, schema, config, threshold, value_floor):
        return {
            "asr": asr,
            "mean_l0": 2.0,
            "median_queries": 40,
            "adversarial": adversarial,
            "top_features": ["amt"],
        }

    def augment(train, rows, weight):
        return pd.concat([train] + [rows] * weight, ignore_index=True)

    return dict(
        train_df=frame,
        test_df=frame,
        schema=schema,
        fit_detector=fit_detector,
        score_detector=score_detector,
        attack=attack,
        augment=augment,
        log=lambda _msg: None,
    )


def test_saturated_run_is_flagged_degenerate(schema):
    result = run_arena(
        **_harness(1.0, schema),
        n_rounds=3,
        red=RedOrchestrator(client=_DeadClient()),
        blue=BlueOrchestrator(client=_DeadClient()),
    )
    assert result.degenerate
    assert all(e.saturated for e in result.exchanges)
    assert any("NOT evidence of adaptation" in n for n in result.notes)


def test_saturated_run_refuses_to_support_an_adaptivity_claim(schema):
    result = run_arena(
        **_harness(1.0, schema),
        n_rounds=3,
        red=RedOrchestrator(client=_DeadClient()),
        blue=BlueOrchestrator(client=_DeadClient()),
    )
    # The plays still differ -- and that must not be mistaken for adaptation.
    assert result.adaptivity_evidence()["distinct_red_plays"] > 1
    assert result.adaptivity_evidence()["supports_adaptivity_claim"] is False


def test_non_saturated_run_is_not_flagged_degenerate(schema):
    result = run_arena(
        **_harness(0.4, schema),
        n_rounds=3,
        red=RedOrchestrator(client=_DeadClient()),
        blue=BlueOrchestrator(client=_DeadClient()),
    )
    assert not result.degenerate
    assert result.adaptivity_evidence()["informative_rounds"] == 3


def test_an_all_fallback_run_says_no_llm_reasoning_occurred(schema):
    result = run_arena(
        **_harness(0.4, schema),
        n_rounds=2,
        red=RedOrchestrator(client=_DeadClient()),
        blue=BlueOrchestrator(client=_DeadClient()),
    )
    assert any("No LLM reasoning occurred" in n for n in result.notes)


def test_saturation_threshold_is_not_reached_by_ordinary_success(schema):
    assert SATURATION_ASR > 0.9
    result = run_arena(**_harness(0.9, schema), n_rounds=1,
                       red=RedOrchestrator(client=_DeadClient()),
                       blue=BlueOrchestrator(client=_DeadClient()))
    assert not result.exchanges[0].saturated
