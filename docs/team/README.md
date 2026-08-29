# Team briefs — how five people build this in three days

One brief per person. Read yours, plus §Contracts below. You do not need to read anyone
else's brief, and that is the point.

| | Owner | Brief | Owns these paths |
|---|---|---|---|
| **P1** | Detector & data | [P1-detector.md](P1-detector.md) | `src/adversarial_payments/{data,detect,serving}/`, `scripts/` |
| **P2** | Attack engine | [P2-attack.md](P2-attack.md) | `src/adversarial_payments/{attack,loop}/` |
| **P3** | Agentic red team | [P3-agentic.md](P3-agentic.md) | `src/adversarial_payments/agentic/` |
| **P4** | Dashboard | [P4-dashboard.md](P4-dashboard.md) | `web/` |
| **P5** | Comms & compliance | [P5-comms.md](P5-comms.md) | `docs/`, deck, video, submission |

---

## The one idea that makes parallel work possible

**Nobody waits for anybody.** Every track reads and writes JSON files in `artifacts/`, and
those files already exist as realistic fixtures:

```bash
python scripts/seed_artifacts.py
```

So P4 can build the whole dashboard before the detector exists. P2 can build the attack
engine before P1 finishes features. Each of you replaces your own fixture with real output
when it's ready, and everything downstream keeps working.

Every artifact carries `placeholder: true` until it's real. The dashboard shows an amber
banner while any of them do — so seeded numbers cannot quietly end up in front of a judge.

---

## Setup (everyone, once)

Requires **Python 3.12** — not 3.13 or 3.14, the ML stack has no wheels for those yet.

```bash
git clone <repo-url> && cd mastercard

uv venv --python 3.12
uv pip install -e ".[dev]"

python scripts/seed_artifacts.py     # fixtures so everything runs immediately
pytest -q                            # should be 24 passed
```

Frontend people also:

```bash
cd web && npm install && npm run dev  # localhost:3000
```

---

## Contracts

Two files are shared. **Do not edit them without telling the team** — everything else is
yours alone to change freely.

### 1. `src/adversarial_payments/schema.py` — the feature contract

P1 produces these columns; P2 attacks them. It defines three tiers:

- **FROZEN** — the victim's demographics and home geography. An attacker using stolen
  credentials inherits these and cannot forge them.
- **COUPLED** — `category_enc`, `merch_lat`, `merch_long`, `distance_km`. One decision
  ("which merchant do I hit?") moves all four *together*. Perturbing them independently
  produces transactions that cannot physically exist.
- **MUTABLE** — amount, timing, pacing. What a carding operation actually tunes.

`schema.validate(df)` raises on drift. If P1 renames a feature, P2's engine fails loudly at
import instead of reporting a meaningless ASR.

### 2. `src/adversarial_payments/artifacts.py` + `web/lib/types.ts` — the data contract

The pipeline writes JSON, the dashboard reads it. These two files are **one contract in two
languages**, and `tests/test_artifacts.py` fails if they drift. If you add a field to a
dataclass in `artifacts.py`, add it to `types.ts` in the same commit.

Writing your results:

```python
from adversarial_payments import artifacts as A

A.write("attack_rounds", rounds, placeholder=False)   # placeholder=False = this is real
```

| Artifact kind | Written by | Read by |
|---|---|---|
| `detect_rounds` | P1 | P4, notebook |
| `attack_rounds`, `attack_examples` | P2 | P4, notebook |
| `agentic_redteam` | P3 | P4 |
| `graph` | P2 | P4 |
| `scorecard` | P2 + P3 | P4 — the terminal node |

---

## Git

Directory ownership means conflicts should be rare. Keep it simple:

```bash
git pull --rebase          # before you start, and often
# ... work only in your own directories ...
git add <your paths>
git commit -m "..."
git push
```

Push small and often. A three-day project dies on a Day-3 merge of five long-lived branches.

**Never commit:** `data/raw/*` (gitignored, hundreds of MB), `.env`, model binaries.
**Always commit:** your `artifacts/*.json` — that's what makes the demo work without training.

---

## Gates

| When | Gate | Owner |
|---|---|---|
| Day 1 end | `schema.py` frozen against real Sparkov data | P1 |
| Day 1 end | Deadline, deliverable format and rules confirmed | **P5 — blocking** |
| Day 2 end | A real ASR number exists | P2 |
| Day 3 midday | Code freeze. Comms only after. | all |

---

## Working with AI

Most of us are coding with Claude. Start your session by pasting:

> Read `docs/team/<your-brief>.md` and `docs/superpowers/specs/2026-08-29-adversarial-payments-design.md`.
> I own only the paths listed in my brief — do not edit files owned by anyone else.
> Work through my brief's task list in order, running the tests after each task.

Two rules that matter more than usual here:

1. **Run the code.** A number that has never executed is not a result. We are reporting ASR
   to judges who may ask how it was computed.
2. **Don't invent numbers.** If something isn't working, say so and leave the fixture in
   place with `placeholder: true`. The banner exists precisely so that's a safe thing to do.
