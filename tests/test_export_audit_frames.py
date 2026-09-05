"""The audit console shows which of our numbers something ran for. That mapping is one
function, and it must not quietly promote an unflagged artifact to grounded."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from export_audit_frames import build_frames  # noqa: E402


def _write(p: Path, doc: dict) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc), encoding="utf-8")


@pytest.fixture
def artifacts(tmp_path: Path) -> Path:
    root = tmp_path / "artifacts"
    _write(root / "scorecard.json", {
        "kind": "scorecard", "placeholder": False, "git_sha": "abc1234",
        "created_at": "2026-08-31T10:18:36+00:00",
        "payload": [{"surface": "Tabular detector", "attack_success_before": 1.0,
                     "attack_success_after": 1.0, "defense_cost": "PR-AUC 0.947 -> 0.932"}],
    })
    _write(root / "attack" / "dosage_sweep.json", {"kind": "dosage_sweep", "rows": 1852394, "arms": [1, 2, 3]})
    _write(root / "agentic" / "cache" / "deadbeef.json", {"key": "x", "request": {}, "response": {}})
    _write(root / "detect" / "cache" / "kept.json", {"kind": "kept", "placeholder": False, "git_sha": "d", "created_at": "2026-09-01T00:00:00+00:00", "payload": {"x": 1}})
    return root


def test_flagged_is_grounded_and_unflagged_is_prior(artifacts: Path) -> None:
    frames = build_frames(artifacts)
    by_id = {m["message_id"]: m for m in frames["messages"]}
    assert set(by_id) == {"scorecard.json", "detect/cache/kept.json", "attack/dosage_sweep.json"}  # cache skipped

    sc = by_id["scorecard.json"]
    assert sc["task_status"] == "complete"
    assert sc["claims"][0]["evidence_type"] == "test_output"
    assert "1.000 -> 1.000" in sc["claims"][0]["claim"]
    assert "abc1234" in sc["claims"][0]["evidence"]

    ds = by_id["attack/dosage_sweep.json"]
    assert ds["task_status"] == "uncertain"
    assert ds["claims"][0]["evidence_type"] == "model_prior"


def test_ordering_and_shape(artifacts: Path) -> None:
    frames = build_frames(artifacts)
    ids = [m["message_id"] for m in frames["messages"]]
    assert ids[-1] == "attack/dosage_sweep.json"  # unflagged rows come last
    assert [m["lamport"] for m in frames["messages"]] == [1, 2, 3]
    for m in frames["messages"]:
        assert m["type"] == "message" and m["sender"] == "assay" and m["receiver"] == "reviewer"
        assert m["performative"] == "task_result"
        assert all(c["claim"].strip() for c in m["claims"])
    assert {n["agent"] for n in frames["nodes"]} == {"assay", "reviewer"}
