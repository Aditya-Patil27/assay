"""Plain state dict for the unrolled loop, plus the DAG the dashboard draws.

Spec section 4.5: the graph is produced *by the loop itself*, not by the orchestrator.
Prefect can be deleted from this repository and ``artifacts/graph.json`` still comes out
of a run, because the nodes and edges are appended by the same functions that do the
work. That is the whole reason the visualisation is safe to demo.

The loop is genuinely cyclic -- round r's retrained detector is round r+1's target. It is
made acyclic by unrolling over rounds, and the edge that closes the cycle keeps
``kind="unroll"`` so the UI can draw it dashed. Calling a feedback loop a DAG without
saying so is the mistake strategy section 5.1 warns about.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

from ..artifacts import (
    AttackExample,
    AttackRound,
    DetectRound,
    Graph,
    GraphEdge,
    GraphNode,
    NodeStatus,
)

STAGES: tuple[tuple[str, str, str], ...] = (
    ("train", "Train detector", "detect"),
    ("score", "Score detector (PR-AUC)", "detect"),
    ("attack", "Generate attacks", "attack"),
    ("asr", "Score attacks (ASR)", "attack"),
    ("augment", "Augment trainset", "loop"),
)

_PRE = (
    ("load_data", "Load transactions", "data"),
    ("features", "Engineer features", "data"),
    ("schema", "Freeze schema", "contract"),
)

_AGENTIC = (
    ("build_agent", "Build payment agent"),
    ("inject", "Generate injections"),
    ("redteam", "Run red team"),
    ("defend", "Apply defenses"),
    ("redteam2", "Re-run red team"),
)


def node_id(stage: str, round_index: int) -> str:
    return f"{stage}_{round_index}"


@dataclass
class LoopState:
    """Everything one full red/blue run produces. Deliberately a plain dict-alike."""

    n_rounds: int
    detect_rounds: list[DetectRound] = field(default_factory=list)
    attack_rounds: list[AttackRound] = field(default_factory=list)
    examples: list[AttackExample] = field(default_factory=list)
    status: dict[str, NodeStatus] = field(default_factory=dict)
    notes: dict[str, Any] = field(default_factory=dict)

    # -- node bookkeeping -----------------------------------------------------------

    def mark(self, stage: str, round_index: int | None, status: NodeStatus) -> None:
        key = stage if round_index is None else node_id(stage, round_index)
        self.status[key] = status

    def started(self, stage: str, round_index: int | None = None) -> None:
        self.mark(stage, round_index, "running")

    def finished(self, stage: str, round_index: int | None = None) -> None:
        self.mark(stage, round_index, "done")

    def _status(self, key: str) -> NodeStatus:
        return self.status.get(key, "pending")

    # -- results ---------------------------------------------------------------------

    def add_detect(self, row: DetectRound) -> None:
        self.detect_rounds.append(row)

    def add_attack(self, row: AttackRound, examples: Iterable[AttackExample] = ()) -> None:
        self.attack_rounds.append(row)
        self.examples.extend(examples)

    def asr_by_round(self) -> dict[int, float]:
        return {r.round: r.asr for r in self.attack_rounds}

    def pr_auc_by_round(self) -> dict[int, float]:
        return {r.round: r.pr_auc for r in self.detect_rounds}

    def as_dict(self) -> dict[str, Any]:
        return {
            "n_rounds": self.n_rounds,
            "asr_by_round": self.asr_by_round(),
            "pr_auc_by_round": self.pr_auc_by_round(),
            "status": dict(self.status),
            "notes": dict(self.notes),
        }

    # -- the DAG ----------------------------------------------------------------------

    def graph(self, *, agentic_status: NodeStatus = "pending") -> Graph:
        """Serialise the unrolled loop, with the feedback edges marked ``unroll``."""
        nodes: list[GraphNode] = [
            GraphNode(nid, label, stage, None, self._status(nid), "shared" if nid == "schema" else "tabular")
            for nid, label, stage in _PRE
        ]
        edges: list[GraphEdge] = [
            GraphEdge("load_data", "features", "flow"),
            GraphEdge("features", "schema", "flow"),
        ]

        for r in range(self.n_rounds):
            last = r == self.n_rounds - 1
            for stage, label, kind in STAGES:
                if stage == "augment" and last:
                    continue  # nothing to feed; the loop stops here
                nid = node_id(stage, r)
                nodes.append(
                    GraphNode(nid, f"{label} r{r}", kind, r, self._status(nid), "tabular")
                )

            edges += [
                GraphEdge(
                    "schema" if r == 0 else node_id("augment", r - 1),
                    node_id("train", r),
                    # The edge back into the next round's detector IS the feedback loop.
                    "flow" if r == 0 else "unroll",
                ),
                GraphEdge(node_id("train", r), node_id("score", r), "flow"),
                GraphEdge(node_id("train", r), node_id("attack", r), "flow"),
                GraphEdge(node_id("attack", r), node_id("asr", r), "flow"),
            ]
            if not last:
                edges.append(GraphEdge(node_id("asr", r), node_id("augment", r), "flow"))

        nodes += [
            GraphNode(nid, label, "agentic", None, agentic_status, "agentic")
            for nid, label in _AGENTIC
        ]
        edges += [
            GraphEdge(a, b, "flow")
            for a, b in zip([n for n, _ in _AGENTIC], [n for n, _ in _AGENTIC][1:])
        ]

        nodes.append(
            GraphNode(
                "scorecard",
                "Framework scorecard",
                "terminal",
                None,
                self._status("scorecard"),
                "shared",
            )
        )
        edges += [
            GraphEdge(node_id("asr", self.n_rounds - 1), "scorecard", "flow"),
            GraphEdge("redteam2", "scorecard", "flow"),
        ]
        return Graph(nodes=nodes, edges=edges)
