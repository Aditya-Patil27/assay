"""Inventory the Python backend so the site can show it instead of asserting it.

The dashboard was renderings of the pipeline's *output*. A judge could see the numbers and
had to take on faith that anything produced them. This walks the package with `ast` and
emits what is actually there -- every module, its size, its docstring summary, its public
API, and which artifact it writes -- so the claim "there is a real system behind this" is
a table a reader can check rather than a sentence they have to believe.

Generated, never hand-maintained: a hand-written module list is wrong the first time
someone adds a file, and a stale inventory is worse than none.

    python scripts/export_backend_audit.py

Writes artifacts/backend_audit.json.
"""

from __future__ import annotations

import ast
import json
import subprocess
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from adversarial_payments.artifacts import Envelope
from adversarial_payments.config import ARTIFACTS, ROOT

PKG = ROOT / "src" / "adversarial_payments"
TESTS = ROOT / "tests"
SCRIPTS = ROOT / "scripts"

# What each subpackage is for, in one line. The only prose here; everything else is
# measured. Keyed by directory so a new module lands in the right group automatically.
GROUPS = {
    "data": ("Corpus", "Loading, feature engineering and the chronological split."),
    "detect": ("Detector", "Training, evaluation and SHAP attribution for the blue team."),
    "attack": ("Red team", "The constraint projector, the search engine and its metrics."),
    "agentic": ("Agent surface", "Payment agent, tools, injection corpus and the defense stack."),
    "loop": ("Orchestration", "The round loop, its state machine and the offline fallback."),
    "orchestration": ("Arena", "Multi-strategy scheduling and the attack repertoire."),
    "serving": ("Serving", "ONNX export and the latency harness."),
    "": ("Contracts", "Schema, artifact envelopes, config and the scorecard."),
}


def _sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return "unknown"


def summarise(doc: str | None) -> str:
    """First sentence of the module docstring, which is where these files say what they do."""
    if not doc:
        return ""
    first = doc.strip().split("\n\n")[0].replace("\n", " ").strip()
    return first if len(first) <= 200 else first[:197] + "…"


def public_api(tree: ast.Module) -> list[str]:
    """Top-level classes and functions that are not private."""
    out = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if not node.name.startswith("_"):
                out.append(node.name)
    return out


def scan(path: Path) -> dict:
    src = path.read_text(encoding="utf-8")
    tree = ast.parse(src)
    # Blank lines and comment-only lines are not code; counting them would inflate every
    # number on the page and this file exists to be checkable.
    code = [
        ln for ln in src.splitlines() if ln.strip() and not ln.strip().startswith("#")
    ]
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "module": path.stem,
        "loc": len(code),
        "summary": summarise(ast.get_docstring(tree)),
        "api": public_api(tree),
    }


def main() -> int:
    groups: dict[str, dict] = {}
    for path in sorted(PKG.rglob("*.py")):
        if path.name == "__init__.py":
            continue
        rel = path.relative_to(PKG)
        key = rel.parts[0] if len(rel.parts) > 1 else ""
        title, blurb = GROUPS.get(key, (key or "Other", ""))
        g = groups.setdefault(key, {"key": key or "core", "title": title, "blurb": blurb, "modules": []})
        g["modules"].append(scan(path))

    test_files = []
    for path in sorted(TESTS.glob("test_*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        cases = [
            n.name
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test_")
        ]
        test_files.append(
            {"path": path.relative_to(ROOT).as_posix(), "cases": len(cases), "summary": summarise(ast.get_docstring(tree))}
        )

    script_files = [
        {"path": p.relative_to(ROOT).as_posix(), "summary": summarise(ast.get_docstring(ast.parse(p.read_text(encoding="utf-8"))))}
        for p in sorted(SCRIPTS.glob("*.py"))
    ]

    ordered = [groups[k] for k in ["", "data", "detect", "attack", "agentic", "loop", "orchestration", "serving"] if k in groups]
    ordered += [g for k, g in groups.items() if k not in {"", "data", "detect", "attack", "agentic", "loop", "orchestration", "serving"}]

    payload = {
        "groups": ordered,
        "tests": test_files,
        "scripts": script_files,
        "totals": {
            "modules": sum(len(g["modules"]) for g in ordered),
            "loc": sum(m["loc"] for g in ordered for m in g["modules"]),
            "test_files": len(test_files),
            "test_cases": sum(t["cases"] for t in test_files),
            "scripts": len(script_files),
        },
    }

    dest = ARTIFACTS / "backend_audit.json"
    envelope = Envelope(kind="backend_audit", placeholder=False, payload=payload)
    envelope.created_at = datetime.now(timezone.utc).isoformat()
    envelope.git_sha = _sha()
    dest.write_text(json.dumps(asdict(envelope), indent=2) + "\n", encoding="utf-8")

    t = payload["totals"]
    print(f"wrote {dest}")
    print(f"  {t['modules']} modules · {t['loc']:,} lines of code")
    print(f"  {t['test_files']} test files · {t['test_cases']} cases · {t['scripts']} scripts")
    for g in ordered:
        print(f"  {g['title']:<16} {len(g['modules']):>2} modules  {sum(m['loc'] for m in g['modules']):>5,} loc")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
