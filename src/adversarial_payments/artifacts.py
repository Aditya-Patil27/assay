"""The pipeline -> frontend contract.

Spec section 4.3 decouples P4 from P1/P2/P3 by having every stage write JSON that the
dashboard reads. That only works if both sides agree on the shape, so the shape lives
here and in ``web/lib/types.ts``, and ``tests/test_artifacts.py`` checks they still match.

Every payload carries ``placeholder``. Seed fixtures ship with it ``True`` so P4 can build
against realistic data on day 1; the real writers set it ``False``. The dashboard renders
a visible banner whenever it is ``True``, which is what stops a placeholder number from
reaching a judge's screen.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from .config import ARTIFACTS

SCHEMA_VERSION = 1


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


@dataclass
class Envelope:
    """Wrapper every artifact file shares, so the UI can trust what it is showing."""

    kind: str
    placeholder: bool
    schema_version: int = SCHEMA_VERSION
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    git_sha: str = field(default_factory=_git_sha)
    payload: Any = None


# --- detector (P1) -----------------------------------------------------------------


@dataclass
class ShapFeature:
    feature: str
    mean_abs_shap: float


@dataclass
class DetectRound:
    """One blue-team training round."""

    round: int
    pr_auc: float
    roc_auc: float
    threshold: float
    precision: float
    recall: float
    n_train: int
    n_adversarial_added: int
    top_shap: list[ShapFeature]


# --- attack (P2) -------------------------------------------------------------------


@dataclass
class AttackRound:
    """One red-team round against the detector of the same index."""

    round: int
    asr: float
    n_attempts: int
    n_success: int
    mean_l0: float
    mean_l2: float
    median_queries: int
    per_feature_freq: dict[str, int]


@dataclass
class FeasibilityAudit:
    """Why a constrained ASR and an unconstrained one are not the same kind of number.

    Both attackers report a high success rate. The difference is that most of the
    unconstrained attacker's wins are not transactions -- they sit at merchants that are
    not in the payment network, or they forged an attribute the real attacker inherits
    from the victim and cannot touch.

    This is the project's central claim demonstrated on our own baseline rather than
    asserted in prose, which is why it belongs in an artifact and not only in a log line.
    """

    constrained_asr: float
    unconstrained_asr: float
    #: share of unconstrained successes at a merchant absent from the network
    impossible_merchant_share: float
    #: share of unconstrained successes that moved a FROZEN victim attribute
    forged_frozen_share: float
    constrained_mean_l0: float
    unconstrained_mean_l0: float


@dataclass
class FeatureDelta:
    feature: str
    before: float
    after: float


@dataclass
class AttackExample:
    """A single successful evasion, for the UI's worked-example panel."""

    id: str
    round: int
    orig_prob: float
    adv_prob: float
    touched: list[FeatureDelta]


# --- agentic (P3) ------------------------------------------------------------------


@dataclass
class AgenticCategory:
    """Exploit rate for one injection category, before and after defenses."""

    category: str
    owasp_id: str
    attempts: int
    success_before: int
    success_after: int
    example_injection: str
    #: the model these rates were measured on. An exploit rate is a property of a model,
    #: not of the corpus, so it travels with one or it is not attributable.
    model: str = ""


# --- terminal node -----------------------------------------------------------------


@dataclass
class ScorecardRow:
    """One row of framework_scorecard. Two rows is the whole 'it generalizes' claim."""

    surface: str
    attack_success_before: float
    attack_success_after: float
    defense_cost: str
    primary_metric: str


# --- the unrolled DAG (rendered by React Flow) --------------------------------------

NodeStatus = Literal["pending", "running", "done"]


@dataclass
class GraphNode:
    id: str
    label: str
    stage: str
    round: int | None
    status: NodeStatus
    track: Literal["tabular", "agentic", "shared"]


@dataclass
class GraphEdge:
    source: str
    target: str
    # "unroll" edges are the feedback cycle made acyclic by round -- drawn dashed,
    # because calling a feedback loop a DAG is the mistake strategy 5.1 warns about.
    kind: Literal["flow", "unroll"]


@dataclass
class Graph:
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# --- io ----------------------------------------------------------------------------

_PATHS = {
    "detect_rounds": ARTIFACTS / "detect" / "rounds.json",
    "attack_rounds": ARTIFACTS / "attack" / "rounds.json",
    "attack_examples": ARTIFACTS / "attack" / "examples.json",
    "agentic_redteam": ARTIFACTS / "agentic" / "redteam.json",
    "agentic_redteam_nvidia": ARTIFACTS / "agentic" / "redteam-nvidia.json",
    "agentic_redteam_groq": ARTIFACTS / "agentic" / "redteam-groq.json",
    "scorecard": ARTIFACTS / "scorecard.json",
    "graph": ARTIFACTS / "graph.json",
    "feasibility_audit": ARTIFACTS / "attack" / "feasibility.json",
    "latency": ARTIFACTS / "latency.json",
}


def path_for(kind: str) -> Path:
    if kind not in _PATHS:
        raise KeyError(f"unknown artifact kind {kind!r}; known: {sorted(_PATHS)}")
    return _PATHS[kind]


def write(kind: str, payload: Any, *, placeholder: bool = False) -> Path:
    """Serialise ``payload`` to its contracted location."""
    dest = path_for(kind)
    dest.parent.mkdir(parents=True, exist_ok=True)
    envelope = Envelope(kind=kind, placeholder=placeholder, payload=payload)
    dest.write_text(
        json.dumps(asdict(envelope), indent=2, default=_encode) + "\n", encoding="utf-8"
    )
    return dest


def read(kind: str) -> dict[str, Any]:
    data = json.loads(path_for(kind).read_text(encoding="utf-8"))
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(
            f"{kind}: artifact schema v{data.get('schema_version')} but code expects "
            f"v{SCHEMA_VERSION} -- regenerate artifacts or bump the reader."
        )
    return data


def _encode(obj: Any) -> Any:
    if hasattr(obj, "__dataclass_fields__"):
        return asdict(obj)
    raise TypeError(f"not JSON serialisable: {type(obj).__name__}")
