# Submission Requirements — RESOLVED

**Date:** 2026-08-29 (updated 23:55 IST, from the live Kaggle portal)
**Owner:** P5 (comms & submission)
**Resolves:** design spec §7 "Still open"; strategy §7 "Open questions"
**Source:** the competition page itself — a **private Kaggle Community Hackathon**, host `raahul`.

Supersedes the earlier revision of this file, which recorded 0 of 5 questions resolved because the
only artifact available then was our own research PDF.

---

## 0. Headline — read this first

### 0.1 The deadline is Aug 31, 2026 · 11:59 PM GMT+5:30. Our plan said Sep 1. Our plan was wrong.

> "Your submission is due by Aug 31, 2026 at 11:59 PM GMT+5:30." — portal header, "2 days to go"

Design spec §6 and strategy §6 both say **"Day 3 = Aug 31 · submit early Sep 1."** Submitting on
Sep 1 misses the deadline by a full day. That date was self-imposed and never sourced — the earlier
revision of this file flagged exactly that risk and declined to guess it. The guess would have cost
the entire project.

Our local clock is IST, the same zone as the deadline. **At time of writing: ~48 hours.**

### 0.2 Why the URL 404'd

It is a **private** Community Hackathon. Kaggle serves 404 to anyone not enrolled, which is why
neither the direct URL nor a web search surfaced it. Not a missing competition — a gated one.

### 0.3 The PDF's status is now partly reversed

The previous revision recommended keeping `GenAI Payment Fraud Challenge.pdf` out of the submission
entirely. **That was right about the file and wrong about the content.** Pillar I ("Identify") is a
*research* pillar, and "diversity of attacks identified" is a scored criterion — see §4. The taxonomy
in that report is now directly worth marks. Still do not submit the PDF (69 citations, several
Reddit/Medium — §5). Do rewrite its taxonomy in our own voice as a first-class part of the walkthrough.

---

## 1. Resolution table

| Spec §7 question | Answer |
|---|---|
| Exact submission deadline and timezone | ✅ **Aug 31, 2026 · 23:59 GMT+5:30 (IST).** Results Sep 5. Top teams present at GFF 2026, Mumbai, Sep 8–11. |
| Scored leaderboard? Hosted dataset? | ✅ **No, and no.** Community Hackathon judged on writeups — no Data tab, no Submit Predictions, no metric, no leaderboard. **Sparkov (spec §3) is compliant.** |
| Deliverable formats | ✅ **Three artifacts, all via the Writeups section** — see §2. Not a notebook competition. |
| External-data / pretrained-model policy | ✅ **No restriction stated.** Nothing prohibits Sparkov, XGBoost, SHAP, or a hosted LLM. Recorded as "unrestricted per the visible rules", not as explicit written permission. |
| Real names assigned to P1–P5 | ❌ **Still open — internal.** Team size cap is 1–5; we are five, so we are inside it. |

**4 of 4 portal questions resolved. 1 internal item outstanding.**

---

## 2. The three required artifacts

> "A valid submission (write-up) must contain the following three artifacts, submitted from the
> 'Writeups' section prior to the deadline. **Any un-submitted or draft work by the deadline will
> not be considered by the judges.**"

| # | Artifact | Requirement | Our state |
|---|---|---|---|
| 1 | **Code repository** | "hosted on Github", covering all three pillars, "organized, documented and reproducible" | ⚠️ Pushed, but the repo is **PRIVATE — it returns 404 to anonymous. A judge cannot open it.** Must be made public. |
| 2 | **Solution walkthrough** | "A word document (as **.docx**)" — attacks identified, how we generate/simulate them, the detection model with efficacy results, real-world feasibility | ❌ Does not exist. `docs/2026-08-31-deck-outline.md` targets a *deck*. |
| 3 | **Working prototype (Web)** | "web-based prototype with a presentable UI" demonstrating the closed loop | ⚠️ Static Next.js export exists — but `web/out/` is gitignored and every number is still placeholder. |

### 2.1 What this deletes from our plan

- **The demo video is not required.** It appears nowhere in the requirements. Strategy §6 Day 8 and
  spec §5 Day 3 both budget "record demo video". **Cut it** — hours returned on the day we need them.
- **The deck is not the deliverable; a .docx is.** The Tracks blurb says "deck/doc"; the Submission
  Requirements section says "a word document (as .docx)". The specific requirement governs. Repoint
  the deck outline at a .docx — keep the argument, drop the slide furniture.
- **No page, word, or length limit exists.** The 10-slide / 3-minute assumption in the deck outline
  was flagged there as unverified; it is now moot.
- **The web prototype is mandatory, not a bonus.** The Streamlit → static Next.js decision
  (spec §4.3) turns out to satisfy a hard requirement. Keep it.

---

## 3. Confirmed logistics

- **Team size:** 1–5. We are 5. Compliant.
- **Eligibility:** open to startups, individuals, students, FIs/fintechs/deeptech. No constraint on us.
- **Registration closed Aug 20.** The portal shows our submission deadline and Writeups section, so
  enrolment is implied — but confirm all five members sit on one team entry.
- **Prizes:** ₹2,56,000 / ₹1,28,000 / ₹64,000 (~$4,707 pool). No Kaggle points or medals.
- **Field:** 1,139 entrants · 70 participants · 41 teams · 42 submissions.

---

## 4. Judging criteria vs. what we are building — the real risk

> "Diversity of attacks identified · Fidelity of attacks in simulation · Detection algorithms and
> their efficacy · Novelty of the solution · Real-world feasibility in live payments"

| Criterion | Our position |
|---|---|
| **Diversity of attacks identified** | ⚠️ **Weakest.** Pillar I asks us to "be thorough and exhaustive… surface as many distinct, plausible attack vectors as possible". Strategy §4 deliberately narrowed to two surfaces and cut audio, graph/AML, federated. That was the right *build* call and the wrong *ideation* call — this pillar is research, so breadth costs writing time, not engineering time. Fix in §4.1. |
| **Fidelity of attacks in simulation** | ✅ **Strongest.** "Closely resemble real payment data… realistic distributions, behaviours and edge cases" is precisely the constraint-projection argument (immutability / feasibility / sparsity). The README's "a transaction that cannot physically occur" passage is already this argument — reframe it explicitly as a *fidelity* claim. |
| **Detection efficacy** | ✅ Planned — PR-AUC, threshold, false positives on legitimate payments. But no real number exists yet. |
| **Novelty** | ✅ Constraint-aware evasion plus the two-surface scorecard. |
| **Real-world feasibility** | ✅ Explicitly a required walkthrough section. The `serving/` latency work feeds it. |

### 4.1 The cheap fix for the diversity gap

Do **not** build a third attack surface. Strategy §4's reasoning holds even harder under a 48-hour
clock: two working surfaces beat three broken ones. Close the gap on paper, where this pillar actually
lives — an exhaustive taxonomy section in the .docx, drawn from the research report's Pillar I
(synthetic identity, deepfake voice, UPI collect / digital-arrest scams, agentic prompt injection,
tabular evasion, plus the vectors the report itself cut), each grounded in how the rail actually works,
with the two we implement end-to-end marked as such.

Breadth in the identify pillar, depth in the two we built — and state that trade-off explicitly rather
than letting a judge discover it.

---

## 5. Unchanged recommendation on the PDF

Do not submit `GenAI Payment Fraud Challenge.pdf` and do not cite it as evidence. 69 numbered
citations including Reddit, Medium and a vendor blog; it promises Kafka/Flink, federated learning and
wav2vec2 that we do not build. Its *content* is now scored (§0.3); its *form* would still cost
credibility on the parts of the submission that are rigorous.

---

## 6. What is now blocking, in order

1. **Correct the Sep 1 date** in spec §6 and strategy §6 before anyone plans around it again.
2. **Make the GitHub repo public** (or add the judges). A private repo is a failed deliverable #1.
3. **Produce real numbers.** All six artifacts are `placeholder: true`. Detection efficacy cannot be
   scored on seed data, and the README banner is currently honest about our having no result.
4. **Write the .docx**, not the deck.
5. **Commit `web/out/` or publish a URL** — the prototype must be openable by a judge.
6. **Submit, do not draft.** Draft writeups are explicitly not judged.
