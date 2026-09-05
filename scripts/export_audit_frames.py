"""Turn every artifact into a Samvad audit frame.

The README says every number on the site traces to an artifact carrying placeholder:false,
and that anything without the flag is unverified. That rule is prose. The Samvad audit
console renders exactly this distinction per claim -- test_output means something ran,
model_prior means nothing did -- so pointing it at artifacts/ makes the rule visible.

Claim text is COMPUTED from artifact values. Nothing in this file types a number.

    python scripts/export_audit_frames.py

Writes web/public/audit/frames.json. Deterministic: sorted paths, lamport = index + 1.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
OUT = ROOT / "web" / "public" / "audit" / "frames.json"
ROOT_TASK = "Does this security number survive an adversary?"
SKIP_PARTS = {"cache"}


def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def _redteam(rows: list[dict]) -> str:
    attempts = sum(r["attempts"] for r in rows)
    before = sum(r["success_before"] for r in rows)
    after = sum(r["success_after"] for r in rows)
    model = rows[0].get("model", "unknown model")
    return (f"{model}: exploit rate {_pct(before / attempts)} -> {_pct(after / attempts)} "
            f"over {attempts} trials per arm")


def _claims(rel: str, doc: dict) -> list[str]:
    """One or more headline sentences per artifact, read from its own fields."""
    p = doc.get("payload", doc)
    if rel == "scorecard.json":
        return [f"{r['surface']}: attack success {r['attack_success_before']:.3f} -> "
                f"{r['attack_success_after']:.3f}; {r['defense_cost']}" for r in p]
    if rel == "attack/rounds.json":
        return [f"round {r['round']}: ASR {r['asr']:.3f}, median queries {r['median_queries']}" for r in p]
    if rel == "attack/feasibility.json":
        return [f"constrained ASR {p['constrained_asr']:.3f} vs unconstrained {p['unconstrained_asr']:.3f}; "
                f"{_pct(p['impossible_merchant_share'])} of unconstrained evasions at an impossible merchant"]
    if rel.startswith("agentic/redteam"):
        return [_redteam(p)]
    if rel == "detect/rounds.json":
        return [f"round {r['round']}: PR-AUC {r['pr_auc']:.3f}, recall {r['recall']:.3f}" for r in p]
    if rel == "latency.json":
        return [f"{p['backend']}: p50 {p['p50_ms']:.3f} ms, p95 {p['p95_ms']:.3f} ms over {p['n_samples']} samples"]
    if rel == "guarantees.json":
        return [f"{len(p['guarantees'])} cross-language checks, {p['tests']['cases']} test cases"]
    if rel == "graph.json":
        return [f"pipeline graph: {len(p['nodes'])} nodes, {len(p['edges'])} edges"]
    if rel == "live_samples.json":
        return [f"{len(p['samples'])} live samples, {len(p['stream'])} stream rows, threshold {p['threshold']:.3f}"]
    if rel == "agent_runtime.json":
        return [f"agent runtime: {len(p['scenarios'])} scenarios, {len(p['injections'])} injections"]
    if rel == "detector_trees.json":
        return [f"exported detector: {p['n_trees']} trees, {p['n_nodes']} nodes"]
    if rel == "attack/examples.json":
        return [f"{len(p)} worked evasions, first {p[0]['orig_prob']:.3f} -> {p[0]['adv_prob']:.4f}"]
    # Unflagged artifacts: still say something true about the file.
    if rel == "attack/dosage_sweep.json":
        return [f"dosage sweep: {len(p['arms'])} arms on {p['rows']:,} rows"]
    if rel == "attack/threshold_sweep.json":
        return [f"threshold sweep: {len(p['arms'])} arms on {p['rows']:,} rows"]
    if rel == "attack/adversarial_detection.json":
        r = p["report"]
        return [f"holdout recall on unseen adversarials {r['holdout_recall_before']:.3f} -> {r['holdout_recall_after']:.3f}"]
    if rel == "data_provenance.json":
        return [f"{p['source']} {p.get('kaggle_dataset', '')}: {p['n_rows']:,} rows, fraud rate {_pct(p['fraud_rate'])}"]
    if rel == "feature_schema.json":
        return [f"{len(p['columns'])} columns: {len(p['frozen'])} frozen, {len(p['mutable'])} mutable"]
    size = len(p) if isinstance(p, (list, dict)) else 1
    return [f"{doc.get('kind', rel)}: {size} top-level entries"]


def _frame(i: int, rel: str, path: Path, doc: dict) -> dict:
    flagged = doc.get("placeholder") is False
    sha = doc.get("git_sha") or "none"
    created = doc.get("created_at") or "unknown"
    evidence = f"artifacts/{rel} · git_sha {sha} · created {created}"
    ev_type = "test_output" if flagged else "model_prior"
    return {
        "type": "message",
        "lamport": i,
        "sender": "assay",
        "receiver": "reviewer",
        "performative": "task_result",
        "task_status": "complete" if flagged else "uncertain",
        "root_task": ROOT_TASK,
        "message_id": rel,
        "timestamp": created if created != "unknown" else "",
        "claims": [{"claim": c, "evidence": evidence, "evidence_type": ev_type} for c in _claims(rel, doc)],
        "artifacts": [{
            "ref": f"artifacts/{rel}",
            "kind": doc.get("kind", path.stem),
            "summary": f"{path.stat().st_size:,} bytes, placeholder={'false' if flagged else 'absent'}",
            "tokens": path.stat().st_size // 4,
        }],
    }


def build_frames(artifacts_dir: Path) -> dict:
    if not artifacts_dir.is_dir():
        raise FileNotFoundError(f"no artifacts directory at {artifacts_dir}")
    entries: list[tuple[bool, str, str, Path, dict]] = []
    for path in sorted(artifacts_dir.rglob("*.json")):
        rel_parts = path.relative_to(artifacts_dir).parts
        if SKIP_PARTS & set(rel_parts[:-1]):
            continue
        rel = "/".join(rel_parts)
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise ValueError(f"{path}: {e}") from e
        flagged = isinstance(doc, dict) and doc.get("placeholder") is False
        created = doc.get("created_at", "") if isinstance(doc, dict) else ""
        entries.append((not flagged, created or "~", rel, path, doc))
    entries.sort(key=lambda e: (e[0], e[1], e[2]))  # flagged first, by created_at, then path
    messages = [_frame(i + 1, rel, path, doc) for i, (_, _, rel, path, doc) in enumerate(entries)]
    nodes = [
        {"type": "node", "agent": "assay", "model": "red/blue loop", "role": "pipeline", "up": True,
         "children": 0, "context": {"used": 0, "limit": 1}, "budget_usd": 0},
        {"type": "node", "agent": "reviewer", "model": "you", "role": "auditor", "up": True,
         "children": 0, "context": {"used": 0, "limit": 1}, "budget_usd": 0},
    ]
    return {"root_task": ROOT_TASK, "nodes": nodes, "messages": messages}


def main() -> int:
    try:
        frames = build_frames(ARTIFACTS)
    except (FileNotFoundError, ValueError) as e:
        print(f"export_audit_frames: {e}", file=sys.stderr)
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(frames, indent=1) + "\n", encoding="utf-8")
    grounded = sum(1 for m in frames["messages"] if m["task_status"] == "complete")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(frames['messages'])} frames, {grounded} grounded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
