# Razorpay pitch video, /audit console, landing-page loops — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship, before 21:00 IST today, a `/audit` console over `artifacts/`, a Razorpay-framed landing page with three silent product loops and a "What broke" section, and a human-narrated 5-minute pitch video built by the existing narration-first pipeline.

**Architecture:** A stdlib Python exporter turns every artifact into a Samvad audit frame; the Samvad console (copied into `web/public/audit/`) replays those frames. Playwright records three loops from the deployed site into `web/public/demos/`; the landing page embeds them. `video/pitch.html` is a motion-graphics page driven by injected per-scene slot lengths; `video/build_pitch.mjs` measures the narrator's WAVs, records the page in three runs, splices the two loops in, and muxes with ffmpeg.

**Tech Stack:** Python 3.12 (stdlib only for the exporter, pytest for its test), Next.js 16 / React 19 / Tailwind 4 in `web/`, Playwright 1.62 (already installed under `video/node_modules`), ffmpeg 8.1 (on PATH), Windows PowerShell 5.1 for recording and SAPI fallback.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-05-razorpay-pitch-and-site-design.md`. Deadline 23:59 IST; internal upload target 21:00 IST.
- **Never quote an artifact without `placeholder: false`.** Unflagged artifacts appear only as amber rows on `/audit`.
- The tabular row stays `1.000 → 1.000` wherever the scorecard is shown. Copy around it uses the §2 framing: "priced finding, so the defence lives elsewhere."
- Commit messages: imperative sentence, no conventional-commit prefix, **no `Co-Authored-By` trailer** (repo rule).
- Keep files under 500 lines. `pitch.html` and `build_pitch.mjs` are the two that come close; do not add to them beyond the plan.
- Run every command from the repo root `C:\Users\app27\Downloads\hacks\mastercard` unless a step says `cd video` or `cd web`.
- Deployed site: `https://adversarial-payments.vercel.app`. Deploy with `cd web && npm run deploy`.
- Repo remote for commit links: `https://github.com/Aditya-Patil27/mastercard-adversarial-payments` (a rename keeps redirecting).
- Microphone device name for ffmpeg dshow on this machine: `Microphone Array (AMD Audio Device)`.

---

## File map

| Path | Responsibility |
|---|---|
| `scripts/export_audit_frames.py` | artifacts → `web/public/audit/frames.json` (Samvad frame shape) |
| `tests/test_export_audit_frames.py` | evidence types, statuses, ordering, non-empty claims |
| `web/public/audit/index.html` | Samvad console, patched to replay `frames.json` |
| `web/public/audit/frames.json` | committed, generated |
| `web/scripts/sync-artifacts.mjs` | also regenerates frames when Python is present |
| `web/components/SiteChrome.tsx` | nav entry `/audit`, footer framing |
| `web/components/WhatBroke.tsx` | the four errors with commit links |
| `web/components/FeatureLoop.tsx` | heading + silent looping `<video>` |
| `web/app/page.tsx` | framing, WhatBroke section, three FeatureLoop sections |
| `web/public/demos/{live,agent,audit}.mp4` | the loops |
| `video/record_loops.mjs` | records and transcodes the loops |
| `video/pitch_narration.json` | the only file a human edits for the pitch |
| `video/pitch.html` | nine motion scenes, slot-driven |
| `video/rec.ps1` | records one scene from the microphone |
| `video/make_pitch_narration.ps1` | SAPI fallback for any scene without a WAV |
| `video/build_pitch.mjs` | measure → record → pad → concat → mux → verify |
| `video/README.md`, `README.md`, `LINKS.md` | links and rebuild notes |

---

### Task 1: Audit frames exporter

**Files:**
- Create: `scripts/export_audit_frames.py`
- Create: `tests/test_export_audit_frames.py`
- Create (generated): `web/public/audit/frames.json`

**Interfaces:**
- Produces: `build_frames(artifacts_dir: Path) -> dict` with keys `nodes: list[dict]`, `messages: list[dict]`; `main() -> int`. Frame fields consumed by Task 2's console: `type, lamport, sender, receiver, performative, task_status, root_task, message_id, timestamp, claims[{claim, evidence, evidence_type}], artifacts[{ref, kind, summary, tokens}]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_export_audit_frames.py
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
    return root


def test_flagged_is_grounded_and_unflagged_is_prior(artifacts: Path) -> None:
    frames = build_frames(artifacts)
    by_id = {m["message_id"]: m for m in frames["messages"]}
    assert set(by_id) == {"scorecard.json", "attack/dosage_sweep.json"}  # cache skipped

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
    assert [m["lamport"] for m in frames["messages"]] == [1, 2]
    for m in frames["messages"]:
        assert m["type"] == "message" and m["sender"] == "assay" and m["receiver"] == "reviewer"
        assert m["performative"] == "task_result"
        assert all(c["claim"].strip() for c in m["claims"])
    assert {n["agent"] for n in frames["nodes"]} == {"assay", "reviewer"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_export_audit_frames.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'export_audit_frames'`

- [ ] **Step 3: Write the exporter**

```python
# scripts/export_audit_frames.py
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
```

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/test_export_audit_frames.py -v`
Expected: 2 passed

- [ ] **Step 5: Generate the real frames and inspect**

Run: `python scripts/export_audit_frames.py && python -c "import json;d=json.load(open('web/public/audit/frames.json'));print([(m['message_id'],m['task_status']) for m in d['messages']])"`
Expected: `wrote web/public/audit/frames.json: 19 frames, 14 grounded`, and the printed list ends with the five `uncertain` entries (`attack/adversarial_detection.json`, `attack/dosage_sweep.json`, `attack/threshold_sweep.json`, `data_provenance.json`, `feature_schema.json`).

- [ ] **Step 6: Commit**

```bash
git add scripts/export_audit_frames.py tests/test_export_audit_frames.py web/public/audit/frames.json
git commit -m "Export every artifact as an audit frame, grounded only where placeholder is false"
```

---

### Task 2: The `/audit` console page, nav link, sync hook

**Files:**
- Create: `web/public/audit/index.html` (from Samvad `dashboard/index.html`)
- Modify: `web/components/SiteChrome.tsx:14-21` (NAV)
- Modify: `web/scripts/sync-artifacts.mjs` (append)

**Interfaces:**
- Consumes: `frames.json` from Task 1 (`nodes`, `messages`).
- Produces: route `/audit` on the deployed site; the replay sets `#hint` to end with `· run complete` (Task 5's recorder waits on that).

- [ ] **Step 1: Copy the upstream console**

Run:
```bash
curl -sL https://raw.githubusercontent.com/Aditya-Patil27/samvad/main/dashboard/index.html -o web/public/audit/index.html
grep -c 'const PEERS = \["agent_a"' web/public/audit/index.html
```
Expected: `1`

- [ ] **Step 2: Patch provenance comment, brand, peers**

Prepend one line to the file, then apply three exact replacements:

```bash
python - <<'EOF'
from pathlib import Path
p = Path("web/public/audit/index.html")
s = p.read_text(encoding="utf-8")
s = ("<!-- Copied from https://github.com/Aditya-Patil27/samvad dashboard/index.html and pointed at\n"
     "     artifacts/ via ./frames.json (scripts/export_audit_frames.py). Only PEERS, the brand and the\n"
     "     ingest function differ from upstream. -->\n") + s
s = s.replace('<span class="brand">SAMVAD<small>audit console</small></span>',
              '<span class="brand">ASSAY<small>audit console · artifacts/</small></span>')
s = s.replace('<title>Samvad Audit Console</title>', '<title>Assay · audit console</title>')
s = s.replace('const PEERS = ["agent_a", "agent_b", "agent_c", "agent_d"];',
              'const PEERS = ["assay", "reviewer"];')
assert s.count('const PEERS = ["assay", "reviewer"];') == 1
p.write_text(s, encoding="utf-8")
EOF
```

- [ ] **Step 3: Replace `live()` with `replay()`**

The upstream block starts at `/* ---- live, or synthetic` and the file ends with `drawRoster();\nlive();\n</script>`. Replace the `live()` function and the final call:

```bash
python - <<'EOF'
from pathlib import Path
import re
p = Path("web/public/audit/index.html")
s = p.read_text(encoding="utf-8")
old_live = re.search(r"function live\(\) \{.*?\n\}\n", s, re.S).group(0)
new_live = '''/* Replay artifacts/ as frames. No /events here: the run already happened, and the file
   is what it produced. 400 ms per row so the grounded ratio is seen to be computed. */
async function replay() {
  let frames;
  try {
    const res = await fetch("./frames.json", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    frames = await res.json();
  } catch (e) {
    $("mode").textContent = "no data";
    $("hint").textContent = "frames.json did not load — run: python scripts/export_audit_frames.py";
    return;
  }
  $("mode").textContent = "artifacts";
  $("mode").classList.add("live");
  $("hint").textContent = "replaying artifacts/ — placeholder:false is grounded, anything else is not";
  for (const n of frames.nodes) onNode(n);
  let i = 0;
  (function step() {
    if (i >= frames.messages.length) { $("hint").textContent += " · run complete"; return; }
    onMessage(frames.messages[i++]);
    setTimeout(step, 400);
  })();
}
'''
s = s.replace(old_live, new_live)
assert s.endswith("drawRoster();\nlive();\n</script>\n") or s.rstrip().endswith("drawRoster();\nlive();\n</script>")
s = s.replace("drawRoster();\nlive();\n</script>", "drawRoster();\nreplay();\n</script>")
p.write_text(s, encoding="utf-8")
print("ok")
EOF
```
Expected: `ok`. The unused `demo()` stays in the file untouched; its `meta` map is never reached.

- [ ] **Step 4: Add the nav entry**

In `web/components/SiteChrome.tsx`, change the `NAV` array to:

```tsx
export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/live", label: "Live demo" },
  { href: "/results", label: "Results" },
  { href: "/attack", label: "Tabular attack" },
  { href: "/agent", label: "Agent attack" },
  { href: "/audit", label: "Audit" },
  { href: "/system", label: "System" },
];
```

- [ ] **Step 5: Regenerate frames on sync when Python is available**

Append to the end of `web/scripts/sync-artifacts.mjs`:

```js
// The audit console reads web/public/audit/frames.json, generated from the same artifacts.
// Regenerate when the repo root and Python are both here; otherwise the committed file
// stands, which is what Vercel sees.
import { spawnSync } from "node:child_process";
const exporter = join(here, "..", "..", "scripts", "export_audit_frames.py");
const py = spawnSync("python", [exporter], { stdio: "inherit" });
if (py.status !== 0) {
  console.warn("audit frames not regenerated (python missing or failed); committed frames.json stands");
}
```

- [ ] **Step 6: Verify locally**

Run: `cd web && npm run sync && npm run typecheck && npm run lint`
Expected: sync prints the `wrote web/public/audit/frames.json` line, typecheck and lint pass.

Run: `cd web && npx next dev -p 3000` in a second terminal, then open `http://localhost:3000/audit`.
Expected: header badge `artifacts`, roster shows `assay` and `reviewer`, rows appear every 0.4 s, top-right `grounded` KPI reads `74%` (14 of 19), the last five rows carry an amber `1 prior` pill, and the hint ends with `· run complete`. Clicking an amber row shows `model_prior` and `nothing ran — not grounded`. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add web/public/audit/index.html web/components/SiteChrome.tsx web/scripts/sync-artifacts.mjs web/public/audit/frames.json
git commit -m "Serve the Samvad audit console at /audit, replaying artifacts/ with their provenance"
```

---

### Task 3: Razorpay framing and the "What broke" section

**Files:**
- Create: `web/components/WhatBroke.tsx`
- Modify: `web/app/page.tsx` (STEPS at lines 26-41; hero at lines 148-156; insert a section after the stats band, before `{/* ---- Capabilities`)
- Modify: `web/components/SiteChrome.tsx:91-94` (footer sentence)

**Interfaces:**
- Produces: `<WhatBroke />` (no props), a `section` with `id="what-broke"`.

- [ ] **Step 1: Write `WhatBroke.tsx`**

```tsx
// web/components/WhatBroke.tsx
/**
 * The four errors this repository has reported about itself, each linked to the commit
 * that fixed it. Razorpay scores "failure recovery" explicitly; a project whose thesis is
 * that unattacked numbers are decoration has to put its own corrections where a judge
 * lands, not in a changelog.
 */
const REPO = "https://github.com/Aditya-Patil27/mastercard-adversarial-payments";

const ERRORS = [
  {
    broke: "We promised attack success would collapse under adversarial retraining. It did not: 1.000 at every round.",
    fixed: "Re-ran all three detector rounds on the full corpus and corrected every caption. The honest headline became attacker cost, +116 median queries.",
    sha: "83f4971",
  },
  {
    broke: "We explained the flat ASR by under-dosed adversarial training.",
    fixed: "A 5000× dosage sweep refuted that: ASR unmoved in every arm, at a cost of 22.3% of PR-AUC. The explanation was withdrawn.",
    sha: "727a5c2",
  },
  {
    broke: "The decision threshold was fitted on the test split until 2026-08-30, which made evasion free and every earlier ASR incomparable.",
    fixed: "Named the split the published detector actually uses, added a tripwire that fails the build if it recurs, and re-measured.",
    sha: "f501f10",
  },
  {
    broke: "A trainer that never ran was reported as if it had.",
    fixed: "Reported the error in the document rather than deleting it from the history.",
    sha: "c3b809d",
  },
];

export function WhatBroke() {
  return (
    <section id="what-broke" className="wrap reveal py-14">
      <p className="mono-label text-[0.75rem] text-attack">Failure recovery</p>
      <h2 className="display mt-3 text-[1.75rem] md:text-[2rem]">What broke, and how we recovered</h2>
      <p className="prose col mt-3">
        Four errors, all still in the history. A metric nobody could retract is not a metric.
      </p>
      <ol className="mt-8 grid gap-4 md:grid-cols-2">
        {ERRORS.map((e, i) => (
          <li key={e.sha} className="card flex flex-col border border-rule p-5">
            <span className="mono-label text-[0.75rem] text-muted">{i + 1} · broke</span>
            <p className="mt-1 text-[0.9375rem] leading-relaxed">{e.broke}</p>
            <span className="mono-label mt-4 text-[0.75rem] text-defend">recovered</span>
            <p className="mt-1 flex-1 text-[0.875rem] leading-relaxed text-muted">{e.fixed}</p>
            <a
              href={`${REPO}/commit/${e.sha}`}
              className="mt-4 font-mono text-[0.75rem] text-defend hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              commit {e.sha} →
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Reframe the hero in `page.tsx`**

Replace the `STEPS` constant (lines 26-41) with:

```tsx
const STEPS = [
  {
    k: "The problem",
    v: "A fraud defence reports a number nobody attacked. Published evasion results usually measure an attacker who could not exist.",
  },
  {
    k: "What we built",
    v: "One loop — attack, measure, defend, re-measure — held to what a real attacker controls, run on a tabular detector and on a payment agent.",
  },
  {
    k: "What landed",
    v: "Payment-agent exploits 4.86% → 0.0% with zero false refusals. And a feasibility audit: 99.9% of a naive attacker's identical 100% is transactions that cannot occur.",
  },
  {
    k: "What we priced",
    v: "Adversarial retraining did not stop one evasion. It raised the attacker's median queries 275 → 391 and cost 1.6% of PR-AUC — so the defence has to live elsewhere.",
  },
];
```

Replace the eyebrow and heading (lines 150-155):

```tsx
            <p className="mono-label text-[0.8125rem] text-attack">
              Razorpay AI Buildathon 2026 · Open Track
            </p>
            <h1 className="display mt-4 max-w-[15ch] text-[2.75rem] sm:text-[3.75rem] md:text-[4.5rem]">
              The test that tells you which of your security numbers are real.
            </h1>
```

Add the import at the top of `page.tsx`, below the `LiveScoreStream` import:

```tsx
import { WhatBroke } from "@/components/WhatBroke";
```

Insert `<WhatBroke />` immediately after the closing `</section>` of the stats band (the section whose heading is "Measured, end to end") and before the `{/* ---- Capabilities` comment.

- [ ] **Step 3: Footer sentence**

In `web/components/SiteChrome.tsx`, replace
`attacker to constraints a real one would face. Mastercard Innovation Challenge 2026.`
with
`attacker to constraints a real one would face. Razorpay AI Buildathon 2026, Open Track.`

- [ ] **Step 4: Verify**

Run: `cd web && npm run typecheck && npm run lint && grep -rn "Mastercard" app components`
Expected: typecheck and lint pass; grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add web/components/WhatBroke.tsx web/app/page.tsx web/components/SiteChrome.tsx
git commit -m "Frame the site for the Razorpay Buildathon, and put the four corrections on the front page"
```

---

### Task 4: FeatureLoop component and landing-page sections

**Files:**
- Create: `web/components/FeatureLoop.tsx`
- Modify: `web/app/page.tsx` (CAPABILITIES at lines 43-78; the Capabilities section)

**Interfaces:**
- Produces: `FeatureLoop({ eyebrow, title, blurb, href, cta, src, flip? })`. `src` values are `/demos/live.mp4`, `/demos/agent.mp4`, `/demos/audit.mp4`, produced by Task 5. Until then the videos 404 and render as a black box; the page still builds.

- [ ] **Step 1: Write the component**

```tsx
// web/components/FeatureLoop.tsx
import Link from "next/link";

/**
 * A heading beside the product moving. Silent, autoplaying, looping — the pattern the
 * reference site (gr-connect.org) uses for each feature, because a fifteen-second clip of
 * the thing working says more than a card of text about it. playsInline is what lets iOS
 * autoplay; preload="metadata" keeps three clips from downloading before the hero paints.
 */
export function FeatureLoop({
  eyebrow,
  title,
  blurb,
  href,
  cta,
  src,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  src: string;
  flip?: boolean;
}) {
  return (
    <section className="wrap reveal py-10">
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <div className={flip ? "lg:order-2" : ""}>
          <p className="mono-label text-[0.75rem] text-attack">{eyebrow}</p>
          <h2 className="display mt-3 text-[1.75rem] md:text-[2rem]">{title}</h2>
          <p className="prose col mt-3">{blurb}</p>
          <Link href={href} className="mt-5 inline-block text-[0.8125rem] font-medium text-defend">
            {cta} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={`overflow-hidden rounded-[8px] border border-rule bg-black ${flip ? "lg:order-1" : ""}`}>
          <video
            src={src}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={title}
            className="block h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Replace the Capabilities section in `page.tsx`**

Add the import below the `WhatBroke` import:

```tsx
import { FeatureLoop } from "@/components/FeatureLoop";
```

Replace the `CAPABILITIES` constant (lines 43-78) with the three non-loop cards only:

```tsx
const CAPABILITIES = [
  {
    href: "/results",
    label: "Co-evolution results",
    blurb: "Three rounds of attack and adversarial retraining, plus the feasibility audit run against our own baseline before any number is reported.",
  },
  {
    href: "/attack",
    label: "Tabular surface",
    blurb: "Worked evasions feature by feature, and the constraint contract every perturbation is held to.",
  },
  {
    href: "/system",
    label: "The system, audited",
    blurb: "Every backend module inventoried from source, the ONNX serving latency, and the corpus the bands were measured from.",
  },
];
```

Replace everything from `{/* ---- Capabilities` through the closing `</section>` of that block with:

```tsx
      {/* ---- Feature loops ------------------------------------------------------ */}
      <section className="wrap pt-14">
        <h2 className="display text-[1.75rem] md:text-[2rem]">
          Two attack surfaces, one loop, both of them live
        </h2>
        <p className="prose col mt-3">
          The same cycle — attack, measure, defend, re-measure — applied to a tabular fraud
          detector and to a payment agent. Each clip below is the deployed page, recorded.
        </p>
      </section>
      <FeatureLoop
        eyebrow="Surface 1 · tabular"
        title="Run the detector in your own tab"
        blurb="The exported tree ensemble, walked in the browser. Move a transaction, watch the score move, then run the constraint-aware attack against it."
        href="/live"
        cta="Run the live detector"
        src="/demos/live.mp4"
      />
      <FeatureLoop
        eyebrow="Surface 2 · agentic"
        title="Fire a live injection at a real model"
        blurb="Pick a payload planted in a payment memo and fire it twice: defenses off, then on. Watch the payee's account move, or not."
        href="/agent"
        cta="Fire an injection"
        src="/demos/agent.mp4"
        flip
      />
      <FeatureLoop
        eyebrow="Provenance"
        title="Every claim, with what ran behind it"
        blurb="Each artifact becomes an audited claim. Green means a test or a file backs it. Amber means nothing ran — including five of our own."
        href="/audit"
        cta="Open the audit console"
        src="/demos/audit.mp4"
      />

      {/* ---- Remaining pages ----------------------------------------------------- */}
      <section className="wrap reveal pb-14 pt-4">
        <div className="grid gap-4 md:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="card group flex flex-col border border-rule p-5 transition-shadow hover:shadow-md"
            >
              <span className="display text-[1.0625rem]">{c.label}</span>
              <span className="mt-2 flex-1 text-[0.8125rem] leading-relaxed text-muted">
                {c.blurb}
              </span>
              <span className="mt-4 text-[0.8125rem] font-medium text-defend">
                Open
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>
```

- [ ] **Step 3: Verify build**

Run: `cd web && npm run typecheck && npm run lint && npm run build`
Expected: all pass. (`tone` is no longer used on CAPABILITIES; if lint complains about the `as const` removal it is because a stale `tone` reference remains — remove it.)

- [ ] **Step 4: Deploy so the loops can be recorded from the live site**

Run: `cd web && npm run deploy`
Expected: Vercel prints a production URL; `curl -s -o /dev/null -w "%{http_code}\n" https://adversarial-payments.vercel.app/audit` prints `200`.

- [ ] **Step 5: Commit**

```bash
git add web/components/FeatureLoop.tsx web/app/page.tsx
git commit -m "Show each live surface as a silent loop on the overview, in place of a text card"
```

---

### Task 5: Record the three loops

**Files:**
- Create: `video/record_loops.mjs`
- Create (generated): `web/public/demos/live.mp4`, `agent.mp4`, `audit.mp4`

**Interfaces:**
- Consumes: deployed `/live`, `/agent`, `/audit` (or `BASE_URL`); `/audit` hint ending in `· run complete` (Task 2).
- Produces: three H.264 clips ≤ 25 s, ≤ 4 MB, no audio. Task 8 splices `agent.mp4` (scene s6) and `audit.mp4` (scene s8).

- [ ] **Step 1: Write the recorder**

```js
// video/record_loops.mjs
/**
 * Record the three landing-page loops from the deployed site.
 *
 * Recorded live rather than mocked so what plays on the overview is what a judge gets
 * when they click through. Each clip is trimmed of its first second (page paint) and
 * capped at 25 s, then transcoded to a small H.264 file with no audio track.
 *
 *   node record_loops.mjs            # all three
 *   node record_loops.mjs agent      # one
 *   BASE_URL=http://localhost:3000 node record_loops.mjs audit
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "https://adversarial-payments.vercel.app";
const RAW = path.join(here, "raw_loops");
const OUT = path.join(here, "..", "web", "public", "demos");
const MAX_S = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setRange(page, idx, frac) {
  await page.evaluate(([i, f]) => {
    const el = document.querySelectorAll("input[type=range]")[i];
    if (!el) return;
    const lo = Number(el.min), hi = Number(el.max);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(lo + (hi - lo) * f));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [idx, frac]);
}

const LOOPS = {
  async live(page) {
    await page.goto(`${BASE}/live`, { waitUntil: "networkidle" });
    const first = page.locator("input[type=range]").first();
    await first.waitFor({ timeout: 30_000 });
    await first.scrollIntoViewIfNeeded();
    await sleep(1500);
    for (const f of [0.15, 0.85, 0.5]) {
      await setRange(page, 0, f);
      await sleep(1500);
    }
    await setRange(page, 1, 0.9);
    await sleep(1500);
    const run = page.getByRole("button", { name: "Run the attack" });
    if (await run.isVisible({ timeout: 2000 }).catch(() => false)) {
      await run.click();
      await page.getByRole("button", { name: "searching…" }).waitFor({ state: "hidden", timeout: 30_000 });
    }
    await sleep(4000);
  },

  async agent(page) {
    await page.goto(`${BASE}/agent`, { waitUntil: "networkidle" });
    const off = page.getByRole("button", { name: "Fire with defenses OFF" });
    await off.waitFor({ timeout: 30_000 });
    await off.scrollIntoViewIfNeeded();
    await sleep(1500);
    for (const [btn, label] of [[off, "Defenses off"], [page.getByRole("button", { name: "Fire with defenses ON" }), "Defenses on"]]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        await btn.click();
        await page.getByRole("button", { name: "running…" }).waitFor({ state: "hidden", timeout: 60_000 });
        const failed = await page.getByText(`${label} — failed`).count();
        if (!failed) break;
        console.warn(`  ${label}: failed, retrying once`);
        await sleep(3000);
      }
      await sleep(3500);
    }
    await sleep(2000);
  },

  async audit(page) {
    await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("hint")?.textContent.includes("run complete"), null, { timeout: 30_000 });
    await sleep(800);
    await page.locator("#rows tr").last().click();
    await sleep(3500);
  },
};

async function record(name) {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const dir = path.join(RAW, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.zoom = "1.35"; });
  });
  console.log(`${name}: recording from ${BASE}`);
  await LOOPS[name](page);
  await context.close();
  await browser.close();

  const webm = fs.readdirSync(dir).find((f) => f.endsWith(".webm"));
  const out = path.join(OUT, `${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", "1", "-i", path.join(dir, webm), "-t", String(MAX_S),
    "-an", "-vf", "fps=30,scale=1920:1080,setsar=1", "-c:v", "libx264", "-crf", "26", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
  ]);
  const bytes = fs.statSync(out).size;
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim();
  console.log(`  wrote ${out}: ${Number(dur).toFixed(1)}s, ${(bytes / 1e6).toFixed(2)} MB`);
  if (bytes > 4_000_000) console.warn("  over 4 MB — raise -crf to 28 and re-run");
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOOPS);
for (const name of wanted) {
  if (!LOOPS[name]) throw new Error(`unknown loop ${name}; one of ${Object.keys(LOOPS).join(", ")}`);
  await record(name);
}
```

Also add `raw_loops/` and `raw_pitch/` to `video/.gitignore` (create the file if absent, alongside whatever ignores `raw/` and `raw_wf/` today — check `git check-ignore video/raw` first; if the root `.gitignore` handles them, add the two new names there in the same block).

- [ ] **Step 2: Record**

Run: `cd video && node record_loops.mjs`
Expected: three `wrote ...` lines, each ≤ 25.0 s and ≤ 4 MB. Open each mp4 and confirm: `live` shows the score bar moving; `agent` shows an `EXPLOITED` or `HELD` card for both fires and **no** `— failed` card; `audit` ends on an amber row with `nothing ran — not grounded` in the detail pane. If `agent` shows a failure card twice, wait 60 s (rate limit) and re-run `node record_loops.mjs agent`.

- [ ] **Step 3: Confirm on the site, deploy**

Run: `cd web && npm run build && npm run deploy`, then open the deployed overview.
Expected: three loops autoplay silently beside their headings.

- [ ] **Step 4: Commit**

```bash
git add video/record_loops.mjs web/public/demos/*.mp4 .gitignore video/.gitignore
git commit -m "Record the three overview loops from the deployed site"
```
(Omit whichever `.gitignore` path was not touched.)

---

### Task 6: Pitch narration and motion page

**Files:**
- Create: `video/pitch_narration.json`
- Create: `video/pitch.html`

**Interfaces:**
- Produces: `pitch_narration.json` scene ids `s1…s11`, with `clip` set on `s6` and `s8`. `pitch.html` reads `window.SLOTS` (`{[id]: ms}`) and `?scenes=` and publishes `window.TOTAL_MS`. Task 8 depends on both.

- [ ] **Step 1: Write the narration**

```json
{
  "note": "The only file a human edits. `seconds` is the narrator's target; the real slot is the recorded WAV's length. `clip` scenes take their slot from the loop's duration instead, so record those two lines to fit the number build_pitch.mjs prints.",
  "voice": "Microsoft Zira Desktop",
  "rate": 0,
  "scenes": [
    { "id": "s1", "seconds": 15,
      "text": "This is Assay. An assay is the test that tells you how much real metal is in a coin. We built one for security numbers. Specifically, the numbers a payment fraud defence reports about itself." },
    { "id": "s2", "seconds": 25,
      "text": "Here is the problem. A fraud detector gets a PR-AUC on a held-out set, and that number goes into a deck. Nobody attacked it. Nobody checked whether the attacker they imagined could exist. Razorpay's brief asks for honest metrics. So our whole project is one loop: attack a defence, measure it, defend, measure again, and publish whatever comes out." },
    { "id": "s3", "seconds": 30,
      "text": "First result. Indirect prompt injection against a payment agent. Payloads planted where a payment system really ingests untrusted text: memos, merchant names, dispute evidence. One hundred forty-four trials per arm, on two independent hundred-and-twenty-billion-parameter models. With the defence stack on, the exploit rate went from four point nine percent to zero on GPT-OSS, significant at p equals point zero one five, with zero false refusals on benign controls. On Nemotron alone it is not significant. One exploit survived. We publish that row too." },
    { "id": "s4", "seconds": 25,
      "text": "Second result, and the one I would most want you to remember. Two attackers, same detector, both report one hundred percent success. Ours may only move what a real fraudster controls. The other one moves anything. Ninety-nine point nine percent of its evasions land at a merchant that does not exist. Same headline number. Completely different thing. That audit runs before any number is reported." },
    { "id": "s5", "seconds": 30,
      "text": "Now the row that did not work. On the tabular detector, three rounds of adversarial retraining stopped zero evasions. Attack success stayed at one hundred percent. What moved was cost. Median queries per success rose from two seventy-five to three ninety-one, and we paid one point six percent of PR-AUC for it. That is the finding. The model-layer defence buys attacker effort, not safety. So the defence has to live somewhere else." },
    { "id": "s6", "seconds": 25, "clip": "agent",
      "text": "This is the live site. I pick a payload planted in a payment memo and fire it at a real model with the defences off. The payee's account moves. Same payload, defences on: an injection classifier, tool scoping, and a human-in-the-loop threshold. It holds." },
    { "id": "s7", "seconds": 45,
      "text": "Architecture. One loop: train a detector, attack it, retrain on the evasions, repeat. The constraint contract sits at the attack's entry. It is a frozen schema, and the attacker calls validate before every perturbation, so a feature change fails loudly instead of producing a meaningless number. The same loop drives the second surface, with the agent's defence stack in place of retraining. Every run writes an artifact with a placeholder flag and a git SHA, and the site reads those files. Nothing on it is typed by hand." },
    { "id": "s8", "seconds": 25, "clip": "audit",
      "text": "That provenance rule is now a console. Every claim carries its evidence type. Green means a test or a file backs it. Amber means nothing ran. Five of our own artifacts are amber, and they stay that way until something runs." },
    { "id": "s9", "seconds": 35,
      "text": "What broke. Four things, all still in the history. We promised attack success would collapse. It did not, and every caption was corrected. We blamed the training dosage. A five-thousand-fold sweep refuted that. The decision threshold was fitted on the test split until August thirtieth, which made every earlier number incomparable. We said so and re-measured. And a trainer that never ran was reported, rather than deleted from the log." },
    { "id": "s10", "seconds": 20,
      "text": "Still unverified: per-round PR-AUC and the latency file, both marked as such on the site. Next is mapping the injection channels onto Razorpay's real surfaces. Payment notes, payment-link descriptions, dispute evidence. And running the corpus there." },
    { "id": "s11", "seconds": 15,
      "text": "A security number nobody attacked is decoration. Assay is the test. The repo, the live site, and the audit console are linked below. Thanks." }
  ]
}
```

- [ ] **Step 2: Write `pitch.html`**

Same stylesheet as `workflow.html` plus a few additions. Every on-screen figure is annotated with its artifact.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Assay — pitch</title>
<style>
  /* Every figure below is read from a committed artifact carrying placeholder:false.
     scorecard.json · attack/rounds.json · attack/feasibility.json · agentic/redteam*.json
     · detect/rounds.json. Nothing here is illustrative. */
  :root{
    --bg:#080a0f; --panel:#11151f; --line:#232a39;
    --text:#e8edf7; --muted:#8b97ad;
    --attack:#ff4d5e; --defend:#22d3a6; --warn:#f5b544;
    --mono:'Cascadia Code','SF Mono',Consolas,monospace;
    --sans:'Segoe UI',system-ui,sans-serif;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1920px;height:1080px;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--sans)}
  .stage{position:relative;width:1920px;height:1080px}
  .scene{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 140px}
  .scene.on{opacity:1}
  .kicker{font-family:var(--mono);font-size:20px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted);margin-bottom:26px}
  h1{font-size:104px;font-weight:700;letter-spacing:-.03em;line-height:1.02;text-align:center}
  h2{font-size:60px;font-weight:650;letter-spacing:-.02em;text-align:center;line-height:1.1;max-width:1500px}
  .sub{margin-top:26px;font-size:30px;color:var(--muted);text-align:center;max-width:1300px;line-height:1.45}
  .big{font-family:var(--mono);font-size:150px;font-weight:700;letter-spacing:-.04em}
  .att{color:var(--attack)} .def{color:var(--defend)} .wrn{color:var(--warn)}
  .rise{opacity:0;transform:translateY(18px)}
  .rise.in{opacity:1;transform:none;transition:opacity .7s ease,transform .7s ease}
  .pipe{display:flex;align-items:center;gap:34px;margin-top:70px}
  .node{background:var(--panel);border:2px solid var(--line);border-radius:18px;padding:30px 40px;text-align:center;min-width:250px;transform:scale(.9);opacity:.25}
  .node .t{font-size:27px;font-weight:650}
  .node .s{font-family:var(--mono);font-size:19px;color:var(--muted);margin-top:10px}
  .node.lit{opacity:1;transform:scale(1);border-color:var(--defend);box-shadow:0 0 60px -12px var(--defend)}
  .node.hot{opacity:1;transform:scale(1);border-color:var(--attack);box-shadow:0 0 60px -12px var(--attack)}
  .arrow{font-size:40px;color:var(--line)} .arrow.lit{color:var(--defend)}
  .pair{display:flex;gap:60px;margin-top:60px}
  .stat{background:var(--panel);border:2px solid var(--line);border-radius:18px;padding:40px 56px;min-width:560px;text-align:center}
  .stat .v{font-family:var(--mono);font-size:96px;font-weight:700;letter-spacing:-.04em}
  .stat .l{font-size:24px;color:var(--muted);margin-top:14px}
  .split{width:1250px;height:74px;display:flex;border-radius:14px;overflow:hidden;margin-top:56px;border:2px solid var(--line)}
  .split .a{background:var(--attack);width:0} .split .b{background:var(--defend);width:0}
  .legend{display:flex;gap:60px;margin-top:30px;font-family:var(--mono);font-size:25px;color:var(--muted)}
  .bars{display:flex;align-items:flex-end;gap:26px;height:340px;margin-top:60px}
  .bar{width:150px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
  .bar .col{width:100%;border-radius:10px 10px 0 0;height:0;background:var(--attack)}
  .bar .col.q{background:var(--warn)}
  .bar .lb{font-family:var(--mono);font-size:20px;color:var(--muted);margin-top:14px}
  .bar .vl{font-family:var(--mono);font-size:22px;margin-bottom:10px}
  table{margin-top:56px;border-collapse:collapse;font-size:29px}
  th,td{padding:22px 40px;border-bottom:1px solid var(--line);text-align:left}
  th{font-family:var(--mono);font-size:20px;letter-spacing:.14em;color:var(--muted);text-transform:uppercase}
  td.m{font-family:var(--mono)}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:56px;width:1500px}
  .card{background:var(--panel);border:2px solid var(--line);border-radius:18px;padding:30px 36px}
  .card .k{font-family:var(--mono);font-size:19px;letter-spacing:.14em;text-transform:uppercase;color:var(--attack)}
  .card .b{font-size:26px;margin-top:10px;line-height:1.35}
  .card .f{font-size:22px;color:var(--defend);margin-top:12px;line-height:1.35}
  .links{margin-top:60px;font-family:var(--mono);font-size:30px;color:var(--muted);line-height:1.8;text-align:center}
  .foot{position:absolute;bottom:52px;font-family:var(--mono);font-size:19px;color:var(--muted)}
</style>
</head>
<body>
<div class="stage">

  <section class="scene" id="s1">
    <div class="kicker">Razorpay AI Buildathon 2026 · Open Track</div>
    <h1>Assay</h1>
    <p class="sub">An assay determines the true metal content of a coin.<br>This one does it to a security number.</p>
  </section>

  <section class="scene" id="s2">
    <div class="kicker">The problem</div>
    <h2>A fraud-detection number nobody attacked is decoration.</h2>
    <div class="pipe" style="margin-top:80px">
      <div class="node" id="p1"><div class="t">Attack</div><div class="s">what a fraudster controls</div></div>
      <div class="arrow" id="pa1">→</div>
      <div class="node" id="p2"><div class="t">Measure</div><div class="s">attack success</div></div>
      <div class="arrow" id="pa2">→</div>
      <div class="node" id="p3"><div class="t">Defend</div><div class="s">retrain · classify · scope</div></div>
      <div class="arrow" id="pa3">→</div>
      <div class="node" id="p4"><div class="t">Re-measure</div><div class="s">publish, whatever it says</div></div>
    </div>
  </section>

  <section class="scene" id="s3">
    <div class="kicker">Result one · payment agent · agentic/redteam-groq.json</div>
    <h2>Indirect prompt injection, 144 trials per arm, two 120B models</h2>
    <div class="pair">
      <div class="stat rise" id="s3a"><div class="v att">4.86%</div><div class="l">exploit rate, defences off</div></div>
      <div class="stat rise" id="s3b"><div class="v def">0.0%</div><div class="l">defences on · p = 0.015 · 0% false refusals</div></div>
    </div>
    <p class="sub rise" id="s3c">nemotron-120b alone: not significant (p = 0.214). Published anyway.</p>
  </section>

  <section class="scene" id="s4">
    <div class="kicker">Result two · feasibility audit · attack/feasibility.json</div>
    <h2>Two attackers. Same detector. Both report 100%.</h2>
    <div class="split"><div class="a" id="spa"></div><div class="b" id="spb"></div></div>
    <div class="legend"><span class="att">■ 99.9% at a merchant that does not exist</span><span class="def">■ physically possible</span></div>
    <p class="sub rise" id="s4c">Same number. Completely different thing.</p>
  </section>

  <section class="scene" id="s5">
    <div class="kicker">The honest row · scorecard.json · attack/rounds.json</div>
    <h2>Adversarial retraining stopped zero evasions. It raised the price.</h2>
    <div class="bars" id="rounds">
      <div class="bar"><div class="vl">1.000</div><div class="col" data-h="300"></div><div class="lb">ASR r0</div></div>
      <div class="bar"><div class="vl">1.000</div><div class="col" data-h="300"></div><div class="lb">ASR r1</div></div>
      <div class="bar"><div class="vl">1.000</div><div class="col" data-h="300"></div><div class="lb">ASR r2</div></div>
      <div class="bar"><div class="vl">1.000</div><div class="col" data-h="300"></div><div class="lb">ASR r3</div></div>
      <div class="bar" style="margin-left:80px"><div class="vl">275</div><div class="col q" data-h="211"></div><div class="lb">queries r0</div></div>
      <div class="bar"><div class="vl">391</div><div class="col q" data-h="300"></div><div class="lb">queries r3</div></div>
    </div>
    <p class="sub rise" id="s5c">PR-AUC 0.947 → 0.932 (−1.6%). The defence has to live elsewhere.</p>
  </section>

  <section class="scene" id="s7">
    <div class="kicker">Architecture</div>
    <h2>One loop, two surfaces, one scorecard</h2>
    <div class="pipe">
      <div class="node" id="n1"><div class="t">Train</div><div class="s">XGBoost · 1.85M rows</div></div>
      <div class="arrow" id="a1">→</div>
      <div class="node" id="n2"><div class="t">Constraint contract</div><div class="s">schema.validate() at entry</div></div>
      <div class="arrow" id="a2">→</div>
      <div class="node" id="n3"><div class="t">Attack</div><div class="s">coordinate descent</div></div>
      <div class="arrow" id="a3">→</div>
      <div class="node" id="n4"><div class="t">Retrain</div><div class="s">on the evasions</div></div>
    </div>
    <div class="pipe" style="margin-top:40px">
      <div class="node" id="n5"><div class="t">Payment agent</div><div class="s">memo · merchant · dispute</div></div>
      <div class="arrow" id="a5">→</div>
      <div class="node" id="n6"><div class="t">Defence stack</div><div class="s">classifier · tool scoping · HITL</div></div>
      <div class="arrow" id="a6">→</div>
      <div class="node" id="n7"><div class="t">artifacts/</div><div class="s">placeholder:false · git_sha</div></div>
    </div>
  </section>

  <section class="scene" id="s9">
    <div class="kicker">Failure recovery</div>
    <h2>What broke, and how we recovered</h2>
    <div class="cards">
      <div class="card rise" id="c1"><div class="k">1 · broke</div><div class="b">Promised attack success would collapse.</div><div class="f">It did not. Every caption corrected; headline became attacker cost.</div></div>
      <div class="card rise" id="c2"><div class="k">2 · broke</div><div class="b">Blamed under-dosed adversarial training.</div><div class="f">5000× sweep: ASR unmoved, −22.3% PR-AUC. Explanation withdrawn.</div></div>
      <div class="card rise" id="c3"><div class="k">3 · broke</div><div class="b">Threshold fitted on the test split until Aug 30.</div><div class="f">Named the split, added a tripwire, re-measured.</div></div>
      <div class="card rise" id="c4"><div class="k">4 · broke</div><div class="b">A trainer that never ran was reported.</div><div class="f">Reported the error rather than deleting it from history.</div></div>
    </div>
  </section>

  <section class="scene" id="s10">
    <div class="kicker">Still unverified · and next</div>
    <h2>Marked unverified: per-round PR-AUC, latency.json</h2>
    <p class="sub">Next: map the injection channels onto Razorpay surfaces — payment notes, payment-link descriptions, dispute evidence — and run the corpus there.</p>
  </section>

  <section class="scene" id="s11">
    <div class="kicker">Why it should exist</div>
    <h1 style="font-size:84px">A number nobody attacked is decoration.</h1>
    <div class="links">adversarial-payments.vercel.app<br>adversarial-payments.vercel.app/audit<br>github.com/Aditya-Patil27/mastercard-adversarial-payments</div>
  </section>

  <div class="foot" id="foot"></div>
</div>

<script>
// Slots come from the narrator's audio, injected by record_pitch as window.SLOTS = {id: ms}.
// Standalone preview (no SLOTS): 8 s each. ?scenes=s1,s2 records a subset in one run.
const el = id => document.getElementById(id);
const lit = (...ids) => ids.forEach(i => el(i).classList.add("lit"));
const hot = (...ids) => ids.forEach(i => el(i).classList.add("hot"));
const rise = id => el(id).classList.add("in");
const grow = id => [...el(id).querySelectorAll(".col")].forEach((c,k)=>
  setTimeout(()=>{ c.style.transition="height .9s cubic-bezier(.2,.8,.2,1)"; c.style.height=c.dataset.h+"px"; }, k*150));

// Beats are fractions of the slot, so they land wherever the narrator's pace puts them.
const BEATS = {
  s2: [[.30,()=>lit("p1","pa1")],[.45,()=>lit("p2","pa2")],[.60,()=>hot("p3")],[.62,()=>lit("pa3")],[.75,()=>lit("p4")]],
  s3: [[.35,()=>rise("s3a")],[.55,()=>rise("s3b")],[.85,()=>rise("s3c")]],
  s4: [[.40,()=>{ el("spa").style.transition="width 1.2s ease"; el("spb").style.transition="width 1.2s ease"; el("spa").style.width="99.9%"; el("spb").style.width="0.1%"; }],[.80,()=>rise("s4c")]],
  s5: [[.20,()=>grow("rounds")],[.80,()=>rise("s5c")]],
  s7: [[.08,()=>lit("n1","a1")],[.20,()=>hot("n2")],[.22,()=>lit("a2")],[.38,()=>hot("n3")],[.40,()=>lit("a3")],[.50,()=>lit("n4")],
       [.62,()=>lit("n5","a5")],[.72,()=>lit("n6","a6")],[.85,()=>lit("n7")]],
  s9: [[.10,()=>rise("c1")],[.32,()=>rise("c2")],[.55,()=>rise("c3")],[.78,()=>rise("c4")]],
};

const param = new URLSearchParams(location.search).get("scenes");
const ORDER = ["s1","s2","s3","s4","s5","s7","s9","s10","s11"];
const scenes = param ? param.split(",") : ORDER;
const slots = window.SLOTS || Object.fromEntries(ORDER.map(id => [id, 8000]));

let at = 0;
scenes.forEach(id => {
  const dur = slots[id];
  if (!dur) throw new Error("no slot for " + id);
  setTimeout(() => {
    document.querySelectorAll(".scene").forEach(s => s.classList.remove("on"));
    el(id).style.transition = "opacity .55s ease";
    el(id).classList.add("on");
    el("foot").textContent = "artifacts/ · placeholder: false · " + id.toUpperCase();
    (BEATS[id] || []).forEach(([f, fn]) => setTimeout(fn, f * dur));
  }, at);
  at += dur;
});
window.TOTAL_MS = at;
</script>
</body>
</html>
```

- [ ] **Step 3: Preview**

Open `video/pitch.html` in a browser (double-click). Expected: nine scenes cycle at 8 s each; s4's bar fills red; s5's bars grow; s9's four cards rise in. Also open `video/pitch.html?scenes=s3,s4` and confirm only those two play.

- [ ] **Step 4: Commit**

```bash
git add video/pitch_narration.json video/pitch.html
git commit -m "Write the Razorpay pitch: eleven scenes, slots driven by the narrator's audio"
```

---

### Task 7: Recording scripts — microphone and SAPI fallback

**Files:**
- Create: `video/rec.ps1`
- Create: `video/make_pitch_narration.ps1`

**Interfaces:**
- Produces: `video/audio_pitch/<id>.wav` for every scene id in `pitch_narration.json` (48 kHz mono for `rec.ps1`; 22.05 kHz mono from SAPI — Task 8 normalises both).

- [ ] **Step 1: Write `rec.ps1`**

```powershell
# Record one scene's narration from the microphone into audio_pitch/<scene>.wav.
#
#   powershell -File rec.ps1 -Scene s3
#
# Prints the line and its target length, then records until you type q and Enter.
# Re-run the same scene to retake it. Any recorder that writes audio_pitch/<id>.wav works too.
param(
    [Parameter(Mandatory = $true)][string]$Scene,
    [string]$Device = "Microphone Array (AMD Audio Device)"
)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $here "pitch_narration.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$s = $cfg.scenes | Where-Object { $_.id -eq $Scene }
if (-not $s) { Write-Error "no scene '$Scene' in pitch_narration.json"; exit 1 }
$out = Join-Path $here "audio_pitch"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$wav = Join-Path $out ($Scene + ".wav")

Write-Host ""
Write-Host ("[{0}]  target {1}s{2}" -f $Scene, $s.seconds, $(if ($s.clip) { "  (clip scene: fit the slot build_pitch prints)" } else { "" }))
Write-Host ""
Write-Host $s.text
Write-Host ""
Write-Host "Recording. Type q then Enter to stop."
ffmpeg -y -loglevel error -f dshow -i "audio=$Device" -ac 1 -ar 48000 $wav
$secs = ffprobe -v error -show_entries format=duration -of csv=p=0 $wav
Write-Host ("saved {0}  ({1:N1}s)" -f $wav, [double]$secs)
```

- [ ] **Step 2: Write `make_pitch_narration.ps1`**

```powershell
# SAPI fallback: render every scene that has no WAV yet, so the pitch builds with or
# without a human take. -Force re-renders everything (it will overwrite human takes).
param([switch]$Force)
Add-Type -AssemblyName System.Speech
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "audio_pitch"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$cfg = Get-Content (Join-Path $here "pitch_narration.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($cfg.voice) } catch { Write-Output "voice '$($cfg.voice)' unavailable, using default" }
$synth.Rate = $cfg.rate

foreach ($scene in $cfg.scenes) {
    $wav = Join-Path $out ($scene.id + ".wav")
    if ((Test-Path $wav) -and -not $Force) { Write-Output ("{0,-4} kept (human take present)" -f $scene.id); continue }
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($scene.text)
    $synth.SetOutputToNull()
    $secs = [math]::Round(((Get-Item $wav).Length - 44) / (22050.0 * 2), 2)
    Write-Output ("{0,-4} synthetic {1,5:N1}s / target {2}s" -f $scene.id, $secs, $scene.seconds)
}
$synth.Dispose()
```

- [ ] **Step 3: Dry-run the fallback**

Run: `cd video && powershell -File make_pitch_narration.ps1`
Expected: eleven `synthetic …s / target …s` lines; `ls audio_pitch` shows `s1.wav … s11.wav`.

- [ ] **Step 4: Commit the scripts (not the audio)**

Add `video/audio_pitch/` to the same `.gitignore` block as `raw_loops/`, then:

```bash
git add video/rec.ps1 video/make_pitch_narration.ps1 .gitignore video/.gitignore
git commit -m "Record pitch narration per scene from the microphone, with a synthetic fallback"
```

---

### Task 8: `build_pitch.mjs` — measure, record, pad, concat, mux, verify

**Files:**
- Create: `video/build_pitch.mjs`
- Create (generated): `video/pitch.mp4`, `video/pitch_timeline.json`

**Interfaces:**
- Consumes: `pitch_narration.json` (Task 6), `pitch.html` (`window.SLOTS`, `?scenes=`, `window.TOTAL_MS`), `audio_pitch/*.wav` (Task 7), `web/public/demos/agent.mp4` and `audit.mp4` (Task 5).
- Produces: `pitch.mp4` 1920×1080 H.264 + AAC ≤ 300 s; `pitch_timeline.json`.

- [ ] **Step 1: Write the build script**

```js
// video/build_pitch.mjs
/**
 * Build pitch.mp4 from the narrator's WAVs.
 *
 * Narration first: every motion scene is held for exactly its WAV plus a 0.4 s breath, and
 * the two clip scenes are held for exactly the clip. The page is recorded in runs of
 * consecutive motion scenes so the clips splice in without re-cutting anything. Any
 * mismatch between what the page declared and what the recording measured fails the build
 * rather than shipping a video whose audio drifts.
 *
 *   node build_pitch.mjs              # full build
 *   node build_pitch.mjs --slots      # print slots only (so the narrator can fit the clip scenes)
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const AUDIO = path.join(here, "audio_pitch");
const NORM = path.join(AUDIO, "norm");
const PADDED = path.join(AUDIO, "padded");
const RAW = path.join(here, "raw_pitch");
const DEMOS = path.join(here, "..", "web", "public", "demos");
const OUT = path.join(here, "pitch.mp4");
const BREATH = 0.4;
const MAX_TOTAL = 300;

const cfg = JSON.parse(fs.readFileSync(path.join(here, "pitch_narration.json"), "utf8").replace(/^\uFEFF/, ""));
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const r2 = (x) => Math.round(x * 100) / 100;

// 1. Normalise and measure every WAV; derive slots.
for (const d of [NORM, PADDED, RAW]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
const scenes = cfg.scenes.map((s) => {
  const wav = path.join(AUDIO, `${s.id}.wav`);
  if (!fs.existsSync(wav)) throw new Error(`missing ${wav} — record it with rec.ps1 -Scene ${s.id}, or run make_pitch_narration.ps1`);
  const norm = path.join(NORM, `${s.id}.wav`);
  ff(["-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", norm]);
  const spoken = probe(norm);
  const clip = s.clip ? path.join(DEMOS, `${s.clip}.mp4`) : null;
  if (clip && !fs.existsSync(clip)) throw new Error(`missing ${clip} — run record_loops.mjs ${s.clip}`);
  const slot = r2(clip ? probe(clip) : spoken + BREATH);
  return { ...s, norm, clip, spoken: r2(spoken), slot };
});
for (const s of scenes) {
  const flag = s.clip && s.spoken > s.slot ? `  OVER the clip by ${r2(s.spoken - s.slot)}s -> trimmed` : "";
  console.log(`${s.id.padEnd(4)} spoken ${String(s.spoken).padStart(6)}s  slot ${String(s.slot).padStart(6)}s${flag}`);
}
const total = r2(scenes.reduce((a, s) => a + s.slot, 0));
console.log(`total ${total}s`);
if (process.argv.includes("--slots")) process.exit(0);
if (total > MAX_TOTAL) throw new Error(`total ${total}s exceeds ${MAX_TOTAL}s — tighten the narration`);

// 2. Record the motion scenes in runs of consecutive non-clip scenes.
const runs = [];
for (const s of scenes) {
  if (s.clip) { runs.push({ clip: s }); continue; }
  const last = runs[runs.length - 1];
  if (last && last.motion) last.motion.push(s); else runs.push({ motion: [s] });
}
const slotsMs = Object.fromEntries(scenes.filter((s) => !s.clip).map((s) => [s.id, Math.round(s.slot * 1000)]));
const pageUrl = "file:///" + path.join(here, "pitch.html").replace(/\\/g, "/");

let k = 0;
for (const run of runs) {
  if (!run.motion) continue;
  const ids = run.motion.map((s) => s.id);
  const declared = run.motion.reduce((a, s) => a + s.slot, 0);
  const dir = path.join(RAW, `run${k}`);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  await page.addInitScript((s) => { window.SLOTS = s; }, slotsMs);
  await page.goto(`${pageUrl}?scenes=${ids.join(",")}`, { waitUntil: "load" });
  const pageTotal = (await page.evaluate(() => window.TOTAL_MS)) / 1000;
  if (Math.abs(pageTotal - declared) > 0.05) throw new Error(`run${k}: page declares ${pageTotal}s, build expects ${declared}s`);
  await page.waitForTimeout(pageTotal * 1000 + 900);
  await context.close();
  await browser.close();
  const webm = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".webm")));
  const recorded = probe(webm);
  const lead = Math.max(recorded - 0.9 - declared, 0);  // page load before the timeline started
  if (recorded < declared) throw new Error(`run${k}: recording ${recorded}s shorter than declared ${declared}s`);
  run.file = path.join(RAW, `run${k}.mp4`);
  ff(["-ss", lead.toFixed(3), "-i", webm, "-t", declared.toFixed(3), "-an", "-vf", "fps=30,scale=1920:1080,setsar=1", "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", run.file]);
  console.log(`run${k} [${ids.join(",")}] recorded ${r2(recorded)}s, lead ${r2(lead)}s, kept ${r2(declared)}s`);
  k++;
}

// 3. Pad or trim every WAV to its slot, then concatenate the audio.
const list = [];
for (const s of scenes) {
  const out = path.join(PADDED, `${s.id}.wav`);
  ff(["-i", s.norm, "-af", `apad=whole_dur=${s.slot}`, "-t", String(s.slot), out]);
  list.push(`file '${out.replace(/\\/g, "/")}'`);
}
fs.writeFileSync(path.join(PADDED, "list.txt"), list.join("\n") + "\n");
const narration = path.join(AUDIO, "narration.wav");
ff(["-f", "concat", "-safe", "0", "-i", path.join(PADDED, "list.txt"), "-c:a", "pcm_s16le", narration]);

// 4. Concatenate the video segments in scene order, and mux.
const segments = runs.map((r) => (r.motion ? r.file : r.clip.clip));
const inputs = segments.flatMap((f) => ["-i", f]);
const chain = segments.map((_, i) => `[${i}:v]fps=30,scale=1920:1080,setsar=1[v${i}]`).join(";")
  + ";" + segments.map((_, i) => `[v${i}]`).join("") + `concat=n=${segments.length}:v=1:a=0[v]`;
ff([...inputs, "-i", narration, "-filter_complex", chain, "-map", "[v]", "-map", `${segments.length}:a`,
    "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", OUT]);

// 5. Verify and record the timeline.
const finalDur = probe(OUT);
const audioDur = probe(narration);
if (Math.abs(finalDur - audioDur) > 0.5) throw new Error(`pitch.mp4 is ${finalDur}s but narration is ${audioDur}s`);
if (finalDur > MAX_TOTAL) throw new Error(`pitch.mp4 is ${finalDur}s, over ${MAX_TOTAL}s`);
let at = 0;
const timeline = scenes.map((s) => { const row = { id: s.id, start: r2(at), slot: s.slot, spoken: s.spoken, source: s.clip ? path.basename(s.clip) : "pitch.html" }; at += s.slot; return row; });
fs.writeFileSync(path.join(here, "pitch_timeline.json"), JSON.stringify({ total: r2(finalDur), scenes: timeline }, null, 2) + "\n");
console.log(`\nwrote ${OUT}: ${r2(finalDur)}s, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
```

- [ ] **Step 2: Build with the synthetic narration**

Run: `cd video && node build_pitch.mjs`
Expected: eleven slot lines, three `runN … kept` lines, and `wrote …pitch.mp4: <≤300>s`. Watch `pitch.mp4` end to end. Check: audio and scene changes coincide (s3's stats rise while "four point nine percent" is spoken; s9's cards appear one per error); the agent clip plays during s6; the audit clip during s8; no black gaps.

If `total` exceeds 300 s with synthetic voice, shorten the longest lines in `pitch_narration.json` (s3, s7, s9 first) and rebuild — the human take is usually faster than SAPI at rate 0.

- [ ] **Step 3: Commit the build script and timeline**

Add `video/raw_pitch/` and `video/pitch.mp4` handling: the mp4 is committed (the previous video was), `raw_pitch/` is ignored (Task 5 step 1 added it).

```bash
git add video/build_pitch.mjs video/pitch_timeline.json
git commit -m "Build the pitch from the narrator's audio, clips spliced in, timing verified"
```

---

### Task 9: Human narration, final build, links, upload

**Files:**
- Modify: `video/README.md` (append a "Pitch video" section)
- Modify: `README.md` (header links), `LINKS.md`
- Generated: `video/pitch.mp4` (final)

- [ ] **Step 1: Print the clip slots for the narrator**

Run: `cd video && node build_pitch.mjs --slots`
Expected: prints `s6 … slot 25.00s` and `s8 … slot <audit clip>s` (or shorter if the clips came in under 25 s). Give the narrator those two numbers.

- [ ] **Step 2: Record the eleven lines**

For each scene id, in the user's own terminal: `cd video; powershell -File rec.ps1 -Scene s1` … `-Scene s11`. Retake by re-running the same id. Keep s6 and s8 within their printed slots.

- [ ] **Step 3: Rebuild and watch**

Run: `cd video && node build_pitch.mjs`
Expected: `wrote …pitch.mp4` with total ≤ 300 s; `make_pitch_narration.ps1` is **not** run again, so no synthetic line replaces a human one. Watch end to end once more.

- [ ] **Step 4: Document the rebuild**

Append to `video/README.md`:

```markdown
## Pitch video (Razorpay AI Buildathon)

`pitch.mp4`, ~5 min, human-narrated. Same principle as the workflow explainer: the narration
is recorded first and every scene is held for exactly its own audio.

```bash
cd video
node record_loops.mjs                     # three loops from the deployed site -> web/public/demos/
node build_pitch.mjs --slots              # prints the two clip-scene slot lengths for the narrator
powershell -File rec.ps1 -Scene s1        # ... through s11; re-run an id to retake
node build_pitch.mjs                      # record pitch.html, pad, concat, mux, verify
```

`pitch_narration.json` is the only file anyone edits. `make_pitch_narration.ps1` fills any
missing scene with Windows SAPI so the build never blocks on a microphone. Scenes s6 and s8
are the `agent` and `audit` loops; their slot is the clip's length, so those two lines are
recorded to fit. `pitch_timeline.json` records what shipped.
```

- [ ] **Step 5: Upload and link**

Upload `video/pitch.mp4` to YouTube as **unlisted**. Open the link in a private window and confirm it plays. Then:

- `README.md`: in the header link block, replace the `[5-minute pitch](#)` placeholder (or add one beside the existing demo-video link) with the unlisted URL, and add `[Audit console](https://adversarial-payments.vercel.app/audit)`.
- `LINKS.md`: add `**Pitch video (Razorpay, 5 min):** <url>` and `**Audit console:** https://adversarial-payments.vercel.app/audit`.

- [ ] **Step 6: Final commit and push**

```bash
git add video/README.md video/pitch.mp4 README.md LINKS.md
git commit -m "Ship the Razorpay pitch video, and link it with the audit console"
git push origin main
```

Expected: push succeeds; the repo page shows the new README links. Then fill the Buildathon form: Open Track, project name **Assay**, the problem statement from the README's first paragraph, repo URL, the unlisted video URL, and for "what broke and how you recovered" paste the four items from `WhatBroke.tsx` in prose. Target 21:00 IST.

---

## Self-review

**Spec coverage.** A (exporter, console, sync hook, nav link) → Tasks 1–2. B.1 framing → Task 3. B.2 loops → Tasks 4–5. B.3 what-broke → Task 3. C narration, page, recorder, SAPI fallback, build, verification → Tasks 6–8. §4 repo edits → Task 9. §2 framing is embodied in `STEPS`, the hero, s3–s5 order and copy. One deviation from the spec: on a `frames.json` fetch failure the console shows a hint and an empty table rather than Samvad's synthetic demo, because that demo's `meta` map is keyed by the upstream peer names and would throw with the new `PEERS`. The spec is amended to match.

**Placeholders.** None: every code step carries the code; every run step carries the command and the expected output.

**Type consistency.** `build_frames` / `message_id` / `task_status` (Task 1) match the test and the console's `onMessage` fields. `pitch_narration.json` ids `s1…s11` with `clip: "agent"|"audit"` (Task 6) match `build_pitch.mjs` (`s.clip` → `web/public/demos/<clip>.mp4`, Task 8) and the loop names in `record_loops.mjs` (Task 5). `pitch.html` reads `window.SLOTS` and `?scenes=` exactly as `build_pitch.mjs` injects them. `#hint` / `run complete` (Task 2) is what `record_loops.mjs audit` waits on.
