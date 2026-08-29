"""Train, evaluate and publish the round-0 detector -- the blue team's baseline.

    python scripts/run_detect_round0.py                 # full dataset
    python scripts/run_detect_round0.py --rows 400000   # fast iteration

Writes, all with ``placeholder=False``:

    artifacts/detect/rounds.json    round 0 metrics + SHAP ranking (the contract shape)
    artifacts/feature_schema.json   fitted feasibility bounds, for the attack engine
    artifacts/latency.json          single-transaction inference latency
    models/detector_round0.json     the model P2's engine attacks

Only round 0 is written here. Rounds 1 and 2 come from the adversarial loop, and the
file deliberately does not carry invented placeholders alongside a real number.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from adversarial_payments import artifacts as A  # noqa: E402
from adversarial_payments.config import ARTIFACTS, SETTINGS  # noqa: E402
from adversarial_payments.data.load import (  # noqa: E402
    load_features,
    read_provenance,
    time_split,
)
from adversarial_payments.detect.evaluate import FPR_BUDGET  # noqa: E402
from adversarial_payments.detect.train import train_round  # noqa: E402
from adversarial_payments.schema import FeatureSchema  # noqa: E402
from adversarial_payments.serving.latency import measure_latency, write_latency  # noqa: E402

SCHEMA_PATH = ARTIFACTS / "feature_schema.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=int, default=SETTINGS.sample_rows)
    parser.add_argument("--latency-samples", type=int, default=300)
    parser.add_argument("--no-latency", action="store_true")
    args = parser.parse_args(argv)

    provenance = read_provenance()
    print(f"data source : {provenance['source']}  ({provenance['n_rows']:,} raw rows)")
    if provenance["source"] != "kaggle":
        print("  !! SYNTHETIC -- label every number below accordingly", file=sys.stderr)

    df = load_features(sample_rows=args.rows)
    train, val, test = time_split(df)
    print(
        f"features    : {len(df):,} rows  "
        f"(train {len(train):,} / val {len(val):,} / test {len(test):,}), "
        f"fraud rate {df['is_fraud'].mean():.4%}"
    )

    # The feasibility projection P2 searches inside. Fitted on train only -- bounds
    # derived from the test split would leak the evaluation data into the attack.
    schema = FeatureSchema.fit(train)
    schema.validate(df, require_target=True)
    schema.save(SCHEMA_PATH)
    print(f"schema      : fitted on train, saved to {SCHEMA_PATH.name}")

    # train_round holds out the tail of `train` internally to choose the threshold; `val`
    # is concatenated back on so that holdout is the real val split.
    import pandas as pd

    fit_frame = pd.concat([train, val], ignore_index=True)
    model, detect_round = train_round(fit_frame, 0, df_eval=test)

    print(
        f"\nround 0     : backend={model.backend}  threshold={detect_round.threshold:.6f} "
        f"(FPR budget {FPR_BUDGET:.2%} on val)"
    )
    print(f"  PR-AUC    : {detect_round.pr_auc:.4f}   <- headline (base rate is the floor)")
    print(f"  ROC-AUC   : {detect_round.roc_auc:.4f}")
    print(f"  precision : {detect_round.precision:.4f}")
    print(f"  recall    : {detect_round.recall:.4f}")
    print(f"  n_train   : {detect_round.n_train:,}")
    print("  top SHAP  :")
    for f in detect_round.top_shap:
        print(f"      {f.feature:<24} {f.mean_abs_shap:.4f}")

    dest = A.write("detect_rounds", [detect_round], placeholder=False)
    print(f"\nwrote {dest}  (placeholder=False)")

    if not args.no_latency:
        report = measure_latency(model, test, n=args.latency_samples)
        write_latency(report)
        print(
            f"latency     : p50 {report.p50_ms:.3f} ms  p95 {report.p95_ms:.3f} ms  "
            f"p99 {report.p99_ms:.3f} ms  (single transaction, n={report.n_samples})"
        )

    summary = {
        "source": provenance["source"],
        "n_rows": len(df),
        "pr_auc": detect_round.pr_auc,
        "roc_auc": detect_round.roc_auc,
        "precision": detect_round.precision,
        "recall": detect_round.recall,
        "threshold": detect_round.threshold,
    }
    print("\n" + json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
