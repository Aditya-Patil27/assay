# Adversarial Payments Framework — Design Spec

**Date:** 2026-08-29
**Supersedes scope in:** `docs/2026-08-22-challenge-strategy.md` (§4 schedule only; §1–§3 taxonomy still stands)
**Budget:** 3 days · team of 5 · AI-assisted implementation
**Timeline:** Day 1 = Aug 29 · Day 2 = Aug 30 · Day 3 = Aug 31 · submit early Sep 1

---

## 1. What changed since Aug 22

The strategy doc budgeted 10 days. Seven are gone. The team decision is to **keep full
Approach C scope** — both attack surfaces, Prefect orchestration, the DAG renderer, the
dashboard, SHAP, and latency measurement — on the basis that AI-assisted coding
absorbs the lost implementation hours.

That decision is accepted and this spec builds to it. The recorded caveat is that AI coding
compresses *authoring* time, not *wall-clock* time: dataset download, model training, and a
judge's clean-machine reproduction are unchanged by it. The architecture below is shaped to
attack exactly those three, so the compressed schedule is spent on work AI actually accelerates.

## 2. Locked decisions

| Decision | Choice | Reason |
|---|---|---|
| Dataset | **Sparkov** (`Credit Card Transactions Fraud Detection`) | Only candidate whose columns make the constraint story literally expressible — see §3 |
| Detector | XGBoost (LightGBM fallback) | Tabular SOTA, minutes to train, SHAP-native |
| Attack search | Greedy coordinate descent + random restarts | Tree ensembles have no gradients; CD yields L0 sparsity natively |
| LLM provider | OpenRouter **or** NVIDIA NIM via one OpenAI-compatible client | Both are `base_url` swaps on the same SDK |
| LLM reproducibility | Every request/response cached to `artifacts/agentic/cache/` | Demo replays with zero network and zero credentials |
| Python | **3.12** (`C:\Program Files\Python312`), managed by `uv` | Closest to Kaggle runtime; 3.14 lacks guaranteed wheels for the ML stack |
| Orchestration | Prefect 3, ephemeral local server, with `RUN_ORCHESTRATED=False` as the **notebook default** | Gate result, §6a |
| Frontend | **Static Next.js 16 export** (React Flow + Recharts), no backend | The demo is a URL a judge clicks, not a stack they install — see §4.3 |

## 3. Why Sparkov, and why not `creditcard.csv`

The thesis is a **constraint-aware** attack: MCC, terminal geography and timestamp are frozen;
only what an attacker can actually control may move. The classic ULB `creditcard.csv` is
PCA-anonymized to `V1`–`V28`. It contains no merchant category, no geography, no device — the
immutability projection is not merely hard to implement there, it is *undefined*. Building the
centerpiece on it would make our central claim a fiction that a domain judge would catch.

Sparkov maps 1:1 onto the three projections:

| Projection | Sparkov columns |
|---|---|
| **Immutability** — attacker cannot alter | `category` (MCC proxy), `merch_lat`, `merch_long`, `merchant`, `trans_date_trans_time` |
| **Feasibility** — must stay plausible | `amt` within the account's historical band; `city_pop`, `age` consistent with `cc_num` |
| **Sparsity** — minimise features touched | L0 over the mutable set |

## 4. Architecture

### 4.1 Repository layout — ownership by directory

Five people over three days cannot afford merge conflicts. Each owner has directories nobody
else writes to. `schema.py` and `artifacts.py` are contracts, written once on Day 1 and then
read-only.

```
src/adversarial_payments/
  config.py            shared   settings, seeds, paths
  schema.py            * P1->P2 CONTRACT (frozen, Day 1)
  data/                P1       load.py, features.py
  detect/              P1       train.py, evaluate.py, explain.py
  attack/              P2       constraints.py, engine.py, metrics.py
  loop/                P2       flows.py, state.py
  agentic/             P3       client.py, agent.py, tools.py, injections.py,
                                redteam.py, defenses.py, scoring.py
  serving/             P1       latency.py
  scorecard.py         * terminal node, both tracks
web/                   P4       Next.js static export: app/, components/, lib/
notebooks/             P1+P2    submission.ipynb  <- the graded artifact
artifacts/             all      committed results (JSON/PNG) — see §4.3
tests/                 all
docs/                  P5
```

### 4.2 `schema.py` is the contract, as code

Strategy §4 identified the P1→P2 feature handoff as the highest-risk dependency in the plan.
It is therefore an importable frozen object, not a document:

```python
@dataclass(frozen=True)
class FeatureSchema:
    columns: tuple[str, ...]
    frozen: frozenset[str]                            # immutability projection
    coupled_groups: tuple[tuple[str, ...], ...]       # inter-feature dependencies
    mutable: frozenset[str]
    bounds: Mapping[str, tuple[float, float]]         # feasibility projection

    def validate(self, df) -> None: ...               # raises on drift
```

The third tier is not in the original strategy doc. It is there because the feasibility
projection requires that inter-feature dependencies hold, and on Sparkov an attacker who
switches merchant changes `category_enc`, `merch_lat`, `merch_long` and `distance_km`
*simultaneously*. Perturbing those independently yields transactions that cannot exist, and an
ASR measured over impossible transactions is a number we would have to retract under questioning.

`attack/engine.py` calls `schema.validate(df)` at entry. If P1 changes features after the
freeze, P2's engine raises immediately instead of silently reporting a meaningless ASR.

### 4.3 `artifacts/` is committed — the key decoupling

Every stage writes JSON to `artifacts/`. The dashboard and the notebook **read those
artifacts; they never train**. Three consequences, each buying back a day:

1. P4 builds the entire dashboard on Day 1 against seeded fixtures, without waiting for P1.
2. The judged demo cannot fail mid-presentation — nothing heavy runs during it.
3. A judge on a clean machine sees results even if their environment can't train.

Following that through is what killed Streamlit. If the dashboard never trains, it is a pure
static data viewer — and then Streamlit's cost is that a judge must install Python 3.12 and the
whole ML stack to see it. A Next.js static export inlines the same JSON into HTML at build time
and deploys as a link that cannot break. The shapes are defined once in `artifacts.py` and
mirrored in `web/lib/types.ts`; `tests/test_artifacts.py` fails if they drift.

Every artifact carries a `placeholder` flag. Seeded fixtures ship `true` and the page renders a
banner while any are; the real writers set it `false`. A placeholder number cannot silently
reach a judge.

`RECOMPUTE=True` reruns everything from scratch for anyone verifying the numbers are real.

### 4.4 Attack engine

Greedy coordinate descent over the mutable feature set, under the three projections, with
random restarts to escape local minima:

```
for restart in R:
    x <- x0
    while model.predict_proba(x) > threshold and |touched| < budget:
        pick the single mutable feature whose best in-bounds change
          most reduces fraud probability          # greedy coordinate
        apply, projected onto bounds              # feasibility
        record touched feature                    # sparsity / L0
    keep the successful x with the smallest |touched|
```

Reported metrics: **ASR**, mean L0, mean L2, and per-feature attack frequency.

### 4.5 The unrolled loop

Rounds r = 0,1,2. Round r's retrained detector feeds round r+1's attacker. Each task writes to
a plain state dict (`loop/state.py`), serialised to `artifacts/graph.json` and drawn by React
Flow — so the visualization survives Prefect being removed entirely.

```
train_detector(r) -> score_detector(r) -> generate_attacks(model_r) -> score_attacks -> ASR_r
                                                                           |
                                           augment_trainset -> train_detector(r+1)
```

Headline result: **ASR collapses across rounds while PR-AUC holds.**

### 4.6 Agentic track (B)

Mock payment agent with real tools (`check_balance`, `initiate_transfer`, `update_payee`).
Indirect prompt injections are planted where a payment system genuinely ingests untrusted text:
transaction memos, invoice metadata, merchant display names, chargeback dispute text.

Defenses: injection classifier, tool scoping, HITL threshold policy. Scored against OWASP LLM
Top 10 and MITRE ATLAS AML.T0051, reporting **exploit rate before vs after, by category**.

### 4.7 `framework_scorecard`

One table both tracks feed: *surface × attack success before × after × defense cost*. This is
what converts "two projects in two tabs" into one framework applied twice. Cheap to build and
non-negotiable per strategy §5.2.

## 5. Three-day schedule

| | Day 1 (Aug 29) | Day 2 (Aug 30) | Day 3 (Aug 31) |
|---|---|---|---|
| **P1** detector | Load Sparkov, EDA, **freeze `schema.py`** | XGBoost baseline, PR-AUC + threshold, SHAP | Retrain harness, latency, notebook cells |
| **P2** attack | Constraint projections | ASR round 0, retrain rounds 1–2 | Co-evolution plot, scorecard row |
| **P3** agentic | Client + agent + tools, injection corpus | Red-team loop, exploit rate before | Defenses, exploit rate after, scorecard row |
| **P4** dashboard | ✅ Static Next.js shell + React Flow DAG on fixtures | Wire real artifacts, deploy preview | **Repro: clean-env run**, `RUN_ORCHESTRATED=False` |
| **P5** comms | Confirm deliverables/deadline/rules | Deck v1, storyboard | Video, writeup, **submit** |

**Gates:** Day 1 end — `schema.py` frozen and Prefect verified serverless. Day 2 end — first ASR
number exists. Day 3 midday — feature freeze, comms only after.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Training wall-clock eats Day 2 | Sparkov trains in minutes; subsample switch in `config.py` |
| Judge's machine can't run it | Committed `artifacts/` + `RECOMPUTE=False` default |
| Prefect fails on judge's env | `RUN_ORCHESTRATED=False` executes identical tasks as a plain loop — now the notebook default, see §6a |
| LLM provider down / no key at judging | Cached request/response fixtures replay offline |
| Python 3.14 wheel gaps | Pinned to 3.12 via `uv` |
| P1 changes features after freeze | `schema.validate()` raises at P2's entry point |

## 6a. Prefect gate result (Day 1, verified)

`scripts/check_prefect_offline.py` passes — the flow completes with no remote API. But the log
shows what "serverless" actually means in Prefect 3:

```
Starting temporary server on http://127.0.0.1:8684
... Finished in state Completed()        <- 29 seconds later
```

It boots an ephemeral HTTP server and binds a port. Fine locally; a real risk in a locked-down
judging environment or a kernel that blocks socket binding. Consequence: `RUN_ORCHESTRATED=False`
is promoted from insurance to **the notebook's default**. Prefect still drives the dashboard's
graph story, where the 29s startup is paid once at build time and never during judging.

## 7. Still open (P5, Day 1)

- [ ] Exact submission deadline and timezone
- [ ] Is there a scored leaderboard and hosted dataset?
- [ ] Deliverable formats: deck page limit, demo video length, notebook vs repo
- [ ] External-data and pretrained-model policy
- [ ] Real names assigned to P1–P5
