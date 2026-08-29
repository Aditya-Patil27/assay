"""The contract guard is the plan's highest-risk interface, so it gets tests first."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from adversarial_payments.schema import (
    ATTACKABLE,
    COUPLED,
    FEATURES,
    FROZEN,
    MUTABLE,
    TARGET,
    FeatureSchema,
    SchemaViolation,
)


@pytest.fixture
def frame() -> pd.DataFrame:
    rng = np.random.default_rng(0)
    data = {c: rng.normal(size=200) for c in FEATURES}
    data[TARGET] = rng.integers(0, 2, size=200)
    return pd.DataFrame(data)


def test_tiers_are_disjoint():
    assert not (FROZEN & MUTABLE)
    assert not (FROZEN & COUPLED)
    assert not (MUTABLE & COUPLED)


def test_frozen_features_are_not_attackable():
    assert not (FROZEN & ATTACKABLE)


def test_fit_produces_bounds_for_every_feature(frame):
    schema = FeatureSchema.fit(frame)
    assert set(schema.bounds) == set(FEATURES)
    assert all(lo <= hi for lo, hi in schema.bounds.values())


def test_validate_accepts_a_conforming_frame(frame):
    FeatureSchema.fit(frame).validate(frame, require_target=True)


def test_validate_rejects_a_dropped_feature(frame):
    schema = FeatureSchema.fit(frame)
    with pytest.raises(SchemaViolation, match="missing"):
        schema.validate(frame.drop(columns=["amt"]))


def test_validate_rejects_an_added_feature(frame):
    schema = FeatureSchema.fit(frame)
    with pytest.raises(SchemaViolation, match="unexpected"):
        schema.validate(frame.assign(p1_new_idea=1.0))


def test_validate_rejects_nulls(frame):
    schema = FeatureSchema.fit(frame)
    frame.loc[0, "amt"] = np.nan
    with pytest.raises(SchemaViolation, match="nulls"):
        schema.validate(frame)


def test_roundtrip_through_disk(frame, tmp_path):
    schema = FeatureSchema.fit(frame)
    path = tmp_path / "schema.json"
    schema.save(path)
    assert FeatureSchema.load(path) == schema


def test_coupled_members_resolve_to_their_group(frame):
    schema = FeatureSchema.fit(frame)
    assert schema.group_of("merch_lat") == ("category_enc", "merch_lat", "merch_long", "distance_km")
    assert schema.group_of("amt") is None
