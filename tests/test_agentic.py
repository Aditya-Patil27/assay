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


# --- provider profiles --------------------------------------------------------------


def test_each_provider_resolves_its_own_endpoint_key_and_model(monkeypatch):
    """One corpus, several providers, and never a silent fallback to the wrong one.

    The quota that blocks this track is per provider, so the same corpus is run once per
    provider rather than load-balanced across them. Load balancing would spread a single
    reported exploit rate over several models, and a rate that belongs to no model is the
    exact failure this project exists to argue against.
    """
    from adversarial_payments.agentic.client import PROVIDERS, resolve_provider

    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    monkeypatch.setenv("NVIDIA_API_KEY", "nvapi-test")

    assert set(PROVIDERS) == {"openrouter", "nvidia", "groq"}

    groq = resolve_provider("groq")
    assert groq.base_url == "https://api.groq.com/openai/v1"
    assert groq.api_key == "gsk-test"
    assert groq.model

    nvidia = resolve_provider("nvidia")
    assert nvidia.base_url == "https://integrate.api.nvidia.com/v1"
    assert nvidia.api_key == "nvapi-test"


def test_a_provider_without_a_key_fails_loudly(monkeypatch):
    """Rather than falling through to whatever LLM_API_KEY happens to hold."""
    from adversarial_payments.agentic.client import resolve_provider

    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="GROQ_API_KEY"):
        resolve_provider("groq")


def test_each_provider_publishes_to_its_own_artifact_naming_its_model(sandbox):
    """An exploit rate is a property of the model under test, so it travels with one."""
    results = _results("live:meta/llama-3.3-70b-instruct")

    RT.write_artifact(results, provider="nvidia")

    written = A.read("agentic_redteam_nvidia")
    assert written["placeholder"] is False
    assert written["payload"][0]["model"] == "meta/llama-3.3-70b-instruct"
