"""Single-transaction inference latency.

A fraud model that needs 300 ms per authorisation does not go into a payment network at
any accuracy, so the number matters as much as PR-AUC. What is measured here is
deliberately the *pessimistic* path: one transaction at a time, one DataFrame per call,
the way an online scorer receives them -- not a batched ``predict_proba`` over 100k rows,
which would report a per-row cost roughly two orders of magnitude lower and would be a
number we could not defend.

Reported as p50 / p95 / p99 because tail latency is what breaches an authorisation SLA,
not the mean.
"""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import ARTIFACTS
from ..schema import FEATURES

LATENCY_PATH: Path = ARTIFACTS / "latency.json"

DEFAULT_N = 300
DEFAULT_WARMUP = 30


@dataclass
class LatencyReport:
    """Per-transaction scoring latency, milliseconds."""

    p50_ms: float
    p95_ms: float
    p99_ms: float
    mean_ms: float
    max_ms: float
    n_samples: int
    mode: str = "single_transaction"
    backend: str = "unknown"

    def as_dict(self) -> dict:
        return asdict(self)


def measure_latency(
    model,
    df: pd.DataFrame,
    n: int = DEFAULT_N,
    warmup: int = DEFAULT_WARMUP,
    seed: int = 0,
) -> LatencyReport:
    """Time ``n`` single-row ``predict_proba`` calls drawn from ``df``.

    ``warmup`` calls are discarded first: the first prediction pays for lazy backend
    initialisation and would otherwise dominate the tail percentiles.
    """
    X = df.loc[:, list(FEATURES)]
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(X), size=warmup + n)

    # Pre-slice so DataFrame construction is not inside the timed region.
    rows = [X.iloc[[i]] for i in idx]

    for row in rows[:warmup]:
        model.predict_proba(row)

    timings = np.empty(n, dtype=np.float64)
    for k, row in enumerate(rows[warmup:]):
        t0 = time.perf_counter()
        model.predict_proba(row)
        timings[k] = (time.perf_counter() - t0) * 1000.0

    return LatencyReport(
        p50_ms=float(np.percentile(timings, 50)),
        p95_ms=float(np.percentile(timings, 95)),
        p99_ms=float(np.percentile(timings, 99)),
        mean_ms=float(timings.mean()),
        max_ms=float(timings.max()),
        n_samples=int(n),
        backend=str(getattr(model, "backend", "unknown")),
    )


def write_latency(report: LatencyReport) -> Path:
    """Publish through ``artifacts.write`` so the number carries provenance.

    This used to be a plain ``json.dump``, which left the one claim we make about
    production viability standing outside the machinery that makes every other number
    checkable: no ``placeholder`` flag, no ``git_sha``, no ``created_at``, and invisible
    to the dashboard's loader. A latency figure a reader cannot audit is not better than
    no latency figure, so it now goes through the same envelope as everything else.
    """
    from .. import artifacts as A

    return A.write("latency", report, placeholder=False)
