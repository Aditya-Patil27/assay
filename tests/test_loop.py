"""The unrolled loop, its graph, and the scorecard.

The graph tests matter more than they look: spec section 4.5 promises the visualisation
survives Prefect being deleted, and the only way that is true is if the nodes and edges
come out of ``LoopState`` rather than out of an orchestrator's introspection.
"""

from __future__ import annotations

import json

import pytest

from adversarial_payments import artifacts as A
from adversarial_payments import scorecard as SC
from adversarial_payments.artifacts import AttackRound, DetectRound
from adversarial_payments.attack.engine import AttackConfig
from adversarial_payments.loop import flows
from adversarial_payments.loop.state import LoopState, node_id


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    """Redirect every artifact path into tmp so tests never touch committed results."""
    paths = {kind: tmp_path / f"{kind}.json" for kind in A._PATHS}
    monkeypatch.setattr(A, "_PATHS", paths)
    return tmp_path


# --- the graph ----------------------------------------------------------------------


def test_graph_has_a_node_per_stage_per_round():
    graph = LoopState(n_rounds=3).graph()
    ids = {n.id for n in graph.nodes}
    for r in range(3):
        for stage in ("train", "score", "attack", "asr"):
            assert node_id(stage, r) in ids
    # the last round has nothing to augment into
    assert node_id("augment", 2) not in ids
    assert node_id("augment", 1) in ids


def test_feedback_edges_are_marked_unroll():
    graph = LoopState(n_rounds=3).graph()
    unroll = [e for e in graph.edges if e.kind == "unroll"]
    assert {(e.source, e.target) for e in unroll} == {
        ("augment_0", "train_1"),
        ("augment_1", "train_2"),
    }


def test_every_edge_points_at_a_real_node():
    graph = LoopState(n_rounds=3).graph()
    ids = {n.id for n in graph.nodes}
    for edge in graph.edges:
        assert edge.source in ids, edge
        assert edge.target in ids, edge


def test_node_status_reflects_progress():
    state = LoopState(n_rounds=2)
    state.started("train", 0)
    assert {n.status for n in state.graph().nodes if n.id == "train_0"} == {"running"}
    state.finished("train", 0)
    assert {n.status for n in state.graph().nodes if n.id == "train_0"} == {"done"}
    assert {n.status for n in state.graph().nodes if n.id == "attack_1"} == {"pending"}


def test_graph_serialises_to_the_contracted_shape(sandbox):
    path = A.write("graph", LoopState(n_rounds=3).graph(), placeholder=True)
    payload = json.loads(path.read_text(encoding="utf-8"))["payload"]
    assert set(payload) == {"nodes", "edges"}
    assert {"id", "label", "stage", "round", "status", "track"} == set(payload["nodes"][0])
    assert {"source", "target", "kind"} == set(payload["edges"][0])


def test_state_as_dict_carries_the_headline_series():
    state = LoopState(n_rounds=2)
    state.add_detect(DetectRound(0, 0.8, 0.9, 0.5, 0.7, 0.6, 100, 0, []))
    state.add_attack(AttackRound(0, 0.6, 10, 6, 2.0, 0.5, 30, {"amt": 6}))
    payload = state.as_dict()
    assert payload["asr_by_round"] == {0: 0.6}
    assert payload["pr_auc_by_round"] == {0: 0.8}


# --- orchestration switch -----------------------------------------------------------


def test_plain_loop_uses_the_identical_task_callables():
    plain = flows._orchestrate(False)
    assert plain["task_train_detector"] is flows.task_train_detector
    assert set(plain) == {fn.__name__ for fn in flows._TASKS}


def test_orchestrated_wraps_the_same_functions():
    prefect = pytest.importorskip("prefect")
    wrapped = flows._orchestrate(True)
    assert isinstance(wrapped["task_train_detector"], prefect.tasks.Task)
    assert wrapped["task_train_detector"].fn is flows.task_train_detector


# --- end to end ---------------------------------------------------------------------


@pytest.fixture(scope="module")
def run():
    return flows.run_loop(
        n_rounds=2,
        orchestrated=False,
        cfg=AttackConfig(max_attempts=8, restarts=2, budget=3, merchant_samples=8),
        sample_rows=3000,
        baseline=False,
        verbose=False,
    )


def test_loop_completes_and_produces_every_round(run):
    state, _ = run
    assert [r.round for r in state.attack_rounds] == [0, 1]
    assert [d.round for d in state.detect_rounds] == [0, 1]
    for r in state.attack_rounds:
        assert 0.0 <= r.asr <= 1.0
        assert r.n_attempts > 0


def test_round_one_trains_on_round_zeros_evasions(run):
    state, _ = run
    assert state.detect_rounds[1].n_train >= state.detect_rounds[0].n_train
    if state.attack_rounds[0].n_success:
        assert state.detect_rounds[1].n_adversarial_added > 0


def test_attack_threshold_tracks_the_detectors_operating_point(run):
    state, _ = run
    assert all(0.0 <= d.threshold <= 1.0 for d in state.detect_rounds)


def test_synthetic_fallback_is_flagged_placeholder(run, sandbox):
    state, real = run
    flows.write_artifacts(state, real=real)
    written = json.loads((sandbox / "attack_rounds.json").read_text(encoding="utf-8"))
    assert written["placeholder"] is (not real)
    assert len(written["payload"]) == 2


def test_report_existing_reads_without_training(run, sandbox, capsys):
    state, real = run
    flows.write_artifacts(state, real=real)
    assert flows.report_existing() == 0
    out = capsys.readouterr().out
    assert "ASR=" in out and "unroll" in out


def test_report_existing_fails_loudly_when_artifacts_are_missing(sandbox):
    assert flows.report_existing() == 1


# --- scorecard ----------------------------------------------------------------------


def test_scorecard_row_prices_the_defense_in_pr_auc():
    attack = [
        AttackRound(0, 0.70, 100, 70, 2.0, 0.5, 30, {}),
        AttackRound(2, 0.12, 100, 12, 4.5, 1.9, 250, {}),
    ]
    detect = [
        DetectRound(0, 0.840, 0.98, 0.5, 0.8, 0.7, 100, 0, []),
        DetectRound(2, 0.820, 0.97, 0.5, 0.8, 0.7, 120, 20, []),
    ]
    row = SC.tabular_row(attack, detect)
    assert row.attack_success_before == 0.70
    assert row.attack_success_after == 0.12
    assert "0.840 -> 0.820" in row.defense_cost


def test_scorecard_reports_the_missing_agentic_row_instead_of_inventing_one(sandbox):
    rows, notes = SC.build(
        [AttackRound(0, 0.5, 10, 5, 1.0, 0.1, 10, {})],
        [DetectRound(0, 0.8, 0.9, 0.5, 0.7, 0.6, 10, 0, [])],
    )
    assert [r.surface for r in rows] == [SC.TABULAR_SURFACE]
    assert notes and "agentic" in notes[0]


def test_scorecard_ignores_a_placeholder_agentic_artifact(sandbox):
    A.write("agentic_redteam", [], placeholder=True)
    assert SC.agentic_row_from_artifact() is None


def test_scorecard_merges_a_real_agentic_artifact(sandbox):
    from adversarial_payments.artifacts import AgenticCategory

    A.write(
        "agentic_redteam",
        [AgenticCategory("memo", "LLM01", 100, 40, 8, "x")],
        placeholder=False,
    )
    rows, notes = SC.build(
        [AttackRound(0, 0.5, 10, 5, 1.0, 0.1, 10, {})],
        [DetectRound(0, 0.8, 0.9, 0.5, 0.7, 0.6, 10, 0, [])],
    )
    assert [r.surface for r in rows] == [SC.TABULAR_SURFACE, SC.AGENTIC_SURFACE]
    assert rows[1].attack_success_before == 0.4
    assert rows[1].attack_success_after == 0.08
    assert not notes


# --- the operating threshold --------------------------------------------------------


def test_operating_threshold_spends_the_fpr_budget_on_validation_data():
    """The threshold follows the policy ``detect/evaluate.py`` documents.

    That policy is the lowest threshold whose false-positive rate stays within
    ``FPR_BUDGET``, fitted on validation. Maximising F1 on the *test* split instead
    does two wrong things at once: it contradicts the stated policy, and it fits the
    operating point on the very rows the attack is scored over -- which lifts the
    threshold far above the budget cut and hands the attacker a nearly free evasion.
    """
    from adversarial_payments.config import SEED
    from adversarial_payments.detect.evaluate import FPR_BUDGET
    from adversarial_payments.loop.fallback import synthetic_features
    from adversarial_payments.schema import FEATURES, TARGET

    df = synthetic_features(8000)
    train, holdout = flows.task_split(df, seed=SEED)
    val, test = flows.task_split(holdout, seed=SEED)
    model = flows.fit_detector(train, seed=SEED)

    det = flows.task_score_detector(
        model, test, 0, val_df=val, n_train=len(train), n_adversarial_added=0
    )

    val_scores = model.predict_proba(val[list(FEATURES)])[:, 1]
    negatives = val_scores[val[TARGET].to_numpy() == 0]
    realised_fpr = float((negatives >= det.threshold).mean())

    assert realised_fpr <= FPR_BUDGET * 1.5, (
        f"threshold {det.threshold:.4f} exceeds the false-positive budget "
        f"({realised_fpr:.5f} > {FPR_BUDGET})"
    )
    assert realised_fpr >= FPR_BUDGET * 0.4, (
        f"threshold {det.threshold:.4f} leaves recall unclaimed: it declines only "
        f"{realised_fpr:.5f} of negatives against a budget of {FPR_BUDGET}"
    )


# --- the feasibility audit ----------------------------------------------------------


def test_write_artifacts_publishes_the_feasibility_audit(sandbox):
    """The audit that justifies the constraints must survive the process that computed it.

    ``feasibility_audit`` answers the one question an unconstrained ASR cannot: what
    share of those "evasions" describe a transaction that could physically occur? It was
    computed every run, logged to stdout and left in ``LoopState.notes`` -- which means it
    died with the process and could never reach the dashboard or the writeup.
    """
    from adversarial_payments.artifacts import AttackRound, DetectRound

    state = LoopState(n_rounds=1)
    state.add_attack(
        AttackRound(
            round=0, asr=1.0, n_attempts=10, n_success=10, mean_l0=3.8,
            mean_l2=3.4, median_queries=277, per_feature_freq={"amt": 10},
        ),
        [],
    )
    state.add_detect(
        DetectRound(
            round=0, pr_auc=0.9, roc_auc=0.99, threshold=0.44, precision=0.77,
            recall=0.85, n_train=100, n_adversarial_added=0, top_shap=[],
        )
    )
    state.notes["unconstrained_baseline"] = {
        "asr": 1.0,
        "mean_l0": 5.2,
        "impossible_merchant_share": 0.995,
        "forged_frozen_share": 0.03,
    }

    flows.write_artifacts(state, real=True)

    audit = A.read("feasibility_audit")
    assert audit["placeholder"] is False
    payload = audit["payload"]
    assert payload["impossible_merchant_share"] == pytest.approx(0.995)
    assert payload["forged_frozen_share"] == pytest.approx(0.03)
    assert payload["unconstrained_asr"] == pytest.approx(1.0)
    assert payload["constrained_asr"] == pytest.approx(1.0)


def test_a_single_detector_round_reports_no_delta_rather_than_zero_cost():
    """One round cannot express a change, and "+0.0%" reads as "the defence was free".

    Same class of error as plotting an absent round as zero: a missing measurement rendered
    as a confident value. The scorecard is the one table a judge reads, so it has to say
    "not measured" where that is what it means.
    """
    from adversarial_payments import scorecard as SC
    from adversarial_payments.artifacts import AttackRound, DetectRound

    atk = [
        AttackRound(
            round=0, asr=1.0, n_attempts=400, n_success=400, mean_l0=3.8,
            mean_l2=3.4, median_queries=277, per_feature_freq={},
        )
    ]
    one = [
        DetectRound(
            round=0, pr_auc=0.829, roc_auc=0.978, threshold=0.23, precision=0.72,
            recall=0.80, n_train=96000, n_adversarial_added=0, top_shap=[],
        )
    ]

    row = SC.build(atk, one)[0][0]
    assert "+0.0%" not in row.defense_cost
    assert "not measured" in row.defense_cost.lower()
