"""Sparkov-shaped synthetic transactions, for when P1's loader is not on disk yet.

This exists so the attack engine and the red/blue loop could be built and proven on Day 2
without blocking on the dataset download. It is **not** a result generator: any run that
falls back to this frame writes its artifacts with ``placeholder=True``, so a synthetic
ASR can never reach a judge's screen as if it were measured on Sparkov.

Delete this module once ``data/load.py`` is landed and the loop stops importing it.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import SEED
from ..schema import FEATURES, TARGET
from ..attack.constraints import haversine_km

N_CATEGORIES = 14
N_MERCHANTS = 400
NIGHT_HOURS = (22, 23, 0, 1, 2, 3, 4, 5)


def synthetic_features(n: int = 40_000, *, seed: int = SEED) -> pd.DataFrame:
    """A frame with exactly ``schema.FEATURES`` + ``is_fraud``, with real couplings.

    The couplings matter more than the realism: ``log_amt`` really is a function of
    ``amt``, ``distance_km`` really is the haversine of the two coordinate pairs, and
    merchants really are drawn from a finite bank. Those are the properties
    ``constraints.py`` is tested against.
    """
    rng = np.random.default_rng(seed)

    # -- cardholders (the frozen tier) --
    n_cards = max(n // 40, 50)
    card = rng.integers(0, n_cards, size=n)
    home_lat = rng.uniform(25.0, 48.0, size=n_cards)[card]
    home_long = rng.uniform(-122.0, -70.0, size=n_cards)[card]
    age = rng.integers(18, 88, size=n_cards)[card].astype(float)
    gender_enc = rng.integers(0, 2, size=n_cards)[card].astype(float)
    city_pop = np.exp(rng.uniform(6.0, 14.5, size=n_cards))[card]
    state_enc = rng.integers(0, 50, size=n_cards)[card].astype(float)
    job_enc = rng.integers(0, 120, size=n_cards)[card].astype(float)
    card_mean = np.exp(rng.normal(4.0, 0.45, size=n_cards))[card]

    # -- merchants (the coupled tier): a finite bank, drawn from jointly --
    m_cat = rng.integers(0, N_CATEGORIES, size=N_MERCHANTS).astype(float)
    m_lat = rng.uniform(25.0, 48.0, size=N_MERCHANTS)
    m_long = rng.uniform(-122.0, -70.0, size=N_MERCHANTS)
    pick = rng.integers(0, N_MERCHANTS, size=n)
    category_enc, merch_lat, merch_long = m_cat[pick], m_lat[pick], m_long[pick]
    distance_km = haversine_km(home_lat, home_long, merch_lat, merch_long)

    # -- the mutable tier --
    amt = np.round(np.exp(rng.normal(np.log(card_mean), 0.7)), 2)
    hour = rng.integers(0, 24, size=n).astype(float)
    day_of_week = rng.integers(0, 7, size=n).astype(float)
    is_night = np.isin(hour.astype(int), NIGHT_HOURS).astype(float)
    hours_since_last_txn = np.round(rng.exponential(11.0, size=n), 3)
    txn_count_1h = rng.poisson(0.6, size=n).astype(float)
    txn_count_24h = rng.poisson(3.2, size=n).astype(float)

    amt_ratio = amt / card_mean
    log_amt = np.log1p(amt)

    # -- label: a nonlinear, interacting rule so a tree model has something to learn --
    risky_category = np.isin(category_enc.astype(int), (2, 5, 11, 13)).astype(float)
    logit = (
        -10.4
        + 1.35 * np.log1p(amt_ratio)
        + 0.9 * is_night
        + 0.0016 * distance_km
        + 0.75 * risky_category
        + 0.55 * txn_count_1h
        + 0.10 * txn_count_24h
        - 0.045 * hours_since_last_txn
        + 0.8 * risky_category * is_night
        + rng.normal(0.0, 0.5, size=n)
    )
    is_fraud = (rng.random(n) < 1.0 / (1.0 + np.exp(-logit))).astype(int)

    frame = pd.DataFrame(
        {
            "age": age,
            "gender_enc": gender_enc,
            "city_pop": city_pop,
            "home_lat": home_lat,
            "home_long": home_long,
            "state_enc": state_enc,
            "job_enc": job_enc,
            "category_enc": category_enc,
            "merch_lat": merch_lat,
            "merch_long": merch_long,
            "distance_km": distance_km,
            "amt": amt,
            "log_amt": log_amt,
            "amt_ratio_to_card_mean": amt_ratio,
            "hour": hour,
            "day_of_week": day_of_week,
            "is_night": is_night,
            "hours_since_last_txn": hours_since_last_txn,
            "txn_count_1h": txn_count_1h,
            "txn_count_24h": txn_count_24h,
            TARGET: is_fraud,
        }
    )
    return frame[list(FEATURES) + [TARGET]]
