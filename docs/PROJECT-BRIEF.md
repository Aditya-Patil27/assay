# Project brief — what this is, what is true, and how it ships

**Audience: P5 and anyone joining mid-flight.** One document, no cloning required to
understand it. Every number here traces to a committed artifact carrying
`placeholder: false`; where a number does not exist yet, this document says so instead of
estimating.

Last updated 2026-08-31. Deadline: **Aug 31 2026, 23:59 IST.**

---

## 1. What we built, in one paragraph

A closed-loop red/blue framework for payment fraud, applied to two attack surfaces and
reporting the same shape of result for both. On the **tabular** surface, a constraint-aware
attacker evades an XGBoost fraud detector by moving only what a real attacker actually
controls; the detector retrains on those evasions and the loop repeats. On the **agentic**
surface, indirect prompt injections are planted in the untrusted text a payment assistant
ingests — memos, merchant names, dispute evidence — and a defence layer tries to stop them.
Both terminate in one table, the framework scorecard.

## 2. The idea that makes it different

Most adversarial-ML work asks *"can I flip this prediction?"*. Payments demands a harder
question: **"can I flip it using only what an attacker actually controls?"**

A fraudster with stolen credentials inherits the victim's age, home city and job. The network
stamps the timestamp. What they control is the amount, the timing, and which merchant to hit
— and choosing a merchant moves four features at once, because category, terminal latitude,
terminal longitude and distance are four projections of one decision. Perturb them
independently and you have produced a transaction that cannot physically occur.

**This is not a philosophical point, and we measured it on ourselves.** See section 4.

---

## 3. The headline result — read this before quoting anything

**Attack success does not fall across rounds. It is 100% at every round.**

| Round | Attack success rate | Mean features touched (L0) | Median queries per success |
|---|---|---|---|
| 0 | 100.0% | 3.81 | 277 |
| 1 | 100.0% | 4.26 | 298 |
| 2 | 100.0% | 4.64 | 492 |

*Source: `artifacts/attack/rounds.json`. 400 attacked transactions per round on a
400,000-row subsample; train 196,001 / validation 84,000 / test 119,999.*

Three rounds of adversarial retraining prevented **zero** evasions. What the defence bought
is attacker *cost*: +0.83 features touched and +215 median queries by round 2.

**How to say this to a judge.** "The defence makes the attack more expensive, not impossible
— and we report that rather than tuning until a nicer curve appeared." That is a
defence-in-depth economics claim and it is defensible. **"Attack success collapses" is false.**
If you find that phrase in any draft, deck or caption, it is stale — delete it.

**The honest caveat to volunteer, not bury:** 400 adversarial rows folded into 196,001 is a
0.2% dosage, unweighted. This says nothing general about whether adversarial retraining works.
It says *this dosage*, against *this attacker*, moved cost and not outcome.

---

## 4. The result we would most want a judge to remember

We ran a second attacker against the identical detector with the constraints removed.

| | Constraint-aware | Unconstrained |
|---|---|---|
| Attack success rate | 100.0% | 100.0% |
| Mean features touched | 3.82 | 1.76 |
| Successes at a merchant that does not exist | 0.0% | **99.5%** |
| Successes that forged a frozen victim attribute | 0.0% | 3.0% |

*Source: `artifacts/attack/feasibility.json`.*

Both attackers report the same headline. **They are not describing the same thing.** 99.5% of
the unconstrained attacker's "evasions" are transactions that could not physically occur — a
merchant category paired with terminal coordinates no merchant occupies. It also wins more
cheaply, because forging is cheaper than searching.

Our zeroes are zero *by construction*, not by measurement: frozen columns are excluded from
the search and merchant choice is drawn from the observed network, so an infeasible
transaction cannot be produced in the first place.

This is the project's whole thesis, demonstrated against our own baseline rather than
asserted. **Lead with it.**

## 5. A worked example that sells the constraint story

Round 0, transaction `txn_25311`: detector score **0.954**. The attacker changed exactly one
feature — the hour, 22:00 to 04:00 — and the score fell to **0.000**. No amount altered, no
merchant substituted, nothing frozen forged. A single rescheduling, entirely legal and
entirely within an attacker's control.

---

## 6. Three measurement errors we found in our own work

Documented in walkthrough section 3.4. This is an asset, not an embarrassment — a judge who
sees we found them first trusts every other number more.

1. **ASR 100% by surrendering the money.** An early engine hit 100% by shrinking transactions
   to ~12% of value. An attacker who gives up 88% of the take has not evaded anything. Fixed
   with an economic floor; retained value went 11.4% to 74.5%.
2. **A missing measurement rendered as a confident zero.** The dashboard plotted untrained
   rounds as PR-AUC 0, drawing a collapse to the axis directly beneath a caption saying
   detection quality holds. Cause was one `?? 0`. A system that cannot distinguish "not
   measured" from "measured zero" will eventually assert the second when it means the first.
3. **The operating threshold was fitted on the test split.** The loop maximised F1 on the same
   rows the attack was scored against, lifting the bar to ~0.94 against a budget cut near 0.23
   and raising it further each round — so every "defence" round handed the attacker an easier
   target. Fixed to a fixed false-positive budget on a held-out validation slice.

**The honest part of number 3:** correcting it made evasion harder and ASR stayed 100% anyway.
The bug was not propping up the result. Had we found it after publishing, the number would
have survived and we would have been quoting it for the wrong reason without knowing.

---

## 7. What is real right now

| Artifact | State |
|---|---|
| `artifacts/detect/rounds.json` | Real — round 0 only |
| `artifacts/attack/rounds.json` | Real — 3 rounds |
| `artifacts/attack/examples.json` | Real |
| `artifacts/attack/feasibility.json` | Real |
| `artifacts/graph.json` | Real |
| `artifacts/scorecard.json` | Real — **both rows** |
| `artifacts/agentic/redteam.json` | Real — `gpt-oss-120b`, 101 live calls |
| `artifacts/agentic/redteam-nvidia.json` | Real — `nemotron-120b` |
| `artifacts/latency.json` | Real — ONNX, 1,000 samples |

**The rule the whole repo enforces: a number is real only when its artifact says
`placeholder: false`.** The dashboard renders a banner naming every fixture; the notebook
substitutes `TK`. A fake number cannot silently reach a reader. Check any time with:

```bash
grep -r placeholder artifacts/
```

**104 tests pass** (`pytest -q`). The tabular run **reproduces byte-for-byte** on a second
execution — only `created_at` and `git_sha` move.

### Data provenance

Real Sparkov from Kaggle, not synthetic: **1,852,394 transactions, 999 cards,
2019-01-01 to 2020-12-31, 9,651 frauds (0.521%)**. Recorded by machine in
`artifacts/data_provenance.json`, not asserted in prose.

### One number that is still NOT quotable

- **Per-round PR-AUC.** The loop does not write `detect/rounds.json`, so its per-round PR-AUC
  exists only in a run log — outside the provenance machinery. Do not put it in the deck. The
  scorecard says "delta not measured" for exactly this reason.

**Latency is now quotable.** It was the other one on this list. The detector is exported to
ONNX and timed under ONNX Runtime — **p50 0.035 ms, p95 0.081 ms, p99 0.145 ms over 1,000
single-transaction calls** — and `latency.json` now goes through `artifacts.write`, so it
carries a `placeholder` flag and a `git_sha` like everything else. The exported graph agrees
with the training-time model to 8.6e-08, so the figure describes the model we evaluated.

---

## 8. The three things we submit

Through the Kaggle **Writeups** section, before **Aug 31 23:59 IST**.

| # | Artifact | State |
|---|---|---|
| 1 | GitHub repo | Pushed, current |
| 2 | `.docx` solution walkthrough | `docs/submission/solution-walkthrough.docx`, 3 markers open |
| 3 | Working web prototype (a URL) | Built and CI-ready, **not yet enabled** |

**A draft is not a submission.** Work sitting in Kaggle as a draft scores exactly the same as
never having been written. Submit early and revise in place. **No video is required** — both
earlier planning docs budgeted hours for one. Don't.

### Remaining PENDING markers

`python scripts/build_docx.py` counts them on every run and renders them orange.

1. **Agentic exploit rate** — closes when the live run finishes (section 10).
2. **Latency figures** — needs an ONNX run at 1,000 samples, and `latency.json` routed
   through `artifacts.py` so it carries a provenance envelope.
3. **Deployment URL** — closes at section 9 step 2.

---

## 9. How we deploy

The dashboard is a **fully static export**: pre-built HTML with the artifact JSON inlined at
build time. No server, no backend, nothing to install. It reads `artifacts/`; it never trains,
by design, so nothing heavy can fail in front of a judge.

### The automated path (do this)

`.github/workflows/deploy-dashboard.yml` builds and publishes to GitHub Pages on every push
to `main` that touches `web/` or `artifacts/`.

**One human step, because it makes the page public:**

> **Settings → Pages → Build and deployment → Source: "GitHub Actions"**

Then push, or trigger **Actions → Deploy dashboard → Run workflow**. The URL will be:

```
https://aditya-patil27.github.io/mastercard-adversarial-payments/
```

Paste that into walkthrough section 7 and into the Kaggle writeup.

**Why BASE_PATH is in the workflow.** Pages serves from `/<repo>/`. `next.config.ts` switches
asset URLs to absolute form when `BASE_PATH` is set; without it every `/_next/...` request
404s and a judge gets unstyled HTML. Verified locally: 26 correctly-prefixed refs.

### Running it locally

```bash
cd web && npm install && npm run build
cd out && python -m http.server 8000
```

Then open `http://localhost:8000`.

**It must be served over HTTP. Do not double-click `index.html`.** Under `file://` the charts
render blank and React Flow paints nothing — Next emits a chunk carrying a `crossorigin`
attribute which fails a CORS check against an opaque origin, so the client components never
execute. The data is fine and headings and tables still render, which makes the failure look
like a styling problem rather than a broken page.

*Windows note:* Git Bash rewrites a leading-slash BASE_PATH into a Windows path. Prefix a
local BASE_PATH build with `MSYS_NO_PATHCONV=1`. Irrelevant in CI, which is Ubuntu.

### Fallback if Pages is refused

Zip `web/out/` and attach it **with a one-line "serve this folder" instruction**, for the
`file://` reason above. This is the backup, never the primary — a judge who double-clicks it
sees a page with no charts.

---

## 10. The agentic track

**Result, and the caveat that must travel with it.** The corpus ran live against two models:

| Model | Provider | before | after | Fisher exact |
|---|---|---|---|---|
| `openai/gpt-oss-120b` | Groq | 4.9% (7/144) | **0.0%** | **p = 0.015** |
| `nvidia/nemotron-3-super-120b-a12b` | NIM | 3.5% (5/144) | 0.7% (1/144) | p = 0.214 |
| pooled | — | 4.2% (12/288) | 0.3% | **p = 0.003** |

**Significant on gpt-oss and pooled; not on nemotron alone.** Quote the per-model rows, not
only the pooled figure — the pooled number hides that the two models disagree, and one
exploit survived the defence on nemotron.

That survivor is worth more than a clean sweep. A defence that blocks 100% of everything on
every model is the result most likely to mean the corpus was too easy.

**If asked why an earlier draft said "not significant":** it did, and it was right then. The
corpus was 72 trials per arm and 3/72 → 0/72 gives p = 0.245. We doubled the corpus because
72 trials could not resolve an effect this size. The defence did not change; the statistical
power did. New injections were authored from published patterns before any were run, and none
was revised after seeing whether the defence caught it.

The finding to lead with: **two independently-trained 120B models were already largely
resistant** to a hand-authored injection corpus, at roughly a 4% baseline. `payee_mutation` is
the only category landing with any regularity.

Blocked for days on a missing API key. The key now exists, and closing it turned up three
real bugs worth knowing about:

- **`.env` was never loaded.** `python-dotenv` was a dependency and the README told people to
  create the file, but `load_dotenv()` was never called anywhere. A pasted key was invisible.
- **No `max_tokens` was set**, so the provider reserved credit against the model's full 64k
  context and rejected every call with a 402.
- **Nothing wrote the artifact.** The CLI printed rates and exited. The key alone would never
  have closed that artifact — the last mile did not exist.

We run on a **free** OpenRouter model (`nvidia/nemotron-3-super-120b-a12b:free`), paced and
retried for free-tier rate limits.

```bash
LLM_LIVE=1 LLM_PACE_SECONDS=3.5 python -m adversarial_payments.agentic.redteam --minimal --write
```

**The honesty rule this track lives or dies by.** `placeholder` is *derived* from the
provenance the trials carry, never passed in. One stub-sourced trial taints the whole
aggregate — mixed provenance is treated as stub, not partial credit. Presenting scripted
output as live-model output is the single mistake that would legitimately sink us.

**State the model in the writeup.** An exploit rate is a property of the model under test. A
free 120B model is not Sonnet, and the number describes what we actually ran.

---

## 11. Known limitations — say these before a judge finds them

- The tabular attacker has **white-box query access to a fixed model**. ASR is an upper bound
  on a strong attacker, not a forecast of live losses.
- **The payment agent is a mock**, with simulated tools and a simulated ledger.
- **Sparkov is simulator-generated.** Absolute accuracy figures are relative across rounds,
  never production expectations. We took a weaker dataset that supports a real claim over a
  stronger one that supports a fake one — `creditcard.csv` is PCA-anonymised, so the entire
  constraint story is *undefined* on it.
- **Our injection corpus is authored by us and finite** — a floor on the attack surface, not
  a census of it.
- The loop's detector rounds use a **stratified random split**, while the published round-0
  detector uses a **temporal** split. They are not directly comparable, and the dashboard
  currently shows one PR-AUC point rather than three for exactly that reason.

---

## 12. If you only do four things

1. **Enable GitHub Pages** (section 9). Requirement 3 has no address until you do.
2. **Open the deployed page in a browser.** Nobody has, at any point. Serving is not
   rendering, and a mechanical check is not a substitute for eyes.
3. **Submit all three artifacts** — early, then revise in place.
4. **Purge "attack success collapses"** from every draft. It is the one claim our own data
   contradicts.
