"""The three projections, straight out of ``schema.py``.

Spec section 4.2 is blunt about why this file exists: an ASR measured over transactions
that could never have happened is a number we would have to retract under questioning.
So every candidate the engine considers passes through :class:`ConstraintProjector`
before it is ever shown to the model.

    IMMUTABILITY  FROZEN features are restored from the origin row and then *asserted*
                  equal.  Intent is not a control; ``assert_frozen`` raises.

    COUPLING      ``category_enc, merch_lat, merch_long, distance_km`` move together or
                  not at all.  The only legal move is "switch to a merchant that exists
                  in the data" -- the four values are resampled jointly from
                  :class:`MerchantBank` and ``distance_km`` is recomputed from the
                  victim's (frozen) home coordinates.  They are never perturbed
                  independently, because independent perturbation is precisely what
                  makes an ASR meaningless.

    FEASIBILITY   Values clip to ``schema.bounds``, integer-valued features stay
                  integral, and the derived features stay derived:
                  ``log_amt`` from ``amt``, ``amt_ratio_to_card_mean`` from ``amt`` and
                  the card's historical mean, ``is_night`` from ``hour``,
                  ``distance_km`` from the two coordinate pairs.

Derived features are never search coordinates.  The attacker moves a *driver* (amt,
hour, the merchant choice) and the projector recomputes everything downstream, so a
repaired candidate is internally consistent by construction rather than by luck.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace

import numpy as np
import pandas as pd

from ..config import SEED
from ..schema import FEATURES, FeatureSchema

EARTH_RADIUS_KM = 6371.0088

#: Features whose value is a function of other features. The engine never searches over
#: these directly; :meth:`ConstraintProjector.repair` recomputes them.
DERIVED: frozenset[str] = frozenset(
    {"log_amt", "amt_ratio_to_card_mean", "is_night", "distance_km"}
)

#: Attacker-controllable features that are integer-valued in the source data.
INTEGRAL: frozenset[str] = frozenset(
    {"category_enc", "hour", "day_of_week", "is_night", "txn_count_1h", "txn_count_24h"}
)

#: The coordinates a greedy step may move: mutable, minus the derived ones. The coupled
#: group is *not* here -- it is one atomic "which merchant do I hit?" decision instead.
SEARCH_COORDS: tuple[str, ...] = (
    "amt",
    "hour",
    "day_of_week",
    "hours_since_last_txn",
    "txn_count_1h",
    "txn_count_24h",
)

MERCHANT_COORD = "__merchant__"

_DEFAULT_NIGHT_HOURS = frozenset({22, 23, 0, 1, 2, 3, 4, 5})


class ConstraintViolation(RuntimeError):
    """Raised when a candidate breaks a projection that must hold by construction."""


def haversine_km(
    lat1: np.ndarray, lon1: np.ndarray, lat2: np.ndarray, lon2: np.ndarray
) -> np.ndarray:
    """Great-circle distance in kilometres between two arrays of coordinates."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dlam = np.radians(np.asarray(lon2) - np.asarray(lon1))
    a = np.sin(dphi / 2.0) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlam / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


@dataclass(frozen=True)
class MerchantBank:
    """Merchants that actually exist in the data.

    A merchant switch may only land on one of these rows. Sampling
    ``(category_enc, merch_lat, merch_long)`` jointly from observed transactions is what
    keeps the coupled group honest: there is no way to express "a grocery store at these
    coordinates" unless the dataset contains one.
    """

    category: np.ndarray
    lat: np.ndarray
    long: np.ndarray

    def __len__(self) -> int:
        return int(self.category.shape[0])

    @classmethod
    def fit(
        cls, df: pd.DataFrame, *, max_merchants: int = 3000, seed: int = SEED
    ) -> "MerchantBank":
        cols = ["category_enc", "merch_lat", "merch_long"]
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise ConstraintViolation(f"cannot build merchant bank, columns absent: {missing}")

        uniq = df[cols].round({"category_enc": 0, "merch_lat": 4, "merch_long": 4})
        uniq = uniq.drop_duplicates().to_numpy(dtype=float)
        if uniq.shape[0] == 0:
            raise ConstraintViolation("merchant bank is empty")
        if uniq.shape[0] > max_merchants:
            rng = np.random.default_rng(seed)
            uniq = uniq[rng.choice(uniq.shape[0], size=max_merchants, replace=False)]
        return cls(category=uniq[:, 0], lat=uniq[:, 1], long=uniq[:, 2])


@dataclass(frozen=True)
class ConstraintProjector:
    """Projects arbitrary candidate rows back onto the feasible transaction manifold."""

    schema: FeatureSchema
    merchants: MerchantBank
    night_hours: frozenset[int] = field(default=_DEFAULT_NIGHT_HOURS)
    use_log1p: bool = True
    distance_scale: float = 1.0
    #: False builds the *unconstrained baseline* attacker of spec section 4.2 -- every
    #: column perturbed independently, frozen attributes included. Its ASR is the number
    #: the literature usually reports on tabular data, and comparing the two is how we
    #: show that number is inflated by transactions that cannot exist.
    enforce: bool = True
    #: Fraction of the original charge an evasion must still collect. The third
    #: feasibility statement, and the one that is economic rather than statistical: a
    #: detector trained on amount will always score a small charge as legitimate,
    #: because it *is*. Without this the greedy search converges on "steal an eighth as
    #: much", reports ASR = 1.0, and measures the defense working as though it failed.
    value_floor: float = 0.5

    def permissive(self) -> "ConstraintProjector":
        """The same projector with the immutability and coupling projections removed."""
        return replace(self, enforce=False)

    def coords(self) -> list[str]:
        """Coordinates a greedy step may move under this projector's rules."""
        if self.enforce:
            return [*SEARCH_COORDS, MERCHANT_COORD]
        # The naive attacker: every column is its own knob, derived and frozen included.
        return list(FEATURES)

    # -- construction ---------------------------------------------------------------

    @classmethod
    def fit(
        cls,
        df: pd.DataFrame,
        schema: FeatureSchema | None = None,
        *,
        max_merchants: int = 3000,
        seed: int = SEED,
    ) -> "ConstraintProjector":
        """Learn the coupling rules from the data instead of assuming P1's conventions.

        ``log_amt`` may be ``log`` or ``log1p``; ``distance_km`` may be kilometres or
        miles; ``is_night`` may use any hour window. Guessing wrong would silently
        corrupt every candidate, so each rule is measured against the real frame.
        """
        schema = schema or FeatureSchema.fit(df)
        bank = MerchantBank.fit(df, max_merchants=max_merchants, seed=seed)

        amt = df["amt"].to_numpy(dtype=float)
        log_amt = df["log_amt"].to_numpy(dtype=float)
        pos = amt > 0
        err1p = float(np.nanmedian(np.abs(np.log1p(amt[pos]) - log_amt[pos]))) if pos.any() else 0.0
        err = float(np.nanmedian(np.abs(np.log(amt[pos]) - log_amt[pos]))) if pos.any() else 1.0

        night_hours = frozenset(
            int(h) for h in df.loc[df["is_night"] > 0.5, "hour"].round().unique()
        ) or _DEFAULT_NIGHT_HOURS

        hav = haversine_km(
            df["home_lat"].to_numpy(dtype=float),
            df["home_long"].to_numpy(dtype=float),
            df["merch_lat"].to_numpy(dtype=float),
            df["merch_long"].to_numpy(dtype=float),
        )
        ok = hav > 1e-6
        scale = float(np.median(df.loc[ok, "distance_km"].to_numpy(dtype=float) / hav[ok])) if (
            ok.any()
        ) else 1.0
        if not np.isfinite(scale) or scale <= 0:
            scale = 1.0

        return cls(
            schema=schema,
            merchants=bank,
            night_hours=night_hours,
            use_log1p=err1p <= err,
            distance_scale=scale,
        )

    # -- helpers --------------------------------------------------------------------

    def _bounds(self, col: str) -> tuple[float, float]:
        lo, hi = self.schema.bounds[col]
        return (float(lo), float(hi)) if lo <= hi else (float(hi), float(lo))

    def _to_amt(self, log_value: float) -> float:
        return float(np.expm1(log_value)) if self.use_log1p else float(np.exp(log_value))

    def _from_amt(self, amt: np.ndarray) -> np.ndarray:
        safe = np.clip(amt, 1e-9 if not self.use_log1p else 0.0, None)
        return np.log1p(safe) if self.use_log1p else np.log(np.clip(safe, 1e-9, None))

    def amt_range(self, origin: pd.Series) -> tuple[float, float]:
        """Feasible ``amt`` window for one transaction.

        The intersection of four separate feasibility statements: the raw ``amt``
        bound, the bound implied by ``log_amt``, the bound implied by
        ``amt_ratio_to_card_mean`` given this card's historical mean spend, and
        :attr:`value_floor` -- the share of the original charge the attack must still
        collect. Enforcing feasibility on the driver is what keeps the derived features
        in range without having to clip them and break the coupling.

        The first three are statistical: they say what a payment network has seen. The
        fourth is economic: it says what a fraudster would bother doing. Only the fourth
        rules out shrinking the charge until it scores as legitimate, which is not an
        evasion but a surrender.
        """
        lo, hi = self._bounds("amt")
        llo, lhi = self._bounds("log_amt")
        lo = max(lo, self._to_amt(llo))
        hi = min(hi, self._to_amt(lhi))

        amt0 = float(origin["amt"])
        ratio0 = float(origin["amt_ratio_to_card_mean"])
        if amt0 > 0 and ratio0 > 0:
            card_mean = amt0 / ratio0
            rlo, rhi = self._bounds("amt_ratio_to_card_mean")
            lo = max(lo, rlo * card_mean)
            hi = min(hi, rhi * card_mean)

        if not (np.isfinite(lo) and np.isfinite(hi)) or lo >= hi:
            lo, hi = self._bounds("amt")

        if self.enforce and self.value_floor > 0.0:
            floor = self.value_floor * amt0
            lo = max(lo, floor)
            if lo > hi:
                # Nothing is both statistically feasible and still worth stealing. The
                # original charge always satisfies the floor, so the amount is pinned.
                return float(amt0), float(amt0)

        return float(max(lo, 0.0)), float(hi)

    # -- the projections ------------------------------------------------------------

    def repair(self, cand: pd.DataFrame, origin: pd.Series) -> pd.DataFrame:
        """Project ``cand`` onto the feasible set, given the transaction it came from.

        Order matters: restore what cannot move, clip what can, then recompute what is
        a function of the rest.
        """
        out = cand.copy()

        if not self.enforce:
            # Unconstrained baseline: bounds only. Nothing is restored, nothing is
            # coupled -- exactly the attacker this design argues is measuring fiction.
            for col in FEATURES:
                blo, bhi = self._bounds(col)
                out[col] = out[col].astype(float).clip(blo, bhi)
            for col in INTEGRAL:
                out[col] = np.rint(out[col].astype(float))
            return out[list(FEATURES)]

        # 1. immutability -- frozen values come back from the origin, unconditionally.
        for col in self.schema.frozen:
            out[col] = float(origin[col])

        # 2. feasibility on the drivers.
        lo, hi = self.amt_range(origin)
        out["amt"] = out["amt"].astype(float).clip(lo, hi)
        for col in SEARCH_COORDS:
            if col == "amt":
                continue
            blo, bhi = self._bounds(col)
            out[col] = out[col].astype(float).clip(blo, bhi)
        for col in INTEGRAL:
            if col in out.columns and col not in DERIVED:
                out[col] = np.rint(out[col].astype(float))

        # 3. the derived features follow their drivers.
        amt = out["amt"].to_numpy(dtype=float)
        out["log_amt"] = self._from_amt(amt)

        amt0 = float(origin["amt"])
        ratio0 = float(origin["amt_ratio_to_card_mean"])
        if amt0 > 0:
            out["amt_ratio_to_card_mean"] = ratio0 * amt / amt0
        else:
            out["amt_ratio_to_card_mean"] = ratio0

        hours = np.rint(out["hour"].to_numpy(dtype=float)).astype(int)
        out["is_night"] = np.isin(hours, np.fromiter(self.night_hours, dtype=int)).astype(float)

        out["distance_km"] = self.distance_scale * haversine_km(
            out["home_lat"].to_numpy(dtype=float),
            out["home_long"].to_numpy(dtype=float),
            out["merch_lat"].to_numpy(dtype=float),
            out["merch_long"].to_numpy(dtype=float),
        )
        return out[list(FEATURES)]

    def switch_merchant(self, cand: pd.DataFrame, merchant_idx: np.ndarray) -> pd.DataFrame:
        """Move the whole coupled group at once, to real merchants only.

        ``distance_km`` is deliberately *not* set here -- :meth:`repair` derives it, so
        there is exactly one place in the codebase where the coupled group can change.
        """
        idx = np.asarray(merchant_idx, dtype=int)
        if idx.shape[0] != len(cand):
            raise ConstraintViolation("merchant index length does not match candidate frame")
        out = cand.copy()
        out["category_enc"] = self.merchants.category[idx]
        out["merch_lat"] = self.merchants.lat[idx]
        out["merch_long"] = self.merchants.long[idx]
        return out

    def assert_frozen(self, cand: pd.DataFrame, origin: pd.Series, *, tol: float = 1e-9) -> None:
        """Hard check that the immutability projection held. Called on every result."""
        for col in sorted(self.schema.frozen):
            delta = np.abs(cand[col].to_numpy(dtype=float) - float(origin[col]))
            if np.any(delta > tol):
                raise ConstraintViolation(
                    f"FROZEN feature {col!r} moved by up to {float(delta.max()):.6g} -- "
                    "the immutability projection was bypassed."
                )

    def assert_coupled(
        self, cand: pd.DataFrame, origin: pd.Series | None = None, *, tol: float = 1e-3
    ) -> None:
        """Hard check that every row's coupled group is a merchant that exists.

        This is the check that makes the ASR mean something: if a row's category and
        coordinates are not a triple observed in the data, the attack invented a
        merchant and the evasion is fictional.

        ``origin``'s own merchant is always legal -- the bank is subsampled for search
        speed, and a transaction is not fictional merely because its real merchant did
        not make the sample.
        """
        bank = np.column_stack(
            [self.merchants.category, self.merchants.lat, self.merchants.long]
        )
        if origin is not None:
            bank = np.vstack(
                [
                    bank,
                    np.array(
                        [
                            float(origin["category_enc"]),
                            float(origin["merch_lat"]),
                            float(origin["merch_long"]),
                        ]
                    ),
                ]
            )
        got = cand[["category_enc", "merch_lat", "merch_long"]].to_numpy(dtype=float)
        for i, row in enumerate(got):
            if not np.any(np.all(np.abs(bank - row) <= tol, axis=1)):
                raise ConstraintViolation(
                    f"row {i} uses merchant {row.tolist()} which does not exist in the data -- "
                    "the coupled group was perturbed independently."
                )

    def assert_consistent(self, cand: pd.DataFrame, *, tol: float = 1e-4) -> None:
        """Hard check on the internal couplings the feasibility projection promises."""
        amt = cand["amt"].to_numpy(dtype=float)
        if np.max(np.abs(cand["log_amt"].to_numpy(dtype=float) - self._from_amt(amt))) > tol:
            raise ConstraintViolation("log_amt is inconsistent with amt")

        hours = np.rint(cand["hour"].to_numpy(dtype=float)).astype(int)
        want = np.isin(hours, np.fromiter(self.night_hours, dtype=int)).astype(float)
        if np.max(np.abs(cand["is_night"].to_numpy(dtype=float) - want)) > tol:
            raise ConstraintViolation("is_night is inconsistent with hour")

        want_d = self.distance_scale * haversine_km(
            cand["home_lat"].to_numpy(dtype=float),
            cand["home_long"].to_numpy(dtype=float),
            cand["merch_lat"].to_numpy(dtype=float),
            cand["merch_long"].to_numpy(dtype=float),
        )
        if np.max(np.abs(cand["distance_km"].to_numpy(dtype=float) - want_d)) > 1e-3:
            raise ConstraintViolation("distance_km is inconsistent with the coordinates")

    # -- candidate generation -------------------------------------------------------

    def candidate_values(self, col: str, origin: pd.Series, *, grid: int = 9) -> np.ndarray:
        """In-bounds values the greedy step may try for one search coordinate."""
        if col == "amt":
            lo, hi = self.amt_range(origin)
            amt0 = max(float(origin["amt"]), 1e-6)
            mult = np.array([0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1.1, 1.3, 1.6, 2.2, 3.5])
            vals = np.concatenate([amt0 * mult, np.linspace(lo, hi, grid)])
            return np.unique(np.clip(vals, lo, hi))

        lo, hi = self._bounds(col)
        if col in INTEGRAL:
            span = np.arange(np.floor(lo), np.floor(hi) + 1.0)
            if span.size == 0:
                span = np.array([np.floor(lo)])
            if span.size > 24:
                span = np.unique(np.rint(np.linspace(lo, hi, 24)))
            return span
        return np.unique(np.linspace(lo, hi, max(grid, 3)))
