"""Record the checks that stop this project lying to itself.

The /system page used to carry a module inventory: 27 files, their line counts, and a wall
of function names. It answered a question nobody asks. Lines of code say nothing about
whether a system works, and a reader cannot tell from `artifacts.py -- 163 loc` whether any
number on the site is trustworthy.

What is actually unusual here is that the same logic exists in two languages three separate
times -- the artifact contract, the agent's defense stack, the detector itself -- and each
pair is held equal by a check that fails loudly rather than by anyone's good intentions.
That is worth a reader's attention. This collects those checks and the size of what each
one covers, straight from the fixtures they run against.

Counts only, and the command to reproduce each. A hardcoded green tick on a page is exactly
the sort of claim this project exists to argue against: the reader is given the command.

    python scripts/export_guarantees.py

Writes artifacts/guarantees.json.
"""

from __future__ import annotations

import ast
import json
import re
import subprocess
from dataclasses import asdict
from datetime import datetime, timezone

from adversarial_payments.artifacts import Envelope
from adversarial_payments.config import ARTIFACTS, ROOT


def _sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return "unknown"


def _json(path):
    p = ROOT / path
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def main() -> int:
    guarantees = []

    # 1. The Python <-> TypeScript artifact contract.
    test_src = (ROOT / "tests" / "test_artifacts.py").read_text(encoding="utf-8")
    mirrored = re.search(r"MIRRORED = \{(.*?)\n\}", test_src, re.DOTALL)
    n_mirrored = len(re.findall(r'"(\w+)":', mirrored.group(1))) if mirrored else 0
    guarantees.append(
        {
            "id": "artifact-contract",
            "title": "The artifact contract cannot drift",
            "claim": f"{n_mirrored} dataclasses in artifacts.py are mirrored by TypeScript "
            "interfaces in web/lib/types.ts. Nothing in either toolchain notices when they "
            "diverge: Python keeps writing, TypeScript keeps compiling, and the site renders "
            "undefined for a field somebody renamed.",
            "how": "tests/test_artifacts.py parses types.ts and fails on any field present "
            "on one side and not the other.",
            "scale": f"{n_mirrored} interfaces",
            "command": "pytest tests/test_artifacts.py",
        }
    )

    # 2. The agent defense port.
    conf = _json("web/scripts/agent-conformance.json")
    if conf:
        spans = sum(len(c["spans"]) for c in conf)
        flagged = sum(1 for c in conf for s in c["spans"] if s["score"] >= 0.5)
        guarantees.append(
            {
                "id": "defense-port",
                "title": "The live agent runs the same defenses as the corpus",
                "claim": "The /agent demo needs a server, and that server is Node — so the "
                "injection classifier, tool scoping and HITL policy exist in TypeScript as "
                "well as Python. Two implementations of one security control is how a demo "
                "drifts into looking right while being wrong.",
                "how": "Every scoreable span of every spliced document is scored by both, "
                "and compared on score, on the reasons that fired, and on the redacted "
                "document byte for byte.",
                "scale": f"{len(conf)} documents · {spans} spans · {flagged} over threshold",
                "command": "npm run check:agent",
            }
        )

    # 3. The detector port.
    trees = _json("web/scripts/tree-conformance.json")
    if trees:
        guarantees.append(
            {
                "id": "detector-port",
                "title": "The in-browser detector is the trained model",
                "claim": "The site walks the 400-tree ensemble in JavaScript so a visitor "
                "does not download 3.2MB of inference runtime to see a score. That is only a "
                "good trade if the answer is unchanged.",
                "how": "Every row the demo can display is scored through the exported ONNX "
                "graph and through the JavaScript walker, and the two are diffed.",
                "scale": f"{len(trees)} rows · agreement to 1e-6",
                "command": "npm run check:trees",
            }
        )

    # 4. Placeholder discipline -- and what it currently says.
    kinds, placeholders = [], []
    for p in sorted((ARTIFACTS).rglob("*.json")):
        if "cache" in p.parts:
            continue
        try:
            e = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(e, dict) and "placeholder" in e:
            kinds.append(p.relative_to(ROOT).as_posix())
            if e["placeholder"]:
                placeholders.append(p.relative_to(ROOT).as_posix())
    guarantees.append(
        {
            "id": "placeholder-discipline",
            "title": "Fixture data announces itself",
            "claim": "Every artifact carries a placeholder flag, a git sha and a timestamp. "
            "While any artifact on the page is a seeded fixture, a banner sits above the "
            "header on every route and names the exact files — so no figure on this site "
            "can quietly be invented.",
            "how": "The writers set the flag; the site reads it and refuses to hide it.",
            "scale": f"{len(kinds)} enveloped artifacts · "
            + (f"{len(placeholders)} still fixtures" if placeholders else "0 fixtures remaining"),
            "command": "grep -l '\"placeholder\": true' artifacts/**/*.json",
        }
    )

    # The test suite, as context rather than as a boast.
    tests = 0
    files = 0
    for p in sorted((ROOT / "tests").glob("test_*.py")):
        files += 1
        tree = ast.parse(p.read_text(encoding="utf-8"))
        tests += sum(
            1
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test_")
        )

    payload = {
        "guarantees": guarantees,
        "tests": {"files": files, "cases": tests, "command": "pytest"},
    }

    dest = ARTIFACTS / "guarantees.json"
    envelope = Envelope(kind="guarantees", placeholder=False, payload=payload)
    envelope.created_at = datetime.now(timezone.utc).isoformat()
    envelope.git_sha = _sha()
    dest.write_text(json.dumps(asdict(envelope), indent=2) + "\n", encoding="utf-8")

    print(f"wrote {dest}")
    for g in guarantees:
        print(f"  {g['title']:<52} {g['scale']}")
    print(f"  {'test suite':<52} {files} files · {tests} cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
