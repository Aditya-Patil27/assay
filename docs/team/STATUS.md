# Status board — Day 2 (2026-08-30)

> ## ⛔ The deadline is **Aug 31, 2026 · 23:59 IST** — not Sep 1
>
> Both plan documents say *"Day 3 = Aug 31 · submit early Sep 1."* **That is a full day past
> the real deadline**, and it was self-imposed, never sourced. Confirmed against the live
> Kaggle portal header: *"Your submission is due by Aug 31, 2026 at 11:59 PM GMT+5:30."*
> Our local clock is IST, the same zone — so from the morning of Aug 30 we have roughly
> **40 hours**, not 64.
>
> Draft work is explicitly **not judged**: three artifacts (GitHub repo, .docx walkthrough,
> working web prototype) must be *submitted* through the Writeups section before the cutoff.
> No demo video is required, though both plan docs budget time for one — that time is now
> better spent elsewhere.
>
> Full sourcing in [../2026-08-29-submission-requirements.md](../2026-08-29-submission-requirements.md).
> **A human should eyeball the portal once to confirm before we re-plan around it.**

What is actually real right now, and what each person does next. Update your own section
when something lands; do not update anyone else's.

The rule this board exists to enforce: **a number is real only when its artifact says
`placeholder: false`.** Five of six still say `true`. Those are seed fixtures and must not
be quoted in the deck, the notebook, or to a judge.

---

## Artifact reality check

| Artifact | Owner | `placeholder` | State |
|---|---|---|---|
| `artifacts/detect/rounds.json` | P1 | **`false`** | Real — round 0 only |
| `artifacts/attack/rounds.json` | P2 | `true` | Seed fixture |
| `artifacts/attack/examples.json` | P2 | `true` | Seed fixture |
| `artifacts/agentic/redteam.json` | P3 | `true` | Seed fixture |
| `artifacts/graph.json` | P2 | `true` | Seed fixture |
| `artifacts/scorecard.json` | P2 + P3 | `true` | Seed fixture — **the terminal node, still empty** |

`pytest -q` → **all green. The count climbs as tests land** — last verified at 70, on
`ba1d38b` plus the uncommitted working tree (2026-08-30).

Do not hard-code a test count in any doc. It went stale twice in one afternoon (24 → 65 → 70)
because three Claude sessions are working this tree concurrently, and a stale count reads
exactly like a current one. If your number disagrees with someone else's, you are almost
certainly missing their untracked test file rather than looking at a regression.

---

## The real numbers so far

**Data — real Sparkov, downloaded from Kaggle.** Not synthetic. `artifacts/data_provenance.json`:

| | |
|---|---|
| Rows | 1,852,394 |
| Fraud rate | 0.521% (9,651 fraud) |
| Cards | 999 |
| Date range | 2019-01-01 → 2020-12-31 |

**Detector, round 0** (`artifacts/detect/rounds.json`):

| Metric | Value |
|---|---|
| PR-AUC | 0.829 |
| ROC-AUC | 0.978 |
| Threshold | 0.233 |
| Precision / Recall | 0.718 / 0.797 |
| `n_train` | 96,000 |

PR-AUC 0.83 sits inside the 0.75–0.90 plausibility band from the P1 brief, which is the
result we want — it is evidence the causal feature engineering did not leak. Do not "improve"
it toward 0.95 without first proving the aggregates are still past-only.

**Caveats to carry into the writeup, not to bury:**

- `n_train = 96,000` is a **subsample**, not the full 1.85M rows. Either scale it up or state
  the subsample size everywhere the PR-AUC appears.
- `artifacts/latency.json` reports p50 4.1 ms / p95 6.0 ms, but over **100 samples on the
  XGBoost backend**, not 1,000 samples on ONNX as the brief specifies. It is indicative, not
  yet quotable.
- **`latency.json` and `data_provenance.json` bypass the envelope.** They are written with a
  plain `json.dump` and are not registered in `artifacts.py:_PATHS`, so they carry no
  `placeholder` flag, no `git_sha`, no `created_at` — and `web/lib/load.ts` cannot read them.
  The sub-50 ms claim therefore sits **outside** the exact machinery we built to guarantee a
  number is real. Either route them through `A.write()` (which means adding kinds to
  `_PATHS` and mirrors to `types.ts`, a contract change needing a team heads-up) or state
  plainly that they are unmanaged. Do not quote them as if the banner were covering them.
  *(Found by a parallel session reviewing the tree — credit where due.)*
- **The agentic cache is 101 entries of scripted stub output** (`STUB_PROVENANCE =
  "scripted-stub-v1"`); no `.env` exists and no LLM has ever been called. The code is honest
  about this and `redteam.json` is still `placeholder: true`, so nothing is currently
  misrepresented — but that scorecard row cannot ship as a result until a real key populates
  the cache and the run replays offline to identical numbers.

---

## Per-person: landed / next / blocked

### P1 — detector & data

**Landed:** real Kaggle fetch with provenance, causal feature build passing
`schema.validate()`, `artifacts/feature_schema.json` frozen, XGBoost round 0, SHAP top-8
(`amt`, `category_enc`, `log_amt`, `amt_ratio_to_card_mean`, `hour`, `is_night`, `age`,
`hours_since_last_txn`), first latency pass.

**Next, in order:**
1. Write `tests/test_features.py` — the causality proof from your brief (row *i*'s
   `amt_ratio_to_card_mean` uses only rows `< i`). Nothing else you write today is worth more.
2. Decide the training size question: scale past 96k or pin the subsample and document it.
3. Redo latency properly — ONNX, batch of 1, ~1,000 calls, p50/p95/p99.
4. Hand P2 the ordinal encoders so the coupled-group swap can reach real merchant categories.

**Blocked by:** nobody.

### P2 — attack engine

**Landed:** `constraints.py`, `engine.py`, `metrics.py`, `loop/state.py`, `loop/flows.py`,
`loop/fallback.py`, `tests/test_attack.py`, `tests/test_loop.py` — green, and now run against
the **real** round-0 model on real Sparkov at ~0.07 s per transaction.

> **The economic-floor finding — read before quoting any ASR.**
> The first real run returned **ASR = 1.0**, achieved by shrinking the transaction to ~12% of
> its value. An attacker who surrenders 88% of the money has not evaded anything; they have
> given up. That is a broken *measurement*, and it would have been the single easiest thing
> for a judge to dismantle.
>
> Fixed under TDD by a parallel session: added an economic floor (`value_floor`, default 0.5),
> fixed `coords` being re-derived from changed columns rather than the coordinates the search
> actually moved, and fixed a sparsity tie-break that structurally favoured the amount lever.
> **Value retained: 11.4% → 74.5%.**
>
> ASR is still 1.0. The fix corrected the measurement, not the detector — the attack genuinely
> succeeds against round 0, and that is the honest starting point the retraining rounds must
> now pull down. Report the retained-value figure alongside every ASR; ASR alone is exactly the
> number that invites the "so what did it cost the attacker?" question.

**Next, in order:**
1. Run rounds 1 and 2 against the corrected engine and show ASR falling from 1.0 while PR-AUC
   holds. This is the Day-2-end gate and it is yours.
2. Run rounds 1 and 2, write `attack/rounds.json` + `examples.json` + `graph.json` at
   `placeholder: false`.
3. Confirm `RUN_ORCHESTRATED=1` and `=0` give **identical** ASR — the Prefect fallback is a
   correctness claim, not a convenience.
4. Write the tabular row of `scorecard.json`; merge P3's agentic row when they send it.

**Blocked by:** P1's model interface — which now exists, so you are unblocked.

**Sanity checks before you believe your own number:** ASR near 100% at round 0 means the
constraints are too loose (check frozen features are truly restored, not clipped). ASR near
0% means the budget or bounds are too tight. Pick 2–4 worked examples, ideally one where the
attacker won by **swapping merchant** rather than just lowering the amount — that example is
the one that sells the constraint story.

### P3 — agentic red team

**Landed:** `client.py` with the response cache, `tools.py`, `agent.py`, `injections.py`,
`redteam.py`, `defenses.py`, plus `artifacts/agentic/cache/`.

**Next, in order:**
1. Add the **benign control condition** — a clean invoice that reads like ordinary business
   text, so a false-refusal rate is measurable. A defense that blocks everything is not a
   defense and a judge will ask.
2. Run the full corpus and write `agentic/redteam.json` at `placeholder: false`, with
   before/after per OWASP category.
3. Measure defense cost: added latency **and** false-refusal rate on the benign controls.
4. Send P2 your scorecard row. You do not write `scorecard.json` yourself.

**Blocked by:** nobody.

**Non-negotiable:** the whole run must complete with `LLM_LIVE=0` and no network. If the
numbers came from a scripted stub rather than a live model, that must be stated in the
artifact and the notebook — presenting stub output as live-model output is the one mistake
that would sink us at judging.

### P4 — dashboard

**Landed:** design pass on `globals.css`, `AdversarialGraph.tsx`, `CoevolutionChart.tsx`,
`ShapPanel.tsx`, `next.config.ts`.

**Next, in order:**
1. Finish the DAG layout — band nodes by round so it reads as an *unrolled loop*, not one
   long ribbon. Keep `kind: "unroll"` edges visibly dashed.
2. Verify the placeholder banner fires **right now**, naming all five fixture files. That
   banner is a correctness feature; test it while it still has something to catch.
3. Re-sync and rebuild each time P1/P2/P3 land a real artifact; confirm the banner clears
   file by file.
4. `npm run build` green with zero TS errors, and check the static export opens from disk.

**Blocked by:** nothing for the UI; real numbers arrive as they arrive.

### P5 — comms & compliance

**Landed:** `docs/2026-08-29-submission-requirements.md` — including the deadline correction,
which is the highest-value thing anyone has produced on this project so far.
Also `docs/2026-08-31-deck-outline.md`, `notebooks/submission.ipynb`, README pass.

**Next, in order:**
1. **Build the three required artifacts as artifacts**, in Writeups form: GitHub repo, the
   `.docx` walkthrough, the working web prototype. Draft work is not judged — "written but not
   submitted" scores zero, so submit early and revise in place.
2. Reallocate the demo-video budget. No video is required; both plan docs budget one. That
   time goes to the `.docx` walkthrough, which *is* judged.
3. Rewrite the PDF's attack taxonomy in our own voice for the walkthrough — "diversity of
   attacks identified" is a scored criterion, so that content earns marks even though the PDF
   itself must not be submitted.
4. Wire the notebook to pull every number live from the artifact JSON. No hardcoded figures,
   so the notebook cannot drift from the run.
5. Carry the caveats above into the writeup in our own words — 96k subsample, unmanaged
   latency number, stub-sourced agentic cache, and attacker retained-value alongside ASR.
   Every one of these is something a judge would otherwise find first.

**Blocked by:** P2 and P3 for final numbers. Everything else is yours to finish now.

---

## Gates

| When | Gate | Owner | State |
|---|---|---|---|
| Day 1 end | `schema.py` frozen against real Sparkov | P1 | ✅ done |
| Day 1 end | Deadline, deliverable format, rules confirmed | P5 | ✅ done — and it moved the deadline a day earlier |
| Day 2 end | A real ASR number exists | P2 | 🟡 exists (1.0, corrected measurement) — now needs rounds 1–2 showing it fall |
| **Aug 31, midday** | Code freeze — everything after this is submission mechanics | all | ⬜ |
| **Aug 31, 23:59 IST** | **All three artifacts submitted, not drafted** | P5 | ⬜ **hard cutoff** |

The old "Day 3 midday code freeze" assumed a Sep 1 submission. With the real Aug 31 23:59
cutoff, Day 3 is submission day, not a build day — there is no evening and no buffer.
