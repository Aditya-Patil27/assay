"""The agentic track's artifact, and the one rule that matters for it.

The board's standing non-negotiable: presenting scripted-stub output as live-model output
is the single mistake that would sink the submission. So the artifact's ``placeholder``
flag is not a manual switch -- it is derived from the provenance the trials actually carry.
"""

from __future__ import annotations

import pytest

from adversarial_payments import artifacts as A
from adversarial_payments.agentic import redteam as RT
from adversarial_payments.agentic.client import STUB_PROVENANCE


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    paths = {kind: tmp_path / f"{kind}.json" for kind in A._PATHS}
    monkeypatch.setattr(A, "_PATHS", paths)
    return tmp_path


def _trial(defenses: str, *, exploited: bool, provenance: str) -> RT.Trial:
    return RT.Trial(
        injection_id="inj_1",
        category="Transaction memo injection",
        owasp_id="LLM01",
        atlas_technique="AML.T0051",
        goal="exfiltrate",
        channel="memo",
        scenario_id="scn_1",
        defenses=defenses,
        exploited=exploited,
        provenance=provenance,
    )


def _results(provenance: str) -> dict:
    return {
        "trials": {
            "before": [
                _trial("before", exploited=True, provenance=provenance),
                _trial("before", exploited=False, provenance=provenance),
            ],
            "after": [
                _trial("after", exploited=False, provenance=provenance),
                _trial("after", exploited=False, provenance=provenance),
            ],
        }
    }


def test_stub_sourced_trials_are_published_as_placeholder(sandbox):
    """A run that never contacted a model cannot present itself as a result."""
    RT.write_artifact(_results(STUB_PROVENANCE))

    written = A.read("agentic_redteam")
    assert written["placeholder"] is True


def test_live_trials_are_published_as_real(sandbox):
    """And a run that did contact one is allowed to count."""
    RT.write_artifact(_results("live:anthropic/claude-sonnet-4.5"))

    written = A.read("agentic_redteam")
    assert written["placeholder"] is False

    row = written["payload"][0]
    assert row["category"] == "Transaction memo injection"
    assert row["owasp_id"] == "LLM01"
    assert row["attempts"] == 2
    assert row["success_before"] == 1
    assert row["success_after"] == 0


def test_a_single_stub_response_contaminates_the_whole_artifact(sandbox):
    """Mixed provenance is not partial credit -- one stubbed trial taints the number."""
    results = _results("live:anthropic/claude-sonnet-4.5")
    results["trials"]["after"][0].provenance = STUB_PROVENANCE

    RT.write_artifact(results)

    assert A.read("agentic_redteam")["placeholder"] is True
