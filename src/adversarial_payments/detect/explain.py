"""SHAP attribution for the detector.

This is not decoration. The attack engine's job is to move the features the detector
leans on, so the SHAP ranking here and the attack engine's ``per_feature_freq`` should
tell the same story from opposite sides -- and where they *disagree* is the interesting
finding, because it means the detector's stated reasons are not the ones an attacker can
cheaply exploit.

Mean absolute SHAP is used rather than gain-based importance: gain is computed over
training splits and is a property of how the tree was built, while mean |SHAP| is a
property of the predictions actually made on the evaluation data.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..artifacts import ShapFeature
from ..schema import FEATURES

#: TreeExplainer is exact but not free. A few thousand rows pins the mean to within
#: noise of the full-split value at a fraction of the cost.
DEFAULT_SAMPLE = 5_000


def shap_values(model, df: pd.DataFrame, sample: int | None = DEFAULT_SAMPLE, seed: int = 0):
    """Per-row, per-feature SHAP values for the positive class, plus the frame used."""
    import shap

    X = df.loc[:, list(FEATURES)]
    if sample is not None and len(X) > sample:
        X = X.sample(n=sample, random_state=seed).sort_index()

    booster = getattr(model, "booster", model)
    explainer = shap.TreeExplainer(booster)
    values = explainer.shap_values(X, check_additivity=False)

    values = np.asarray(values)
    if values.ndim == 3:
        # (n, features, classes) or (classes, n, features) depending on backend.
        values = values[..., -1] if values.shape[-1] == 2 else values[-1]
    return values, X


def top_shap_features(
    model,
    df: pd.DataFrame,
    top_k: int = 8,
    sample: int | None = DEFAULT_SAMPLE,
    seed: int = 0,
) -> list[ShapFeature]:
    """Mean absolute SHAP per feature, descending, truncated to ``top_k``."""
    values, X = shap_values(model, df, sample=sample, seed=seed)
    mean_abs = np.abs(values).mean(axis=0)

    ranked = sorted(
        zip(X.columns, mean_abs.tolist()), key=lambda kv: kv[1], reverse=True
    )
    return [ShapFeature(feature=str(f), mean_abs_shap=float(v)) for f, v in ranked[:top_k]]


def shap_table(model, df: pd.DataFrame, **kwargs) -> pd.DataFrame:
    """Full ranking as a frame, for the notebook."""
    features = top_shap_features(model, df, top_k=len(FEATURES), **kwargs)
    return pd.DataFrame(
        {
            "feature": [f.feature for f in features],
            "mean_abs_shap": [f.mean_abs_shap for f in features],
        }
    )
