"""Prove the JavaScript tree walker scores identically to the exported ONNX graph.

lib/trees.ts replaced onnxruntime-web to get 3.2MB of WASM off the wire. That is only a
good trade if it is the same model, so this scores every row the demo can show -- the
hero's 60-row stream and the 8 attack samples -- through ONNX here, and
web/scripts/check-tree-port.mjs replays them through the walker and diffs.

    python scripts/check_tree_port.py     # writes the expectations
    node web/scripts/check-tree-port.mjs  # checks the port against them
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from adversarial_payments.config import ROOT
from adversarial_payments.schema import FEATURES
from adversarial_payments.serving.onnx_backend import OnnxDetector

OUT = ROOT / "web" / "scripts" / "tree-conformance.json"


def main() -> int:
    live = json.loads((ROOT / "artifacts" / "live_samples.json").read_text(encoding="utf-8"))["payload"]
    rows = [{"id": r["id"], "values": r["values"]} for r in live.get("stream", [])]
    rows += [{"id": r["id"], "values": r["values"]} for r in live["samples"]]

    X = np.array([[r["values"][c] for c in FEATURES] for r in rows], dtype=np.float32)
    proba = OnnxDetector().predict_proba(X)[:, 1]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            [{"id": r["id"], "values": r["values"], "p": float(p)} for r, p in zip(rows, proba)],
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"wrote {OUT.relative_to(ROOT).as_posix()}  ({len(rows)} rows scored through ONNX)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
