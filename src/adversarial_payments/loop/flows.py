"""The unrolled red/blue loop -- spec section 4.5.

    train_detector(r) -> score_detector(r) -> generate_attacks(model_r) -> ASR_r
                                                       |
                             augment_trainset -> train_detector(r+1)

Two switches, both from ``config.py``, both there to de-risk the judged demo:

``RECOMPUTE=False``       read the committed artifacts and report them; train nothing.
                          This is the default, so the notebook and the dashboard cannot
                          fail on a judge's machine.
``RUN_ORCHESTRATED=False`` execute the *identical* task functions as a plain Python
                          loop. Prefect wraps the same callables when it is True, so
                          the two paths cannot drift apart -- and section 6a made the
                          plain loop the notebook default after Prefect turned out to
                          bind a local port.

    python -m adversarial_payments.loop.flows --recompute
"""

from __future__ import annotations

import argparse
import sys
from typing import Any, Callable, Sequence

import numpy as np
import pandas as pd

from .. import artifacts as A
from .. import scorecard as SC
from ..artifacts import DetectRound, FeasibilityAudit, ShapFeature
from ..config import SETTINGS, ensure_dirs
from ..schema import FEATURES, TARGET, FeatureSchema
from ..attack.constraints import ConstraintProjector
from ..attack.engine import AttackConfig, adversarial_frame, attack_dataset
from ..attack.metrics import feasibility_audit, pick_examples, summarize_round
from .state import LoopState

# ----------------------------------------------------------------------------------
# adapters: P1's modules when they exist, self-contained fallbacks until they do
# ----------------------------------------------------------------------------------


def load_frame(sample_rows: int | None = None) -> tuple[pd.DataFrame, bool]:
    """Return ``(features + is_fraud, is_real_data)``.

    The bool is load-bearing: a run on the synthetic fallback writes every artifact with
    ``placeholder=True``, which is what keeps a fabricated ASR off a judge's screen.
    """
    real = True
    try:
        from ..data.load import load_features  # type: ignore[attr-defined]

        df = load_features()
    except Exception:  # noqa: BLE001 -- P1's loader is simply not on disk yet
        from .fallback import synthetic_features

        df = synthetic_features(sample_rows or 40_000)
        real = False

    if sample_rows is not None and len(df) > sample_rows and real:
        df = df.sample(sample_rows, random_state=SETTINGS.seed).reset_index(drop=True)
    return df, real


def fit_detector(train_df: pd.DataFrame, *, seed: int) -> Any:
    """Train the detector every published round in ``detect/rounds.json`` came from.

    This used to open with ``try: from ..detect.train import train_model``, falling through
    to the configuration below on any failure. ``train_model`` does not exist -- that module
    exports ``train_round`` -- so the import raised on every call and the fallback ran every
    time, while the code read as though a different trainer were preferred.

    Nothing was broken by it and no number is wrong because of it. What was wrong is that
    the source could not tell you which model produced the results: a reader would have
    concluded the published rounds came from ``detect/train.py`` at n_estimators=400,
    max_depth=7, lr=0.08, and they came from the values below instead.

    ``detect/train.py`` is still the trainer ``scripts/run_detect_round0.py`` uses, on a
    temporal split. The two configurations coexist deliberately; what is removed here is the
    silent try/except that made it impossible to say which one ran.
    """
    from xgboost import XGBClassifier

    y = train_df[TARGET].to_numpy()
    pos = max(int(y.sum()), 1)
    model = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        scale_pos_weight=float((len(y) - pos) / pos),
        tree_method="hist",
        eval_metric="aucpr",
        random_state=seed,
        n_jobs=4,
    )
    model.fit(train_df[list(FEATURES)], y)
    return model


def _top_shap(model: Any, frame: pd.DataFrame, k: int = 5) -> list[ShapFeature]:
    """Mean |SHAP| over a sample, or an empty list rather than a mislabelled proxy."""
    try:
        import shap  # type: ignore

        sample = frame[list(FEATURES)].sample(min(len(frame), 2000), random_state=0)
        values = shap.TreeExplainer(model).shap_values(sample)
        values = np.asarray(values)
        if values.ndim == 3:
            values = values[..., -1]
        mean_abs = np.abs(values).mean(axis=0)
        order = np.argsort(mean_abs)[::-1][:k]
        return [ShapFeature(FEATURES[i], float(round(mean_abs[i], 5))) for i in order]
    except Exception:  # noqa: BLE001 -- SHAP is P1's deliverable, not a loop dependency
        return []


# ----------------------------------------------------------------------------------
# tasks -- plain functions; Prefect wraps these exact callables when orchestrated
# ----------------------------------------------------------------------------------


def task_split(df: pd.DataFrame, *, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Stratified 70/30 split. The attack and the PR-AUC both run on the held-out half."""
    rng = np.random.default_rng(seed)
    idx = np.arange(len(df))
    y = df[TARGET].to_numpy()
    test_mask = np.zeros(len(df), dtype=bool)
    for label in (0, 1):
        rows = idx[y == label]
        take = rng.choice(rows, size=max(int(0.3 * len(rows)), 1), replace=False)
        test_mask[take] = True
    return df[~test_mask].reset_index(drop=True), df[test_mask].reset_index(drop=True)


def task_train_detector(train_df: pd.DataFrame, round_index: int, *, seed: int) -> Any:
    return fit_detector(train_df, seed=seed + round_index)


def task_score_detector(
    model: Any,
    test_df: pd.DataFrame,
    round_index: int,
    *,
    val_df: pd.DataFrame,
    n_train: int,
    n_adversarial_added: int,
) -> DetectRound:
    """PR-AUC, ROC-AUC and the operating threshold P1's policy defines.

    The threshold is ``detect.evaluate.choose_threshold`` -- the lowest cut whose
    false-positive rate stays inside ``FPR_BUDGET`` -- fitted on ``val_df``. Two
    properties follow, and both are load-bearing for the ASR being meaningful:

    * The operating point never sees the rows the attack is scored over.
    * Every round is compared at the *same false-positive cost*, so a fall in ASR
      is the detector improving rather than the defender quietly widening the net.

    An earlier version maximised F1 on ``test_df``. That lifted the threshold to
    ~0.94 against a budget cut near 0.23, which made evasion nearly free and pinned
    ASR at 1.000 for every round.
    """
    from ..detect.evaluate import choose_threshold, metrics_at_threshold

    y = test_df[TARGET].to_numpy()
    proba = np.asarray(model.predict_proba(test_df[list(FEATURES)]))[:, 1]

    val_proba = np.asarray(model.predict_proba(val_df[list(FEATURES)]))[:, 1]
    threshold = choose_threshold(val_df[TARGET].to_numpy(), val_proba)

    ev = metrics_at_threshold(y, proba, threshold)

    return DetectRound(
        round=round_index,
        pr_auc=float(round(ev.pr_auc, 5)),
        roc_auc=float(round(ev.roc_auc, 5)),
        threshold=float(round(ev.threshold, 5)),
        precision=float(round(ev.precision, 5)),
        recall=float(round(ev.recall, 5)),
        n_train=int(n_train),
        n_adversarial_added=int(n_adversarial_added),
        top_shap=_top_shap(model, test_df),
    )


def task_generate_attacks(
    model: Any,
    test_df: pd.DataFrame,
    schema: FeatureSchema,
    projector: ConstraintProjector,
    cfg: AttackConfig,
) -> list:
    return attack_dataset(model, test_df, schema, cfg, projector=projector)


def task_augment(
    train_df: pd.DataFrame, results: Sequence[Any], *, max_add: int | None = None
) -> tuple[pd.DataFrame, int]:
    """Fold successful evasions back into the trainset, labelled as the fraud they are."""
    adv = adversarial_frame(results)
    if max_add is not None and len(adv) > max_add:
        adv = adv.sample(max_add, random_state=SETTINGS.seed)
    if adv.empty:
        return train_df, 0
    return pd.concat([train_df, adv], ignore_index=True), len(adv)


_TASKS: tuple[Callable[..., Any], ...] = (
    task_split,
    task_train_detector,
    task_score_detector,
    task_generate_attacks,
    task_augment,
)


# ----------------------------------------------------------------------------------
# the loop
# ----------------------------------------------------------------------------------


def _orchestrate(orchestrated: bool) -> dict[str, Callable[..., Any]]:
    """Return the task callables, optionally wrapped as Prefect tasks.

    Same functions either way. That is the point: ``RUN_ORCHESTRATED=False`` is not a
    reimplementation that can drift, it is the absence of a decorator.
    """
    if not orchestrated:
        return {fn.__name__: fn for fn in _TASKS}
    from prefect import task

    return {fn.__name__: task(name=fn.__name__)(fn) for fn in _TASKS}


def run_loop(
    *,
    n_rounds: int | None = None,
    orchestrated: bool | None = None,
    cfg: AttackConfig | None = None,
    sample_rows: int | None = None,
    baseline: bool = True,
    verbose: bool = True,
) -> tuple[LoopState, bool]:
    """Run rounds r = 0..n-1 and return ``(state, is_real_data)``."""
    n_rounds = n_rounds or SETTINGS.n_rounds
    orchestrated = SETTINGS.run_orchestrated if orchestrated is None else orchestrated
    cfg = cfg or AttackConfig()
    t = _orchestrate(orchestrated)

    state = LoopState(n_rounds=n_rounds)
    ensure_dirs()

    def log(msg: str) -> None:
        if verbose:
            print(msg, flush=True)

    state.started("load_data")
    df, real = load_frame(sample_rows if sample_rows is not None else SETTINGS.sample_rows)
    state.finished("load_data")
    state.finished("features")
    log(f"[loop] {len(df):,} transactions, {int(df[TARGET].sum()):,} fraud "
        f"({'real' if real else 'SYNTHETIC FALLBACK'})")

    train_df, test_df = t["task_split"](df, seed=SETTINGS.seed)
    # The operating threshold is fitted on this slice, never on the rows the attack
    # is scored over. Carved once, before the loop: adversarial examples are appended
    # to train every round, and a validation slice that grew with them would move the
    # operating point for a reason that has nothing to do with the detector.
    train_df, val_df = t["task_split"](train_df, seed=SETTINGS.seed)
    log(f"[loop] split: train={len(train_df):,} val={len(val_df):,} test={len(test_df):,} "
        f"(threshold fitted on val, attack scored on test)")

    state.started("schema")
    schema = FeatureSchema.fit(train_df)
    schema.validate(df, require_target=True)
    # Bank fitted on the full frame: whether a merchant exists is a fact about the
    # payment network, not about which split a transaction landed in.
    projector = ConstraintProjector.fit(df, schema)
    state.finished("schema")
    log(f"[loop] merchant bank: {len(projector.merchants)} distinct merchants; "
        f"night hours={sorted(projector.night_hours)}; distance scale={projector.distance_scale:.3f}")

    n_added = 0
    for r in range(n_rounds):
        state.started("train", r)
        model = t["task_train_detector"](train_df, r, seed=SETTINGS.seed)
        state.finished("train", r)

        state.started("score", r)
        det = t["task_score_detector"](
            model,
            test_df,
            r,
            val_df=val_df,
            n_train=len(train_df),
            n_adversarial_added=n_added,
        )
        state.add_detect(det)
        state.finished("score", r)
        log(f"[r{r}] PR-AUC={det.pr_auc:.4f} ROC-AUC={det.roc_auc:.4f} "
            f"thr={det.threshold:.4f} P={det.precision:.3f} R={det.recall:.3f} "
            f"n_train={det.n_train:,} (+{det.n_adversarial_added:,} adversarial)")

        round_cfg = AttackConfig(
            threshold=det.threshold,
            budget=cfg.budget,
            restarts=cfg.restarts,
            grid=cfg.grid,
            merchant_samples=cfg.merchant_samples,
            max_queries=cfg.max_queries,
            max_attempts=cfg.max_attempts,
            seed=cfg.seed,
        )

        state.started("attack", r)
        results = t["task_generate_attacks"](model, test_df, schema, projector, round_cfg)
        state.finished("attack", r)

        state.started("asr", r)
        atk = summarize_round(r, results)
        state.add_attack(atk, pick_examples(r, results))
        state.finished("asr", r)
        log(f"[r{r}] ASR={atk.asr:.3f} ({atk.n_success}/{atk.n_attempts}) "
            f"L0={atk.mean_l0:.2f} L2={atk.mean_l2:.3f} med_queries={atk.median_queries}")

        if baseline and r == 0:
            # The comparison that justifies the whole constraint machinery.
            naive = attack_dataset(
                model,
                test_df,
                schema,
                AttackConfig(
                    threshold=det.threshold,
                    budget=round_cfg.budget,
                    restarts=round_cfg.restarts,
                    max_attempts=round_cfg.max_attempts,
                    unconstrained=True,
                    seed=cfg.seed,
                ),
                projector=projector,
            )
            naive_round = summarize_round(0, naive)
            audit = feasibility_audit(naive, projector)
            state.notes["unconstrained_baseline"] = {
                "asr": naive_round.asr,
                "mean_l0": naive_round.mean_l0,
                "impossible_merchant_share": audit["impossible_merchant"],
                "forged_frozen_share": audit["forged_frozen"],
            }
            log(f"[r0] unconstrained baseline ASR={naive_round.asr:.3f} -- of its successes, "
                f"{audit['impossible_merchant']:.1%} use a merchant that does not exist and "
                f"{audit['forged_frozen']:.1%} forged a FROZEN victim attribute")

        if r < n_rounds - 1:
            state.started("augment", r)
            train_df, n_added = t["task_augment"](train_df, results)
            state.finished("augment", r)
            log(f"[r{r}] augmented trainset with {n_added:,} successful evasions")

    state.finished("scorecard")
    return state, real


def write_artifacts(state: LoopState, *, real: bool, write_detect: bool = False) -> None:
    """Emit the artifacts P2 owns. ``placeholder`` tracks whether the data was real."""
    placeholder = not real
    agentic_real = False
    try:
        agentic_real = not A.read("agentic_redteam").get("placeholder", True)
    except (FileNotFoundError, ValueError):
        agentic_real = False

    A.write("attack_rounds", state.attack_rounds, placeholder=placeholder)
    A.write("attack_examples", state.examples, placeholder=placeholder)
    A.write(
        "graph",
        state.graph(agentic_status="done" if agentic_real else "pending"),
        placeholder=placeholder,
    )
    # The audit only exists when the r0 unconstrained baseline was run. Writing a
    # zeroed one when it was skipped would be inventing the very number this artifact
    # exists to keep honest, so it is simply absent instead.
    baseline = state.notes.get("unconstrained_baseline")
    if baseline and state.attack_rounds:
        r0 = state.attack_rounds[0]
        A.write(
            "feasibility_audit",
            FeasibilityAudit(
                constrained_asr=float(r0.asr),
                unconstrained_asr=float(baseline["asr"]),
                impossible_merchant_share=float(baseline["impossible_merchant_share"]),
                forged_frozen_share=float(baseline["forged_frozen_share"]),
                constrained_mean_l0=float(r0.mean_l0),
                unconstrained_mean_l0=float(baseline["mean_l0"]),
            ),
            placeholder=placeholder,
        )

    rows, notes = SC.write(
        state.attack_rounds, state.detect_rounds, placeholder=placeholder
    )
    for note in notes:
        print(f"[scorecard] GAP: {note}", flush=True)
    print(f"[scorecard] {len(rows)} row(s) written", flush=True)

    if write_detect:
        # Off by default: artifacts/detect/rounds.json is P1's file.
        A.write("detect_rounds", state.detect_rounds, placeholder=placeholder)


def report_existing() -> int:
    """RECOMPUTE=False: read what is committed and say what it is. Train nothing."""
    try:
        atk = A.read("attack_rounds")
        graph = A.read("graph")
    except (FileNotFoundError, ValueError) as exc:
        print(f"cannot read committed artifacts: {exc}", file=sys.stderr)
        return 1

    flag = "PLACEHOLDER" if atk.get("placeholder", True) else "real"
    print(f"RECOMPUTE=False -- reading committed artifacts ({flag})")
    for row in atk.get("payload", []):
        print(
            f"  round {row['round']}: ASR={row['asr']:.3f} "
            f"({row['n_success']}/{row['n_attempts']}) mean_l0={row['mean_l0']:.2f} "
            f"median_queries={row['median_queries']}"
        )
    payload = graph.get("payload", {})
    unroll = sum(1 for e in payload.get("edges", []) if e.get("kind") == "unroll")
    print(f"  graph: {len(payload.get('nodes', []))} nodes, "
          f"{len(payload.get('edges', []))} edges ({unroll} unroll)")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="adversarial_payments.loop.flows")
    parser.add_argument("--recompute", action="store_true", default=SETTINGS.recompute)
    parser.add_argument("--orchestrated", action="store_true", default=SETTINGS.run_orchestrated)
    parser.add_argument("--rounds", type=int, default=SETTINGS.n_rounds)
    parser.add_argument("--attempts", type=int, default=AttackConfig.max_attempts)
    parser.add_argument("--budget", type=int, default=AttackConfig.budget)
    parser.add_argument("--restarts", type=int, default=AttackConfig.restarts)
    parser.add_argument("--rows", type=int, default=None)
    parser.add_argument("--no-baseline", action="store_true")
    parser.add_argument("--write-detect", action="store_true")
    args = parser.parse_args(argv)

    if not args.recompute:
        return report_existing()

    cfg = AttackConfig(
        budget=args.budget, restarts=args.restarts, max_attempts=args.attempts
    )
    runner = run_loop
    if args.orchestrated:
        from prefect import flow

        runner = flow(name="adversarial-payments-unrolled-loop")(run_loop)

    state, real = runner(
        n_rounds=args.rounds,
        orchestrated=args.orchestrated,
        cfg=cfg,
        sample_rows=args.rows,
        baseline=not args.no_baseline,
    )
    write_artifacts(state, real=real, write_detect=args.write_detect)

    print("\n=== headline ===")
    for r in state.attack_rounds:
        pr = next((d.pr_auc for d in state.detect_rounds if d.round == r.round), float("nan"))
        print(f"  r{r.round}: ASR={r.asr:.3f}  PR-AUC={pr:.4f}  mean_l0={r.mean_l0:.2f}")
    if not real:
        print("  (SYNTHETIC FALLBACK data -- artifacts written with placeholder=True)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
