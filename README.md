# Adversarial Payments Framework

**Mastercard Innovation Challenge 2026 — AI red teaming for payment security**

A closed-loop red/blue framework, applied to two attack surfaces:

- **Tabular** — a constraint-aware evasion engine against a fraud detector, measuring
  **Attack Success Rate** as the detector is adversarially retrained across rounds.
- **Agentic** — indirect prompt injection against a payment agent, measuring **exploit rate**
  before and after a defense layer.

Both feed one `framework_scorecard`: *surface × attack success before × after × defense cost*.

## Setup

Requires Python 3.12 (not 3.14 — the ML stack has no wheels for it yet).

```bash
uv venv --python 3.12
uv pip install -e ".[dev]"
```

Dataset (Sparkov, ~350 MB) downloads on first run:

```bash
python scripts/fetch_data.py
```

## Running

The demo defaults are chosen so nothing heavy runs during judging:

```bash
streamlit run app/Home.py      # reads committed artifacts/, never trains
RECOMPUTE=1 python -m adversarial_payments.loop.flows   # actually retrain + re-attack
```

| Env var | Default | Effect |
|---|---|---|
| `RECOMPUTE` | `0` | `1` retrains and re-attacks from scratch instead of reading `artifacts/` |
| `RUN_ORCHESTRATED` | `1` | `0` runs identical tasks as a plain loop with no Prefect |
| `LLM_LIVE` | `0` | `1` calls the live LLM; `0` replays cached responses offline |
| `SAMPLE_ROWS` | full | Row cap for fast iteration |

`LLM_LIVE=1` needs `.env` (copy `.env.example`) with an OpenRouter **or** NVIDIA NIM key.

## Ownership

Directories are assigned so five people rarely touch the same file.

| Owner | Directories |
|---|---|
| **P1** detector | `src/adversarial_payments/{data,detect,serving}/`, `scripts/` |
| **P2** attack | `src/adversarial_payments/{attack,loop}/` |
| **P3** agentic | `src/adversarial_payments/agentic/` |
| **P4** dashboard | `app/` |
| **P5** comms | `docs/` |

`schema.py` and `scorecard.py` are **shared contracts** — written Day 1, read-only after.

## Gates

- **Day 1** — `schema.py` frozen; Prefect verified running serverless and offline.
- **Day 2** — first ASR number exists.
- **Day 3 midday** — code freeze; comms only after.

## Docs

- [Design spec](docs/superpowers/specs/2026-08-29-adversarial-payments-design.md) — current, authoritative
- [Strategy](docs/2026-08-22-challenge-strategy.md) — threat taxonomy and approach analysis
- `GenAI Payment Fraud Challenge.pdf` — background research; roadmap appendix, not backlog
