"""The P1 -> P2 contract.

Strategy doc section 4 named the feature handoff the single highest-risk dependency in the
plan: if P1 changes features after the freeze, P2's attack engine silently reports a
meaningless ASR. So the contract is an importable object with a ``validate`` that raises,
not a paragraph in a document.

Three tiers, not two. The strategy doc's feasibility projection requires that
"inter-feature dependencies hold", and on Sparkov that is a real constraint: an attacker
who picks a different merchant changes the category, the terminal geography and the
cardholder-to-terminal distance *simultaneously*. Perturbing those independently would
produce transactions that cannot exist, and an ASR computed over impossible transactions
is worthless.

    FROZEN   victim/account attributes the attacker cannot forge
    COUPLED  merchant choice -- these move together or not at all
    MUTABLE  levers the attacker controls directly
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Mapping

if TYPE_CHECKING:
    import pandas as pd

TARGET = "is_fraud"

# --- Tier 1: immutable -------------------------------------------------------------
# Cardholder demographics and home geography. A fraudster using stolen credentials
# inherits these; no amount of attack cleverness alters the victim's age or city.
FROZEN: frozenset[str] = frozenset(
    {
        "age",
        "gender_enc",
        "city_pop",
        "home_lat",
        "home_long",
        "state_enc",
        "job_enc",
    }
)

# --- Tier 2: coupled ---------------------------------------------------------------
# One decision -- "which merchant do I hit?" -- sets all four at once.
COUPLED_GROUPS: tuple[tuple[str, ...], ...] = (
    ("category_enc", "merch_lat", "merch_long", "distance_km"),
)

# --- Tier 3: mutable ---------------------------------------------------------------
# Amount, timing and pacing: what a carding operation actually tunes.
MUTABLE: frozenset[str] = frozenset(
    {
        "amt",
        "log_amt",
        "amt_ratio_to_card_mean",
        "hour",
        "day_of_week",
        "is_night",
        "hours_since_last_txn",
        "txn_count_1h",
        "txn_count_24h",
    }
)

COUPLED: frozenset[str] = frozenset(c for g in COUPLED_GROUPS for c in g)

# Attacker-controllable surface = what the engine may search over.
ATTACKABLE: frozenset[str] = MUTABLE | COUPLED

FEATURES: tuple[str, ...] = tuple(sorted(FROZEN | COUPLED | MUTABLE))


class SchemaViolation(RuntimeError):
    """Raised when a dataframe does not match the frozen contract."""


@dataclass(frozen=True)
class FeatureSchema:
    """Frozen feature contract, with per-feature feasibility bounds.

    ``bounds`` are derived from the training split by :meth:`fit` and then written to
    disk. They are the feasibility projection: an attack that pushes a feature outside
    these has left the space of transactions the payment network would ever see.
    """

    columns: tuple[str, ...]
    frozen: frozenset[str]
    coupled_groups: tuple[tuple[str, ...], ...]
    mutable: frozenset[str]
    bounds: Mapping[str, tuple[float, float]]

    # -- construction ---------------------------------------------------------------

    @classmethod
    def fit(cls, df: "pd.DataFrame", quantile: float = 0.005) -> "FeatureSchema":
        """Derive feasibility bounds from a training split.

        Uses inner quantiles rather than min/max so a single outlier transaction cannot
        hand the attacker an enormous legal range.
        """
        missing = [c for c in FEATURES if c not in df.columns]
        if missing:
            raise SchemaViolation(f"cannot fit schema, columns absent from frame: {missing}")

        bounds = {
            col: (
                float(df[col].quantile(quantile)),
                float(df[col].quantile(1.0 - quantile)),
            )
            for col in FEATURES
        }
        return cls(
            columns=FEATURES,
            frozen=FROZEN,
            coupled_groups=COUPLED_GROUPS,
            mutable=MUTABLE,
            bounds=bounds,
        )

    # -- persistence ----------------------------------------------------------------

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "columns": list(self.columns),
            "frozen": sorted(self.frozen),
            "coupled_groups": [list(g) for g in self.coupled_groups],
            "mutable": sorted(self.mutable),
            "bounds": {k: list(v) for k, v in self.bounds.items()},
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "FeatureSchema":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            columns=tuple(payload["columns"]),
            frozen=frozenset(payload["frozen"]),
            coupled_groups=tuple(tuple(g) for g in payload["coupled_groups"]),
            mutable=frozenset(payload["mutable"]),
            bounds={k: (float(v[0]), float(v[1])) for k, v in payload["bounds"].items()},
        )

    # -- the guard ------------------------------------------------------------------

    def validate(self, df: "pd.DataFrame", *, require_target: bool = False) -> None:
        """Raise if ``df`` has drifted from the contract.

        Called at the entry point of every attack routine. Failing loudly here is the
        whole point: a silently mismatched frame produces an ASR number that looks
        plausible and means nothing.
        """
        present = set(df.columns)

        missing = [c for c in self.columns if c not in present]
        if missing:
            raise SchemaViolation(
                f"{len(missing)} contracted feature(s) missing: {missing[:10]}"
                " -- P1 changed the feature set after the freeze."
            )

        if require_target and TARGET not in present:
            raise SchemaViolation(f"target column {TARGET!r} missing")

        extra = present - set(self.columns) - {TARGET}
        if extra:
            raise SchemaViolation(
                f"unexpected column(s) not in the contract: {sorted(extra)[:10]}"
                " -- add them to schema.py and re-freeze, or drop them."
            )

        nulls = [c for c in self.columns if df[c].isna().any()]
        if nulls:
            raise SchemaViolation(f"nulls present in contracted feature(s): {nulls[:10]}")

    def attackable(self) -> frozenset[str]:
        return self.mutable | frozenset(c for g in self.coupled_groups for c in g)

    def group_of(self, column: str) -> tuple[str, ...] | None:
        """Return the coupled group ``column`` belongs to, if any."""
        for group in self.coupled_groups:
            if column in group:
                return group
        return None
