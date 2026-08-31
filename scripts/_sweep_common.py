"""Shared pieces of the three sweep scripts.

`_split` and `_fit` were copy-pasted verbatim into run_dosage_sweep, run_threshold_sweep and
run_adversarial_detection. Three copies of a stratified splitter means a fix lands in one and
rots in the other two, and the arms of different sweeps stop being comparable without anyone
noticing -- which is exactly the class of error the rest of this project exists to catch.

Kept out of the installed package deliberately: these are experiment scaffolding, not part
of the contract that `src/adversarial_payments` offers to the dashboard and the notebook.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from adversarial_payments.schema import FEATURES, TARGET  # noqa: E402

#: Matches loop.flows.task_split so sweep results stay comparable to the published loop.
#: Both are stratified random, NOT temporal -- see walkthrough section 4.2 for why that is
#: a weaker evaluation than the temporal split and what it costs.
HOLDOUT_FRACTION = 0.30


def split_stratified(
    df: pd.DataFrame, frac: float = HOLDOUT_FRACTION, *, seed: int
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Stratified split preserving the class balance on both sides.

    Raises on a single-class frame rather than dividing by zero. An adversarial frame is all
    fraud, and the first version of this silently blew up on `rng.choice` of an empty array
    two hours into a run.
    """
    y = df[TARGET].to_numpy()
    present = [label for label in (0, 1) if (y == label).any()]
    if len(present) < 2:
        raise ValueError(
            f"split_stratified needs both classes; got only {present}. "
            "For a single-class frame (e.g. adversarial rows) use a plain shuffle."
        )

    rng = np.random.default_rng(seed)
    idx = np.arange(len(df))
    held = np.zeros(len(df), dtype=bool)
    for label in present:
        rows = idx[y == label]
        held[rng.choice(rows, size=max(int(frac * len(rows)), 1), replace=False)] = True
    return df[~held].reset_index(drop=True), df[held].reset_index(drop=True)


def shuffle_split(df: pd.DataFrame, *, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Half/half plain shuffle, for frames with one class."""
    shuffled = df.sample(frac=1.0, random_state=seed).reset_index(drop=True)
    cut = len(shuffled) // 2
    return shuffled.iloc[:cut], shuffled.iloc[cut:]


def fit_detector(
    train: pd.DataFrame, *, seed: int, weights: np.ndarray | None = None
) -> Any:
    """The round-0 detector configuration, in one place.

    Hyperparameters match loop.flows.fit_detector. If they drift apart, sweep results stop
    describing the same model the loop publishes, and nothing would announce that.
    """
    from xgboost import XGBClassifier

    y = train[TARGET].to_numpy()
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
        n_jobs=-1,
    )
    model.fit(train[list(FEATURES)], y, sample_weight=weights)
    return model


def scores(model: Any, df: pd.DataFrame) -> np.ndarray:
    """Positive-class probability for every row."""
    return np.asarray(model.predict_proba(df[list(FEATURES)]))[:, 1]
