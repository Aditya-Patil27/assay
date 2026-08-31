"""Flatten the XGBoost detector into arrays a browser can walk without a runtime.

The site was shipping onnxruntime-web to score a gradient-boosted tree: 3.2MB of WASM on
the wire before the landing page could show anything, and 8.8s to a first score on a 4Mbps
connection. That is a general-purpose inference engine brought in to do 400 comparisons of
a float against a threshold.

So the trees are exported instead. Every node becomes five numbers in five flat arrays --
feature index, threshold, left child, right child, and which way a missing value goes --
and lib/trees.ts walks them. The result is the same model, not an approximation of it:
scripts/check_tree_port.py scores the whole demo corpus through ONNX and through the
exported arrays and fails on any disagreement beyond float32 noise.

    python scripts/export_tree_model.py

Writes artifacts/detector_trees.json.
"""

from __future__ import annotations

import json
import math
import subprocess
from dataclasses import asdict
from datetime import datetime, timezone

from adversarial_payments.artifacts import Envelope
from adversarial_payments.config import ARTIFACTS, ROOT
from adversarial_payments.schema import FEATURES

MODEL = ROOT / "models" / "detector_round0.json"


def _sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return "unknown"


def main() -> int:
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    learner = model["learner"]
    param = learner["learner_model_param"]

    objective = learner["objective"]["name"]
    if objective != "binary:logistic":
        raise SystemExit(f"exporter only handles binary:logistic, got {objective!r}")

    # XGBoost >= 2.0 stores base_score in probability space; the margin starts at its
    # logit. For the usual 0.5 that is exactly 0, but computing it keeps a retrained
    # detector with a shifted intercept correct rather than silently off.
    base_prob = float(json.loads(param["base_score"])[0]) if param["base_score"].startswith("[") else float(param["base_score"])
    base_margin = math.log(base_prob / (1.0 - base_prob)) if 0.0 < base_prob < 1.0 else 0.0

    trees = learner["gradient_booster"]["model"]["trees"]

    # One flat block for every node in every tree, with a root offset per tree. Nested
    # per-tree objects cost far more JSON punctuation than the numbers are worth.
    roots: list[int] = []
    split_idx: list[int] = []
    split_cond: list[float] = []
    left: list[int] = []
    right: list[int] = []
    default_left: list[int] = []

    for tree in trees:
        offset = len(split_idx)
        roots.append(offset)
        lc = tree["left_children"]
        rc = tree["right_children"]
        for i in range(len(lc)):
            is_leaf = lc[i] == -1
            split_idx.append(-1 if is_leaf else int(tree["split_indices"][i]))
            # For a leaf, XGBoost stores the leaf weight in split_conditions.
            split_cond.append(float(tree["split_conditions"][i]))
            left.append(-1 if is_leaf else offset + int(lc[i]))
            right.append(-1 if is_leaf else offset + int(rc[i]))
            default_left.append(int(tree["default_left"][i]))

    payload = {
        "objective": objective,
        "base_margin": base_margin,
        "features": list(FEATURES),
        "n_trees": len(trees),
        "n_nodes": len(split_idx),
        "roots": roots,
        "split_idx": split_idx,
        "split_cond": split_cond,
        "left": left,
        "right": right,
        "default_left": default_left,
    }

    dest = ARTIFACTS / "detector_trees.json"
    envelope = Envelope(kind="detector_trees", placeholder=False, payload=payload)
    envelope.created_at = datetime.now(timezone.utc).isoformat()
    envelope.git_sha = _sha()
    dest.write_text(json.dumps(asdict(envelope), separators=(",", ":")) + "\n", encoding="utf-8")

    kb = dest.stat().st_size / 1024
    print(f"wrote {dest}")
    print(f"  {len(trees)} trees · {len(split_idx):,} nodes · {len(FEATURES)} features")
    print(f"  base_margin {base_margin:.6f} · {kb:,.0f} KB on disk")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
