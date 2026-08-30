"""Dataset acquisition and the single entry point the rest of the pipeline calls.

``load_features()`` is the P1 -> everyone contract in practice: it returns exactly
``schema.FEATURES + is_fraud``, no nulls, sorted by time, such that
``FeatureSchema.fit(df)`` and ``.validate(df)`` both pass.

Acquisition order is: real Sparkov from Kaggle, else the deterministic synthetic
generator. Which one you got is recorded in ``artifacts/data_provenance.json`` and
surfaced by :func:`read_provenance`. Nothing silently substitutes one for the other --
presenting synthetic results as real-dataset results is the failure mode this file
exists to make impossible.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
import os
from pathlib import Path

import numpy as np
import pandas as pd

from .. import config
from ..schema import FEATURES, TARGET
from .features import build_features
from .synthetic import RAW_COLUMNS, generate_synthetic_sparkov

INTERIM_PATH: Path = config.DATA_INTERIM / "sparkov.parquet"
PROVENANCE_PATH: Path = config.ARTIFACTS / "data_provenance.json"

DEFAULT_SYNTHETIC_ROWS = 300_000

#: Chronological split. Never random -- a card's later transactions would leak into the
#: features of its earlier ones and every metric downstream would be fiction.
VAL_FRACTION = 0.15
TEST_FRACTION = 0.20


class DatasetUnavailable(RuntimeError):
    """Neither the real dataset nor a usable fallback could be produced."""


# --- acquisition --------------------------------------------------------------------


def download_kaggle() -> pd.DataFrame | None:
    """Try the real Sparkov dataset. Returns ``None`` if it is not obtainable.

    Any failure (missing ``kagglehub``, absent credentials, no network, unexpected
    layout) is a soft failure: the caller falls back to synthetic and records that fact.
    """
    # A Kaggle notebook already has the dataset mounted read-only under /kaggle/input,
    # where kagglehub cannot reach it and no network is available. Pointing this at the
    # mount reuses the identical parsing path rather than growing a second loader that
    # could drift from it.
    override = os.getenv("SPARKOV_CSV_DIR", "")
    if override:
        root = Path(override)
        if not root.exists():
            return None
    else:
        try:
            import kagglehub
        except ImportError:
            return None

        try:
            root = Path(kagglehub.dataset_download(config.KAGGLE_DATASET))
        except Exception:  # noqa: BLE001 -- kagglehub raises many unrelated types
            return None

    csvs = sorted(root.rglob("*.csv"))
    if not csvs:
        return None

    frames = [pd.read_csv(p, low_memory=False) for p in csvs]
    raw = pd.concat(frames, ignore_index=True)
    raw = raw.drop(columns=[c for c in raw.columns if c.startswith("Unnamed")], errors="ignore")

    missing = [c for c in RAW_COLUMNS if c not in raw.columns]
    if missing:
        return None

    raw["trans_date_trans_time"] = pd.to_datetime(raw["trans_date_trans_time"])
    raw["dob"] = pd.to_datetime(raw["dob"])
    return (
        raw.loc[:, list(RAW_COLUMNS)]
        .sort_values("trans_date_trans_time", kind="stable")
        .reset_index(drop=True)
    )


def ensure_dataset(
    *,
    force: bool = False,
    allow_download: bool = True,
    n_rows: int = DEFAULT_SYNTHETIC_ROWS,
) -> dict:
    """Materialise ``data/interim/sparkov.parquet`` and its provenance record.

    Idempotent: returns the existing provenance unless ``force``.
    """
    config.ensure_dirs()

    if INTERIM_PATH.exists() and PROVENANCE_PATH.exists() and not force:
        return read_provenance()

    raw = download_kaggle() if allow_download else None
    source = "kaggle"

    if raw is None:
        source = "synthetic"
        raw = generate_synthetic_sparkov(n_rows=n_rows, seed=config.SEED)

    if raw.empty:
        raise DatasetUnavailable("produced an empty transaction frame")

    INTERIM_PATH.parent.mkdir(parents=True, exist_ok=True)
    raw.to_parquet(INTERIM_PATH, index=False)

    provenance = {
        "source": source,
        "n_rows": int(len(raw)),
        "fraud_rate": float(raw[TARGET].mean()),
        "n_fraud": int(raw[TARGET].sum()),
        "n_cards": int(raw["cc_num"].nunique()),
        "date_min": str(raw["trans_date_trans_time"].min()),
        "date_max": str(raw["trans_date_trans_time"].max()),
        "kaggle_dataset": config.KAGGLE_DATASET,
        "seed": config.SEED if source == "synthetic" else None,
        "generator": "adversarial_payments.data.synthetic" if source == "synthetic" else None,
        "path": str(INTERIM_PATH.relative_to(config.ROOT)),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "warning": (
            "SYNTHETIC DATA. Sparkov-shaped columns and base rate, invented joint "
            "distribution. No metric computed from this file may be reported as a "
            "result on the real Sparkov dataset."
        )
        if source == "synthetic"
        else None,
    }
    PROVENANCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROVENANCE_PATH.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    return provenance


def read_provenance() -> dict:
    """Where the current dataset came from. Raises if nothing has been fetched."""
    if not PROVENANCE_PATH.exists():
        raise DatasetUnavailable(
            f"{PROVENANCE_PATH} missing -- run `python scripts/fetch_data.py` first"
        )
    return json.loads(PROVENANCE_PATH.read_text(encoding="utf-8"))


def is_synthetic() -> bool:
    return read_provenance().get("source") != "kaggle"


# --- loading ------------------------------------------------------------------------


def load_raw(sample_rows: int | None = None) -> pd.DataFrame:
    """Raw Sparkov columns, time-sorted. Fetches on first call."""
    ensure_dataset()
    raw = pd.read_parquet(INTERIM_PATH)
    raw = raw.sort_values("trans_date_trans_time", kind="stable").reset_index(drop=True)

    if sample_rows is not None and sample_rows < len(raw):
        raw = _subsample_by_card(raw, sample_rows)
    return raw


def _subsample_by_card(raw: pd.DataFrame, sample_rows: int) -> pd.DataFrame:
    """Keep whole card histories, then truncate chronologically.

    Sampling rows at random would shred the per-card history that
    ``hours_since_last_txn`` and ``txn_count_*`` are computed from, so entire cards are
    kept or dropped. Deterministic under ``config.SEED``.
    """
    cards = np.array(raw["cc_num"].drop_duplicates().to_numpy(), copy=True)
    rng = np.random.default_rng(config.SEED)
    rng.shuffle(cards)

    sizes = raw["cc_num"].value_counts()
    kept: list = []
    total = 0
    for card in cards:
        kept.append(card)
        total += int(sizes[card])
        if total >= sample_rows:
            break

    subset = raw[raw["cc_num"].isin(set(kept))].sort_values(
        "trans_date_trans_time", kind="stable"
    )
    return subset.head(sample_rows).reset_index(drop=True)


def load_features(sample_rows: int | None = None) -> pd.DataFrame:
    """The contracted feature frame: ``schema.FEATURES + is_fraud``, time-sorted.

    ``FeatureSchema.fit(df)`` and ``FeatureSchema.validate(df, require_target=True)``
    both pass on the result. Rows stay in ascending time order so callers can split
    chronologically with :func:`time_split`.
    """
    return build_features(load_raw(sample_rows=sample_rows))


# --- splitting ----------------------------------------------------------------------


def time_split(
    df: pd.DataFrame,
    *,
    val_fraction: float = VAL_FRACTION,
    test_fraction: float = TEST_FRACTION,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Chronological train / val / test. Never random.

    The val split is what the operating threshold is chosen on; test is touched once,
    for the reported numbers.
    """
    if not 0 < val_fraction + test_fraction < 1:
        raise ValueError("val_fraction + test_fraction must be in (0, 1)")

    n = len(df)
    n_test = int(round(n * test_fraction))
    n_val = int(round(n * val_fraction))
    n_train = n - n_val - n_test
    if min(n_train, n_val, n_test) < 1:
        raise ValueError(f"{n} rows is too few to split into train/val/test")

    train = df.iloc[:n_train].reset_index(drop=True)
    val = df.iloc[n_train : n_train + n_val].reset_index(drop=True)
    test = df.iloc[n_train + n_val :].reset_index(drop=True)
    return train, val, test


def feature_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """The model's X, with columns in the contract's canonical order."""
    return df.loc[:, list(FEATURES)]


def labels(df: pd.DataFrame) -> np.ndarray:
    return df[TARGET].to_numpy().astype(np.int8)
