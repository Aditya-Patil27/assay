# Assay

**An assay for security numbers. Payment fraud defences report metrics that nobody has
attacked — this is the test that tells you which of those numbers are real.**

*An assay is the test that determines the true metal content of a coin. This framework does
the same to a security number.*

**[Live dashboard](https://assay-payments.vercel.app)** · **[Audit console](https://assay-payments.vercel.app/audit)** · **[5-minute pitch](https://youtu.be/wjGwf3xRlUU)** ·
**[Architecture](docs/submission/solution-walkthrough.md)** · Razorpay AI Buildathon 2026,
Open Track

---

![The system in 37 seconds: a live injection fired with defences off then on, the detector scoring in the browser, the audit ledger replaying, the three-round results](docs/images/system-37s.gif)

*Thirty-seven seconds of the deployed site. No narration; the pitch has that.*

## Contents



- [Problem statement](#problem-statement)
- [What Assay is](#what-assay-is)
- [Results](#results)
- [How we tackle it: system architecture](#how-we-tackle-it-system-architecture)
- [System design decisions](#system-design-decisions)
- [Security](#security)
- [Where this sits in a Razorpay stack](#where-this-sits-in-a-razorpay-stack)
- [What we got wrong, in public](#what-we-got-wrong-in-public)
- [See it / reproduce](#see-it--reproduce)
- [Provenance](#provenance)
- [Where the work stands](#where-the-work-stands)
- [Related work, and why 1.000 is the expected number](#related-work-and-why-1000-is-the-expected-number)
- [Known limitations](#known-limitations)
- [Repository layout](#repository-layout)
- [Gates](#gates)
- [Docs](#docs)

---

## Problem statement

Most adversarial-ML work asks *"can I flip this prediction?"* Payments demands a harder
question: **"can I flip it using only what an attacker actually controls?"** A fraudster with
stolen credentials inherits the victim's age, home city and job; the network stamps the
timestamp. What they control is the amount, the timing, and which merchant to hit — and
choosing a merchant moves four features at once, because those are four projections of one
decision. Perturb them independently and you have produced a transaction that cannot
physically occur.

**An ASR measured over impossible transactions is a number you would have to retract under
questioning.** Every published robustness figure that skipped this is measuring an attacker
who does not exist. That contract is code, not prose — `src/adversarial_payments/schema.py`,
frozen on day one, and the attack engine calls `schema.validate()` at entry so a feature
change fails loudly instead of silently producing a meaningless ASR.

## What Assay is

![Overview page: the thesis, the live score stream scoring real held-out transactions in the browser, and attack success flat across three rounds while attacker effort climbs](docs/images/overview.png)

One loop, two attack surfaces, one scorecard.

| | Red team | Blue team | Metric |
|---|---|---|---|
| **Tabular** | Constraint-aware evasion search against an XGBoost fraud detector | Adversarial retraining, 3 rounds | Attack Success Rate |
| **Agentic** | Indirect prompt injection into memos, invoice metadata, merchant names, dispute text | Injection classifier + tool scoping + HITL threshold | Exploit rate |

Both terminate in one table — `framework_scorecard`: *surface × attack success before ×
after × defense cost*. Two rows is the whole claim that this is a **framework**, not two
projects sharing a repo.

The tabular attack search runs under three projections, enforced at every step:

1. **Immutability** — the victim's attributes are excluded from the search entirely.
2. **Feasibility** — mutable features stay inside the plausible band observed in training,
   and coupled features move as a group or not at all.
3. **Sparsity** — minimise the L0 count of features touched.

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

## Results

One closed-loop red/blue framework, two attack surfaces, one table.

| Surface | Attack success **before** | **After** | What the defence cost |
|---|---|---|---|
| Tabular fraud detector | 1.000 | **1.000** | PR-AUC 0.947 → 0.932 (−1.6%) |
| Payment agent | 4.86% | **0.0%** | significant at *p* = 0.015 |
| Second-stage detector, evasions it never saw | 0.0% recall | **68.9%** | 94 legitimate declines per 100k · real-fraud recall 89.3% → 87.9% |

**Read the first row before the second.**

On the tabular detector our defence did nothing. Attack success stayed at 1.000 across three
rounds of adversarial retraining. We could have quietly dropped that row. Instead it is the
first thing on this page, because the second row only means something next to it.

On the payment agent the same framework took indirect prompt injection from 4.86% to zero,
across 144 trials per arm on two independent 120B models — with **zero false refusals** on benign controls (from the run log; not yet an artifact), which is the number that decides whether a defence is deployable or merely
strict.

You should trust the second number **because** we showed you the first.

### Results in numbers

Every row below is read from a committed artifact carrying `placeholder: false`; the last
column names the file. Model names, splits and caveats are in the sections that follow.

| Measure | Value | Artifact |
|---|---|---|
| Tabular · attack success per round | 1.000 → 1.000 → 1.000 | `attack/rounds` |
| Tabular · median queries per successful evasion | 275 → 291 → 391 | `attack/rounds` |
| Tabular · mean features touched (L0) | 4.12 → 4.00 → 4.03 | `attack/rounds` |
| Detector · PR-AUC per round | 0.947 → 0.939 → 0.932 | `detect/rounds` |
| Detector · recall per round | 0.916 → 0.896 → 0.890 | `detect/rounds` |
| Feasibility · unconstrained evasions at a merchant that does not exist | 99.9% | `attack/feasibility` |
| Feasibility · unconstrained evasions that forged a frozen attribute | 6.0% | `attack/feasibility` |
| Feasibility · mean features touched, constrained vs unconstrained | 4.12 vs 1.88 | `attack/feasibility` |
| Agent · gpt-oss-120b exploits, defences off → on | 7/144 → 0/144 | `agentic/redteam-groq` |
| Agent · nemotron-120b exploits, defences off → on | 5/144 → 1/144 | `agentic/redteam-nvidia` |
| Agent · pooled, both models | 12/288 → 1/288 | `both redteam files` |
| Second stage · evasions split train / held-out | 283 / 283 | `attack/adversarial_detection` |
| Second stage · recall on held-out evasions, before → after | 0.0% → 68.9% | `attack/adversarial_detection` |
| Second stage · recall on trained-on evasions (memorisation ceiling) | 100.0% | `attack/adversarial_detection` |
| Second stage · legitimate declines per 100k, before → after | 114 → 94 | `attack/adversarial_detection` |
| Second stage · real-fraud recall, before → after | 89.3% → 87.9% | `attack/adversarial_detection` |
| Second stage · PR-AUC, before → after | 0.929 → 0.921 | `attack/adversarial_detection` |
| Serving · latency to score one transaction, p50 / p95 / p99 | 0.035 / 0.081 / 0.145 ms | `latency` |
| Guarantees · cross-language checks / test cases | 4 / 92 | `guarantees` |

![Results page: the per-round cost table and the framework scorecard](docs/images/results-scorecard.png)

The third row is what you do about the first. Retraining never stops the *next* search, but a
detector retrained on half of the evasions catches 68.9% of the half it never saw, at the same
false-positive budget (`artifacts/attack/adversarial_detection.json`, `placeholder: false`).
The defence works one layer out from the model, not inside it.

![Results page: the second-stage detector panel, recall on evasions the model never saw, what it cost legitimate payments, what it cost real-fraud detection](docs/images/second-stage.png)

![Figure: held-out adversarial recall 0.0% to 68.9%, trained-on recall 100% as the memorisation ceiling, real-fraud recall and legitimate declines at the same operating point](docs/submission/figures/adversarial_detection.png)

Every figure above reads from `artifacts/scorecard.json` (`placeholder: false`,
`git_sha 6ca9dbd`). Nothing on this page is typed by hand.

---

## How we tackle it: system architecture

Two lanes that both end in the same scorecard.

```mermaid
flowchart LR
    subgraph Tabular surface
        DATA["data/interim/sparkov.parquet<br/>data/load.py"] --> SCHEMA["schema.py +<br/>attack/constraints.py"]
        SCHEMA --> DETECT["detect/<br/>XGBoost detector"]
        DETECT --> ENGINE["attack/engine.py<br/>coordinate descent"]
        ENGINE --> LOOP["loop/flows.py<br/>retrain on evasions"]
        LOOP -. retrain .-> DETECT
    end
    subgraph Agentic surface
        CORPUS["agentic/<br/>red team corpus"] --> PORT["web/lib/agent<br/>TypeScript port"]
        PORT --> CONFORM["check_agent_conformance.py<br/>conformance check"]
    end
    LOOP --> ART["artifacts.py<br/>Envelope, placeholder flag"]
    CONFORM --> ART
    ART --> WEB["web/<br/>Next.js app, one server route"]
    WEB --> LIVE["/live<br/>in-browser detector"]
    WEB --> AGENT["/agent<br/>one server route"]
    WEB --> AUDIT["/audit<br/>provenance ledger"]
    WEB --> LINEAGE["/lineage<br/>attack lineage graph"]
```

| The attack lineage, `/lineage` | The detector in the browser, `/live` |
|---|---|
| ![Lineage page: task, channel, technique, goal, outcome, with one path lit](docs/images/lineage.png) | ![Live page: the exported detector scoring a transaction in the browser as features are moved](docs/images/live-detector.png) |


One sentence per box, tabular lane:

- **Data** (`data/interim/sparkov.parquet`, loaded by `src/adversarial_payments/data/load.py`)
  — the raw Sparkov transactions, chronologically split into train/val/test.
- **Feature schema + constraint contract** (`schema.py`, `attack/constraints.py`) — the
  frozen feature list and the three projections (immutability, coupling, feasibility) every
  attack candidate must pass.
- **Detector** (`detect/`) — an XGBoost fraud classifier trained on the schema's features.
- **Attack engine** (`attack/engine.py`) — greedy coordinate descent against the detector,
  projected at every step.
- **Loop** (`loop/flows.py`) — retrains the detector on the previous round's evasions, three
  rounds end to end.

One sentence per box, agentic lane:

- **Red team corpus** (`agentic/`) — the injection payloads, scenarios and exploit-scoring
  oracle, in Python.
- **TypeScript port** (`web/lib/agent`) — the same defense stack and exploit oracle,
  re-implemented for the server route that holds the model key.
- **Conformance check** (`scripts/check_agent_conformance.py`) — proves the TypeScript port
  agrees with the Python original span-for-span before either is trusted.

Where both lanes land:

- **Artifacts** (`artifacts.py`) — every stage writes a JSON envelope carrying a
  `placeholder` flag, the single contract the frontend reads.
- **Web** (`web/`, Next.js) — a running app that reads the artifact JSON at build time; `/live` downloads
  the exported detector graph and walks it in the browser, `/agent` is the one server route
  that calls a live model.
- **Audit console** (`/audit`) — renders the same artifacts as a judge-facing walkthrough of
  what is real versus placeholder.
- A `/lineage` page is being added: an attack-lineage graph — task → channel → technique →
  goal → outcome for the agent surface, feature tier → feature → worked evasion for the
  tabular surface.

## System design decisions

| Decision | Reason |
|---|---|
| Sparkov over ULB `creditcard.csv` | `creditcard.csv` is PCA-anonymized (`V1`–`V28`); no MCC, no geography, so the constraint story is undefined, not just hard. Sparkov keeps raw columns, so the claim is expressible in the data. |
| XGBoost as the detector | The realistic tree-ensemble baseline for tabular fraud scoring — and gradient-free, which is why the attack below is coordinate descent, not FGSM/PGD. |
| Greedy coordinate descent with random restarts | Tree ensembles have no gradients; at each step the engine tries every in-bounds value of every controllable coordinate and keeps the move that most reduces fraud probability. |
| Chronological train/val/test split, never random | A card's later transactions would leak into the features of its earlier ones and every downstream metric would be fiction (`data/load.py`). |
| Narration-free artifacts | Every artifact carries a `placeholder` flag; only `placeholder: false` renders on the dashboard or prints in the notebook without a `TK` substitution (`artifacts.py`). |
| Static-first web, one server route | Every page is rendered at build time from committed JSON; `/api/agent` is the only dynamic route, and it exists only because the provider key must not reach the browser. |
| Cached LLM replay by default (`LLM_LIVE=0`) | Reproduces the agentic numbers with zero network cost; a live call is opt-in. |
| Per-request provider-key rotation | Free-tier keys cap per key, not per account; round-robin beats draining one key until it 429s. |

---

## Security

### What the system measures

![Figure: exploit rate per OWASP category before and after the defence layer](docs/submission/figures/agentic.png)

- **Tabular surface.** A white-box query attacker constrained to the features it can
  actually control — amount, timing, and merchant choice — under the three projections above
  (`attack/constraints.py`). Immutable victim attributes are excluded from the search
  entirely.
- **Agentic surface.** Indirect prompt injection delivered through four untrusted channels
  the agent ingests as data rather than instruction: `transaction_memo`,
  `merchant_display_name`, `invoice_metadata`, `dispute_text`.
- **Defence stack**, three independently toggleable layers (`agentic/defenses.py`): an
  injection classifier that scores and redacts untrusted spans before they reach the model,
  tool scoping (allowlist per task type, verified-payee requirement, DLP check on free text),
  and a human-in-the-loop threshold for high-value or account-changing actions.

### Security of the demo itself

![Agent page: the same payload fired twice, EXPLOITED with defences off (the payee IBAN moved), HELD with defences on (the injection filter redacted it)](docs/images/agent-exploited-held.png)

The live site (`web/`) is a separate concern from the framework it demos: what does an
unauthenticated judge hitting a public URL get to do?

- The only server route, `/api/agent`, rate-limits per client: 8 tokens/minute refilled
  continuously, 400 calls/day across the deployment (`web/lib/ratelimit.ts`). The bucket is
  per serverless instance, so on Vercel's model it binds mainly under sustained load rather
  than a single burst — stated in the file rather than assumed away.
- Provider keys rotate per request, round-robin over a pooled, comma-separated credential
  (`web/app/api/agent/route.ts`), mirroring the Python client so no single key is drained
  alone.
- No real payment rail: the ledger is an in-memory fixture created per request, the same
  fixture every Python trial starts from.
- No key configured returns a labelled `503` rather than failing silently.
- A judge-typed payload is capped at 600 characters (`MAX_PAYLOAD` in `route.ts`) and control
  characters are stripped before it reaches the model.
- No secrets in the repository: `.env` is git-ignored, only `.env.example` is committed.

---

## Where this sits in a Razorpay stack

Assay does not call a Razorpay API; nothing here should be read as an integration. It maps
by field, which is the honest level for a test harness.

| Assay surface | Razorpay surface it would test | What Assay asks of it |
|---|---|---|
| Tabular fraud detector (Sparkov, XGBoost) | A risk engine scoring orders and payments on device, velocity and address signals — the job [Thirdwatch](https://razorpay.com/blog/detect-fraud-using-ml-ai-thirdwatch/) and the [Shield risk engine](https://razorpay.com/blog/navigate-payment-risks-with-razorpays-shield-risk-engine/) describe | Does its evasion rate survive an attacker who may only move amount, timing and merchant, and who searches again after every retrain? |
| Payment agent, four injection channels | The places an agent ingests untrusted text: payment `notes` and description fields (`transaction_memo`), merchant display names (`merchant_display_name`), payment-link and invoice descriptions (`invoice_metadata`), and chargeback dispute evidence (`dispute_text`, the input to a [Chargeback Shield](https://razorpay.com/chargeback-shield/)-style flow) | Can a payload planted in one of those fields move a payee, exfiltrate a balance or skip a control, and does the classifier + tool-scoping + human-in-the-loop stack stop it without refusing legitimate work? |

The transferable finding is the one that costs money to learn in production: against an
attacker that re-searches after every change, **the model layer is the wrong place to
defend**. Retraining raised the attacker's price and stopped nothing; the defences that
held were the ones outside the model — the constraint contract, the injection classifier,
tool scoping and the human threshold.

---

## What we got wrong, in public

![Overview page: the five errors, each with what broke, what we did, and the commit](docs/images/what-broke.png)

This repository has reported five of its own errors. They are still here:

- **ASR does not collapse.** An earlier revision promised it would. The honest headline is
  attacker *cost* — the defence buys +116 median queries of attacker effort and does not stop
  a single attempt. Every chart caption claiming otherwise has been corrected.
- **The dosage explanation was refuted by its own sweep.** Raising adversarial-training
  weight 5000× moves attack success not at all, while costing 22.3% of PR-AUC.
- **The threshold was fitted on the test split until 2026-08-30.** That made evasion free and
  every ASR measured before the fix incomparable to one measured after.
- **A trainer that never ran** was reported rather than left in the history.
- **The second-stage detection script did not run.** A refactor moved the trainer into a
  shared module and left one call behind, so the committed result predated the code that
  claimed to produce it. Found on 2026-09-05 by re-running it to give it a provenance flag;
  fixed, and reproduced to the digit.
- **Not significant on `nemotron-120b` alone** (*p* = 0.214), where one exploit survived. We
  publish per-model rows rather than only the pooled figure, so the disagreement is visible.

Any number here without `placeholder: false` behind it is marked unverified — including
per-round PR-AUC and `latency.json`. A metric nobody could retract is not a metric.

---

## See it / reproduce

### 30 seconds, no Python

The deployed site is the fastest route: <https://assay-payments.vercel.app>. Every page is
rendered at build time from the committed artifact JSON; the site never trains. Two pages run
the real thing in front of you: `/live` walks the exported detector in your browser, and
`/agent` fires one prompt injection at a live model through the site's only server route.
`/audit` is the provenance ledger and `/lineage` the attack-lineage graph.

To run it yourself:

```bash
cd web && npm install && npm run dev     # http://localhost:3000 — reads ../artifacts, no Python needed
```

The live injection needs a provider key in `web/.env.local` (`GROQ_API_KEY=...`); without one
the route returns a labelled 503 and every other page still works.

### Read the argument — `notebooks/submission.ipynb`

The graded artifact. Narrative order: threat model → why Sparkov → the three projections →
ASR and attacker cost across rounds → agentic exploit rate before/after → the unified
scorecard.

It needs only the standard library plus `matplotlib`, because **it reads `artifacts/` and
never trains**. Every number is pulled live from the artifact JSON at render time — nothing
is typed into the prose. Re-run it after a recompute and it shows *your* numbers, so a
disagreement with ours would be visible rather than buried.

The notebook defaults to `RUN_ORCHESTRATED=0` — see [Gates](#gates) for why.

### Reproduce the numbers properly

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

![Audit page: every artifact as a claim, 15 of 19 grounded, the ledger replaying in lamport order with the four amber rows last](docs/images/audit.png)

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

**3. Origin.** Assay was built for the Mastercard Innovation Challenge 2026 (AI red teaming
for payment security) and re-framed for the Razorpay AI Buildathon 2026, Open Track. Both
framings are honest; the numbers did not change between them.

> ## Status — 2026-08-30: five of six results are real
>
> The tabular track has been run end to end on the genuine Sparkov dataset
> (see [Provenance](#provenance)). `attack/rounds`, `attack/examples`, `graph`, `scorecard`
> and `detect/rounds` all carry `placeholder: false` and are safe to quote.
>
> **Every result artifact is now real.** The placeholder banner is gone, the scorecard
> carries **both rows**, and the dashboard is deployed at
> <https://assay-payments.vercel.app>.
>
> The agentic corpus ran live against two independent 120B models on two providers,
> 144 trials per arm each, and replays entirely from cache with no network. **The defence
> reduction is statistically significant** — 4.9% to 0.0% on `gpt-oss-120b` (Fisher
> p = 0.015) and 4.2% to 0.3% pooled (p = 0.003) — with a **0% false-refusal rate** on the
> benign controls. It is *not* significant on `nemotron-120b` alone (p = 0.214), where one
> exploit survived; we publish the per-model rows rather than only the pooled figure so that
> disagreement is visible. See [§4.5](docs/submission/solution-walkthrough.md).

---|---|---|---|
> | 0 | 1.000 | 4.12 | 275 |
> | 1 | 1.000 | 4.00 | 291 |
> | 2 | 1.000 | 4.03 | 391 |
>
> *400 attacked transactions per round, 400,000-row subsample, train 196,001 / val 84,000 /
> test 119,999. Threshold fitted on val at `FPR_BUDGET = 0.001`, never on the test rows the
> attack is scored over. Every figure above is read from
> `artifacts/attack/rounds.json` (`placeholder: false`).*
>
> The defense buys **+116 median queries of attacker effort** and does not stop a single
> attempt. Mean features touched does *not* rise — 4.12 → 4.03, flat within noise. An earlier
> revision claimed a rise on both axes from a 400,000-row subsample; the full run keeps only
> the query cost. That is a defense-in-depth economics claim, not a solved problem,
> and the repo says so everywhere rather than implying a collapse it did not measure.
>
> **The defence does detect the generated attacks — 68.9% of ones it has never seen**
> (`artifacts/attack/adversarial_detection.json`), at a cost of 1.4 points of real-fraud
> recall and *fewer* false positives than before. That sits alongside the ASR result rather
> than contradicting it: adversarial retraining generalises within the attack distribution,
> and still does not survive an attacker who re-searches against the new model.
>
> **The dosage explanation was tested and refuted.** A sweep of the adversarial training
> weight () shows that raising the dosage 5000x moves
> attack success **not at all** — it is 1.000 in every arm and every round across the full
> 1.85M-row dataset — while costing 22.3% of PR-AUC and a third of recall (0.911 to 0.609).
> Adversarial retraining does not beat this attacker at any dosage we can afford.
>
> ⚠️ **Per-round PR-AUC is not yet quotable.** The loop does not write `detect/rounds.json`
> (that file is the detector owner's, and holds a round-0 figure computed under a *different*
> split). The loop's own per-round PR-AUC exists only in its run log, which puts it outside
> the placeholder machinery — the same gap that applies to `latency.json`. Treat
> "PR-AUC holds while attacker cost rises" as **unverified** until those rounds are published
> through `artifacts.py`.

---

## Where the work stands

For anyone picking this up mid-flight. The per-person board with full detail is
[`docs/team/STATUS.md`](docs/team/STATUS.md); this is the one-screen version.

| Area | State | Blocked on |
|---|---|---|
| Data + round-0 detector | ✅ real, 1.85M Sparkov rows | — |
| Constraint engine + attack | ✅ real, 3 rounds run end to end | — |
| Feasibility audit | ✅ published, `placeholder: false` | — |
| Red/Blue orchestrators | ✅ landed; loop runs end to end | baseline stays saturated at ASR 1.000 |
| Agentic red team | ✅ real, 144 trials/arm on two vendors | — |
| Dashboard | ✅ [deployed and live](https://assay-payments.vercel.app) | — |
| `.docx` walkthrough | ✅ complete, 0 `[[PENDING]]` markers | — |
| Submission | ❌ nothing submitted | all three artifacts, via Writeups |

**The three things worth knowing before you touch anything:**

1. **ASR is 1.000 and does not fall.** Any doc, chart caption or slide still promising a
   collapse is now wrong. The honest headline is attacker *cost*, not attacker failure.
2. **Both provider keys are present and both agentic arms have been run.** The corpus was
   fired at `gpt-oss-120b` (Groq) and `nemotron-3-super-120b` (NVIDIA NIM), 144 trials each.
   `/agent` on the live site fires a single injection against a real model on demand.
3. **The loop's threshold was fitted on the test split until 2026-08-30.** It maximised F1 on
   the rows the attack was scored over, which lifted the bar to ~0.94 and made evasion free.
   It now uses `choose_threshold` at a fixed FPR budget on a held-out validation slice. Any
   ASR measured before that fix is not comparable to one measured after it.

---

## Related work, and why 1.000 is the expected number

We did not invent the flat curve; we measured it under the conditions the literature says
produce it.

- [Simonetto et al., 2023](https://arxiv.org/abs/2311.04503) — *Constrained Adaptive Attacks:
  Realistic Evaluation of Adversarial Examples and Robust Training of Deep Neural Networks for
  Tabular Data.* Introduces domain-constrained adaptive attacks for tabular models and finds
  adversarial training can defend against constrained examples in their setting. Their
  attacker is fixed at evaluation time.
- [Simonetto et al., 2024](https://arxiv.org/abs/2406.00775) — *Constrained Adaptive Attack.*
  The follow-up shows the adaptive attack remains effective against adversarially trained
  models for some architectures, and drops accuracy by up to 96 points relative to prior
  attacks. Ours is that case, on a gradient-free tree ensemble: the attacker re-searches
  after every retrain, and constrained ASR stays at 1.000 while the attacker's median query
  cost rises 275 → 391.
- [Tramèr et al., 2020](https://arxiv.org/abs/2002.08347) — *On Adaptive Attacks to
  Adversarial Example Defenses.* The general result: defences evaluated against a
  non-adaptive attacker report robustness that an adaptive one removes. A closed loop is the
  only evaluation that does not make this mistake by construction.
- [Cartella et al., 2021](https://ceur-ws.org/Vol-2808/Paper_4.pdf) — *Adversarial Attacks
  for Tabular Data: Application to Fraud Detection and Imbalanced Data.* Fraud-specific
  evasion on tabular models, and the feasibility question this repository turns into a
  contract: [`schema.py`](src/adversarial_payments/schema.py).
- [Adversarial Learning in Real-World Fraud Detection: Challenges and Perspectives,
  2023](https://arxiv.org/abs/2307.01390) — the survey that frames why fraud detection is
  evaluated against fraud that already happened, which is the problem statement above.

What this repository adds is not a better attack. It is the audit that says which share of a
reported evasion rate is physically possible, and a scorecard that publishes the row where
the defence failed next to the one where it held.

---

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

The repository root itself now carries only `README.md`, `LINKS.md`, `pyproject.toml`,
`uv.lock`, `.env.example` and `.gitignore` — everything else lives under one of the
directories above. The background-research PDF moved to `docs/archive/`, which is
git-ignored; `kaggle_code.zip` is gone.

- `video/` — the demo-video pipeline (`mux.sh` and the narration scripts); its rendered
  outputs are git-ignored, the pipeline itself is committed.
- `web/` — the Next.js dashboard, audit console and the one live agent route; see
  [System architecture](#how-we-tackle-it-system-architecture).

## Gates

- **Day 1** — `schema.py` frozen; Prefect gate run. ✅ Passed, **with a caveat that changed a
  default.** `scripts/check_prefect_offline.py` completes with no remote API, but the log
  shows what "serverless" means in Prefect 3: it boots an ephemeral HTTP server on
  `127.0.0.1` and takes ~29 seconds to do it. Fine on a laptop; a real risk on a locked-down
  judging machine or a kernel that blocks socket binding. So `RUN_ORCHESTRATED=0` was
  promoted from insurance to **the notebook default** — the plain-loop path executes identical
  tasks with no server. Prefect still drives the dashboard's graph, where the 29 seconds is
  paid once at build time and never during judging.
- **Day 2** — first real ASR number exists. ✅ Passed. All 14 enveloped artifacts carry
  `placeholder: false`; attack success is published for three rounds on the full
  1,852,394-row corpus.
- **Day 3 midday** — code freeze; comms only after.

## Docs

- [Design spec](docs/superpowers/specs/2026-08-29-adversarial-payments-design.md) — current, authoritative
- [Submission requirements](docs/2026-08-29-submission-requirements.md) — resolved from the
  live portal: deadline, deliverable formats, judging criteria and data policy. Three
  artifacts are required (this repository, a `.docx` walkthrough, a working web prototype).
- [Deck outline + demo storyboard](docs/2026-08-31-deck-outline.md)
- [Strategy](docs/2026-08-22-challenge-strategy.md) — threat taxonomy and approach analysis
- `GenAI Payment Fraud Challenge.pdf` (`docs/archive/`) — our own background research. **Not a
  rules document and not a deliverable**; roadmap appendix only. Its 69 citations include
  Reddit and Medium sources, and it promises four subsystems we deliberately cut.
