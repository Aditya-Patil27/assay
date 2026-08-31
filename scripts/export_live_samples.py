"""Export a handful of real flagged transactions for the in-browser demo.

The /live page runs the exported ONNX detector in the visitor's browser. It has to start
from *something*, and that something must not be invented: a demo seeded with midpoints of
the observed bounds would be a synthetic transaction wearing a real transaction's clothes,
and every score it produced would be meaningless.

So these are real rows. They come from the chronological test split -- the part of the
corpus the detector was never trained on -- and every one is a transaction that is
genuinely fraudulent AND that the round-0 detector genuinely flags. That is exactly the
population the attack targets, so the demo starts where the pipeline starts.

    python scripts/export_live_samples.py

Writes artifacts/live_samples.json.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone

import numpy as np

from adversarial_payments.artifacts import Envelope
from adversarial_payments.config import ARTIFACTS, ROOT
from adversarial_payments.data.load import feature_matrix, labels, load_features, time_split
from adversarial_payments.schema import FEATURES
from adversarial_payments.serving.onnx_backend import OnnxDetector

# Enough rows to give the chronological test split real fraud in it, without spending
# minutes rebuilding features for 1.85M transactions to pick eight of them.
SAMPLE_ROWS = 250_000
N_SAMPLES = 8


def main() -> int:
    meta = json.loads((ROOT / "models" / "detector_round0.meta.json").read_text())
    threshold = float(meta["threshold"])

    print(f"building features over {SAMPLE_ROWS:,} rows ...")
    df = load_features(sample_rows=SAMPLE_ROWS)
    _, _, test = time_split(df)

    X = feature_matrix(test)
    y = labels(test)

    detector = OnnxDetector()
    proba = detector.predict_proba(X)[:, 1]

    # The attack's target population, exactly as select_targets defines it: actually
    # fraudulent AND actually flagged. An unflagged fraud has nothing to evade.
    flagged = np.where((y == 1) & (proba >= threshold))[0]
    if len(flagged) == 0:
        print("no flagged fraud in the test split; widen SAMPLE_ROWS")
        return 1

    # Spread across the score range rather than taking the top N, so the demo opens on a
    # transaction the detector is merely confident about, not only on its most extreme.
    order = flagged[np.argsort(proba[flagged])]
    picks = order[np.linspace(0, len(order) - 1, min(N_SAMPLES, len(order))).astype(int)]

    # A realistic authorisation stream for the hero: real rows in chronological order,
    # fraud and legitimate mixed at something near the corpus base rate rather than
    # filtered. The hero scores these live, so an invented row would be a fake score.
    n_stream = 60
    fraud_idx = np.where(y == 1)[0]
    legit_idx = np.where(y == 0)[0]
    rng = np.random.default_rng(0)
    take_fraud = rng.choice(fraud_idx, size=min(8, len(fraud_idx)), replace=False)
    take_legit = rng.choice(legit_idx, size=n_stream - len(take_fraud), replace=False)
    stream_idx = np.sort(np.concatenate([take_fraud, take_legit]))

    payload = {
        "threshold": threshold,
        "features": list(FEATURES),
        "stream": [
            {
                "id": f"txn-{int(i):06d}",
                "is_fraud": int(y[i]),
                "amt": float(X.iloc[i]["amt"]),
                "values": {c: float(X.iloc[i][c]) for c in FEATURES},
            }
            for i in stream_idx
        ],
        "samples": [
            {
                "id": f"txn-{int(i):06d}",
                "p_fraud": float(proba[i]),
                "values": {c: float(X.iloc[i][c]) for c in FEATURES},
            }
            for i in picks
        ],
    }

    dest = ARTIFACTS / "live_samples.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    envelope = Envelope(kind="live_samples", placeholder=False, payload=payload)
    envelope.created_at = datetime.now(timezone.utc).isoformat()
    dest.write_text(json.dumps(asdict(envelope), indent=2) + "\n", encoding="utf-8")

    print(f"wrote {dest}  ({len(payload['samples'])} samples, {len(payload['stream'])} stream rows)")
    print(f"  threshold {threshold:.4f}")
    for s in payload["samples"]:
        print(f"  {s['id']}  p={s['p_fraud']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
