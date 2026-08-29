"""Training one blue-team round. This module is the P1 -> P2 runtime interface.

Two functions matter to anybody outside this file:

    train_round(df_train, round, adversarial=None) -> (model, DetectRound)
    load_model(round)                              -> model

``model`` is always a :class:`Detector`: a thin wrapper with sklearn-style
``predict_proba(X: pd.DataFrame) -> np.ndarray`` of shape ``(n, 2)``, accepting a frame
whose columns are ``schema.FEATURES`` in any order. The attack engine calls that in its
inner loop tens of thousands of times, so the wrapper does column reordering and nothing
else -- no per-call validation, no copying beyond what the backend needs.

XGBoost is the backend; LightGBM is used automatically if XGBoost is unimportable. Both
are persisted in their own native text format rather than pickled, so a model trained on
one machine loads on a judge's.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from .. import config
from ..artifacts import DetectRound, ShapFeature
from ..schema import FEATURES, TARGET
from .evaluate import FPR_BUDGET, choose_threshold, evaluate, predict_scores

#: Fraction of ``df_train`` held back, chronologically, to pick the threshold on.
INTERNAL_VAL_FRACTION = 0.2


class BackendUnavailable(RuntimeError):
    """Neither XGBoost nor LightGBM could be imported."""


def _backend() -> str:
    try:
        import xgboost  # noqa: F401

        return "xgboost"
    except ImportError:
        pass
    try:
        import lightgbm  # noqa: F401

        return "lightgbm"
    except ImportError as exc:  # pragma: no cover - environment failure
        raise BackendUnavailable("install xgboost or lightgbm") from exc


# --- the object P2 holds -------------------------------------------------------------


@dataclass
class Detector:
    """Sklearn-shaped facade over an XGBoost or LightGBM model.

    ``features`` is stored with the model so a frame handed in with shuffled columns is
    reordered rather than silently scored against the wrong columns.
    """

    backend: str
    booster: object
    features: tuple[str, ...]
    threshold: float
    round: int

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Class probabilities, shape ``(n, 2)``, column 1 = P(fraud)."""
        if isinstance(X, pd.DataFrame):
            frame = X.loc[:, list(self.features)]
        else:  # ndarray: assume already in `features` order
            frame = pd.DataFrame(np.asarray(X), columns=list(self.features))

        if self.backend == "xgboost":
            return np.asarray(self.booster.predict_proba(frame), dtype=np.float64)

        p = np.asarray(self.booster.predict(frame.to_numpy()), dtype=np.float64).ravel()
        return np.column_stack([1.0 - p, p])

    def predict(self, X: pd.DataFrame, threshold: float | None = None) -> np.ndarray:
        t = self.threshold if threshold is None else threshold
        return (self.predict_proba(X)[:, 1] >= t).astype(np.int8)

    # -- persistence ------------------------------------------------------------------

    def save(self, round_: int | None = None) -> Path:
        r = self.round if round_ is None else round_
        config.MODELS.mkdir(parents=True, exist_ok=True)
        ext = "json" if self.backend == "xgboost" else "txt"
        model_path = config.MODELS / f"detector_round{r}.{ext}"

        if self.backend == "xgboost":
            self.booster.save_model(str(model_path))
        else:
            self.booster.save_model(str(model_path))

        meta_path(r).write_text(
            json.dumps(
                {
                    "backend": self.backend,
                    "features": list(self.features),
                    "threshold": self.threshold,
                    "round": r,
                    "model_file": model_path.name,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return model_path


def meta_path(round_: int) -> Path:
    return config.MODELS / f"detector_round{round_}.meta.json"


def load_model(round: int) -> Detector:  # noqa: A002 - name fixed by the P1->P2 contract
    """Load the detector trained for ``round``. Raises if it has not been trained."""
    meta_file = meta_path(round)
    if not meta_file.exists():
        raise FileNotFoundError(
            f"no detector for round {round} at {meta_file} -- run train_round first"
        )
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    model_path = config.MODELS / meta["model_file"]

    if meta["backend"] == "xgboost":
        import xgboost as xgb

        booster = xgb.XGBClassifier()
        booster.load_model(str(model_path))
    else:
        import lightgbm as lgb

        booster = lgb.Booster(model_file=str(model_path))

    return Detector(
        backend=meta["backend"],
        booster=booster,
        features=tuple(meta["features"]),
        threshold=float(meta["threshold"]),
        round=int(meta["round"]),
    )


# --- training ------------------------------------------------------------------------


def _fit(X: pd.DataFrame, y: np.ndarray, backend: str, seed: int):
    n_pos = max(int(y.sum()), 1)
    n_neg = max(len(y) - n_pos, 1)
    pos_weight = n_neg / n_pos

    if backend == "xgboost":
        import xgboost as xgb

        model = xgb.XGBClassifier(
            n_estimators=400,
            max_depth=7,
            learning_rate=0.08,
            subsample=0.9,
            colsample_bytree=0.8,
            min_child_weight=2.0,
            reg_lambda=1.5,
            # The imbalance is 190:1. Without this the model can score 99.5% accuracy
            # by predicting "legitimate" forever.
            scale_pos_weight=pos_weight,
            tree_method="hist",
            eval_metric="aucpr",
            random_state=seed,
            n_jobs=-1,
        )
        model.fit(X, y, verbose=False)
        return model

    import lightgbm as lgb

    train_set = lgb.Dataset(X.to_numpy(), label=y, feature_name=list(X.columns))
    params = {
        "objective": "binary",
        "metric": "average_precision",
        "learning_rate": 0.08,
        "num_leaves": 96,
        "min_data_in_leaf": 20,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.9,
        "bagging_freq": 1,
        "scale_pos_weight": pos_weight,
        "seed": seed,
        "verbosity": -1,
    }
    return lgb.train(params, train_set, num_boost_round=400)


def train_round(
    df_train: pd.DataFrame,
    round: int,  # noqa: A002 - name fixed by the P1->P2 contract
    adversarial: pd.DataFrame | None = None,
    *,
    df_eval: pd.DataFrame | None = None,
    fpr_budget: float = FPR_BUDGET,
    seed: int | None = None,
    top_k_shap: int = 8,
    persist: bool = True,
) -> tuple[Detector, DetectRound]:
    """Train the round-``round`` detector and report its metrics.

    ``df_train`` and ``adversarial`` must both carry ``schema.FEATURES + is_fraud``.
    ``adversarial`` is the successful evasions from round ``round - 1``, relabelled as
    fraud and folded into the training set -- that fold-in is the entire blue-team move
    in the unrolled loop.

    The last :data:`INTERNAL_VAL_FRACTION` of ``df_train`` (chronologically, since
    ``load_features`` returns time-ordered rows) is held out to choose the operating
    threshold. Never randomly: a random holdout would put a card's later transactions in
    train and its earlier ones in val, and the reported PR-AUC would be fiction.

    ``df_eval`` is the optional clean held-out test split. When given, the returned
    ``DetectRound`` carries test-set metrics at the val-chosen threshold -- that is what
    goes in the artifact. When omitted, metrics are the val split's, which is a fine
    self-contained default for a caller that only has a training frame.
    """
    seed = config.SEED if seed is None else seed

    for name, frame in (("df_train", df_train), ("adversarial", adversarial)):
        if frame is None:
            continue
        missing = [c for c in (*FEATURES, TARGET) if c not in frame.columns]
        if missing:
            raise ValueError(f"{name} is missing required column(s): {missing}")

    n_adversarial = 0 if adversarial is None else len(adversarial)

    # Split first, augment after: adversarial examples belong in the fit set only. Put
    # them in the threshold-selection split and the threshold is tuned on the attacker's
    # own output, which is not a detector we could deploy.
    n_train_rows = len(df_train)
    cut = max(1, n_train_rows - int(n_train_rows * INTERNAL_VAL_FRACTION))
    fit_df = df_train.iloc[:cut]
    val_df = df_train.iloc[cut:]
    if len(val_df) == 0 or val_df[TARGET].nunique() < 2:
        # Too small or single-class to hold out from; fall back to fitting on everything.
        fit_df, val_df = df_train, df_train

    if adversarial is not None and n_adversarial:
        cols = list(FEATURES) + [TARGET]
        fit_df = pd.concat([fit_df.loc[:, cols], adversarial.loc[:, cols]], ignore_index=True)

    backend = _backend()
    X = fit_df.loc[:, list(FEATURES)]
    y = fit_df[TARGET].to_numpy().astype(np.int8)
    booster = _fit(X, y, backend, seed)

    detector = Detector(
        backend=backend,
        booster=booster,
        features=FEATURES,
        threshold=0.5,
        round=int(round),
    )

    # Threshold on val, at the fixed FPR budget, without ever touching df_eval.
    val_scores = predict_scores(detector, val_df)
    detector.threshold = choose_threshold(
        val_df[TARGET].to_numpy(), val_scores, fpr_budget=fpr_budget
    )

    report_on = val_df if df_eval is None else df_eval
    result = evaluate(detector, report_on, threshold=detector.threshold)

    top_shap = _safe_shap(detector, report_on, top_k_shap)

    if persist:
        detector.save()

    detect_round = DetectRound(
        round=int(round),
        pr_auc=result.pr_auc,
        roc_auc=result.roc_auc,
        threshold=result.threshold,
        precision=result.precision,
        recall=result.recall,
        n_train=int(len(fit_df)),
        n_adversarial_added=int(n_adversarial),
        top_shap=top_shap,
    )
    return detector, detect_round


def _safe_shap(detector: Detector, df: pd.DataFrame, top_k: int) -> list[ShapFeature]:
    """SHAP is a nice-to-have inside the loop; never let it fail a training round."""
    try:
        from .explain import top_shap_features

        return top_shap_features(detector, df, top_k=top_k)
    except Exception:  # noqa: BLE001 - explanation must not break the blue team
        return []
