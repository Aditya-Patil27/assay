"""Does the defence detect the generated attacks? The pillar-III number, measured honestly.

The challenge asks for a model that "detects, flags and mitigates the generated attacks"
while keeping false positives on legitimate payments low. Our loop never answered that
question. It answered a harder one -- can a *fresh* constraint-aware search evade the
retrained detector -- and the answer is always yes, which is the ASR 1.000 result.

Those are different questions and conflating them undersells the defence.

    loop asks   : after retraining, can a NEW search find NEW evasions?          yes, always
    pillar asks : does the retrained detector catch generated attacks it has     <- measured
                  never seen before?                                               here

So: attack the round-0 detector, split the successful evasions in half, retrain on one half
only, and measure recall on the half the model has never seen. Splitting matters. Folding
every adversarial row into training and then reporting recall on those same rows measures
memorisation, and would be the same species of error as fitting a threshold on the test
split -- which this project has already caught itself doing once.

The false-positive side is reported at the same operating point, because a detector that
catches every attack by declining everything is not a detection result.

    python scripts/run_adversarial_detection.py --rows 400000 --attempts 1200
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
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
from adversarial_payments.config import ARTIFACTS, SEED  # noqa: E402
from adversarial_payments.detect.evaluate import (  # noqa: E402
    FPR_BUDGET,
    choose_threshold,
    metrics_at_threshold,
)
from adversarial_payments.schema import FEATURES, TARGET, FeatureSchema  # noqa: E402
from _sweep_common import fit_detector, scores, split_stratified  # noqa: E402

OUT_PATH = ARTIFACTS / "attack" / "adversarial_detection.json"


@dataclass
class Report:
    n_adversarial_total: int
    n_adversarial_train: int
    n_adversarial_holdout: int
    threshold: float
    #: the whole point: recall on adversarial rows the retrained model never saw
    holdout_recall_after: float
    #: same rows, scored by the detector they were built to evade. ~0 by construction.
    holdout_recall_before: float
    #: memorisation check -- recall on the adversarial rows it WAS trained on
    train_recall_after: float
    legit_fpr_before: float
    legit_fpr_after: float
    legit_declines_per_100k_after: float
    real_fraud_recall_before: float
    real_fraud_recall_after: float
    pr_auc_before: float
    pr_auc_after: float


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="run_adversarial_detection")
    ap.add_argument("--rows", type=int, default=400_000, help="0 uses the full dataset")
    ap.add_argument("--attempts", type=int, default=1200)
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args(argv)

    from adversarial_payments.data.load import load_features

    print(f"loading {args.rows or 'all'} rows ...", flush=True)
    df = load_features(sample_rows=args.rows or None)
    train, test = split_stratified(df, 0.30, seed=SEED)
    train, val = split_stratified(train, 0.30, seed=SEED)
    print(f"  train={len(train):,} val={len(val):,} test={len(test):,}", flush=True)

    schema = FeatureSchema.fit(train)
    projector = ConstraintProjector.fit(df, schema)

    print("round 0 detector ...", flush=True)
    base = fit_detector(train, seed=SEED)
    thr0 = choose_threshold(val[TARGET].to_numpy(), scores(base, val), FPR_BUDGET)
    ev0 = metrics_at_threshold(test[TARGET].to_numpy(), scores(base, test), thr0)
    print(f"  PR-AUC {ev0.pr_auc:.4f} recall {ev0.recall:.3f} thr {thr0:.4f}", flush=True)

    print(f"attacking with {args.attempts} attempts ...", flush=True)
    results = attack_dataset(
        base, test, schema,
        AttackConfig(threshold=thr0, max_attempts=args.attempts, seed=SEED),
        projector=projector,
    )
    adv = adversarial_frame(results)
    print(f"  {len(adv):,} successful evasions", flush=True)
    if len(adv) < 20:
        print("too few evasions to split meaningfully", file=sys.stderr)
        return 1

    # Half in, half out. Without the split this measures memorisation, not detection.
    # A plain shuffle, not the stratified _split: every adversarial row is labelled fraud,
    # so there is no negative stratum to balance and stratifying would divide by zero.
    shuffled = adv.sample(frac=1.0, random_state=SEED).reset_index(drop=True)
    cut = len(shuffled) // 2
    adv_train, adv_hold = shuffled.iloc[:cut], shuffled.iloc[cut:]
    print(f"  adversarial train={len(adv_train):,} holdout={len(adv_hold):,}", flush=True)

    print("retraining on the adversarial half ...", flush=True)
    after = _fit(pd.concat([train, adv_train], ignore_index=True), SEED)
    thr1 = choose_threshold(val[TARGET].to_numpy(), scores(after, val), FPR_BUDGET)
    ev1 = metrics_at_threshold(test[TARGET].to_numpy(), scores(after, test), thr1)

    flagged = lambda m, d, t: float((scores(m, d) >= t).mean())  # noqa: E731

    rep = Report(
        n_adversarial_total=len(adv),
        n_adversarial_train=len(adv_train),
        n_adversarial_holdout=len(adv_hold),
        threshold=round(float(thr1), 6),
        holdout_recall_after=round(flagged(after, adv_hold, thr1), 5),
        holdout_recall_before=round(flagged(base, adv_hold, thr0), 5),
        train_recall_after=round(flagged(after, adv_train, thr1), 5),
        legit_fpr_before=round(float(ev0.fpr), 6),
        legit_fpr_after=round(float(ev1.fpr), 6),
        legit_declines_per_100k_after=round(float(ev1.fpr) * 100_000, 1),
        real_fraud_recall_before=round(float(ev0.recall), 5),
        real_fraud_recall_after=round(float(ev1.recall), 5),
        pr_auc_before=round(float(ev0.pr_auc), 5),
        pr_auc_after=round(float(ev1.pr_auc), 5),
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(
            {
                "kind": "adversarial_detection",
                "rows": len(df),
                "n_train": len(train),
                "n_test": len(test),
                "fpr_budget": FPR_BUDGET,
                "note": (
                    "Recall on adversarial examples the retrained model never saw. Answers "
                    "'does the defence detect the generated attacks', which is a different "
                    "question from 'can a fresh search evade the retrained model'."
                ),
                "report": asdict(rep),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print("\n=== does the defence detect the generated attacks? ===")
    print(f"  held-out adversarial recall   {rep.holdout_recall_before:.1%} -> "
          f"{rep.holdout_recall_after:.1%}")
    print(f"  (trained-on adversarial rows  {rep.train_recall_after:.1%}  <- memorisation ceiling)")
    print(f"  real-fraud recall             {rep.real_fraud_recall_before:.1%} -> "
          f"{rep.real_fraud_recall_after:.1%}")
    print(f"  PR-AUC                        {rep.pr_auc_before:.4f} -> {rep.pr_auc_after:.4f}")
    print(f"  legitimate declines / 100k    {rep.legit_fpr_before*100_000:,.0f} -> "
          f"{rep.legit_declines_per_100k_after:,.0f}")
    print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
