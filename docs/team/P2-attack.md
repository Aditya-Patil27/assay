# P2 — Attack engine

You own the red team, and the number the whole submission is built on: **Attack Success Rate
before and after adversarial retraining.** Everything else is context for your chart.

**You own:** `src/adversarial_payments/attack/`, `src/adversarial_payments/loop/`
**Don't touch:** `data/`, `detect/`, `agentic/`, `web/`

---

## Start now — don't wait for P1

You need a trained model and a schema. Until P1 lands them, make your own:

```python
import numpy as np, pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from adversarial_payments.schema import FEATURES, FeatureSchema

rng = np.random.default_rng(0)
df = pd.DataFrame({c: rng.normal(size=5000) for c in FEATURES})
y = (df["amt"] + df["distance_km"] * 0.5 + rng.normal(scale=0.3, size=5000) > 1).astype(int)
schema, model = FeatureSchema.fit(df), GradientBoostingClassifier().fit(df[list(FEATURES)], y)
```

Your engine should never care where the model came from — it needs `predict_proba` and
nothing else. When P1 commits `artifacts/schema.json` and a real model, you swap two lines.

---

## Tasks, in order

### 1. `attack/constraints.py` — the three projections

This module is the intellectual core of the submission. It is what makes our ASR mean
something, versus the standard adversarial-ML result that ignores whether the perturbed
record could exist.

```python
def project(x: pd.Series, x0: pd.Series, schema: FeatureSchema) -> pd.Series
```

**Immutability.** Every feature in `schema.frozen` is restored to its value in `x0`. Not
clipped — restored. The attacker cannot touch these at all.

**Feasibility.** Every feature clipped to `schema.bounds[feature]`. Additionally: integer
features stay integral (`hour`, `day_of_week`, `txn_count_*`, `is_night`), `is_night` must
stay consistent with `hour`, and `log_amt` must stay `log1p(amt)` — a perturbation that
breaks that identity is detectable by inspection and would embarrass us.

**Coupling.** This is the one the strategy doc only gestures at. `schema.coupled_groups`
declares that `category_enc`, `merch_lat`, `merch_long` and `distance_km` move *together*.
Implement it as a **discrete choice, not a continuous perturbation**: build a lookup of real
(category, merchant lat/long) combinations that appear in the data, and let the attacker
*swap to a different real merchant*, recomputing `distance_km` from the victim's unchanged
home coordinates. An attacker picks a merchant; they don't invent one at arbitrary
coordinates.

Write `tests/test_constraints.py` first. Property: for any random perturbation,
`project(x, x0, schema)` never changes a frozen feature, never leaves bounds, and never
breaks the `log_amt`/`amt` identity. This is exactly the kind of code where a subtle bug
produces a great-looking, wrong ASR.

### 2. `attack/engine.py` — greedy coordinate descent

Tree ensembles have no gradients, so no FGSM/PGD. Greedy coordinate descent instead — it
also gives L0 sparsity for free, which *is* the sparsity projection rather than a bolt-on.

```
for restart in range(n_restarts):
    x = x0.copy(); touched = set()
    while model.predict_proba(x)[1] > threshold and len(touched) < budget:
        best = None
        for f in schema.attackable():                 # frozen never enters this loop
            for candidate in candidates(f, x, schema):  # line search / real merchants
                trial = project(x.with_(f, candidate), x0, schema)
                p = model.predict_proba(trial)[1]
                if p < best_p: best = (f, trial, p)
        if best is None: break                        # no single move helps -> stuck
        x, touched = best.trial, touched | {best.f}
    if evaded(x): keep the x with the smallest len(touched)
```

Only attack transactions the detector **correctly flags as fraud** — evading on a record the
model already scores as legitimate is not an evasion. State that in the notebook; it's the
first thing a sharp judge checks.

Count and report queries per successful attack. It's a black-box realism argument: an
attacker who needs 300 queries against a live API gets rate-limited.

### 3. `attack/metrics.py`

`ASR = successful evasions / attempted evasions`, plus mean L0, mean L2 (over the mutable
subspace only — L2 across a categorical encoding is meaningless), median queries, and
per-feature attack frequency.

### 4. `loop/state.py` — the run state and the graph

A plain dict every task writes into, serialised to `artifacts/graph.json` via
`A.GraphNode` / `A.GraphEdge`. The frontend draws it directly.

`scripts/seed_artifacts.py:build_graph()` already produces the exact shape and layering —
read it, then make the real one match. Keep `kind="unroll"` on the retrain edges: those are
the feedback edges, drawn dashed, because calling a feedback loop a DAG is the mistake
strategy §5.1 explicitly warns against.

### 5. `loop/flows.py` — the unrolled loop

```
r=0: train -> score -> attack -> ASR_0 -> augment
r=1: train -> score -> attack -> ASR_1 -> augment
r=2: train -> score -> attack -> ASR_2
```

Augmentation: add successful adversarial examples to the training set **labelled fraud**
(they are fraud — that's the point), retrain, re-attack with a *fresh* attack budget.

Two execution paths, same tasks:

```python
if SETTINGS.run_orchestrated:   # Prefect @flow/@task
    ...
else:                           # plain Python loop -- the notebook default
    ...
```

The fallback is not optional and it is not decorative. **Prefect 3 boots an ephemeral local
HTTP server and costs ~29 s** (verified — `scripts/check_prefect_offline.py`), which is a
real risk on a locked-down judging machine. Test both paths give identical numbers.

### 6. Write your artifacts

`attack_rounds`, `attack_examples`, `graph`, and the tabular row of `scorecard`.
Pick 2–4 genuinely interesting worked examples — ideally one where the attacker succeeded by
swapping merchant rather than just lowering the amount.

---

## What "success" looks like

ASR should **fall a lot** across rounds while P1's PR-AUC **barely moves**. If PR-AUC craters
too, we bought robustness by breaking the detector, and the honest thing is to report that.

If ASR at round 0 is near 100%, your constraints are too loose — check that frozen features
really are frozen. If it's near 0%, your budget or bounds are too tight.

## Done when

- [ ] `tests/test_constraints.py` proves all three projections hold under random input
- [ ] Both `RUN_ORCHESTRATED=1` and `=0` produce identical ASR
- [ ] `artifacts/attack/rounds.json`, `examples.json`, `graph.json` at `placeholder: false`
- [ ] Tabular row written to `artifacts/scorecard.json`
- [ ] Co-evolution chart on the dashboard shows the real curve
