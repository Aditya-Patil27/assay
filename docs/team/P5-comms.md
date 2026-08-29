# P5 — Comms, compliance & submission

Roughly a third of the score is how this is presented. That is not filler work — a
submission that doesn't reach the judges in the right format scores zero regardless of the
engineering.

**You own:** `docs/`, the deck, the video, the writeup, the submission mechanics
**Don't touch:** `src/`, `web/`

---

## Day 1, before anything else — you are blocking the team

Nobody has confirmed these, and several of them change what other people build:

- [ ] **Exact deadline and timezone**
- [ ] **Deliverable format** — Kaggle notebook? GitHub repo? Deck? Video? All of them?
- [ ] **Is there a scored leaderboard and a hosted dataset?** If yes, that's a whole
      separate track and we need to reallocate today
- [ ] Deck page limit, video length limit, live pitch vs recorded
- [ ] External-data and pretrained-model policy — we use Sparkov from Kaggle and a hosted
      LLM; confirm both are allowed
- [ ] Team registration complete, all five members listed

Post the answers in the team channel and update
`docs/superpowers/specs/2026-08-29-adversarial-payments-design.md` §7.

**If the graded artifact is a Kaggle notebook rather than a repo**, tell P4 immediately — it
demotes the dashboard from primary demo to supporting material, and changes what they spend
Day 2 on.

---

## The narrative

One spine, used in the deck, the video, and the writeup:

> **Threat → Attack → Defense → Result**

Told once for the tabular surface, once for the agentic surface, then joined by the
framework scorecard. That table is the argument: the same loop, applied to two different
attack surfaces, with measured before/after on both. Two surfaces is what makes it a
framework; the scorecard is what makes that visible in one glance.

### The one rule

**Every claim in the deck must be backed by something running in the repo.**

The background research PDF promises Kafka, Flink, federated learning, wav2vec2 audio
anti-spoofing and temporal graph networks. **We are not building any of those.** Mismatch
between a promised architecture and a demoed artifact is the single most common way
innovation-challenge teams lose.

Those belong on **one Roadmap slide**, explicitly labelled as future work and cited to the
research. We get credit for having mapped the threat landscape without pretending we built
it.

### Voice

Write in our own voice. The research PDF is 4,000 words with 74 citations and reads as
machine-generated; judges notice. Use it as the threat taxonomy — Pillar I is genuinely good
source material for the "why this matters" opening — and write everything else ourselves.

---

## Deck skeleton (~10 slides)

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

## Video

Storyboard Day 2, record Day 3 morning. Do not leave recording to the last hours.

Show the numbers moving, not code scrolling. The strongest 20 seconds available: round 0's
attack succeeding against the detector, then the same attack failing at round 2.

Record from P4's deployed URL rather than a local dev server — no localhost in the address
bar, nothing to crash mid-take.

## Writeup

Structure it as: threat model → what we built → how we measured it → what we found →
limitations → roadmap.

**Include the limitations section.** Say that we evaluate on synthetic Sparkov data, that the
agentic track uses a mock payment agent, that our constraint set is a modelling choice.
Judges trust a team that states its own boundaries far more than one that claims none.

---

## Day 3

- [ ] Submit **early**. Not in the final hour.
- [ ] Deliverables in the exact required formats
- [ ] All links public and tested from a logged-out browser — a private repo or a
      permissioned Vercel URL is the classic way to lose points for work that was finished
- [ ] Team members correctly listed
- [ ] Confirmation of submission saved

## Done when

- [ ] Rules confirmed and shared (Day 1)
- [ ] Deck final, every claim traceable to running code
- [ ] Video recorded and under the limit
- [ ] Writeup in our own voice, with limitations
- [ ] Submitted, confirmed, screenshotted
