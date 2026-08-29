# Build guide

How to get this running, what each command does, and what to do when it breaks. Your
[brief](README.md) says *what* you own; this says *how* to run it.

Every command here has been executed against the real repo. Where output is shown, that is
the actual output, not an illustration.

## If you're new to this codebase

Three ideas explain almost everything about how it's organised:

**1. Nothing waits for anything.** Each track writes its results into small JSON files in
`artifacts/`. Everyone else reads those files. So the website can be built before the
detector exists, and the attack engine before the data is ready — each of you swaps in real
results when they're ready, and nothing downstream breaks.

**2. Fake results are labelled, loudly.** Every result file carries a `placeholder` flag.
While it's `true`, the website shows a large amber banner naming that exact file. This means
shipping something unfinished is *safe* — the banner tells the truth for you. It also means
nobody can accidentally show a judge an invented number.

**3. The demo never computes anything.** The website reads finished results and draws them.
No training, no API calls, nothing that can time out while a judge is looking at it.

Two commands are worth knowing before anything else:

```bash
python -m adversarial_payments.loop.flows   # safe: shows current results, changes nothing
pytest -q                                   # are we healthy?
```

The first one is read-only unless you add `--recompute`. That matters when several people
share a repo.

**Live status board:** [STATUS.md](STATUS.md) is the source of truth for what's finished. The
table below is a snapshot and may lag it.

---

## What's finished right now

**[STATUS.md](STATUS.md) is the source of truth.** Check it each morning. This guide
deliberately does not repeat the state of each artifact — two documents disagreeing about
what is real is worse than either alone, and that has already bitten us once today.

To see the current results yourself, read-only and safe:

```bash
python -m adversarial_payments.loop.flows
```

Two figures are worth knowing before you quote anything:

- **PR-AUC 0.829** is real and honest — but it was trained on `n_train=96,000`, a subsample
  of 1.85M rows. Carry that qualifier everywhere the number appears.
- **Latency 6.6 ms** is *not quotable yet*. It was measured 100 times against XGBoost
  directly; the spec calls for 1,000 against an exported ONNX model. Indicative only.

---

## Prerequisites

| | Version | Check |
|---|---|---|
| Python | **3.12** — not 3.13/3.14 | `py -0p` |
| Node | 20+ (22 tested) | `node --version` |
| uv | any recent | `uv --version` |
| Disk | ~2 GB | Sparkov is ~350 MB raw, 145 MB parquet |

Python 3.14 will fail on the ML stack — no wheels. If `py -0p` doesn't list 3.12, install it
before anything else.

---

## First-time setup

```bash
git clone https://github.com/Aditya-Patil27/mastercard-adversarial-payments.git
cd mastercard-adversarial-payments

uv venv --python 3.12
uv pip install -e ".[dev]"

pytest -q
```

Expect all green — the count climbs as people add tests, so don't treat a specific number
as the target. If anything **fails**, stop and post it; don't build on a red suite.

At this point the dashboard already works, because artifacts are committed:

```bash
cd web && npm install && npm run dev      # http://localhost:3000
```

### Get the data (P1 and P2 need it; P3 and P5 don't)

`data/` is gitignored — 145 MB doesn't belong in the repo, so everyone fetches their own:

```bash
python scripts/fetch_data.py
```

Downloads Sparkov via `kagglehub` into `data/raw/`, then writes `data/interim/sparkov.parquet`.
Needs Kaggle credentials (`~/.kaggle/kaggle.json`) the first time. Takes a few minutes; it
skips the download if the files are already there.

---

## Running things

### The unrolled loop — the centerpiece

Read-only by default. **It will not overwrite anyone's artifacts unless you pass
`--recompute`**, which matters when five people share a repo:

```bash
python -m adversarial_payments.loop.flows
```

```
RECOMPUTE=False -- reading committed artifacts (PLACEHOLDER)
  round 0: ASR=0.713 (3565/5000) mean_l0=2.10 median_queries=37
  round 1: ASR=0.342 (1710/5000) mean_l0=3.40 median_queries=118
  round 2: ASR=0.118 (590/5000) mean_l0=4.80 median_queries=284
  graph: 23 nodes, 24 edges (2 unroll)
```

Those are still fixtures. To compute real ones:

```bash
# fast smoke test -- small sample, few attempts
python -m adversarial_payments.loop.flows --recompute --rows 50000 --attempts 200 --rounds 2

# the real run
python -m adversarial_payments.loop.flows --recompute --write-detect
```

| Flag | Meaning |
|---|---|
| `--recompute` | Actually train and attack. Without it, everything is read from disk. |
| `--rounds N` | Adversarial rounds (default 3) |
| `--rows N` | Subsample — use this while iterating |
| `--attempts N` | Attack attempts per round |
| `--budget N` | Max features the attacker may touch (the L0 cap) |
| `--restarts N` | Random restarts per attack |
| `--orchestrated` | Run through Prefect instead of the plain loop |
| `--write-detect` | Also write `detect/rounds.json` for rounds 1+ |

**Both execution paths must agree.** Run it with and without `--orchestrated` and confirm the
ASR numbers are identical — that equivalence is a claim we make to judges, and P4 verifies it.

### The agentic red team

```bash
python -m adversarial_payments.agentic.redteam
```

Runs from the committed cache with **no network and no API key**. On a cache miss it raises
`CacheMissError` rather than inventing a response — that refusal is deliberate.

### The dashboard

```bash
cd web
npm run dev        # localhost:3000, syncs artifacts first
npm run build      # static export to web/out/
npm run typecheck
```

`npm run sync` copies `artifacts/**.json` into `web/public/data/`. `dev` and `build` do it for
you. If the page shows stale numbers, you skipped the sync.

---

## Environment variables

Defaults are chosen so that a fresh clone with no configuration does the safe thing.

| Var | Default | Effect |
|---|---|---|
| `RECOMPUTE` | `0` | `1` retrains instead of reading artifacts |
| `RUN_ORCHESTRATED` | `1` | `0` runs the plain loop, no Prefect |
| `LLM_LIVE` | `0` | `1` calls the provider; `0` replays cache |
| `LLM_STUB` | `0` | `1` lets the scripted responder bake cache entries |
| `SAMPLE_ROWS` | full | Row cap |

CLI flags override env vars. For P3, copy `.env.example` to `.env` and fill in an OpenRouter
or NVIDIA NIM key.

---

## Agentic: read this before trusting those numbers

The 101 cached responses were produced by a **scripted stub** (`STUB_PROVENANCE =
"scripted-stub-v1"`), not by a real model. No `.env` exists yet, so no LLM has ever been
called.

The stub was the right call for building the harness — it made the loop, the tools, the audit
log and the defenses testable without credentials. But **scripted exploit rates are not
evidence about LLM behaviour**, and presenting them as such is exactly the kind of claim that
collapses under one judge question.

`agentic/redteam.json` is still `placeholder: true`, so the dashboard is currently honest
about this. To make it real:

1. Put a key in `.env`
2. `LLM_LIVE=1 python -m adversarial_payments.agentic.redteam` — populates the cache from the
   real provider
3. Commit the cache, write the artifact with `placeholder=False`
4. Re-run with `LLM_LIVE=0` and confirm it replays identically offline

Until step 4 passes, the agentic row of the scorecard is not submittable.

---

## Daily rhythm

```bash
git pull --rebase
# ... work only inside the paths your brief lists ...
pytest -q
git add <your paths>
git commit -m "..."
git push
```

Push small and often. Five long-lived branches merging on Day 3 is how this project fails.

**Commit** your `artifacts/*.json` — they are what makes the demo run without training.
**Never commit** `data/`, `.env`, or model binaries.

---

## Troubleshooting

**`SchemaViolation: N contracted feature(s) missing`**
Your dataframe drifted from `schema.py`. It names the columns. If you genuinely need a new
feature, that is a team decision — the whole point of the guard is that it isn't a solo one.

**`test_fields_match[X]` fails**
You changed a dataclass in `artifacts.py` without changing `web/lib/types.ts`, or the reverse.
The failure names both sides. Fix both in the same commit.

**`CacheMissError`**
The agentic run needs a response it doesn't have. Either `LLM_LIVE=1` with a key, or
`--bake` to let the stub fill it. It will not fabricate one.

**Prefect hangs ~30 s before doing anything**
Expected. Prefect 3 boots an ephemeral local HTTP server on 127.0.0.1 — it is not truly
in-process. That is why `--orchestrated` is opt-in and the plain loop is the default.

**`Type '(v: number) => string' is not assignable to LabelFormatter`**
Recharts 3 tightened its formatter types. `LabelList` receives `React.ReactNode`; `Tooltip`
receives `ValueType`. Don't annotate the parameter as `number`.

**xgboost/lightgbm won't install**
You're on Python 3.13 or 3.14. Rebuild the venv with `uv venv --python 3.12`.

**Dashboard shows old numbers**
`npm run sync`, or just use `npm run dev`.

**Dashboard shows an amber PLACEHOLDER banner**
Working as designed. It names the files still carrying fixtures. It clears when their writers
emit `placeholder=False`.

---

## Before we submit

P4 owns running these; everyone owns not breaking them.

- [ ] Fresh clone, this guide followed exactly, works
- [ ] `pytest -q` green
- [ ] `--orchestrated` and the plain loop produce identical ASR
- [ ] Agentic replays from cache with no network and no key
- [ ] `npm run build` from a clean `node_modules`
- [ ] Notebook runs top to bottom on committed artifacts without training
- [ ] **No placeholder banner on the deployed page**
- [ ] Every number in the deck traceable to an artifact in the repo

Last one is not a formality. If a figure is on a slide and not in `artifacts/`, either
compute it or cut it.
