"""Greedy coordinate descent with random restarts -- spec section 4.4.

Tree ensembles have no gradients, so the search is discrete: at each step, try every
in-bounds value of every attacker-controllable coordinate, keep the single move that
most reduces the fraud probability, and stop when the transaction slips under the
detector's threshold or the sparsity budget runs out.

Three rules distinguish this from a generic adversarial-example loop, and all three
exist to keep the reported ASR honest:

1. **Only already-flagged fraud is attacked.** Evading a detector that was going to miss
   the transaction anyway is not an evasion. The attempt set is
   ``is_fraud == 1 AND p(fraud) >= threshold``.
2. **Every candidate is projected before it is scored.** The engine never asks the model
   about a transaction that could not exist; see ``constraints.py``.
3. **The evasion must still be worth running.** ``ConstraintProjector.value_floor``
   holds the charge above a fixed share of the original. Without it the search converges
   on shrinking the amount until the model scores it as legitimate -- which it is -- and
   an ASR of 1.0 gets reported for a strategy that hands back most of the money.

Budget is spent on *coordinates*, not columns: the merchant switch is one attacker
decision that moves four columns, and changing the amount is one that moves three. The
two counts are reported separately and neither is a substitute for the other --
``AttackResult.coords`` is the decisions taken, ``AttackResult.l0`` the columns that
ended up different.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol, Sequence

import numpy as np
import pandas as pd

from ..config import SEED
from ..schema import FEATURES, TARGET, FeatureSchema
from .constraints import MERCHANT_COORD, ConstraintProjector


class SupportsPredictProba(Protocol):
    """P1's contract: column 1 of the returned array is the fraud probability."""

    def predict_proba(self, df: pd.DataFrame) -> np.ndarray: ...


@dataclass(frozen=True)
class AttackConfig:
    threshold: float = 0.5
    #: distinct coordinates the attacker may touch (merchant group counts as one)
    budget: int = 4
    restarts: int = 3
    grid: int = 9
    merchant_samples: int = 24
    max_queries: int = 6000
    #: cap on transactions attacked per round, for wall-clock sanity
    max_attempts: int | None = 400
    #: True runs the naive baseline attacker: no immutability, no coupling, bounds only
    unconstrained: bool = False
    seed: int = SEED


@dataclass
class AttackResult:
    """One attack attempt against one transaction."""

    id: str
    success: bool
    orig_prob: float
    adv_prob: float
    queries: int
    #: feature -> (before, after) for every column that actually moved
    touched: dict[str, tuple[float, float]] = field(default_factory=dict)
    coords: tuple[str, ...] = ()
    l0: int = 0
    l2: float = 0.0
    adv_row: dict[str, float] | None = None


class _Counter:
    """Black-box query budget. One scored candidate row is one query."""

    __slots__ = ("n", "cap")

    def __init__(self, cap: int) -> None:
        self.n = 0
        self.cap = cap

    @property
    def exhausted(self) -> bool:
        return self.n >= self.cap


def _fraud_prob(model: SupportsPredictProba, frame: pd.DataFrame, counter: _Counter) -> np.ndarray:
    proba = np.asarray(model.predict_proba(frame[list(FEATURES)]))
    counter.n += len(frame)
    if proba.ndim != 2 or proba.shape[1] < 2:
        raise ValueError(
            f"predict_proba returned shape {proba.shape}; the contract is (n, 2) with "
            "column 1 = fraud probability"
        )
    return proba[:, 1].astype(float)


def _l0_l2(
    origin: pd.Series, adv: pd.Series, projector: ConstraintProjector
) -> tuple[dict[str, tuple[float, float]], float]:
    """Touched features and a bounds-normalised L2.

    Raw L2 across dollars, hours and degrees of latitude is not a distance anyone can
    interpret, so each delta is divided by that feature's feasible width first.
    """
    touched: dict[str, tuple[float, float]] = {}
    sq = 0.0
    for col in FEATURES:
        before, after = float(origin[col]), float(adv[col])
        if abs(after - before) <= 1e-9:
            continue
        touched[col] = (before, after)
        lo, hi = projector.schema.bounds[col]
        width = float(hi) - float(lo)
        sq += ((after - before) / width) ** 2 if width > 1e-12 else 0.0
    return touched, float(np.sqrt(sq))


def _candidate_frame(
    state: pd.Series,
    origin: pd.Series,
    projector: ConstraintProjector,
    cfg: AttackConfig,
    rng: np.random.Generator,
    allowed: Sequence[str],
) -> tuple[pd.DataFrame, list[str]]:
    """Every legal single-coordinate move from ``state``, already projected."""
    rows: list[pd.Series] = []
    coords: list[str] = []

    for col in allowed:
        if col == MERCHANT_COORD:
            continue
        for value in projector.candidate_values(col, origin, grid=cfg.grid):
            if abs(float(value) - float(state[col])) <= 1e-12:
                continue
            row = state.copy()
            row[col] = float(value)
            rows.append(row)
            coords.append(col)

    frame = (
        pd.DataFrame(rows).reset_index(drop=True)
        if rows
        else pd.DataFrame(columns=list(FEATURES))
    )

    if MERCHANT_COORD in allowed and len(projector.merchants) > 0:
        k = min(cfg.merchant_samples, len(projector.merchants))
        idx = rng.choice(len(projector.merchants), size=k, replace=False)
        block = pd.DataFrame([state] * k).reset_index(drop=True)
        block = projector.switch_merchant(block, idx)
        frame = pd.concat([frame, block], ignore_index=True)
        coords += [MERCHANT_COORD] * k

    if len(frame) == 0:
        return frame, []
    return projector.repair(frame, origin), coords


def _greedy(
    model: SupportsPredictProba,
    origin: pd.Series,
    projector: ConstraintProjector,
    cfg: AttackConfig,
    counter: _Counter,
    rng: np.random.Generator,
    start: pd.Series,
    touched_coords: set[str],
) -> tuple[pd.Series, float, set[str]]:
    """Descend until the transaction passes, the budget is spent, or nothing helps."""
    state = start.copy()
    prob = float(_fraud_prob(model, pd.DataFrame([state]), counter)[0])
    coords = set(touched_coords)

    while prob >= cfg.threshold and not counter.exhausted:
        # An already-touched coordinate is free to move again -- re-tuning a lever the
        # attacker has already pulled costs no additional sparsity.
        remaining = cfg.budget - len(coords)
        allowed = list(coords) if remaining <= 0 else projector.coords()
        if not allowed:
            break

        cand, cand_coords = _candidate_frame(state, origin, projector, cfg, rng, allowed)
        if len(cand) == 0:
            break

        probs = _fraud_prob(model, cand, counter)
        best = int(np.argmin(probs))
        if probs[best] >= prob - 1e-6:
            break  # local minimum; the restart loop is what escapes it

        state = cand.iloc[best].copy()
        prob = float(probs[best])
        coords.add(cand_coords[best])

    return state, prob, coords


def attack_one(
    model: SupportsPredictProba,
    origin: pd.Series,
    projector: ConstraintProjector,
    cfg: AttackConfig,
    *,
    txn_id: str,
    rng: np.random.Generator | None = None,
) -> AttackResult:
    """Attack a single transaction; keep the success that touched the fewest features."""
    rng = rng or np.random.default_rng(cfg.seed)
    counter = _Counter(cfg.max_queries)

    base = origin[list(FEATURES)].astype(float)
    orig_prob = float(_fraud_prob(model, pd.DataFrame([base]), counter)[0])

    best: tuple[pd.Series, float, set[str]] | None = None
    best_key: tuple[int, float] | None = None

    for restart in range(max(cfg.restarts, 1)):
        start, seeded = base.copy(), set()
        if restart > 0:
            # A random feasible kick, so restart != 0 explores a different basin.
            if projector.enforce and rng.random() < 0.5 and len(projector.merchants) > 0:
                idx = rng.integers(0, len(projector.merchants), size=1)
                start = projector.switch_merchant(pd.DataFrame([start]), idx).iloc[0]
                seeded.add(MERCHANT_COORD)
            else:
                pool = [c for c in projector.coords() if c != MERCHANT_COORD]
                col = str(rng.choice(np.array(pool, dtype=object)))
                values = projector.candidate_values(col, base, grid=cfg.grid)
                start[col] = float(rng.choice(values))
                seeded.add(col)
            start = projector.repair(pd.DataFrame([start]), base).iloc[0]

        adv, prob, coords = _greedy(
            model, base, projector, cfg, counter, rng, start, seeded
        )
        if prob < cfg.threshold:
            # Rank restarts by attacker *decisions*, not by columns that moved. A
            # merchant switch is one decision spread over four columns; changing the
            # amount is one decision spread over three. Counting columns makes the
            # amount lever look sparser than it is and biases every reported attack
            # toward it.
            key = (len(coords), prob)
            if best_key is None or key < best_key:
                best, best_key = (adv, prob, coords), key
        if counter.exhausted:
            break

    if best is None:
        return AttackResult(
            id=txn_id,
            success=False,
            orig_prob=orig_prob,
            adv_prob=orig_prob,
            queries=counter.n,
        )

    adv, prob, coords = best
    frame = pd.DataFrame([adv])
    # Belt and braces: the result that leaves this function has been re-checked against
    # all three projections, not merely produced by code that intends to respect them.
    if projector.enforce:
        projector.assert_frozen(frame, base)
        projector.assert_coupled(frame, base)
        projector.assert_consistent(frame)

    touched, l2 = _l0_l2(base, adv, projector)
    return AttackResult(
        id=txn_id,
        success=True,
        orig_prob=orig_prob,
        adv_prob=prob,
        queries=counter.n,
        touched=touched,
        coords=tuple(sorted(coords)),
        l0=len(touched),
        l2=l2,
        adv_row={c: float(adv[c]) for c in FEATURES},
    )


def select_targets(
    model: SupportsPredictProba,
    df: pd.DataFrame,
    cfg: AttackConfig,
    *,
    rng: np.random.Generator | None = None,
) -> pd.DataFrame:
    """The rows worth attacking: true fraud the detector currently catches."""
    frame = df
    if TARGET in df.columns:
        frame = df[df[TARGET] > 0.5]
    if len(frame) == 0:
        return frame

    proba = np.asarray(model.predict_proba(frame[list(FEATURES)]))[:, 1]
    flagged = frame[proba >= cfg.threshold]
    if cfg.max_attempts is not None and len(flagged) > cfg.max_attempts:
        rng = rng or np.random.default_rng(cfg.seed)
        take = rng.choice(len(flagged), size=cfg.max_attempts, replace=False)
        flagged = flagged.iloc[np.sort(take)]
    return flagged


def attack_dataset(
    model: SupportsPredictProba,
    df: pd.DataFrame,
    schema: FeatureSchema,
    cfg: AttackConfig | None = None,
    *,
    projector: ConstraintProjector | None = None,
    progress: Callable[[int, int], Any] | None = None,
) -> list[AttackResult]:
    """Run the attack over a dataset. Entry point -- validates the contract first."""
    cfg = cfg or AttackConfig()

    # Spec section 4.2: if P1 moved the feature set after the freeze, raise here rather
    # than report an ASR computed over the wrong columns.
    schema.validate(df, require_target=TARGET in df.columns)

    projector = projector or ConstraintProjector.fit(df, schema)
    if cfg.unconstrained:
        projector = projector.permissive()
    rng = np.random.default_rng(cfg.seed)
    targets = select_targets(model, df, cfg, rng=rng)

    results: list[AttackResult] = []
    for i, (idx, row) in enumerate(targets.iterrows()):
        results.append(
            attack_one(
                model,
                row,
                projector,
                cfg,
                txn_id=f"txn_{idx}",
                rng=np.random.default_rng(cfg.seed + i),
            )
        )
        if progress is not None and (i + 1) % 50 == 0:
            progress(i + 1, len(targets))
    return results


def adversarial_frame(results: Sequence[AttackResult]) -> pd.DataFrame:
    """Successful evasions as a labelled frame, ready to augment the trainset."""
    rows = [r.adv_row for r in results if r.success and r.adv_row]
    if not rows:
        return pd.DataFrame(columns=list(FEATURES) + [TARGET])
    frame = pd.DataFrame(rows)[list(FEATURES)]
    frame[TARGET] = 1
    return frame
