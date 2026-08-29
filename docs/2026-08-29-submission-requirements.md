# Submission Requirements — Findings

**Date:** 2026-08-29
**Owner:** P5 (comms & submission)
**Resolves:** design spec §7 "Still open"; strategy §7 "Open questions"
**Source examined:** `GenAI Payment Fraud Challenge.pdf` (15 pages), repo root

---

## 0. Headline finding — read this first

**`GenAI Payment Fraud Challenge.pdf` is not a rules document.** It is our own
deep-research report — strategy §1 already says so ("we have a ~4,000-word deep-research
report"), and the file confirms it: PDF metadata gives `/Producer: Skia/PDF m153 Google Docs
Renderer`, `/Title: GenAI Payment Fraud Challenge`, and the body is titled *"An End-to-End
Adversarial AI Framework for Payment Security: Identification, Simulation, and Defense"*
(p. 1). Its 15 pages are: introduction and Pillar I (pp. 1–4), Pillar II (pp. 5–7),
Pillar III and the deployment/regulatory architecture (pp. 7–11), and 69 numbered web
citations (pp. 12–15).

The challenge is named exactly once, in a subordinate clause on p. 1:

> "Responding to the parameters set forth by the Mastercard Innovation Challenge 2026 — an
> initiative centered on AI red teaming for payment security — this report delineates a
> comprehensive, closed-loop AI defense architecture."

That sentence asserts that parameters exist. It does not state any of them.

**Consequence: not one of the five spec §7 questions can be answered from the PDF.** I ran a
full-text extraction and searched for `deadline`, `submit`, `submission`, `leaderboard`,
`kaggle`, `deck`, `slide`, `video`, `page limit`, `word limit`, `rules`, `eligib*`, `judg*`,
`deliverab*`, `timezone`, `due`, `portal`, `prize`, `criteria`. The only hits are the p. 1
sentence above, the word "Kaggle" as a dataset provenance label inside the model-comparison
table (p. 9), the word "video" in "deepfake video generation" (p. 2), and "rules" inside a
reference title about the DPDP Act (p. 15). There is no rules text in this file.

A supplementary web search for a public "Mastercard Innovation Challenge 2026" returned only
Mastercard marketing and industry-trend pages — no competition listing, no deadline, no rules.
I am recording that as *no corroboration found*, not as evidence the challenge is
unlisted; it may well be a private, invite, or campus-hosted portal.

**Nothing below is a guess. Every §7 item is unresolved and needs a human.**

---

## 1. Resolution table

| Spec §7 question | Status | Citation |
|---|---|---|
| Exact submission deadline and timezone | ❌ **UNRESOLVED — needs a human on the challenge portal** | Not present anywhere in the PDF; searched pp. 1–15. Only "Mastercard Innovation Challenge 2026" appears (p. 1), with no dates. |
| Scored leaderboard? Hosted dataset? | ❌ **UNRESOLVED — needs a human** | PDF describes datasets *academically* (IEEE-CIS, PaySim, ASVspoof, AMLSim — pp. 9, 11, 13) as literature benchmarks. It never says which, if any, is *provided by the challenge*. No mention of a metric, a submission file format, or a leaderboard. |
| Deliverable formats — deck page limit, video length, notebook vs repo | ❌ **UNRESOLVED — needs a human** | No deliverable specification of any kind in the PDF. Zero hits for deck/slide/page limit/word limit/video length. |
| External-data and pretrained-model policy | ❌ **UNRESOLVED — needs a human** | No rules text. Note the PDF itself *assumes* heavy pretrained-model use (wav2vec2 / SSL pretraining, pp. 9–10) with no eligibility discussion — that is a research recommendation, **not** permission. |
| Real names assigned to P1–P5 | ❌ **UNRESOLVED — internal, needs the team** | Not a PDF question. Still unassigned in spec §4.1 and strategy §4. |

**Score: 0 of 5 resolved.** This is the honest state and it should be treated as a live risk,
not a formality.

---

## 2. Why I did not guess the deadline

Our own plan (spec §6 timeline) says "Day 3 = Aug 31 · submit early Sep 1." That is a
*self-imposed* internal schedule, chosen on Aug 22 and repeated on Aug 29. It is not sourced
from any rules document I can find, and this doc must not be read as confirming it.

A wrong deadline is the single failure mode that costs the entire three days of work
regardless of how good the result is. It cannot be inferred, and I will not put a plausible
date in writing where a reader might later mistake it for a verified one.

---

## 3. What a human must go and check — a portal checklist

Whoever has portal access should answer these in one sitting and paste the answers here with a
screenshot or URL. In rough order of how much of our remaining plan each one can invalidate:

1. **Deadline + timezone, exactly as written on the portal.** Screenshot it. If the portal
   shows a countdown rather than a date, record both the countdown and the local clock time
   you read it at.
2. **Is there a "Submit Predictions" button and a Data tab?** This is strategy §2.1's
   blocking question, still open seven days later. If a hosted dataset + metric exists, a
   whole track of work (leaderboard chasing) does not currently exist in our plan — and our
   Sparkov choice (spec §3) may be non-compliant if the challenge mandates its own data.
3. **Deliverable list and formats.** Specifically: is the graded artifact a *notebook*, a
   *repo link*, a *deck*, a *video*, or several? Our plan currently produces all four and has
   optimised the repo/dashboard path hardest — if the portal only accepts a single notebook
   file, the static Next.js export (spec §4.3) stops being the demo and becomes a screenshot.
4. **Deck page limit and video length limit.** `docs/2026-08-31-deck-outline.md` is written
   to a 10-slide / 3-minute assumption that is explicitly flagged there as unverified.
5. **External-data and pretrained-model policy.** Affects: Sparkov from Kaggle (external
   dataset), any pretrained LLM used in the agentic track (P3), and the SHAP/XGBoost stack.
6. **Team size cap and eligibility.** Never checked at all. We are five people.
7. **Submission mechanics:** account required? one submission per team or per person? file
   size cap? Does resubmission overwrite?

---

## 4. Secondary risk this surfaced

Strategy §2.2 warns that the report "will read as machine-generated to Mastercard judges."
Having now read all 15 pages, I want to sharpen that: the report contains **69 numbered web
citations, several of which are Reddit threads, Medium posts, and a marketing blog**
(pp. 12–15 — e.g. citation 66 is `reddit.com/r/fintech`, 64 and 65 are Medium, 67 is a
vendor page). It also promises Kafka/Flink, federated learning with differential privacy,
wav2vec2 anti-spoofing and temporal graph networks (pp. 9–11) — all four of which strategy §4
explicitly cut.

**Recommendation, consistent with strategy §2.2:** do not submit this PDF as a deliverable and
do not cite it as evidence. Use it only as the roadmap appendix, in our own words, on one
slide. If a judge opens it expecting our work and finds a citation list that leans on Reddit,
the credibility cost lands on the parts of the submission that *are* rigorous.

---

## 5. Status of this document

This file will be updated the moment a human returns from the portal. Until then, treat every
row of §1 as open. If we reach the day before our assumed submission date with §1 still empty,
that itself is the escalation — someone stops building and goes to find the rules.
