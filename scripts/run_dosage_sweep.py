"""Does adversarial retraining ever beat this attacker, and what does it cost?

The headline tabular result is ASR = 1.000 at every round: three rounds of adversarial
retraining prevented no evasions at all. The explanation offered in the writeup is that the
dosage was tiny -- 400 adversarial rows folded unweighted into 196,001 -- but that is a
hypothesis, and an untested hypothesis in place of a result is exactly what this project
spends its methodology section arguing against.

This sweeps the dosage and measures the answer. For each weight ``w`` the loop runs
normally, except that adversarial rows enter the next round's training set carrying
``sample_weight = w``. Weighting rather than duplicating is deliberate: duplicating to a 50x
dosage would need 50x the attack budget to generate the rows, where weighting asks the same
question for the cost of one attack pass.

Three outcomes are all publishable, which is why it is worth running:

* ASR falls at some dosage -- we can state the dosage at which the defence starts working
  and what it costs in PR-AUC. That is the co-evolution result the project set out to find.
* ASR never falls -- then "the dosage was too small" is refuted by our own experiment, and
  the honest claim becomes that this defence does not work against this attacker at any
  dosage we can afford.
* ASR falls only where PR-AUC collapses -- the defence is real but not worth buying, which
  is a defence-in-depth economics finding rather than a failure.

Self-contained by design. It imports the attack engine and the constraint projector but
changes nothing in ``attack/`` or ``loop/``, so the baseline result stands whether or not
this lands -- the same containment rule the orchestration package follows.

    python scripts/run_dosage_sweep.py --rows 400000 --weights 1 10 50 200 --attempts 400

On Kaggle, point the loader at the mounted dataset instead of the network:

    SPARKOV_CSV_DIR=/kaggle/input/fraud-detection python scripts/run_dosage_sweep.py ...
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from adversarial_payments.attack.constraints import ConstraintProjector  # noqa: E402
from adversarial_payments.attack.engine import (  # noqa: E402
    AttackConfig,
    adversarial_frame,
    attack_dataset,
)
from adversarial_payments.attack.metrics import summarize_round  # noqa: E402
from adversarial_payments.config import ARTIFACTS, SEED  # noqa: E402
from adversarial_payments.detect.evaluate import (  # noqa: E402
    FPR_BUDGET,
    choose_threshold,
    metrics_at_threshold,
)
from adversarial_payments.schema import FEATURES, TARGET, FeatureSchema  # noqa: E402
from _sweep_common import fit_detector, scores, split_stratified  # noqa: E402

OUT_PATH = ARTIFACTS / "attack" / "dosage_sweep.json"


@dataclass
class RoundResult:
    round: int
    asr: float
    n_attempts: int
    n_success: int
    mean_l0: float
    median_queries: int
    pr_auc: float
    roc_auc: float
    threshold: float
    precision: float
    recall: float
    n_train: int
    n_adversarial: int
    adversarial_weight: float


@dataclass
class SweepArm:
    weight: float
    rounds: list[RoundResult] = field(default_factory=list)
    seconds: float = 0.0


def run_arm(
    weight: float,
    train0: pd.DataFrame,
    val: pd.DataFrame,
    test: pd.DataFrame,
    schema: FeatureSchema,
    projector: ConstraintProjector,
    cfg: AttackConfig,
    n_rounds: int,
    seed: int,
) -> SweepArm:
    """One dosage, run for ``n_rounds``. Round 0 is identical across arms by construction."""
    arm = SweepArm(weight=weight)
    started = time.time()

    train = train0.copy()
    weights = np.ones(len(train), dtype=float)
    n_adv = 0

    for r in range(n_rounds):
        model = fit_detector(train, seed=SEED, weights=weights if weight != 1.0 else None)

        val_scores = np.asarray(model.predict_proba(val[list(FEATURES)]))[:, 1]
        threshold = choose_threshold(val[TARGET].to_numpy(), val_scores, FPR_BUDGET)
        test_scores = np.asarray(model.predict_proba(test[list(FEATURES)]))[:, 1]
        ev = metrics_at_threshold(test[TARGET].to_numpy(), test_scores, threshold)

        results = attack_dataset(
            model,
            test,
            schema,
            AttackConfig(
                threshold=threshold,
                budget=cfg.budget,
                restarts=cfg.restarts,
                grid=cfg.grid,
                merchant_samples=cfg.merchant_samples,
                max_queries=cfg.max_queries,
                max_attempts=cfg.max_attempts,
                seed=cfg.seed,
            ),
            projector=projector,
        )
        atk = summarize_round(r, results)

        arm.rounds.append(
            RoundResult(
                round=r,
                asr=round(atk.asr, 5),
                n_attempts=atk.n_attempts,
                n_success=atk.n_success,
                mean_l0=round(atk.mean_l0, 4),
                median_queries=atk.median_queries,
                pr_auc=round(float(ev.pr_auc), 5),
                roc_auc=round(float(ev.roc_auc), 5),
                threshold=round(float(threshold), 5),
                precision=round(float(ev.precision), 5),
                recall=round(float(ev.recall), 5),
                n_train=len(train),
                n_adversarial=n_adv,
                adversarial_weight=weight,
            )
        )
        print(
            f"  [w={weight:>5g} r{r}] ASR={atk.asr:.3f} PR-AUC={ev.pr_auc:.4f} "
            f"thr={threshold:.4f} recall={ev.recall:.3f} n_train={len(train):,} "
            f"(+{n_adv:,} adv @ w={weight:g}, "
            f"{n_adv * weight / max(len(train) - n_adv, 1):.1%} of training mass)",
            flush=True,
        )

        if r < n_rounds - 1:
            adv = adversarial_frame(results)
            if not adv.empty:
                train = pd.concat([train, adv], ignore_index=True)
                weights = np.concatenate(
                    [weights, np.full(len(adv), float(weight), dtype=float)]
                )
                n_adv += len(adv)

    arm.seconds = round(time.time() - started, 1)
    return arm


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="run_dosage_sweep")
    ap.add_argument(
        "--rows", type=int, default=400_000,
        help="0 uses the full dataset",
    )
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--attempts", type=int, default=400)
    ap.add_argument("--budget", type=int, default=4)
    ap.add_argument("--restarts", type=int, default=3)
    ap.add_argument(
        "--weights", type=float, nargs="+",
        default=[1.0, 10.0, 50.0, 200.0, 1000.0, 5000.0],
        help=(
            "sample_weight applied to adversarial rows in the next round's trainset. "
            "The range is deliberately wide enough to bracket the transition: at w=1 the "
            "adversarial rows are 0.2%% of the training mass and demonstrably do nothing, "
            "while at w=5000 they outweigh the entire legitimate trainset and must do "
            "something -- if only destroy PR-AUC. A sweep that does not contain the "
            "crossover cannot tell you where it is."
        ),
    )
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args(argv)

    from adversarial_payments.data.load import load_features

    print(f"loading {args.rows or 'all'} rows ...", flush=True)
    df = load_features(sample_rows=args.rows or None)
    print(f"  {len(df):,} rows, {int(df[TARGET].sum()):,} fraud", flush=True)

    train, holdout = split_stratified(df, 0.30, seed=SEED)
    train, val = split_stratified(train, 0.30, seed=SEED)
    test = holdout
    print(f"  train={len(train):,} val={len(val):,} test={len(test):,}", flush=True)

    schema = FeatureSchema.fit(train)
    projector = ConstraintProjector.fit(df, schema)
    cfg = AttackConfig(
        budget=args.budget, restarts=args.restarts, max_attempts=args.attempts
    )

    arms: list[SweepArm] = []
    for w in args.weights:
        print(f"\n=== adversarial weight {w:g} ===", flush=True)
        arm = run_arm(
            w, train, val, test, schema, projector, cfg, args.rounds, SEED
        )
        arms.append(arm)

        # Written after every arm rather than at the end: an overnight run that dies in
        # its last arm should still leave the arms that finished.
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(
                {
                    "kind": "dosage_sweep",
                    "rows": len(df),
                    "n_train": len(train),
                    "n_val": len(val),
                    "n_test": len(test),
                    "attempts_per_round": args.attempts,
                    "fpr_budget": FPR_BUDGET,
                    "arms": [asdict(a) for a in arms],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    print("\n=== sweep ===")
    print(f"{'weight':>8s}  " + "  ".join(f"r{r} ASR / PR-AUC" for r in range(args.rounds)))
    for a in arms:
        cells = "  ".join(f"{x.asr:.3f} / {x.pr_auc:.4f}" for x in a.rounds)
        print(f"{a.weight:>8g}  {cells}   ({a.seconds:.0f}s)")
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
