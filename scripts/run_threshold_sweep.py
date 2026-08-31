"""What does it actually cost to make this attacker fail?

The dosage sweep established that adversarial retraining does not beat a constraint-aware
attacker at any dosage we can afford. That is a true result and a negative one, and it left
an obvious question unanswered: is the attacker unbeatable, or was retraining simply the
wrong lever?

There is a second lever, already named in the Blue repertoire and never measured --
`threshold_tighten`. The attacker wins by pushing a transaction's score below the operating
threshold. Lower the threshold and the target region shrinks; the attack gets harder for
reasons that have nothing to do with what the model learned. It is instant, it needs no
retraining, and it is not free: every step down declines more legitimate customers.

So this sweeps the false-positive budget and measures both sides of that trade at once:
attack success on one axis, the operational cost of the threshold that produced it on the
other. The result is a price list rather than a claim -- "evasion falls to X% if you are
willing to decline Y% of legitimate transactions" -- which is the shape of answer a payment
network can actually act on.

One model is trained and then attacked at every threshold. Nothing is retrained between
arms, so any change in attack success is attributable to the operating point alone.

    python scripts/run_threshold_sweep.py --rows 400000 --attempts 800
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from adversarial_payments.attack.constraints import ConstraintProjector  # noqa: E402
from adversarial_payments.attack.engine import AttackConfig, attack_dataset  # noqa: E402
from adversarial_payments.attack.metrics import summarize_round  # noqa: E402
from adversarial_payments.config import ARTIFACTS, SEED  # noqa: E402
from adversarial_payments.detect.evaluate import (  # noqa: E402
    choose_threshold,
    metrics_at_threshold,
)
from adversarial_payments.schema import FEATURES, TARGET, FeatureSchema  # noqa: E402
from _sweep_common import fit_detector, scores, split_stratified  # noqa: E402

OUT_PATH = ARTIFACTS / "attack" / "threshold_sweep.json"


@dataclass
class Arm:
    fpr_budget: float
    threshold: float
    asr: float
    n_attempts: int
    n_success: int
    mean_l0: float
    median_queries: int
    pr_auc: float
    precision: float
    recall: float
    realised_fpr: float
    #: legitimate transactions declined per 100,000 -- the number an operations team feels
    declines_per_100k: float
    #: Where the attack actually lands. If these sit near zero the attack is not merely
    #: crossing the boundary, it is driving the score to the floor -- and then no operating
    #: point above zero defends against it, which is a stronger claim than any single ASR.
    adv_score_p50: float
    adv_score_p90: float
    adv_score_max: float
    seconds: float


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="run_threshold_sweep")
    ap.add_argument("--rows", type=int, default=400_000, help="0 uses the full dataset")
    ap.add_argument("--attempts", type=int, default=800)
    ap.add_argument("--budget", type=int, default=4)
    ap.add_argument("--restarts", type=int, default=3)
    ap.add_argument(
        "--fpr", type=float, nargs="+",
        default=[0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.10],
        help="false-positive budgets to price. 0.001 is the current operating point.",
    )
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args(argv)

    from adversarial_payments.data.load import load_features

    print(f"loading {args.rows or 'all'} rows ...", flush=True)
    df = load_features(sample_rows=args.rows or None)
    train, test = split_stratified(df, 0.30, seed=SEED)
    train, val = split_stratified(train, 0.30, seed=SEED)
    print(f"  {len(df):,} rows | train={len(train):,} val={len(val):,} test={len(test):,}",
          flush=True)

    schema = FeatureSchema.fit(train)
    projector = ConstraintProjector.fit(df, schema)

    print("training one detector; every arm attacks this same model", flush=True)
    model = fit_detector(train, seed=SEED)

    y_val = val[TARGET].to_numpy()
    val_scores = np.asarray(model.predict_proba(val[list(FEATURES)]))[:, 1]
    y_test = test[TARGET].to_numpy()
    test_scores = np.asarray(model.predict_proba(test[list(FEATURES)]))[:, 1]

    arms: list[Arm] = []
    for budget in args.fpr:
        started = time.time()
        threshold = choose_threshold(y_val, val_scores, budget)
        ev = metrics_at_threshold(y_test, test_scores, threshold)

        results = attack_dataset(
            model, test, schema,
            AttackConfig(
                threshold=threshold, budget=args.budget, restarts=args.restarts,
                max_attempts=args.attempts, seed=SEED,
            ),
            projector=projector,
        )
        atk = summarize_round(0, results)
        adv = np.array([r.adv_prob for r in results if r.success], dtype=float)
        if adv.size == 0:
            adv = np.array([float("nan")])

        arm = Arm(
            fpr_budget=budget,
            threshold=round(float(threshold), 6),
            asr=round(atk.asr, 5),
            n_attempts=atk.n_attempts,
            n_success=atk.n_success,
            mean_l0=round(atk.mean_l0, 4),
            median_queries=atk.median_queries,
            pr_auc=round(float(ev.pr_auc), 5),
            precision=round(float(ev.precision), 5),
            recall=round(float(ev.recall), 5),
            realised_fpr=round(float(ev.fpr), 6),
            declines_per_100k=round(float(ev.fpr) * 100_000, 1),
            adv_score_p50=round(float(np.percentile(adv, 50)), 6),
            adv_score_p90=round(float(np.percentile(adv, 90)), 6),
            adv_score_max=round(float(np.nanmax(adv)), 6),
            seconds=round(time.time() - started, 1),
        )
        arms.append(arm)
        print(
            f"  [fpr={budget:<6g}] thr={threshold:.4f} ASR={atk.asr:.3f} "
            f"recall={ev.recall:.3f} precision={ev.precision:.3f} "
            f"declines/100k={arm.declines_per_100k:,.0f} "
            f"advscore p50={arm.adv_score_p50:.2e} max={arm.adv_score_max:.2e} "
            f"({arm.seconds:.0f}s)",
            flush=True,
        )

        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(
                {
                    "kind": "threshold_sweep",
                    "rows": len(df),
                    "n_train": len(train),
                    "n_val": len(val),
                    "n_test": len(test),
                    "attempts_per_arm": args.attempts,
                    "note": (
                        "One detector, attacked at every threshold. No retraining between "
                        "arms, so a change in attack success is attributable to the "
                        "operating point alone."
                    ),
                    "arms": [asdict(a) for a in arms],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    print("\n=== the price list ===")
    base = arms[0]
    print(f"{'FPR budget':>11}  {'ASR':>7}  {'recall':>7}  {'declines/100k':>14}")
    for a in arms:
        print(f"{a.fpr_budget:>11g}  {a.asr:>7.3f}  {a.recall:>7.3f}  {a.declines_per_100k:>14,.0f}")
    best = min(arms, key=lambda a: a.asr)
    print(
        f"\nattack success {base.asr:.3f} -> {best.asr:.3f} "
        f"by moving the FPR budget {base.fpr_budget:g} -> {best.fpr_budget:g}, "
        f"which declines {best.declines_per_100k - base.declines_per_100k:,.0f} more "
        f"legitimate transactions per 100,000."
    )
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
