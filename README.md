# Adversarial Payments Framework

**Mastercard Innovation Challenge 2026 — AI red teaming for payment security**

> ## Status — 2026-08-30: five of six results are real
>
> The tabular track has been run end to end on the genuine Sparkov dataset
> (see [Provenance](#provenance)). `attack/rounds`, `attack/examples`, `graph`, `scorecard`
> and `detect/rounds` all carry `placeholder: false` and are safe to quote.
>
> **Every result artifact is now real.** The placeholder banner is gone, the scorecard
> carries **both rows**, and the dashboard is deployed at
> <https://aditya-patil27.github.io/mastercard-adversarial-payments/>.
>
> The agentic corpus ran live against two independent 120B models on two providers and
> replays entirely from cache with no network. **Its defence result is reported as *not*
> statistically significant** — 4.2% to 0.0% on `gpt-oss-120b` is Fisher p=0.245, and
> 1.4% to 0.0% on `nemotron-120b` is p=1.000. The scorecard row computes that p-value and
> says so itself. See [§4.5 of the walkthrough](docs/submission/solution-walkthrough.md).
>
> ### Read this before quoting the headline
>
> **Attack success does not fall across rounds. It is 1.000 at every round.** Three rounds of
> adversarial retraining did not stop a constraint-respecting attacker. What *does* move is
> the attacker's cost, and that is the result we report:
>
> | Round | ASR | mean L0 | median queries |
> |---|---|---|---|
> | 0 | 1.000 | 3.81 | 277 |
> | 1 | 1.000 | 4.26 | 298 |
> | 2 | 1.000 | 4.64 | 492 |
>
> *400 attacked transactions per round, 400,000-row subsample, train 196,001 / val 84,000 /
> test 119,999. Threshold fitted on val at `FPR_BUDGET = 0.001`, never on the test rows the
> attack is scored over. Every figure above is read from
> `artifacts/attack/rounds.json` (`placeholder: false`).*
>
> The defense buys **+0.83 coordinates and +215 median queries of attacker effort**, and does
> not stop a single attempt. That is a defense-in-depth economics claim, not a solved problem,
> and the repo says so everywhere rather than implying a collapse it did not measure.
>
> ⚠️ **Per-round PR-AUC is not yet quotable.** The loop does not write `detect/rounds.json`
> (that file is the detector owner's, and holds a round-0 figure computed under a *different*
> split). The loop's own per-round PR-AUC exists only in its run log, which puts it outside
> the placeholder machinery — the same gap that applies to `latency.json`. Treat
> "PR-AUC holds while attacker cost rises" as **unverified** until those rounds are published
> through `artifacts.py`.

---

## Where the work stands

For teammates picking this up mid-flight. The per-person board with full detail is
[`docs/team/STATUS.md`](docs/team/STATUS.md); this is the one-screen version.

| Area | State | Blocked on |
|---|---|---|
| Data + round-0 detector | ✅ real, 1.85M Sparkov rows | — |
| Constraint engine + attack | ✅ real, 3 rounds run end to end | — |
| Feasibility audit | ⚠️ **computed but never published** | needs an artifact kind |
| Red/Blue orchestrators | ✅ landed, ❌ unwired | API key + a non-saturated baseline |
| Agentic red team | ❌ fixture | **one API key** |
| Dashboard | ✅ builds and serves | never deployed; nobody has opened it in a browser |
| `.docx` walkthrough | 🟡 drafted, 4 `[[PENDING]]` | ASR marker is now fillable |
| Submission | ❌ nothing submitted | all three artifacts, via Writeups |

**The three things worth knowing before you touch anything:**

1. **ASR is 1.000 and does not fall.** Any doc, chart caption or slide still promising a
   collapse is now wrong. The honest headline is attacker *cost*, not attacker failure.
2. **One missing API key blocks two tracks.** `.env` is present and pre-filled; it needs a
   key pasted into `LLM_API_KEY` and `LLM_LIVE=1`. Five minutes, highest leverage in the repo.
3. **The loop's threshold was fitted on the test split until 2026-08-30.** It maximised F1 on
   the rows the attack was scored over, which lifted the bar to ~0.94 and made evasion free.
   It now uses `choose_threshold` at a fixed FPR budget on a held-out validation slice. Any
   ASR measured before that fix is not comparable to one measured after it.

---

## What this is

A closed-loop red/blue framework, applied to **two attack surfaces** and reporting the
**same shape of result** for both.

| | Red team | Blue team | Metric |
|---|---|---|---|
| **Tabular** | Constraint-aware evasion search against an XGBoost fraud detector | Adversarial retraining, 3 rounds | Attack Success Rate |
| **Agentic** | Indirect prompt injection into memos, invoice metadata, merchant names, dispute text | Injection classifier + tool scoping + HITL threshold | Exploit rate |

Both terminate in one table — `framework_scorecard`: *surface × attack success before ×
after × defense cost*. Two rows is the whole claim that this is a **framework**, not two
projects sharing a repo.

### The part that is actually novel

Most adversarial-ML work asks *"can I flip this prediction?"*. Payments demands a harder
question: **"can I flip it using only what an attacker actually controls?"**

A fraudster with stolen credentials inherits the victim's age, home city and job; the
network stamps the timestamp. What they control is the amount, the timing, and which
merchant to hit — and *choosing a merchant moves four features at once* (category, terminal
latitude, terminal longitude, distance), because those are four projections of one decision.
Perturb them independently and you have produced a transaction that cannot physically occur.

So the attack search runs under three projections, enforced at every step:

1. **Immutability** — the victim's attributes are excluded from the search entirely.
2. **Feasibility** — mutable features stay inside the plausible band observed in training,
   and coupled features move as a group or not at all.
3. **Sparsity** — minimise the L0 count of features touched.

This matters commercially, not just aesthetically: **an ASR measured over impossible
transactions is a number you would have to retract under questioning.**

That contract is code, not prose — `src/adversarial_payments/schema.py`, frozen on Day 1,
and the attack engine calls `schema.validate()` at entry so a feature change fails loudly
instead of silently producing a meaningless ASR.

### Why Sparkov and not `creditcard.csv`

The default choice for a fraud demo is the ULB `creditcard.csv`. We rejected it, and the
reason is the reason the project exists.

`creditcard.csv` is PCA-anonymized to `V1`–`V28`. No merchant category. No geography. No
device. On that data the constraint story above is not merely hard to implement — it is
**undefined**. You cannot freeze the MCC because there is no MCC; it has been linearly mixed
into all 28 components. Every projection degenerates to "perturb `V1`–`V28` freely", which is
exactly the unconstrained attack we are arguing against.

And it degenerates *silently*: you can point a constraint-aware engine at it and get a
beautiful ASR-collapse curve. The number would be real and the claim attached to it a
fiction — catchable by any domain judge in one question: *which of those V-columns is the
MCC?*

Sparkov keeps the raw columns, so the claim is literally expressible in the data. The cost,
stated plainly: **Sparkov is itself simulator-generated**, so absolute accuracy figures
should be read as relative across rounds, never as production expectations. We take a weaker
dataset that supports a real claim over a stronger one that supports a fake one.

---

## See the result in 30 seconds — no Python

The dashboard is a **fully static export**: pre-built HTML with the artifact JSON inlined at
build time. No server, no backend, nothing to install. It reads `artifacts/`; it never
trains, by design — so nothing heavy can fail mid-demo, and the results are visible on a
machine that could not build XGBoost.

```bash
# If web/out/ is present, just open it — the export uses relative asset paths,
# so it works straight off the filesystem with no server at all:
open web/out/index.html          # macOS
start web/out/index.html         # Windows
```

> **Note for a judge cloning this repo:** `web/out/` is currently in `.gitignore`, so a fresh
> clone will not contain the built export. Until that changes or a deployed URL is published,
> build it once with the command below. This is a known gap, not the intended final state.

```bash
cd web && npm install && npm run build   # writes web/out/, ~1 min
```

`npm run dev` serves the same thing at `localhost:3000` if you would rather have hot reload.

## Read the argument — `notebooks/submission.ipynb`

The graded artifact. Narrative order: threat model → why Sparkov → the three projections →
ASR and attacker cost across rounds → agentic exploit rate before/after → the unified
scorecard.

It needs only the standard library plus `matplotlib`, because **it reads `artifacts/` and
never trains**. Every number is pulled live from the artifact JSON at render time — nothing
is typed into the prose. Re-run it after a recompute and it shows *your* numbers, so a
disagreement with ours would be visible rather than buried.

The notebook defaults to `RUN_ORCHESTRATED=0` — see [Gates](#gates) for why.

## Reproduce the numbers properly

For anyone who would rather verify than take our word for it:

```bash
uv venv --python 3.12                  # 3.14 has no wheels for this ML stack yet
uv pip install -e ".[dev]"

python scripts/fetch_data.py           # Sparkov, ~200 MB, ~60s
RECOMPUTE=1 python -m adversarial_payments.loop.flows
```

**No Kaggle account or API token is required** — `fetch_data.py` pulls the dataset
anonymously via `kagglehub`. A judge with a network connection gets byte-identical input
data, which is most of what "reproducible" is supposed to mean.

Then re-run the notebook and rebuild the dashboard. Both re-read the regenerated JSON.

| Env var | Default | Effect |
|---|---|---|
| `RECOMPUTE` | `0` | `1` retrains and re-attacks from scratch instead of reading `artifacts/` |
| `RUN_ORCHESTRATED` | `1` in code, **`0` in the notebook** | `0` runs identical tasks as a plain loop with no Prefect |
| `LLM_LIVE` | `0` | `1` calls a live model; `0` replays cached responses with zero network |
| `SAMPLE_ROWS` | full | Row cap for fast iteration |

`LLM_LIVE=1` needs `.env` (copy `.env.example`) with an OpenRouter **or** NVIDIA NIM key.

---

## Provenance

Two things a reader is entitled to know before reading any number.

**1. Machine-checked — is this artifact real?** Every artifact carries a `placeholder` flag.
Seed fixtures ship `true`; only a real run sets it `false`. The dashboard renders a banner
while any is `true`, and the notebook's first cell prints a full audit and substitutes `TK`
for every figure sourced from placeholder data. A fake number cannot silently reach a reader.

To check the current state at any time, run the notebook's first cell, or:

```bash
grep -r '"placeholder"' artifacts/
```

**2. Human-attested — what was it computed on?** Two claims only a person can make, and both
are outstanding:

- **Dataset provenance — ✅ real.** Results are computed on the real Sparkov *Credit Card
  Transactions Fraud Detection* dataset (Kaggle `kartik2112/fraud-detection`): **1,852,394
  transactions from 999 cardholders, 2019-01-01 to 2020-12-31, with 9,651 labelled frauds
  (0.521% base rate)**.

  This is machine-recorded, not asserted: `scripts/fetch_data.py` writes
  `artifacts/data_provenance.json` with a `source` field, and the notebook reads that field
  rather than hardcoding a claim. A deterministic **synthetic fallback**
  (`src/adversarial_payments/data/synthetic.py`, seeded from `config.SEED`) exists for a
  locked-down environment where the download fails; if it ever fires, the provenance file
  records `source: "synthetic"` and both the loader and the notebook print a loud warning. It
  is a repro safety net, never the source of our results — and it is wired so that synthetic
  numbers cannot be presented as real ones even by accident.

- **TK — LLM provenance** (owner: P3). Whether the agentic numbers came from a live model, from
  cached real responses replayed offline, or from a scripted stub that never contacts a model.
  Still a human attestation rather than a file. If it is a stub, that will be stated here and
  in the notebook, before any exploit-rate figure.

Presenting synthetic or simulated results as real ones is the one thing that would
legitimately sink a submission like this, so these lines get filled in truthfully or the
claims come out.

## Known limitations

Stated here rather than discovered later:

- **The tabular attacker has white-box query access to a fixed model.** ASR is an upper bound
  on a strong attacker, not a forecast of live losses.
- **Each round's detector was trained on the previous round's adversarial examples.** At the
  dosage we ran (400 adversarial rows into 196,001) this moved attacker cost but not ASR, so
  there is no robustness claim here to over-read. The honest generalisation test — a held-out
  attack, or a detector trained on a different dataset entirely — is roadmap.
- **The attack becomes expensive, not impossible.** Mean L0 rises across rounds. That is the
  real result, and it is a defense-in-depth economics story, not a solved problem.
- **Residual agentic exploit rate is above zero.** Prompt injection is not solved; a claimed
  100% block rate on a defense this cheap would mean the test set was measuring itself.
- **Our injection corpus is authored by us and finite** — a floor on the attack surface, not a
  census of it.

Deliberately out of scope, described in the background research and named on the roadmap
rather than implied: voice anti-spoofing, graph/AML topology detection, streaming inference
under a p99 latency budget, federated training with differential privacy.

---

## Repository layout

Directories are assigned so five people rarely touch the same file.

| Owner | Directories |
|---|---|
| **P1** detector | `src/adversarial_payments/{data,detect,serving}/`, `scripts/` |
| **P2** attack | `src/adversarial_payments/{attack,loop}/` |
| **P3** agentic | `src/adversarial_payments/agentic/` |
| **P4** dashboard | `web/` |
| **P5** comms | `docs/`, `notebooks/`, `README.md` |

`schema.py` (features) and `artifacts.py` + `web/lib/types.ts` (pipeline → frontend) are
**shared contracts** — written Day 1, read-only after. Both fail loudly rather than drift;
`tests/test_artifacts.py` fails if the Python and TypeScript shapes diverge.

## Gates

- **Day 1** — `schema.py` frozen; Prefect gate run. ✅ Passed, **with a caveat that changed a
  default.** `scripts/check_prefect_offline.py` completes with no remote API, but the log
  shows what "serverless" means in Prefect 3: it boots an ephemeral HTTP server on
  `127.0.0.1` and takes ~29 seconds to do it. Fine on a laptop; a real risk on a locked-down
  judging machine or a kernel that blocks socket binding. So `RUN_ORCHESTRATED=0` was
  promoted from insurance to **the notebook default** — the plain-loop path executes identical
  tasks with no server. Prefect still drives the dashboard's graph, where the 29 seconds is
  paid once at build time and never during judging.
- **Day 2** — first real ASR number exists. ⏳ Outstanding.
- **Day 3 midday** — code freeze; comms only after.

## Docs

- [Design spec](docs/superpowers/specs/2026-08-29-adversarial-payments-design.md) — current, authoritative
- [Submission requirements](docs/2026-08-29-submission-requirements.md) — ⚠️ **all five open questions unresolved; a human must check the challenge portal**
- [Deck outline + demo storyboard](docs/2026-08-31-deck-outline.md)
- [Strategy](docs/2026-08-22-challenge-strategy.md) — threat taxonomy and approach analysis
- `GenAI Payment Fraud Challenge.pdf` — our own background research. **Not a rules document
  and not a deliverable**; roadmap appendix only. Its 69 citations include Reddit and Medium
  sources, and it promises four subsystems we deliberately cut.
