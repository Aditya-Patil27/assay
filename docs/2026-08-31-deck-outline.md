# Deck Outline + Demo Storyboard

**Date:** 2026-08-31 (Day 3)
**Owner:** P5
**Status:** outline — numbers are TK until artifacts flip to `placeholder: false`

> ⚠️ **Format assumption, unverified.** This is written to **10 slides** and a **3-minute**
> demo video. Neither limit is confirmed — see `docs/2026-08-29-submission-requirements.md`.
> The challenge PDF in this repo is our own research report and contains no deliverable
> specification at all. Slides 8–10 are marked **CUT FIRST** so this collapses to 7 slides
> and ~2 minutes without restructuring, if the real limit turns out to be tighter.

---

## The one claim

> **One framework, two attack surfaces, measured red vs blue — and the blue team wins
> measurably.**

Every slide either sets that sentence up or supplies evidence for it. If a slide does
neither, it comes out. The specific words that do the work:

- **one framework** — not two demos. Slide 9 (the scorecard) is what earns this word, and it
  is the reason the scorecard is non-negotiable.
- **two attack surfaces** — tabular ML and an LLM agent. Two is enough to support
  "generalizes"; a third, broken one would undermine it.
- **measured** — every claim traces to a number in a committed artifact file. No slide
  asserts a capability the notebook does not compute.
- **the blue team wins measurably** — a delta, with its cost stated. Not "we improved
  security."

### What we will not claim, and why that is a feature

We cut audio anti-spoofing, graph/AML detection, federated learning, and Kafka/Flink
streaming. They appear once, on the roadmap slide, cited to the research. Innovation-challenge
teams most often lose on the gap between a promised architecture and a demoed artifact —
so the promised architecture and the demoed artifact are deliberately the same size here.

---

## Slide-by-slide

### 1 — Title + the claim
**Says:** Assay. One framework, two attack surfaces, red vs blue,
measured.
**Shows:** The scorecard table's two rows, before/after, as the title slide's only graphic.
Lead with the result; do not save it.
**Why first:** A judge scoring twenty submissions decides in fifteen seconds whether this one
is real. Give them the number immediately and spend the rest of the deck earning it.

### 2 — The threat, in payment terms
**Says:** GenAI moved fraud from credential theft to synthesized identity, automated social
engineering, and detection evasion at scale. Static defenses are tested by the attacker, not
by the defender.
**Shows:** The Pillar I taxonomy, trimmed to a single readable table. Four vectors, not
fourteen.
**Careful:** No stat we cannot source. Cite the research doc's figures as *reported by the
cited source*, not as our findings.

### 3 — The question everyone else skips
**Says:** Standard adversarial ML asks "can I flip this prediction?" Payments demands a
harder question: **"can I flip it with only what an attacker actually controls?"**
**Shows:** The three-tier constraint diagram — immutable (the victim's attributes) / coupled
(one merchant choice moves four features together) / mutable (amount, timing, pacing).
**This is the intellectual core.** If a judge remembers one slide, this is the one worth
remembering, because it is the part a generic submission does not have.

### 4 — Why Sparkov, not `creditcard.csv` — the differentiator
**Says:** The default fraud dataset is PCA-anonymized to `V1`–`V28`. On it, our central claim
is not hard to implement — it is **undefined**. There is no MCC to freeze, no geography to
couple. You can still produce a beautiful ASR-collapse curve on it, and the number would be
real while the claim attached to it was a fiction.
**Shows:** Two-column comparison. Left: `V1 … V28, Time, Amount`. Right: Sparkov's real
columns mapped onto the three tiers.
**The line to say out loud:** *"a domain judge would catch that in one question — which of
those V-columns is the MCC?"*
**Also say the cost:** Sparkov is simulator-generated. We take a weaker dataset that supports
a real claim over a stronger one that supports a fake one. Naming our own trade-off here is
what makes the rest of the deck credible.

### 5 — The unrolled loop
**Says:** Attack → detect → score → retrain → attack. It is a *cycle*; it becomes a DAG only
when unrolled over rounds, so round 1's retrained detector is a distinct node feeding round
2's attacker.
**Shows:** The React Flow graph from the live dashboard, with the unroll edges dashed.
**Precision note:** say "unrolled loop", never "DAG". A judge who knows the difference will
notice, and being right costs us nothing.

### 6 — Result 1: ASR collapse *while PR-AUC holds* — **the money slide**
**Says:** ASR falls from **TK** to **TK** across three rounds while PR-AUC moves only
**TK**.
**Shows:** The two-line chart (ASR red, PR-AUC blue) plus the L0 bar chart beside it.
**Both lines matter.** A submission showing only the falling ASR has shown a detector that
learned to say "fraud" more often. The pair is the claim.
**Then the caveat, out loud, unprompted:** the attack does not become impossible, it becomes
**expensive** — mean L0 rises from TK to TK. Volunteering this is worth more than the headline
number, because it tells a domain judge we understand what we measured.

### 7 — Result 2: agentic exploit rate before vs after
**Says:** Same framework, an entirely different modality. Indirect prompt injection in the
four places a payment system must ingest untrusted text — memos, invoice metadata, merchant
display names, chargeback dispute text. Exploit rate **TK** → **TK** after the defense layer.
**Shows:** Grouped bar chart by OWASP category, before vs after, with one real injection
string displayed verbatim. The literal attack text is the most memorable thing in the deck.
**Say the residual out loud:** the post-defense rate is not zero. Prompt injection is not
solved, and anyone showing a 100% block rate on a defense this cheap is measuring their own
test set.

### 8 — The defense layer, and what it costs — **CUT FIRST**
**Says:** Injection classifier, tool scoping, HITL threshold. Each has a price.
**Shows:** Three-row cost table.
**The honest note that belongs here:** the HITL threshold's cost is not a latency figure —
it transfers work to a human reviewer, which on a real payment book is headcount. A scorecard
that only counts milliseconds is hiding that.
**Cut rule:** if the page limit bites, fold one line of this into slide 9 and drop the slide.

### 9 — `framework_scorecard` — **NEVER CUT**
**Says:** Two surfaces, one shape of result: attack success before, after, defense cost.
**Shows:** The two-row table, full width, nothing else on the slide.
**This slide is the whole argument.** Without it we presented two projects. With it we
presented a method that transfers across modalities, with two independent pieces of evidence.
If the deck must shrink to five slides, this is one of the five.

### 10 — Roadmap and limits — **CUT SECOND**
**Says:** What we deliberately did not build, and what we know is missing. Transfer tests
against attacks the detector never saw in training (the honest generalisation question).
Voice anti-spoofing. Graph/AML topology. Streaming inference under a p99 budget. Federated
training with DP.
**Shows:** Roadmap strip, cited to the background research.
**Why it earns its place if it survives:** it gets us credit for knowing the full landscape
without spending hours pretending to have built it — and closing on our own limitations reads
as confidence, not weakness, to a technical judge.

---

## Demo storyboard — 3 minutes

The demo is a **static export a judge clicks**, not a stack they install. Nothing trains
while anyone is watching. The failure mode we are engineering out is the classic one: the
demo that dies live.

| # | Time | On screen | Said |
|---|---|---|---|
| 1 | 0:00–0:20 | Dashboard landing, scorecard visible immediately | "One framework, two attack surfaces. Attack success before, after, and what the defense cost. Here is the whole result — now let me show you it is real." |
| 2 | 0:20–0:50 | Constraint panel: the three tiers, `schema.py` rendered live | "The frozen features aren't a config setting, they're a contract the attack engine calls. An attack that moves the victim's age doesn't get to count." |
| 3 | 0:50–1:20 | React Flow unrolled loop, rounds highlighting in sequence | "Attack, detect, retrain, attack again — unrolled over three rounds so round 1's detector feeds round 2's attacker." |
| 4 | 1:20–1:50 | ASR + PR-AUC chart animating across rounds | "Red falls from TK to TK. Blue holds at TK. Both, or it means nothing." |
| 5 | 1:50–2:10 | Worked-example panel: one transaction, before/after, features touched | "One real evasion. Two features moved. Here is exactly what the attacker did." |
| 6 | 2:10–2:40 | Agentic tab: injection strings, then before/after bars | "Different surface, same framework. This string, in a transaction memo, made the agent call `update_payee`." |
| 7 | 2:40–3:00 | Back to the scorecard, full screen | "Two surfaces, one shape of result. That is why this is a framework and not two demos." |

**Storyboard rules:**
- **Open and close on the scorecard.** It is the claim; bookend it.
- **Never type a command on camera.** Every screen is a click on a pre-built page.
- **Show one real injection string in full.** Specificity is what people remember.
- **Say one caveat out loud** (beat 4: attacks get expensive, not impossible). A demo with no
  admitted limitation reads as a sales pitch.
- **Record with all artifacts real.** If the placeholder banner is on screen, the recording is
  void — that banner exists precisely so a placeholder cannot reach a judge, and it will be
  extremely visible on video.

---

## Pre-record checklist

Do not start recording until every box is ticked.

- [ ] All six artifacts show `placeholder: false` (the notebook's provenance audit prints
      this — run it and screenshot the output)
- [ ] Dataset provenance line written by P1 and, **if the data is synthetic, that fact is on
      screen in the demo**, not only in the notebook
- [ ] LLM provenance line written by P3 — live model, cached responses, or stub, stated
- [ ] Notebook executes top to bottom on a clean kernel with no errors
- [ ] Static export opens from `file://` with no dev server running
- [ ] Deck page limit and video length **verified against the actual portal**, not assumed
- [ ] Every TK in this document resolved to a number or deliberately removed
