# P1 — Detector & data

> **⏰ Aug 31, 11:59 PM IST.** Your main job is done. Two things still need fixing.

---

# Part 1 — For you

## What you built, in plain terms

The defender. Given a card transaction, your model answers: is this fraud?

You also built the data everything else stands on — turning 1.85 million raw transactions
into the ~20 numeric columns the model learns from, and freezing that column list into a
written contract so P2's attacker knows exactly what it's allowed to touch.

## Where you are: mostly done, and the numbers are honest

| | |
|---|---|
| Real data loaded | ✅ 1,852,394 transactions, 0.52% fraud, 999 cards, 2019–2020 |
| Column contract frozen | ✅ `artifacts/feature_schema.json` — P2 is building against it |
| Detector trained | ✅ PR-AUC **0.829**, ROC-AUC 0.978 |

**PR-AUC 0.829 is a good result and, more importantly, a believable one.** The most common
way this project could have failed was *leakage* — the model accidentally seeing information
from the future, producing a spectacular score like 0.99 that means nothing. Anything above
0.95 on this data would have been a bug. 0.829 says your causal feature work held.

## Two things still wrong

### 1. The speed number isn't quotable yet

`artifacts/latency.json` says 6.6 ms at the 99th percentile — comfortably under the 50 ms
target. But it was measured **100 times against the XGBoost model directly**, and the spec
calls for **1,000 measurements against an exported ONNX model**. ONNX is the format you'd
actually deploy, so the current number describes something we're not claiming to ship.

It's probably fine. But "probably fine" is not what you say to a judge who asks how you
measured it. Re-run it properly, or the number stays off the slides.

### 2. Two of your result files bypass the safety net

Every result file in this project carries a flag saying whether it's real or a placeholder,
and the website shows a warning banner listing any that are fake. It's the mechanism that
makes it impossible to accidentally show a judge an invented number.

`latency.json` and `data_provenance.json` don't have that flag. They were written with plain
`json.dump` instead of going through `artifacts.py`. So the "under 50 ms" claim currently sits
*outside* the exact machinery we built to guarantee a number is real — and the website can't
display them at all.

Small fix, real consequence.

### 3. One caveat to carry everywhere

The detector was trained on **96,000 rows**, a subsample of the 1.85 million. That's a
perfectly reasonable choice. But PR-AUC 0.829 must always appear *with* that number attached,
or a reader will assume it's the full dataset. Tell P5 so the writeup says it too.

## What "done" looks like

- Latency re-measured on ONNX with 1,000 samples
- `latency.json` and `data_provenance.json` go through `artifacts.py` like everything else
- The subsample size travels with the PR-AUC figure everywhere it appears

## How to check your agent isn't fooling you

| If it says | Ask |
|---|---|
| "PR-AUC 0.97, great!" | *"That's too high for this data. Check for leakage — is any per-card average computed over the whole column instead of only past rows?"* |
| "Latency is 2 ms" | *"On which backend, and how many samples? Show me the raw distribution, not just p99."* |
| "Features are done" | *"Show me `schema.validate(df)` running clean on the real frame."* |
| "Tests pass" | *"Show me a test proving row N's card average uses only rows before N."* |

The leakage one is worth internalising. It is the single most common way a fraud-detection
project produces an impressive, worthless number.

---

# Part 2 — Paste this to your AI agent

```
You are working on the P1 detector-and-data track of an adversarial ML project.

CONTEXT
Read first:
  docs/team/BUILD.md
  src/adversarial_payments/schema.py     (the frozen feature contract)
  src/adversarial_payments/artifacts.py  (the result-file contract)
  src/adversarial_payments/data/, detect/, serving/   (EXISTING, working)

The main track is COMPLETE: real Sparkov data loaded (1,852,394 rows, 0.52% fraud),
features engineered causally, schema frozen to artifacts/feature_schema.json, XGBoost
trained to PR-AUC 0.829 / ROC-AUC 0.978 on n_train=96,000. Do not redo this work.

SCOPE -- you may edit ONLY:
  src/adversarial_payments/data/**
  src/adversarial_payments/detect/**
  src/adversarial_payments/serving/**
  scripts/**
  tests/ files covering the above
Do NOT touch attack/, loop/, agentic/, or web/.

TASK 1 -- Re-measure latency correctly
serving/latency.py currently reports p50 4.1ms / p99 6.6ms from 100 samples against the
XGBoost booster directly. The specification requires 1,000 samples against an exported
ONNX model, batch size 1, because ONNX is the deployment format we are claiming.
- Export the round-0 detector to ONNX
- Measure p50/p95/p99 over >=1000 single-transaction calls
- Report BOTH backends if they differ materially -- that difference is itself interesting
- Report what you measure. Do not round toward the 50ms target.

TASK 2 -- Bring two artifacts inside the contract
artifacts/latency.json and artifacts/data_provenance.json are written with plain
json.dump. They therefore lack the {kind, placeholder, schema_version, created_at,
git_sha} envelope, are absent from artifacts._PATHS, and cannot be read by
web/lib/load.ts. This puts the "<50ms" claim outside the placeholder machinery that
guarantees a number is real.

- Add `latency` and `data_provenance` entries to artifacts._PATHS
- Add matching dataclasses in artifacts.py
- Add the mirrored TypeScript interfaces to web/lib/types.ts  <-- REQUIRED, the contract
  test parses that file and will fail if you skip it
- Rewrite both via A.write(..., placeholder=False)
- Run pytest tests/test_artifacts.py and confirm green

TASK 3 -- Attach the subsample size to the headline figure
PR-AUC 0.829 was computed on n_train=96,000, a subsample of 1.85M. Ensure n_train is
present in the artifact and surfaced wherever the figure appears.

LEAKAGE -- the standing correctness bar
Every per-card aggregate (amt_ratio_to_card_mean, txn_count_1h, txn_count_24h,
hours_since_last_txn) must use ONLY past transactions: sort by time, then shift/expanding/
time-based rolling per cc_num. Never a whole-column groupby. Never train_test_split with
shuffle=True -- Sparkov ships a temporal split already.
If PR-AUC ever exceeds ~0.95, assume leakage before assuming success.

METHOD
Test-driven: write the test, watch it FAIL, then make it pass. For any numeric claim,
paste the real terminal output -- never a number you did not execute. If something does
not work, leave the artifact at placeholder=true and say so.

Run `pytest -q` after each task and report the real result.
```
