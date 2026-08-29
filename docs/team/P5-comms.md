# P5 — Comms, compliance & submission

Roughly a third of the score is how this is presented. That is not filler work — a
submission that doesn't reach the judges in the right format scores zero regardless of the
engineering.

**You own:** `docs/`, the `.docx` walkthrough, the writeup, the submission mechanics

> ## ⚠️ Deadline: **Aug 31 2026, 11:59 PM IST (GMT+5:30)**
>
> Confirmed from the Kaggle portal. The plan docs previously said "submit early Sep 1" —
> **that was a day past the deadline.** Aug 31 is submission day, not a build day.
>
> Three artifacts, via the **Writeups** section: a GitHub repo, a **`.docx` walkthrough**,
> and a **working web prototype** (that's the deployed dashboard — P4).
>
> **No video is required.** Do not spend a single hour on one.
>
> **A draft writeup is not judged.** Submitting a draft is the same as not submitting.

**Don't touch:** `src/`, `web/`

---

## Rules status

- [x] **Deadline** — Aug 31 2026, 23:59 IST
- [x] **Deliverable format** — repo + `.docx` walkthrough + working web prototype, no video
- [x] **Leaderboard** — none; it's a Writeups-judged Community Hackathon
- [ ] External-data and pretrained-model policy — we use Sparkov from Kaggle and a hosted
      LLM; confirm both are allowed
- [ ] Team registration complete, all five members listed

Full findings in `docs/2026-08-29-submission-requirements.md`.

---

## The narrative

One spine, used in the walkthrough and the writeup:

> **Threat → Attack → Defense → Result**

Told once for the tabular surface, once for the agentic surface, then joined by the
framework scorecard. That table is the argument: the same loop, applied to two different
attack surfaces, with measured before/after on both. Two surfaces is what makes it a
framework; the scorecard is what makes that visible in one glance.

### The one rule

**Every claim in the walkthrough must be backed by something running in the repo.**

The background research PDF promises Kafka, Flink, federated learning, wav2vec2 audio
anti-spoofing and temporal graph networks. **We are not building any of those.** Mismatch
between a promised architecture and a demoed artifact is the single most common way
innovation-challenge teams lose.

Those belong in **one Roadmap section**, explicitly labelled as future work and cited to the
research. We get credit for having mapped the threat landscape without pretending we built
it.

### Voice

Write in our own voice. The research PDF is 4,000 words with 74 citations and reads as
machine-generated; judges notice. Use it as the threat taxonomy — Pillar I is genuinely good
source material for the "why this matters" opening — and write everything else ourselves.

---

## Walkthrough structure (the `.docx`)

Ten beats. This is the graded document, so it carries the argument on its own — a judge may
read it without ever opening the prototype.

1. **The threat** — GenAI has changed the attacker's cost curve. One statistic, one sentence.
2. **The gap** — fraud detectors are evaluated against historical fraud, not against an
   adversary who adapts.
3. **Our approach** — the closed adversarial loop, in one diagram.
4. **Surface 1: tabular** — the constraint-aware attack. *Lead with the three projections.*
   This is the most novel thing we built and it's what a technical judge will engage with.
5. **The result** — ASR collapses, PR-AUC holds. The co-evolution chart, full bleed.
6. **Surface 2: agentic** — indirect prompt injection where payments actually ingest
   untrusted text. Exploit rate before/after.
7. **The framework scorecard** — the whole argument in one table.
8. **Architecture** — the unrolled loop; note it's a feedback cycle unrolled over rounds,
   not a DAG. Precision here costs nothing and a knowledgeable judge notices.
9. **Roadmap** — everything from the research we deliberately didn't build, and why.
10. **The team.**

## The web prototype is a graded artifact, not a demo aid

One of the three required submissions *is* the working web prototype. That moves P4's deployed
URL from supporting material to a deliverable in its own right — make sure it is public and
loads from a logged-out browser well before the deadline.

## Writeup

Structure it as: threat model → what we built → how we measured it → what we found →
limitations → roadmap.

**Include the limitations section.** Say that we evaluate on synthetic Sparkov data, that the
agentic track uses a mock payment agent, that our constraint set is a modelling choice.
Judges trust a team that states its own boundaries far more than one that claims none.

---

## Aug 31 — submission day

- [ ] Submit **early**. Not in the final hour, and not on Sep 1 — the deadline is Aug 31.
- [ ] **Publish the writeup.** A draft is not judged.
- [ ] Deliverables in the exact required formats
- [ ] All links public and tested from a logged-out browser — a private repo or a
      permissioned Vercel URL is the classic way to lose points for work that was finished
- [ ] Team members correctly listed
- [ ] Confirmation of submission saved

## Done when

- [x] Rules confirmed and shared
- [ ] `.docx` walkthrough final, every claim traceable to running code
- [ ] Web prototype public and loading from a logged-out browser
- [ ] Writeup in our own voice, with limitations — **published, not draft**
- [ ] Submitted, confirmed, screenshotted
