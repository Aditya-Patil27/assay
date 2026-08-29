# P2 — Attack engine

> **⏰ Aug 31, 11:59 PM IST.** You own the single most important number in the submission.

---

# Part 1 — For you

## What you're building, in plain terms

P1 built a fraud detector. You're building the criminal who tries to slip past it.

But not a *cartoon* criminal. The interesting question isn't "can you fool the model if you're
allowed to change anything?" — of course you can, just claim the transaction was £2 from the
victim's home town. The interesting question is: **can you fool it while only changing things
a real fraudster could actually control?**

A fraudster with stolen card details:

- **Cannot** change the victim's age, their home city, or where they live. Those come with the
  stolen identity.
- **Can** choose which shop to hit — but that's one decision that changes several things at
  once: the shop's category, its GPS location, and the distance from the victim's home. They
  move together or not at all.
- **Can** freely choose the amount, the time of day, and how fast to make repeat purchases.

Your engine searches for the smallest change, within those rules, that flips the detector from
"fraud" to "fine". Then you count how often that works. **That count is the ASR.**

Then the loop: the detector retrains on your successful attacks and you attack the new one.
Three rounds. The ASR should fall each round. That falling line is the whole thesis.

## Why it matters more than anything else here

Every other part of this project has a fallback. If the website is ugly we still have numbers.
If the AI-agent track fails we still have one attack surface. **If there is no real ASR
number, there is no submission** — just a fraud detector, which is a solved problem nobody is
impressed by.

Everything else is context for your chart.

## What's already done

A lot. Do not start from scratch — read the existing code first.

- `attack/constraints.py`, `attack/engine.py`, `attack/metrics.py` — written and passing tests
- `loop/state.py`, `loop/flows.py` — the round-by-round loop, with a working CLI
- Tests in `tests/test_attack.py` and `tests/test_loop.py`

**A serious bug was already found and fixed here today**, and it's worth understanding because
it's exactly the kind of thing you're guarding against. The engine reported ASR = 1.0 — a
perfect 100% success rate. It looked like a triumph. It was achieved by shrinking transactions
to about 12% of their value. The attacker "won" every time while giving up 88% of the money,
which is not evasion, it's surrender. Shipping that number would have collapsed under the
first judge question.

The fix added a floor on how much value the attacker must retain (now 74.5%), stopped
crediting the attacker for moving columns that are just arithmetic on the amount, and fixed a
ranking bug that made it always reach for the amount lever. The ASR is still 1.0 afterwards —
but now it's an honest 1.0, meaning *it evades every time while keeping three quarters of the
money*. That's a legitimate "before" number.

## What's left

1. Run the loop against P1's **real** round-0 detector instead of the stub model
2. Produce rounds 1 and 2 — **these have never been run on real data**
3. Confirm the ASR actually falls across rounds while PR-AUC holds
4. Write the real result files and the tabular row of the scorecard

Step 3 is the moment of truth for the entire project.

## What "done" looks like

- `artifacts/attack/rounds.json` says `placeholder: false`
- The website's amber banner no longer lists your files
- The co-evolution chart shows a real falling line
- Running it with and without `--orchestrated` gives **identical** numbers

## How to check your agent isn't fooling you

| If it says | Ask |
|---|---|
| "ASR is 100%" | *"What did the attacker sacrifice? Show me value retained, and the actual feature changes."* |
| "ASR dropped to 5%" | *"Did PR-AUC hold? If the detector also got worse, we broke it rather than hardening it."* |
| "The attack works" | *"Which features did it touch, and how often? If it's 95% one feature, the constraints are too loose."* |
| "Tests pass" | *"Show me a constraint test failing when I deliberately let a frozen feature move."* |

**Red flags:** an attack that only ever changes the amount. A frozen feature appearing in the
changed list. ASR that doesn't move at all across rounds.

## If you get stuck

You don't need the real data to make progress — there's a synthetic fallback that lets the
whole loop run. Say: *"Run the loop on synthetic data first so I can see the shape of the
result, then swap in the real model."*

---

# Part 2 — Paste this to your AI agent

```
You are working on the P2 attack-engine track of an adversarial ML project.

CONTEXT
Read first, in this order:
  docs/team/BUILD.md                  (how to run things)
  src/adversarial_payments/schema.py  (the feature contract)
  src/adversarial_payments/attack/    (constraints.py, engine.py, metrics.py -- EXISTING, working)
  src/adversarial_payments/loop/      (state.py, flows.py -- EXISTING, working)
  tests/test_attack.py, tests/test_loop.py

Substantial working code already exists and passes its tests. READ IT BEFORE WRITING
ANYTHING. Do not rewrite these modules; extend them.

SCOPE -- you may edit ONLY:
  src/adversarial_payments/attack/**
  src/adversarial_payments/loop/**
  tests/test_attack.py, tests/test_loop.py
Do NOT touch data/, detect/, agentic/, web/, or docs/.

OBJECTIVE
Produce the project's headline result: a real Attack Success Rate across 3 adversarial
rounds, computed against P1's real trained detector (not the stub model), showing ASR
falling across rounds while the detector's PR-AUC holds.

THE THREE CONSTRAINT PROJECTIONS (already implemented -- preserve their semantics)
1. Immutability: features in schema.FROZEN are restored to their original values, never
   clipped. The attacker inherits the victim's identity and cannot forge it.
2. Feasibility: values stay within schema.bounds. Integer features stay integral.
   is_night stays consistent with hour. log_amt must remain log1p(amt). A value floor
   (ConstraintProjector.value_floor, default 0.5) requires the attacker to retain a
   realistic fraction of transaction value.
3. Coupling: schema.coupled_groups declares that category_enc, merch_lat, merch_long and
   distance_km move TOGETHER, as a discrete swap to a real merchant that exists in the
   data -- never as independent continuous perturbation. distance_km is recomputed from
   the victim's unchanged home coordinates.

ALGORITHM
Greedy coordinate descent with random restarts. Tree ensembles have no gradients, so no
FGSM/PGD. Coordinate descent yields L0 sparsity natively. Rank restarts by number of
attacker DECISIONS, not number of changed columns -- a merchant swap is 1 decision across
4 columns, and ranking by columns structurally biases the search toward the amount lever.

Only attack transactions the detector correctly flags as fraud. Evading on a record already
scored legitimate is not an evasion. Count model queries per successful attack.

TASKS, IN ORDER
1. Run the existing test suite. Report the actual output.
2. Load P1's real artifacts: artifacts/feature_schema.json and the round-0 detector.
   Confirm the schema validates against the real feature frame.
3. Run round 0 against the real model. Report ASR, mean L0, median queries, mean value
   retained, and the per-feature attack frequency distribution.
4. Implement/verify augmentation: successful adversarial examples are added to the
   training set labelled as fraud, the detector retrains, and round r+1 attacks the new
   model with a fresh attack budget.
5. Run rounds 1 and 2. These have never been run on real data.
6. Verify RUN_ORCHESTRATED=1 (Prefect) and =0 (plain loop) produce IDENTICAL numbers.
7. Write artifacts via `from adversarial_payments import artifacts as A`:
   A.write("attack_rounds", ..., placeholder=False)
   A.write("attack_examples", ..., placeholder=False)   # 2-4 examples; include at least
                                                        # one won by merchant swap, not amount
   A.write("graph", ..., placeholder=False)             # match seed_artifacts.build_graph()
                                                        # shape; keep kind="unroll" on
                                                        # retrain edges
   Plus the tabular row of A.write("scorecard", ...).

CORRECTNESS BARS -- these are not optional
- If ASR at round 0 is ~100%, report what the attacker SACRIFICED (value retained,
  features touched). A previous version of this engine scored 1.0 by shrinking
  transactions to 12% of value -- that is surrender, not evasion. Do not reintroduce it.
- If PR-AUC collapses alongside ASR, say so plainly. That means we broke the detector
  rather than hardening it, and it is a finding, not a failure to hide.
- If the attack only ever touches `amt`, the constraints are too loose. Investigate.
- A frozen feature must NEVER appear in a changed-feature list. Assert this.

METHOD
Test-driven. Write the test, watch it FAIL, then make it pass. For any numeric claim, paste
the real terminal output -- never a number you did not execute. If something does not work,
leave the artifact at placeholder=true and say so; the dashboard banners it honestly. Never
replace a fixture with an invented value.

Run `pytest -q` after each task and report the real result.
```
