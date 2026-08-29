# Status board — Day 2 (2026-08-30)

> ## ⛔ The deadline is **Aug 31, 2026 · 23:59 IST** — not Sep 1
>
> Both plan documents say *"Day 3 = Aug 31 · submit early Sep 1."* **That is a full day past
> the real deadline**, and it was self-imposed, never sourced. Confirmed against the live
> Kaggle portal header: *"Your submission is due by Aug 31, 2026 at 11:59 PM GMT+5:30."*
> Our local clock is IST, the same zone. **At 2026-08-30 01:10 IST that is ~47 hours.**
> Quote the cutoff, not a countdown — an hours figure in a doc rots within the hour, and an
> earlier revision of this board carried a stale one.
>
> Draft work is explicitly **not judged**: three artifacts (GitHub repo, .docx walkthrough,
> working web prototype) must be *submitted* through the Writeups section before the cutoff.
> No demo video is required, though both plan docs budget time for one — that time is now
> better spent elsewhere.
>
> Full sourcing in [../2026-08-29-submission-requirements.md](../2026-08-29-submission-requirements.md).
> **A human should eyeball the portal once to confirm before we re-plan around it.**

> ## 🔑 One credential is now the highest-leverage item on the board
>
> There is **no `.env`** in the repo (verified). That was P3's blocker; with LLM-driven
> orchestrators it now blocks **two tracks**, because the orchestrators need the same
> OpenRouter/NIM key the agentic track has been waiting on.
>
> Consequences: the agentic exploit rates stay stub-sourced, the orchestrator reasoning
> cannot be real, and **two of the six `[[PENDING]]` markers in the walkthrough close the
> moment a key exists**. Everything else on this board is work; this is a five-minute
> unblock that no amount of engineering substitutes for. Copy `.env.example`, add a key.
>
> Both tracks can be *built and tested* against the cached/stub path meanwhile — but neither
> produces a quotable number without it.

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

> ### The training pause is LIFTED, and the architecture is changing
>
> Superseded: rounds 1–2 were paused by decision; that instruction has been withdrawn and
> both tracks now run in parallel.
>
> **The new direction: two LLM-driven orchestrators, Red and Blue.** Blue holds the line,
> Red reasons about how to breach it, Blue responds to *how* it was breached, and it
> iterates.
>
> **The gap this closes is real — verified, not assumed.** There is no strategy selection
> anywhere in `attack/` or `loop/`: grepping for strategy/selection/adaptation returns five
> hits and every one is a comment or a docstring. `run_loop` is a fixed procedure with one
> attack (greedy coordinate descent) and one defense (retrain on adversarial examples). So
> today "co-evolution" means **"we retrained three times"**, and the question *"in what sense
> are there two adversaries here rather than one script?"* currently has no good answer.
>
> **Ownership split:** b4 keeps `attack/` and `loop/` and owns the baseline run that produces
> the real ASR — they found and fixed the value-floor bug, so the number should be theirs.
> A new `src/adversarial_payments/orchestration/` package (does not exist yet) holds the
> orchestrators: new directory, no edits to anyone's files, imports from `attack/` and
> `loop/` without modifying them, writes its own artifact kind.
>
> **That containment is the safety property, so hold to it.** This is a scope increase at
> T-47h on the one deliverable with no fallback. It is only safe while the orchestrator is
> strictly *additive*: if it doesn't land, the baseline ASR and the co-evolution curve must
> still ship on their own. The moment orchestration work starts editing `attack/` or `loop/`,
> that guarantee is gone and the headline result is at risk. Baseline first, orchestrator
> second — in that order, even though both tracks run in parallel.

> ### Risk: across 3 rounds, "adaptive" is hard to tell from "scripted"
>
> With only r=0,1,2, an adaptive orchestrator and a fixed schedule produce very similar
> traces. *"How do you know it adapted rather than cycling a list?"* is the obvious challenge
> and it lands hard.
>
> Mitigation, and it must be built in from the start rather than added afterwards: **record
> each orchestrator's reasoning per round** so the transcript shows an actual counter — Red
> pivoting to timing *because* Blue hardened amount — rather than the writeup asserting
> adaptivity. A saved reasoning trace is evidence; a claim in prose is not.

**Next, in order:**
1. Run rounds 1 and 2 against the corrected engine and show ASR falling from 1.0 while PR-AUC
   holds. This is the Day-2-end gate and it is yours — **currently blocked by the no-training
   instruction above.**
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

> ### 🔴 The headline chart currently disproves its own caption
>
> The co-evolution chart plots PR-AUC as **82.9% → 0% → 0%**, collapsing to the axis,
> directly beneath text reading *"Attack success collapses while detection quality holds …
> the failure mode this chart exists to rule out."* The stat tile beside it disagrees too,
> showing "PR-AUC 0.829 → 0.829, −0.0%".
>
> Not a UI bug in origin: `detect/rounds.json` holds round 0 only, `attack/rounds.json`
> holds rounds 0–2, and the chart joins by round and renders the missing values as zero.
> P1 was **right** not to write invented rounds next to a real number — the chart is what
> must change. Suppress absent points rather than plotting them as 0; Recharts skips `null`
> in a line series.
>
> **Plotting absent data as zero is the same class of error as inventing a number**, and it
> is the worst thing on the page for a judge. Fix before deploying, not after.
>
> Also: at 390px the body scrolls horizontally and headline, banner and body text clip at
> the right edge. Cards stack correctly, so it is a container min-width rather than the grid.
> (Measured without device emulation — strong evidence, not proof.)

**The prototype is now a graded artifact, not demo support.** The deadline correction
promoted it: requirement #3 of three is "a working web prototype", submitted through
Writeups. Everything below is scored work.

> ### ⚠️ Requirement #3 is never deployed, and the local build is stale
>
> *An earlier revision of this board claimed `web/out/` being gitignored meant "no delivery
> path to a judge". **That was wrong** and is corrected here — the record is kept because
> the wrong diagnosis pointed at the wrong fix.*
>
> **CORRECTED 2026-08-30: the export does NOT work from `file://`.** This board previously
> said it was standalone-capable, on my (mastercard-7f's) report. mastercard-b4 opened it in
> a real browser: **charts render blank and React Flow paints nothing.**
>
> The relative-path check was correct — 26 relative `./_next/...`, zero absolute, re-confirmed
> — it just doesn't cover the failure. The data is fine, inlined at build time, which is why
> headings, tables and stat tiles all render. What fails is **hydration**: Next emits one
> chunk carrying a `crossorigin` attribute, which under `file://` fails a CORS check against
> an opaque origin, so the chunk is blocked and the client components that draw the charts
> never execute.
>
> Two lessons kept deliberately: **assets resolving and the page working are different
> claims**, and a mechanical check on HTML is not a substitute for opening a browser. The
> gap was flagged as open and then reported as though it were closed.
>
> **A served URL is required.** Any static server: `cd web/out && python -m http.server 8000`.
>
> **`web/out/` being gitignored is correct practice, not a bug.** Build output does not
> belong in a repo, and gitignore has no bearing on deploying. A judge with only the repo
> can run `npm install && npm run build`: `package.json` has `"prebuild": "npm run sync"`,
> which regenerates `web/public/data/` from the committed `artifacts/`. **Leave
> `.gitignore:39` and `:40` exactly as they are.**
>
> ✅ **The stale build is fixed.** Rebuilt 2026-08-30 00:58, after the design pass and the
> real detector run. Verified in the served HTML: **PR-AUC 0.829, ROC-AUC 0.978, and the
> `n_train = 96,000` qualifier are all on the page** — the subsample caveat now travels with
> the number where a judge actually reads it. The sync moved 6 → 9 artifact files, so it had
> genuinely fallen behind. Standalone capability survived (still 26 relative, 0 absolute).
>
> ✅ **The placeholder banner works, verified against the real page.** It names exactly the
> five remaining fixtures — `attack/rounds`, `attack/examples`, `graph`, `scorecard`,
> `agentic/redteam` — and correctly does *not* name `detect/rounds`, the one real artifact.
> That is the safety mechanism doing precisely its job.
>
> The two gaps that remain:
>
> 1. **Nothing is deployed and there is no deployment automation.** Verified absent:
>    `.github/workflows`, `vercel.json`, `netlify.toml`. Deployment is an unperformed
>    manual step with no CI fallback. The fix is one command
>    (`npm run build && npx vercel deploy out --prod`), not a repo change. **It publishes a
>    public URL, so it is a human's call** — not something any agent should do on its own
>    initiative.
> 2. **Nobody has looked at the page in a browser.** It serves over HTTP (200s on
>    `index.html` and its chunks, with `0.829` present in the served response), and its asset
>    paths are relative — but *serving* is not *rendering*. Layout, whether the React Flow
>    graph actually draws, and mobile width are unverified and cannot be checked without
>    eyes on a browser. **Do not let the mechanical checks stand in for this one.**
>
> **Fallback if deploy fails or a judge cannot reach the URL:** zip `web/out/` — but it is
> only usable WITH a one-line "serve this folder" instruction, since double-clicking
> `index.html` shows a page with no charts. Attach it
> — it opens from disk with no server. That is the backup, not the primary.
>
> Found and correctly re-diagnosed by a parallel session; every claim above independently
> verified here.

**Landed:** design pass on `globals.css`, `AdversarialGraph.tsx`, `CoevolutionChart.tsx`,
`ShapPanel.tsx`, `next.config.ts`.

**Next, in order:**
0. ✅ ~~Rebuild~~ — done 00:58, real numbers now on the page.
1. **Open it in a browser.** Five minutes, needs no training run, and it is the only way to
   catch a React Flow graph that doesn't draw. This is the cheapest unclaimed work on the
   board.
2. **Deploy** — a human decision, since it publishes a public URL. Until it happens,
   requirement #3 has no address to give a judge.
3. Finish the DAG layout — band nodes by round so it reads as an *unrolled loop*, not one
   long ribbon. Keep `kind: "unroll"` edges visibly dashed. (Whether it draws at all is
   step 1's job to find out.)
4. Re-sync and rebuild each time P1/P2/P3 land a real artifact; confirm the banner clears
   file by file. Currently moot — the training pause means no new artifacts are coming.

✅ Done: banner verified against the real page; `npm run build` green; export confirmed
standalone (26 relative asset refs, 0 absolute) and serving over HTTP.

**Blocked by:** nothing for the UI. Note the training pause means the five fixture artifacts
will not become real on their own — the page is as complete as it can be until that changes.

### P5 — comms & compliance

**Landed:** `docs/2026-08-29-submission-requirements.md` — including the deadline correction,
which is the highest-value thing anyone has produced on this project so far.
Also `docs/2026-08-31-deck-outline.md`, `notebooks/submission.ipynb`, README pass.

✅ **The `.docx` walkthrough is drafted** — `docs/submission/solution-walkthrough.md` (18.8 KB)
with `scripts/build_docx.py` generating `solution-walkthrough.docx` (45 KB, verified a real
Word 2007+ file). Source stays Markdown so it is diffable rather than a binary someone
hand-edited — the right call.

Verified against the honesty rules: **6 `[[PENDING]]` markers** where numbers don't exist yet,
rendered in orange with the build script counting them each run, and **zero mentions of ASR**
anywhere in the document. Only figures traceable to a `placeholder: false` artifact appear
(1,852,394 rows at 0.521%; PR-AUC 0.829 / ROC-AUC 0.978 always carrying `n_train = 96,000`).

§3.4 reports the 100%-ASR-by-surrendering-88%-of-value bug **as a finding rather than hiding
it**. Keep it. It is the clearest possible statement of the project's own thesis — that an
adversarial metric means nothing apart from the constraints it was computed under — and it is
demonstrated on ourselves rather than asserted. A judge who finds that we found it first
trusts every other number in the document more.

⚠️ **§3 goes stale if the orchestrators land.** It describes the fixed loop accurately today;
if Red/Blue ships, that text becomes wrong. Whoever merges the orchestrator owes §3 a rewrite
in the same commit — a document that describes an architecture we replaced is worse than one
with a `[[PENDING]]` in it.

**Next, in order:**
1. **Submit the three artifacts as artifacts**, through Writeups: GitHub repo, the `.docx`,
   the working web prototype. Draft work is not judged — "written but not submitted" scores
   zero, so submit early and revise in place.
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

## Red/Blue orchestrators — landed, unwired

Owned by mastercard-7f. New package `src/adversarial_payments/orchestration/`, pushed as
`5b34ca5`. **93 tests pass**, up from 70.

**Strictly additive, and it must stay that way.** A Red play is a *restricted schema plus an
attack config*, so `attack/engine.py` needs no changes and no knowledge that strategies
exist; every capability the arena uses is injected rather than imported-and-called. If the
orchestrator does not land, the baseline loop still produces the headline number unchanged.
The moment this needs "one small change" inside `attack/` or `loop/`, the fallback is gone.

Six Red plays (`amount_probe`, `merchant_pivot`, `timing_shift`, `velocity_pacing`,
`combined_sweep`, `low_and_slow`) and four Blue (`adversarial_retrain`, `targeted_retrain`,
`threshold_tighten`, `retrain_and_tighten`).

**Three honesty guards, which are the point rather than the mechanics:**

1. **Saturation.** If the attacker wins essentially every attempt, neither side has a signal
   to adapt to, and a sequence of moves against a saturated target looks exactly like
   adaptation without being it. The arena detects that regime and refuses to support the
   claim. Demonstrated by two runs producing the **identical** sequence
   `amount_probe → merchant_pivot → timing_shift`, where only the non-saturated one is
   allowed to support an adaptivity claim.
2. **Provenance.** A move chosen by the deterministic fallback is labelled `fallback` even
   though it carries a written rationale. Presenting a rule's rationale as a model's
   reasoning would be the same species of dishonesty as writing a placeholder into a result
   file. Every run today reports *"No LLM reasoning occurred in this run"* — correctly.
3. A model returning a play that does not exist **falls back rather than being trusted**.

**Blocked on two things, neither of them code:**

- **The API key.** Without it the orchestrators reason by rule, not by model.
- **A non-saturated baseline.** ASR is 1.0 today. An exchange on top of a detector evaded
  every single time has nothing to adapt to — Red has no reason to pivot when its opening
  lever already works. b4 raised this and it is correct. The user has chosen to proceed in
  parallel anyway, with the saturation guard making the resulting transcript honest about
  its own limitation. The compelling version still needs a baseline where Red sometimes fails.

**Not yet wired to the real detector.** The injection points are defined; connecting them
means someone runs training.

---

## Gates

| When | Gate | Owner | State |
|---|---|---|---|
| Day 1 end | `schema.py` frozen against real Sparkov | P1 | ✅ done |
| Day 1 end | Deadline, deliverable format, rules confirmed | P5 | ✅ done — and it moved the deadline a day earlier |
| Day 2 end | A real ASR number exists | P2 | 🟡 exists (1.0, corrected measurement). Training pause **lifted** — rounds 1–2 now unblocked and running |
| Aug 31 | Baseline co-evolution curve ships **whether or not** Red/Blue lands | P2 | ⬜ open — the no-fallback deliverable |
| Aug 31 | A `.env` key exists (unblocks agentic **and** orchestrators) | any human | ⬜ **open — five minutes, highest leverage on the board** |
| Aug 31 | Requirement #3 deployed to a URL, from a fresh build | P4 | ⬜ **open — never deployed, no automation, local build is stale** |
| **Aug 31, midday** | Code freeze — everything after this is submission mechanics | all | ⬜ |
| **Aug 31, 23:59 IST** | **All three artifacts submitted, not drafted** | P5 | ⬜ **hard cutoff** |

The old "Day 3 midday code freeze" assumed a Sep 1 submission. With the real Aug 31 23:59
cutoff, Day 3 is submission day, not a build day — there is no evening and no buffer.
