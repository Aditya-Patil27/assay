"""The constraint projections are the submission's central claim, so they get the tests.

Everything here runs against a stub model -- a logistic function of the amount ratio and
the night flag -- so the engine's behaviour is provable without a trained detector and
without the Sparkov download.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from adversarial_payments.attack.constraints import (
    DERIVED,
    MERCHANT_COORD,
    SEARCH_COORDS,
    ConstraintProjector,
    ConstraintViolation,
    MerchantBank,
    haversine_km,
)
from adversarial_payments.attack.engine import (
    AttackConfig,
    adversarial_frame,
    attack_dataset,
    attack_one,
    select_targets,
)
from adversarial_payments.attack.metrics import (
    feasibility_audit,
    pick_examples,
    summarize_round,
)
from adversarial_payments.loop.fallback import synthetic_features
from adversarial_payments.schema import COUPLED, FEATURES, FROZEN, TARGET, FeatureSchema


class StubModel:
    """Fraud probability rises with relative amount and at night. Deliberately evadable."""

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        z = (
            1.6 * X["amt_ratio_to_card_mean"].to_numpy(dtype=float)
            + 1.0 * X["is_night"].to_numpy(dtype=float)
            + 0.002 * X["distance_km"].to_numpy(dtype=float)
            - 2.4
        )
        p = 1.0 / (1.0 + np.exp(-z))
        return np.column_stack([1.0 - p, p])


@pytest.fixture(scope="module")
def frame() -> pd.DataFrame:
    return synthetic_features(3000, seed=7)


@pytest.fixture(scope="module")
def schema(frame: pd.DataFrame) -> FeatureSchema:
    return FeatureSchema.fit(frame)


@pytest.fixture(scope="module")
def projector(frame: pd.DataFrame, schema: FeatureSchema) -> ConstraintProjector:
    return ConstraintProjector.fit(frame, schema)


@pytest.fixture(scope="module")
def results(frame, schema, projector):
    return attack_dataset(
        StubModel(),
        frame,
        schema,
        AttackConfig(threshold=0.5, max_attempts=30, seed=1),
        projector=projector,
    )


# --- the coupling rules are learned from data, not assumed --------------------------


def test_projector_learns_the_data_conventions(projector):
    assert projector.use_log1p is True
    assert projector.night_hours == frozenset({22, 23, 0, 1, 2, 3, 4, 5})
    assert projector.distance_scale == pytest.approx(1.0, abs=1e-6)


def test_merchant_bank_holds_only_observed_triples(frame, projector):
    observed = set(
        map(
            tuple,
            frame[["category_enc", "merch_lat", "merch_long"]]
            .round({"category_enc": 0, "merch_lat": 4, "merch_long": 4})
            .to_numpy(),
        )
    )
    bank = zip(projector.merchants.category, projector.merchants.lat, projector.merchants.long)
    assert all(triple in observed for triple in bank)


def test_derived_features_are_never_search_coordinates(projector):
    assert not (set(SEARCH_COORDS) & DERIVED)
    assert MERCHANT_COORD in projector.coords()


# --- projection 1: immutability -----------------------------------------------------


def test_repair_restores_frozen_features(frame, projector):
    origin = frame.iloc[0]
    tampered = pd.DataFrame([origin[list(FEATURES)].astype(float)])
    for col in FROZEN:
        tampered[col] = tampered[col] + 999.0

    repaired = projector.repair(tampered, origin)
    projector.assert_frozen(repaired, origin)
    for col in FROZEN:
        assert repaired[col].iloc[0] == pytest.approx(float(origin[col]))


def test_assert_frozen_actually_raises(frame, projector):
    origin = frame.iloc[0]
    bad = pd.DataFrame([origin[list(FEATURES)].astype(float)])
    bad["age"] = float(origin["age"]) + 1.0
    with pytest.raises(ConstraintViolation, match="FROZEN"):
        projector.assert_frozen(bad, origin)


def test_no_successful_attack_ever_moves_a_frozen_feature(results):
    for r in results:
        assert not (set(r.touched) & FROZEN)


# --- projection 2: the coupled group ------------------------------------------------


def test_merchant_switch_moves_the_whole_group(frame, projector):
    origin = frame.iloc[0]
    state = pd.DataFrame([origin[list(FEATURES)].astype(float)])
    switched = projector.repair(projector.switch_merchant(state, np.array([3])), origin)

    assert switched["category_enc"].iloc[0] == projector.merchants.category[3]
    assert switched["merch_lat"].iloc[0] == projector.merchants.lat[3]
    assert switched["merch_long"].iloc[0] == projector.merchants.long[3]
    # distance is recomputed from the victim's home, not carried over
    expected = haversine_km(
        np.array([float(origin["home_lat"])]),
        np.array([float(origin["home_long"])]),
        np.array([projector.merchants.lat[3]]),
        np.array([projector.merchants.long[3]]),
    )[0]
    assert switched["distance_km"].iloc[0] == pytest.approx(expected)
    projector.assert_coupled(switched)


def test_coupled_features_only_ever_move_together(results):
    """Either the whole merchant decision changed, or none of it did."""
    for r in results:
        moved = set(r.touched) & COUPLED
        if not moved:
            continue
        # category/lat/long are set jointly; distance follows. A group where only one of
        # the three identity columns moved would mean an invented merchant.
        assert {"category_enc", "merch_lat", "merch_long"} & moved
        assert "distance_km" in moved or moved == set()


def test_assert_coupled_rejects_an_invented_merchant(frame, projector):
    origin = frame.iloc[0]
    bad = pd.DataFrame([origin[list(FEATURES)].astype(float)])
    bad["merch_lat"] = 12.3456
    with pytest.raises(ConstraintViolation, match="does not exist"):
        projector.assert_coupled(bad)


def test_every_successful_evasion_uses_a_real_merchant(results, projector):
    frame = pd.DataFrame([r.adv_row for r in results if r.success])
    if len(frame):
        projector.assert_coupled(frame)


# --- projection 3: feasibility ------------------------------------------------------


def test_repair_keeps_internal_couplings_consistent(frame, projector):
    origin = frame.iloc[0]
    cand = pd.DataFrame([origin[list(FEATURES)].astype(float)] * 5).reset_index(drop=True)
    cand["amt"] = [1.0, 50.0, 500.0, 5_000.0, 50_000.0]
    cand["hour"] = [0.0, 6.0, 13.0, 21.0, 23.0]
    repaired = projector.repair(cand, origin)

    projector.assert_consistent(repaired)
    assert np.allclose(repaired["log_amt"], np.log1p(repaired["amt"]))
    assert np.all(
        repaired["is_night"].to_numpy()
        == np.isin(repaired["hour"].to_numpy().astype(int), list(projector.night_hours))
    )


def test_repair_clips_to_bounds(frame, projector, schema):
    origin = frame.iloc[0]
    cand = pd.DataFrame([origin[list(FEATURES)].astype(float)])
    cand["amt"] = 10_000_000.0
    cand["txn_count_1h"] = 999.0
    repaired = projector.repair(cand, origin)

    for col in ("amt", "txn_count_1h"):
        lo, hi = schema.bounds[col]
        assert repaired[col].iloc[0] <= hi + 1e-9
        assert repaired[col].iloc[0] >= lo - 1e-9


def test_integer_features_stay_integral(results):
    for r in results:
        if not r.adv_row:
            continue
        for col in ("hour", "day_of_week", "txn_count_1h", "txn_count_24h", "category_enc"):
            assert float(r.adv_row[col]) == pytest.approx(round(r.adv_row[col]))


def test_amt_range_intersects_the_ratio_bound(frame, projector):
    origin = frame.iloc[0]
    lo, hi = projector.amt_range(origin)
    card_mean = float(origin["amt"]) / float(origin["amt_ratio_to_card_mean"])
    rlo, rhi = projector.schema.bounds["amt_ratio_to_card_mean"]
    assert lo >= rlo * card_mean - 1e-6
    assert hi <= rhi * card_mean + 1e-6


# --- the contract guard -------------------------------------------------------------


def test_engine_entry_raises_on_feature_drift(frame, schema):
    from adversarial_payments.schema import SchemaViolation

    drifted = frame.assign(p1_new_feature=1.0)
    with pytest.raises(SchemaViolation):
        attack_dataset(StubModel(), drifted, schema, AttackConfig(max_attempts=1))

    with pytest.raises(SchemaViolation):
        attack_dataset(
            StubModel(), frame.drop(columns=["amt"]), schema, AttackConfig(max_attempts=1)
        )


def test_predict_proba_shape_is_enforced(frame, schema, projector):
    class BadModel:
        def predict_proba(self, X):
            return np.zeros(len(X))

    with pytest.raises(ValueError, match=r"\(n, 2\)"):
        attack_one(
            BadModel(),
            frame.iloc[0],
            projector,
            AttackConfig(),
            txn_id="t",
        )


# --- targeting and search behaviour -------------------------------------------------


def test_only_flagged_fraud_is_attacked(frame):
    cfg = AttackConfig(threshold=0.5, max_attempts=None)
    targets = select_targets(StubModel(), frame, cfg)
    assert (targets[TARGET] > 0.5).all()
    proba = StubModel().predict_proba(targets[list(FEATURES)])[:, 1]
    assert (proba >= cfg.threshold).all()


def test_attack_reduces_probability_below_threshold(results):
    for r in results:
        if r.success:
            assert r.adv_prob < 0.5 <= r.orig_prob
            assert r.l0 >= 1
        assert r.queries > 0


def test_budget_caps_the_touched_coordinates(frame, schema, projector):
    tight = attack_dataset(
        StubModel(),
        frame,
        schema,
        AttackConfig(threshold=0.5, budget=1, max_attempts=15, seed=3),
        projector=projector,
    )
    for r in tight:
        # One coordinate. The merchant group is one decision but four columns, and amt
        # drags its two derived companions, so L0 in *features* can exceed the budget.
        assert r.l0 <= 4


def test_summary_and_examples_match_the_results(results):
    summary = summarize_round(0, results)
    assert summary.n_attempts == len(results)
    assert summary.n_success == sum(r.success for r in results)
    assert summary.asr == pytest.approx(summary.n_success / summary.n_attempts)
    assert set(summary.per_feature_freq) <= set(FEATURES)

    examples = pick_examples(0, results)
    assert len(examples) <= 3
    for ex in examples:
        assert ex.adv_prob < ex.orig_prob
        assert ex.touched


def test_adversarial_frame_is_trainable(results):
    adv = adversarial_frame(results)
    if len(adv):
        assert list(adv.columns) == list(FEATURES) + [TARGET]
        assert (adv[TARGET] == 1).all()


# --- the unconstrained baseline -----------------------------------------------------


def test_unconstrained_baseline_produces_impossible_transactions(frame, schema, projector):
    """The comparison that justifies the constraint machinery.

    A naive attacker perturbing every column independently reports a higher ASR, and a
    measurable share of its 'evasions' are transactions that could never have occurred.
    """
    naive = attack_dataset(
        StubModel(),
        frame,
        schema,
        AttackConfig(threshold=0.5, max_attempts=30, unconstrained=True, seed=1),
        projector=projector,
    )
    audit = feasibility_audit(naive, projector)
    assert audit["n_success"] > 0
    assert audit["impossible_merchant"] + audit["forged_frozen"] > 0.0


def test_merchant_bank_rejects_a_frame_without_merchant_columns():
    with pytest.raises(ConstraintViolation, match="columns absent"):
        MerchantBank.fit(pd.DataFrame({"amt": [1.0]}))


# --- the economic floor: an evasion must stay worth committing -----------------------


def test_amt_range_never_drops_below_the_value_floor(frame, projector):
    """Feasibility is not only statistical. Shrinking the charge is not an evasion.

    The greedy search will always find that a tiny amount scores as legitimate, because
    it *is* legitimate. Without a floor on retained value the engine reports ASR = 1.0
    for the strategy "steal 12% as much", which no carding operation would run.
    """
    for i in range(25):
        origin = frame.iloc[i]
        lo, _ = projector.amt_range(origin)
        assert lo >= projector.value_floor * float(origin["amt"]) - 1e-6


def test_no_successful_attack_gives_away_the_value_it_was_stealing(results, projector):
    for r in results:
        if not r.success or "amt" not in r.touched:
            continue
        before, after = r.touched["amt"]
        assert after >= projector.value_floor * before - 1e-6


def test_value_floor_is_off_for_the_unconstrained_baseline(frame, projector):
    """The naive attacker keeps its unfair advantage -- that is what it is for.

    The floor is a claim about which attacks are worth running, so the baseline we
    compare against must not have it. Asserted on the projector rather than through a
    search, whose amount moves depend on the model's incentives rather than the rules.
    """
    naive = projector.permissive()
    assert naive.value_floor == projector.value_floor  # carried, but not applied

    floored = 0
    for i in range(25):
        origin = frame.iloc[i]
        lo, _ = naive.amt_range(origin)
        if lo >= projector.value_floor * float(origin["amt"]) - 1e-6:
            floored += 1
    assert floored < 25, "permissive projector is still applying the value floor"


# --- sparsity is counted in attacker decisions, not in columns -----------------------


def test_coords_are_search_coordinates_not_derived_columns(results):
    """``_greedy`` knows which coordinates it moved; the result must report those.

    Deriving coords from the changed columns instead credits the attacker with moving
    ``log_amt`` and ``amt_ratio_to_card_mean``, which are functions of ``amt`` and are
    not knobs anyone can turn.
    """
    legal = set(SEARCH_COORDS) | {MERCHANT_COORD}
    for r in results:
        if not r.success:
            continue
        assert set(r.coords) <= legal, f"coords leaked non-coordinates: {set(r.coords) - legal}"
        assert not (set(r.coords) & DERIVED)


def test_sparsity_tiebreak_counts_decisions_not_columns(results):
    """A merchant switch is 1 decision / 4 columns; an amount change is 1 / 3.

    Ranking restarts by column count makes the amount move look sparser than it is and
    biases every reported attack toward the amount lever.
    """
    successes = [r for r in results if r.success]
    assert successes
    for r in successes:
        assert len(r.coords) <= r.l0
    # The distinction must be real, not vacuously true because coords == touched.
    assert any(len(r.coords) < r.l0 for r in successes)
