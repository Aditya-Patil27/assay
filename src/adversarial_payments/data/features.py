"""Raw Sparkov columns -> the frozen feature contract in ``schema.py``.

Two rules govern everything here.

**Causality.** Every per-card aggregate (``amt_ratio_to_card_mean``, ``txn_count_1h``,
``txn_count_24h``, ``hours_since_last_txn``) is computed from *strictly prior*
transactions on the same card. Using the full-history mean would leak the future into
the past, inflate PR-AUC, and hand the attack engine a detector that does not exist in
production. Splits are chronological for the same reason.

**Exactly the contract.** :func:`build_features` returns ``schema.FEATURES + is_fraud``
and nothing else, so ``FeatureSchema.fit`` / ``.validate`` pass without a shim.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..schema import FEATURES, TARGET

EARTH_RADIUS_KM = 6371.0088

# A card's first-ever observed transaction has no predecessor. 720h (30 days) is the
# "effectively dormant" sentinel; it is inside the observed range so it cannot be used
# as a free out-of-distribution lever by the attacker.
NO_PRIOR_TXN_HOURS = 720.0

NIGHT_START = 22
NIGHT_END = 6


def to_epoch_seconds(values: pd.Series) -> np.ndarray:
    """Datetimes -> int64 seconds since epoch, whatever the datetime resolution.

    Not ``astype("int64") // 10**9``: parquet round-trips these columns as
    ``datetime64[us]``, so that expression silently returns kiloseconds and every gap
    and rolling-window count comes out ~1000x wrong while still looking plausible.
    """
    return pd.to_datetime(values).to_numpy().astype("datetime64[s]").astype(np.int64)


def haversine_km(
    lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray
) -> np.ndarray:
    """Great-circle distance in km between cardholder home and merchant terminal."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dlam = np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dphi / 2.0) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlam / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def ordinal_encode(values: pd.Series) -> pd.Series:
    """Stable, deterministic label encoding: sorted unique -> 0..n-1.

    Sorted rather than order-of-appearance so that ``category_enc`` means the same thing
    across runs, splits and rounds. The attack engine perturbs this column, and a code
    that shifts between rounds would silently change what an attack *means*.
    """
    codes = pd.Categorical(values.astype("string"), categories=sorted(set(values.astype("string"))))
    return pd.Series(codes.codes.astype(np.float64), index=values.index)


def _prior_expanding_mean(group_key: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Mean of all *previous* values within each group; NaN for each group's first row.

    Assumes rows are already sorted by time. Vectorised: cumulative sums restarted at
    each group boundary of the group-sorted view.
    """
    order = np.argsort(group_key, kind="stable")
    keys = group_key[order]
    vals = values[order].astype(np.float64)

    new_group = np.r_[True, keys[1:] != keys[:-1]]
    starts = np.flatnonzero(new_group)
    # Position of each row within its own group.
    pos = np.arange(len(keys)) - np.repeat(starts, np.diff(np.r_[starts, len(keys)]))

    csum = np.cumsum(vals)
    base = np.r_[0.0, csum][np.repeat(starts, np.diff(np.r_[starts, len(keys)]))]
    prior_sum = csum - vals - base

    with np.errstate(invalid="ignore", divide="ignore"):
        out = np.where(pos > 0, prior_sum / np.maximum(pos, 1), np.nan)

    result = np.empty_like(out)
    result[order] = out
    return result


def _prior_window_count(
    group_key: np.ndarray, times_s: np.ndarray, window_s: int
) -> np.ndarray:
    """Count of prior same-card transactions within ``window_s`` seconds (self excluded).

    Assumes rows are sorted by time ascending.
    """
    order = np.argsort(group_key, kind="stable")
    keys = group_key[order]
    t = times_s[order].astype(np.int64)

    new_group = np.r_[True, keys[1:] != keys[:-1]]
    starts = np.flatnonzero(new_group)
    ends = np.r_[starts[1:], len(keys)]

    out = np.zeros(len(keys), dtype=np.float64)
    for lo, hi in zip(starts, ends):
        block = t[lo:hi]
        left = np.searchsorted(block, block - window_s, side="left")
        out[lo:hi] = np.arange(hi - lo) - left

    result = np.empty_like(out)
    result[order] = out
    return result


def _prior_gap_hours(group_key: np.ndarray, times_s: np.ndarray) -> np.ndarray:
    """Hours since the same card's previous transaction; NaN for a card's first row."""
    order = np.argsort(group_key, kind="stable")
    keys = group_key[order]
    t = times_s[order].astype(np.float64)

    gap = np.r_[np.nan, np.diff(t)] / 3600.0
    gap[np.r_[True, keys[1:] != keys[:-1]]] = np.nan

    result = np.empty_like(gap)
    result[order] = gap
    return result


def build_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Engineer the frozen feature set from raw Sparkov columns.

    ``raw`` must be sorted by ``trans_date_trans_time`` ascending; the causal aggregates
    depend on it and this function re-sorts defensively rather than trusting the caller.
    """
    df = raw.sort_values("trans_date_trans_time", kind="stable").reset_index(drop=True)

    ts = pd.to_datetime(df["trans_date_trans_time"])
    dob = pd.to_datetime(df["dob"])
    cc = df["cc_num"].to_numpy()
    times_s = to_epoch_seconds(ts)

    out = pd.DataFrame(index=df.index)

    # --- FROZEN: victim attributes the attacker inherits and cannot forge -------------
    out["age"] = ((ts - dob).dt.days / 365.25).astype(np.float64)
    out["gender_enc"] = (df["gender"].astype("string").str.upper() == "M").astype(np.float64)
    out["city_pop"] = df["city_pop"].astype(np.float64)
    out["home_lat"] = df["lat"].astype(np.float64)
    out["home_long"] = df["long"].astype(np.float64)
    out["state_enc"] = ordinal_encode(df["state"])
    out["job_enc"] = ordinal_encode(df["job"])

    # --- COUPLED: one decision -- "which merchant?" -- sets all four -----------------
    out["category_enc"] = ordinal_encode(df["category"])
    out["merch_lat"] = df["merch_lat"].astype(np.float64)
    out["merch_long"] = df["merch_long"].astype(np.float64)
    out["distance_km"] = haversine_km(
        out["home_lat"].to_numpy(),
        out["home_long"].to_numpy(),
        out["merch_lat"].to_numpy(),
        out["merch_long"].to_numpy(),
    )

    # --- MUTABLE: amount, timing, pacing ---------------------------------------------
    amt = df["amt"].astype(np.float64).to_numpy()
    out["amt"] = amt
    out["log_amt"] = np.log1p(np.clip(amt, 0.0, None))

    prior_mean = _prior_expanding_mean(cc, amt)
    # A card with no history is scored against the population mean, not against itself.
    global_mean = float(np.mean(amt)) if len(amt) else 1.0
    prior_mean = np.where(np.isnan(prior_mean), global_mean, prior_mean)
    out["amt_ratio_to_card_mean"] = amt / np.maximum(prior_mean, 1e-3)

    out["hour"] = ts.dt.hour.astype(np.float64)
    out["day_of_week"] = ts.dt.dayofweek.astype(np.float64)
    hour = out["hour"].to_numpy()
    out["is_night"] = ((hour >= NIGHT_START) | (hour < NIGHT_END)).astype(np.float64)

    gap = _prior_gap_hours(cc, times_s)
    out["hours_since_last_txn"] = np.where(
        np.isnan(gap), NO_PRIOR_TXN_HOURS, np.minimum(gap, NO_PRIOR_TXN_HOURS)
    )
    out["txn_count_1h"] = _prior_window_count(cc, times_s, 3_600)
    out["txn_count_24h"] = _prior_window_count(cc, times_s, 86_400)

    if TARGET in df.columns:
        out[TARGET] = df[TARGET].astype(np.int8)

    # Exactly the contract, in the contract's order. `validate` rejects extras, and the
    # column order is what keeps the model's feature order stable across rounds.
    cols = list(FEATURES) + ([TARGET] if TARGET in out.columns else [])
    out = out.loc[:, cols]

    if out[list(FEATURES)].isna().to_numpy().any():
        bad = [c for c in FEATURES if out[c].isna().any()]
        raise ValueError(f"feature engineering produced nulls in {bad} -- fix before training")

    return out.reset_index(drop=True)
