# Mastercard Innovation Challenge 2026 — Scoping & Strategy

**Date:** 2026-08-22
**Theme:** AI red teaming for payment security
**Budget:** 10 days · 1–2 focused hrs/day/person · **team of 5** → **75 total focused hours** (15 hrs/person)
**Status:** Awaiting decision on Approach A / B / C

---

## 1. Where we are

We have a ~4,000-word deep-research report (`GenAI Payment Fraud Challenge.pdf`) proposing a
three-pillar closed-loop red/blue architecture:

| Pillar | Contents |
|---|---|
| **I — Identify** | Synthetic identity, deepfake voice, UPI collect / digital-arrest scams, agentic prompt injection, tabular adversarial evasion |
| **II — Generate** | AMLSim-style multi-agent graph simulation, CTGAN / WGAN-GP, constraint-aware adversarial perturbations |
| **III — Defend** | FT-Transformer w/ SSL pretraining, TabNet, TGN+HGT graph nets, wav2vec2 anti-spoofing, SHAP / GNNExplainer, Kafka→Flink→Redis→ONNX at <50 ms p99, federated learning + differential privacy |

**The core problem:** that report describes roughly 6–12 engineer-months of work. We have ~50 hours.
Attempting even 30% of it ships nothing demoable.

**The report's real value is narrative, not backlog.** It is our threat taxonomy and our roadmap
appendix. The thing we *build* must be one narrow, working slice that the report makes look inevitable.

---

## 2. Two risks to close immediately

### 2.1 Verify the leaderboard — **blocking, do tonight**

"Scored leaderboard" + "no dataset provided" don't normally coexist on Kaggle. Either:

- **(a)** there IS a hosted dataset and a metric → one teammate owns LB-chasing as a separate track, or
- **(b)** it's an Analytics/Community-style competition where "submission" = notebook + humans score it.

Check the **Data** tab and whether a **Submit Predictions** button exists.
This single fact reallocates ~30% of the budget.

### 2.2 The report is background, not the submission

A 4,000-word, 74-citation deep-research doc will read as machine-generated to Mastercard judges,
and it promises Kafka/Flink/federated learning/wav2vec2 that we will not build.

- Use it as the **threat taxonomy** and the **"full roadmap" appendix**.
- The submitted writeup must be in our own voice.
- **Every claim in the writeup must be backed by something running in the notebook.**
- Mismatch between promised architecture and demoed artifact is the #1 way innovation-challenge
  teams lose.

---

## 3. Three approaches

### A. "Adversarial Gym" — tabular red/blue closed loop *(recommended core)*

One public fraud dataset (IEEE-CIS, or the classic `creditcard.csv`). Train an XGBoost/LightGBM
detector. Then build the piece the report actually describes and that nobody else will build:
a **constraint-aware tabular attack engine** enforcing three projections —

1. **Immutability** — MCC, terminal geo, timestamp are frozen; an attacker cannot alter them post-hoc.
2. **Feasibility** — amount stays within the account's plausible band; inter-feature dependencies hold.
3. **Sparsity** — flip the decision touching the fewest features possible.

Measure **Attack Success Rate (ASR)**. Adversarially retrain → re-attack → show ASR collapse while
PR-AUC holds. Loop 3 times, plot the co-evolution curve.

- **Why it wins:** produces a hard, novel number (ASR before/after) no baseline submission has.
  It is the report's central thesis, executed. Demoable as an animation.
- **Cost:** ~18–22 hrs. Genuinely achievable.
- **Risk:** low. Worst case we still have a working detector + attack demo.

### B. "Agentic Payment Red Team" — LLM attack/defense loop

Mock payment agent with real tools (`check_balance`, `initiate_transfer`, `update_payee`).
An automated red-team LLM plants **indirect prompt injections** in the places a payment system
actually ingests untrusted text — transaction memos, invoice metadata, merchant display names,
chargeback dispute text. Score exploit success against OWASP LLM Top 10 / MITRE ATLAS AML.T0051.
Then add a defense layer (injection classifier, tool-scoping, HITL threshold policy) and show the
exploit rate drop.

- **Why it wins:** most on-theme for the literal words "AI red teaming." Genuinely novel, cheap
  compute, plays to our LLM strength. Mastercard is actively worried about agentic commerce.
- **Cost:** ~12–15 hrs.
- **Risk:** judges may read it as a clever demo rather than a system. Weaker if there's a leaderboard.

### C. Both, under one shell *(recommended with 4 people)*

Two attack surfaces, one narrative, **shallow** integration — a single Streamlit app with two tabs
and one shared *Threat Taxonomy → Attack → Defense → Result* frame drawn from the Pillar I table.
Not a unified codebase. One story, one UI.

- **Why:** demonstrates the framework **generalizes across modalities**, which is what elevates
  "a project" to "a framework." Two surfaces is enough to make that claim; five is a lie we can't demo.
- **Cost:** ~40 hrs across the team, parallelizable from Day 1.
- **Risk:** the classic hackathon failure — two things at 60% instead of one at 100%.

---

## 4. Recommendation

**Approach C, with a hard gate.**

- **A is the guaranteed core**, and at 18–22 hrs it **exceeds one person's 15-hr budget** — so it is
  split across two people (see roles below). Must be **finished and demo-ready by Day 6**, not Day 9.
- **B runs in parallel from Day 1**, owned by the LLM person. **Cut without debate on Day 7** if it
  isn't working end-to-end.
- **Dashboard/integration and comms are separate owners.** With a pitch and a deck as graded
  deliverables, comms is roughly a third of the score — it is not filler work.

### Roles (5 people)

| # | Role | Owns | Budget |
|---|---|---|---|
| **P1** | Detector & data | Dataset choice, EDA, feature engineering, XGBoost/LightGBM baseline, PR-AUC + threshold, **the leaderboard if one exists** | ~15 hrs |
| **P2** | Attack engine | Constraint projections (immutability / feasibility / sparsity), ASR metric, adversarial retrain loop, co-evolution plot | ~15 hrs |
| **P3** | Agentic red team (B) | Mock payment agent + tools, injection corpus, automated red-team loop, defense layer, exploit-rate delta | ~15 hrs |
| **P4** | Dashboard & integration | Streamlit shell, both tabs, SHAP panel, latency measurement, reproducibility check from a clean run | ~15 hrs |
| **P5** | Comms & compliance | Rules/deliverable formats, deck, demo video, writeup in our own voice, submission mechanics | ~15 hrs |

P1 and P2 share the A track and must agree on the feature schema and the frozen-feature list **on Day 2** —
that interface is the single highest-risk dependency in the plan. If P1 changes features after Day 3,
P2's attack engine breaks.

### Why not a third attack surface?

The tempting use of a 5th person is adding audio anti-spoofing or graph/AML detection as a third
modality. Rejected: audio needs dataset acquisition (ASVspoof LA is ~20 GB) plus training, and graph
needs a whole pipeline — either consumes 15 hrs and lands at ~60%. **Two working surfaces already
support the "framework generalizes" claim; a third broken one undermines it.**

Revisit only as a **Day 7 stretch decision**, and only if A and B are both genuinely done.

### Explicitly cut

Audio anti-spoofing, federated learning, Kafka/Flink, graph neural networks.

These go on the deck's **Roadmap** slide, cited to the report. We get credit for knowing about them
without spending hours on them.

---

## 5. Architecture: the unrolled adversarial DAG

### 5.1 Framing — say "unrolled loop", not "DAG"

The red/blue process is **cyclic**, not acyclic: attack → detect → score → retrain → attack again is a
feedback cycle, and that co-evolution *is* the report's thesis. It becomes a DAG only when
**unrolled over rounds** — round 1's retrained detector is a distinct node feeding round 2's attacker.

Describe it that way in the deck and the writeup. A judge who knows the difference will notice if we
call a feedback loop a DAG, and it costs us nothing to be precise.

### 5.2 Node graph

**A-track flow** (unrolled for rounds *r* = 0…2):

```
load_data ──▶ engineer_features ──▶ [SCHEMA + FROZEN-FEATURE LIST]  ◀─ P1→P2 contract
                                        │
                                        ▼
                          ┌──▶ train_detector(r) ──▶ score_detector(r) ──▶ PR-AUC_r, threshold_r
                          │            │
                          │            ▼
                          │   generate_attacks(model_r, frozen_list) ──▶ adversarial_set_r
                          │            │
                          │            ▼
                          │   score_attacks(model_r, set_r) ──▶ ASR_r, sparsity stats
                          │            │
                          │            ▼
                          └── augment_trainset(train, set_r) ──▶ train_{r+1}     [unroll edge]

                                        ▼
                              co_evolution_report ──▶ ASR & PR-AUC vs round
```

**B-track flow:**

```
build_agent ──▶ generate_injections ──▶ run_red_team(agent) ──▶ exploit_rate_before
                                                    │
                                                    ▼
                                          apply_defenses(agent) ──▶ run_red_team(hardened)
                                                    │                         │
                                                    ▼                         ▼
                                              score_owasp ──▶ exploit_rate_after, delta by category
```

**Shared terminal node — `framework_scorecard`.** Both flows feed one table: *surface × attack success
before × after × defense cost*. This is cheap (a dataframe) and it is what converts "two projects in
two tabs" into **one framework applied twice**. Do not skip it.

### 5.3 Engine: Prefect, not Airflow

Airflow needs a scheduler, webserver, and metadata DB — disqualifying for a notebook a judge must run.
**Prefect 3** is pip-installable and runs flows in-process with no server. Tasks are `@task`, flows are
`@flow`, and the task signatures become the executable P1→P2 contract that §4 flagged as our most
fragile interface.

**Do not demo the Prefect UI.** It binds our centerpiece to a running server and to Kaggle's network
policy. Instead: Prefect executes, each task writes to a plain state dict, and **we render the graph
ourselves in Streamlit**. The demo then survives Prefect being stripped out entirely.

### 5.4 Reproducibility risk — owned by P4

A notebook submission with an orchestration dependency is a real failure mode. Required checks:

- [ ] Prefect 3 flow runs **with no server and no network** (ephemeral local mode), verified on a clean env
- [ ] Kaggle notebook environment: is `prefect` installable? Is internet enabled for the submission?
- [ ] **Fallback path:** a `RUN_ORCHESTRATED = False` switch that executes the same tasks as a plain
      loop. If Prefect fails on the judges' machine, the notebook still runs end-to-end.

The fallback is not optional. It is the insurance premium on this decision.

### 5.5 Budget impact — honest accounting

This is **not free**, and §4 already allocated all 75 hours:

| Work | Owner | Net add |
|---|---|---|
| Prefect task/flow authoring | P2 | ~+4 hrs (substitutes for the hand-written retrain loop) |
| Graph renderer in Streamlit | P4 | ~+3 hrs (substitutes for generic plots) |
| Fallback path + repro checks | P4 | ~+2 hrs |
| B-track flow wrapping | P3 | ~+1 hr |

**Net ≈ +10 hrs, which consumes the Day 7–8 buffer.** Accepted consequence: if either gate slips,
the DAG visualization is the first thing cut, not the ASR result. **The ASR co-evolution number is the
submission; the DAG is how we present it.** Never let presentation eat the result.

---

## 6. Proposed 10-day schedule *(contingent on choosing C)*

| Day | P1 — Detector | P2 — Attack engine | P3 — Agentic (B) | P4 — Dashboard | P5 — Comms |
|---|---|---|---|---|---|
| 1 | Confirm LB; pick dataset; load + EDA | Read A spec; scaffold Prefect flow skeleton | Mock agent + 3 tools stubbed | Streamlit shell; **verify Prefect runs serverless/offline** | **Confirm deliverables, deadline, external-data policy** |
| 2 | **Freeze feature schema + frozen-feature list → P2** | Immutability + feasibility masks | Injection corpus v1 | Tab layout, fake data wired | Deck skeleton, story spine from Pillar I |
| 3 | XGBoost baseline, PR-AUC + threshold | Sparsity optimizer | Automated red-team loop | **Graph renderer + state dict** | Draft narrative |
| 4 | Feature eng. round 2 / LB push | **First ASR number** | Score vs OWASP LLM Top 10 | Wire tab 1 to real A outputs | Deck v1 |
| 5 | Retrain harness for adversarial rounds | Adversarial retrain round 1; re-attack | Defense layer: classifier + tool scoping | SHAP panel | Storyboard the video |
| 6 | **GATE: A demo-ready** | Rounds 2–3, co-evolution plot | Measure exploit-rate drop | Wire tab 2 to real B outputs | Deck v2 |
| 7 | Latency measurement for <50 ms claim | `framework_scorecard` node | **GATE: cut B if not end-to-end** | **Fallback path (`RUN_ORCHESTRATED=False`)** | Deck full pass |
| 8 | Notebook cleanup, narrative markdown cells | Notebook cleanup | Buffer / hardening | **Reproducibility: clean-run check** | **Record demo video** |
| 9 | Freeze code | Freeze code | Freeze code | Freeze app | Deck final; writeup in our own voice |
| 10 | Buffer only — **submit early** | | | | |

**Rule:** Day 10 is buffer. If work is happening on Day 10, we mis-scoped on Day 1.

**Three hard gates:** Day 1 Prefect-runs-offline check (P4), Day 2 feature-schema freeze (P1→P2), Day 7 B-track cut.

**Buffer is spent.** See §5.5 — the DAG visualization is the first cut if anything slips.

---

## 7. Open questions

- [ ] Is there a scored leaderboard and a hosted dataset? *(blocking — see §2.1)*
- [ ] Exact submission deadline and timezone
- [ ] Demo video length limit / pitch format (live vs recorded)
- [ ] Deck page limit
- [ ] External-data and pretrained-model policy in the rules
- [ ] Does the Kaggle notebook environment allow installing `prefect`? Is internet enabled at submission? *(see §5.4)*
- [ ] Real names assigned to P1–P5 in §4
