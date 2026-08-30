"""The detector as it would actually be served: ONNX Runtime, not the training library.

Latency measured against XGBoost's Python API is not the number a payment network cares
about. That path builds a one-row DataFrame per authorisation and calls back into the
training library; a production scorer loads a frozen graph and feeds it a float array.
Reporting the training-time figure as a serving figure would overstate inference cost by
roughly two orders of magnitude -- in our own measurements, 4.1 ms against 0.03 ms.

The adapter exposes ``predict_proba`` so ``measure_latency`` times it without knowing which
backend it holds, and carries ``backend`` so the artifact records which one produced the
number.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from ..config import MODELS
from ..schema import FEATURES

ONNX_PATH: Path = MODELS / "detector_round0.onnx"


def export_onnx(booster: Any, dest: Path = ONNX_PATH) -> Path:
    """Convert a trained XGBoost booster to ONNX.

    The feature names are rewritten to ``f0..fN`` because onnxmltools rejects anything
    else. Only the labels change -- column order is untouched, which is what actually
    binds a value to a tree split, so the exported graph scores identically.
    """
    from onnxmltools.convert import convert_xgboost
    from onnxmltools.convert.common.data_types import FloatTensorType

    booster.feature_names = [f"f{i}" for i in range(len(FEATURES))]
    onx = convert_xgboost(
        booster, initial_types=[("input", FloatTensorType([None, len(FEATURES)]))]
    )
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(onx.SerializeToString())
    return dest


class OnnxDetector:
    """Frozen-graph scorer with the sklearn-shaped call the rest of the code expects."""

    backend = "onnxruntime"

    def __init__(self, path: Path = ONNX_PATH):
        import onnxruntime as ort

        self.session = ort.InferenceSession(
            str(path), providers=["CPUExecutionProvider"]
        )
        self.input_name = self.session.get_inputs()[0].name
        self.version = ort.__version__

    def predict_proba(self, X) -> np.ndarray:
        arr = np.asarray(getattr(X, "values", X), dtype=np.float32)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        outputs = self.session.run(None, {self.input_name: arr})

        # ONNX classifier ZipMap emits probabilities as a list of dicts; the raw tensor
        # form appears when ZipMap is disabled. Handle both rather than assuming one and
        # silently indexing the wrong output.
        probs = outputs[1]
        if isinstance(probs, list):
            return np.array([[row[0], row[1]] for row in probs], dtype=np.float64)
        return np.asarray(probs, dtype=np.float64)
