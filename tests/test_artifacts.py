"""Keep the Python writers and the TypeScript readers describing the same thing.

`artifacts.py` and `web/lib/types.ts` are one contract in two languages. Nothing in either
toolchain notices when they drift: Python keeps writing, TypeScript keeps compiling, and the
dashboard renders `undefined` for a field somebody renamed. So the drift is caught here.
"""

from __future__ import annotations

import dataclasses
import json
import re

import pytest

from adversarial_payments import artifacts as A
from adversarial_payments.config import ROOT

TYPES_TS = ROOT / "web" / "lib" / "types.ts"

# Python dataclass -> the TypeScript interface that mirrors it.
MIRRORED = {
    "ShapFeature": A.ShapFeature,
    "DetectRound": A.DetectRound,
    "AttackRound": A.AttackRound,
    "FeatureDelta": A.FeatureDelta,
    "AttackExample": A.AttackExample,
    "AgenticCategory": A.AgenticCategory,
    "ScorecardRow": A.ScorecardRow,
    "GraphNode": A.GraphNode,
    "GraphEdge": A.GraphEdge,
    "Graph": A.Graph,
}


def ts_interfaces() -> dict[str, set[str]]:
    """Field names per exported interface in types.ts."""
    source = TYPES_TS.read_text(encoding="utf-8")
    # Strip block comments so a documented field name inside /** */ isn't picked up.
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)

    out: dict[str, set[str]] = {}
    for match in re.finditer(r"export interface (\w+)(?:<[^>]*>)?\s*\{(.*?)\n\}", source, re.DOTALL):
        name, body = match.group(1), match.group(2)
        fields = set(re.findall(r"^\s*(\w+)\??\s*:", body, re.MULTILINE))
        out[name] = fields
    return out


@pytest.fixture(scope="module")
def interfaces() -> dict[str, set[str]]:
    assert TYPES_TS.exists(), f"missing {TYPES_TS}"
    return ts_interfaces()


def test_types_ts_declares_every_mirrored_interface(interfaces):
    missing = sorted(set(MIRRORED) - set(interfaces))
    assert not missing, f"interfaces absent from web/lib/types.ts: {missing}"


@pytest.mark.parametrize("name", sorted(MIRRORED))
def test_fields_match(name, interfaces):
    py = {f.name for f in dataclasses.fields(MIRRORED[name])}
    ts = interfaces[name]
    assert py == ts, (
        f"{name} has drifted.\n"
        f"  only in artifacts.py:   {sorted(py - ts)}\n"
        f"  only in web/lib/types.ts: {sorted(ts - py)}"
    )


def test_schema_version_matches():
    ts_version = re.search(
        r"SCHEMA_VERSION\s*=\s*(\d+)", TYPES_TS.read_text(encoding="utf-8")
    )
    assert ts_version, "SCHEMA_VERSION not found in web/lib/types.ts"
    assert int(ts_version.group(1)) == A.SCHEMA_VERSION


def test_envelope_roundtrip(tmp_path, monkeypatch):
    rows = [
        A.ScorecardRow(
            surface="Tabular detector",
            attack_success_before=0.7,
            attack_success_after=0.1,
            defense_cost="PR-AUC -1.8%",
            primary_metric="Attack Success Rate",
        )
    ]
    monkeypatch.setitem(A._PATHS, "scorecard", tmp_path / "scorecard.json")

    path = A.write("scorecard", rows, placeholder=True)
    data = json.loads(path.read_text(encoding="utf-8"))

    assert data["placeholder"] is True
    assert data["schema_version"] == A.SCHEMA_VERSION
    assert data["payload"][0]["surface"] == "Tabular detector"
    assert A.read("scorecard")["payload"] == data["payload"]


def test_read_rejects_a_future_schema_version(tmp_path, monkeypatch):
    dest = tmp_path / "scorecard.json"
    dest.write_text(json.dumps({"schema_version": 99, "payload": []}), encoding="utf-8")
    monkeypatch.setitem(A._PATHS, "scorecard", dest)

    with pytest.raises(ValueError, match="schema v99"):
        A.read("scorecard")


def test_unknown_kind_is_rejected():
    with pytest.raises(KeyError, match="unknown artifact kind"):
        A.path_for("not_a_real_artifact")


def test_latency_is_written_through_the_provenance_envelope(tmp_path, monkeypatch):
    """The sub-50ms claim must sit inside the machinery that guarantees a number is real.

    latency.json was written with a plain json.dump: no placeholder flag, no git_sha, no
    created_at, and unreadable by the dashboard's loader. The one claim we make about
    production viability was therefore the one claim standing outside the audit that makes
    every other number checkable.
    """
    from adversarial_payments.serving.latency import LatencyReport, write_latency

    paths = {kind: tmp_path / f"{kind}.json" for kind in A._PATHS}
    monkeypatch.setattr(A, "_PATHS", paths)

    report = LatencyReport(
        p50_ms=1.0, p95_ms=2.0, p99_ms=3.0, mean_ms=1.2, max_ms=4.0,
        n_samples=1000, backend="onnxruntime",
    )
    write_latency(report)

    env = A.read("latency")
    assert env["placeholder"] is False
    assert env["git_sha"] and env["created_at"]
    assert env["payload"]["n_samples"] == 1000
    assert env["payload"]["backend"] == "onnxruntime"
