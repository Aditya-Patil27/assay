"""Detector metrics, and the one honest way to pick an operating threshold.

The class balance here is ~0.52% fraud, so ROC-AUC flatters everything and accuracy is
meaningless. **PR-AUC (average precision) is the headline number**; ROC-AUC is reported
only because reviewers expect to see it.

Threshold policy: a **fixed false-positive budget of 0.1%** on the chronological
validation split. That is the operational constraint a card network actually works
under -- declining 1 in 1,000 legitimate authorisations is roughly the ceiling before
cardholder attrition and call-centre cost dominate -- and it is chosen without ever
looking at the test split. Precision and recall are then whatever that threshold buys.

Picking the threshold by maximising F1 instead would be the easy move and the wrong one:
F1 has no operational meaning at this base rate, and it would let the adversarial rounds
quietly buy recall by spending false positives the business would never approve.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score

from ..schema import FEATURES, TARGET

#: Fraction of legitimate transactions we are willing to decline. See module docstring.
FPR_BUDGET = 0.001


@dataclass(frozen=True)
class EvalResult:
    """Detector performance at one operating point."""

    pr_auc: float
    roc_auc: float
    threshold: float
    precision: float
    recall: float
    fpr: float
    n: int
    n_positive: int

    def as_dict(self) -> dict:
        return {
            "pr_auc": self.pr_auc,
            "roc_auc": self.roc_auc,
            "threshold": self.threshold,
            "precision": self.precision,
            "recall": self.recall,
            "fpr": self.fpr,
            "n": self.n,
            "n_positive": self.n_positive,
        }


def predict_scores(model, df: pd.DataFrame) -> np.ndarray:
    """Fraud probability for every row, in the contract's feature order."""
    return np.asarray(model.predict_proba(df.loc[:, list(FEATURES)]))[:, 1]


def choose_threshold(
    y_true: np.ndarray, scores: np.ndarray, fpr_budget: float = FPR_BUDGET
) -> float:
    """Lowest threshold whose false-positive rate stays within ``fpr_budget``.

    Lowest, not any-that-fits: within the budget we want maximum recall. Called on the
    validation split only.
    """
    y = np.asarray(y_true).astype(bool)
    s = np.asarray(scores, dtype=float)
    negatives = s[~y]
    if negatives.size == 0:
        return 0.5

    # The (1 - budget) quantile of negative scores is exactly the cut that declines
    # `budget` of them.
    threshold = float(np.quantile(negatives, 1.0 - fpr_budget))
    # Nudge above ties so the realised FPR does not overshoot the budget.
    return float(np.nextafter(threshold, np.inf))


def metrics_at_threshold(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> EvalResult:
    y = np.asarray(y_true).astype(bool)
    s = np.asarray(scores, dtype=float)
    flagged = s >= threshold

    tp = int(np.sum(flagged & y))
    fp = int(np.sum(flagged & ~y))
    fn = int(np.sum(~flagged & y))
    tn = int(np.sum(~flagged & ~y))

    n_pos = int(y.sum())
    both_classes = 0 < n_pos < len(y)

    return EvalResult(
        pr_auc=float(average_precision_score(y, s)) if both_classes else float("nan"),
        roc_auc=float(roc_auc_score(y, s)) if both_classes else float("nan"),
        threshold=float(threshold),
        precision=float(tp / (tp + fp)) if (tp + fp) else 0.0,
        recall=float(tp / (tp + fn)) if (tp + fn) else 0.0,
        fpr=float(fp / (fp + tn)) if (fp + tn) else 0.0,
        n=int(len(y)),
        n_positive=n_pos,
    )


def evaluate(
    model,
    df: pd.DataFrame,
    *,
    threshold: float | None = None,
    fpr_budget: float = FPR_BUDGET,
) -> EvalResult:
    """Score ``df`` and report metrics.

    Pass ``threshold`` from the validation split. Omitting it derives the threshold from
    ``df`` itself, which is fine for a quick look but is *not* a clean held-out number --
    the artifact writers always pass an explicit threshold.
    """
    scores = predict_scores(model, df)
    y = df[TARGET].to_numpy()
    if threshold is None:
        threshold = choose_threshold(y, scores, fpr_budget)
    return metrics_at_threshold(y, scores, threshold)
