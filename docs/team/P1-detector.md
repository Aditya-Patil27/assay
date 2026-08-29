# P1 — Detector & data

You own the blue team and the data everything else stands on. **Your Day-1 output is the
contract two other people are blocked on**, so ship the schema freeze before you polish
anything.

**You own:** `src/adversarial_payments/data/`, `src/adversarial_payments/detect/`,
`src/adversarial_payments/serving/`, `scripts/`
**Don't touch:** `attack/`, `loop/`, `agentic/`, `web/`

---

## The one thing that will ruin this project

**Leakage.** Every per-card aggregate you build (`amt_ratio_to_card_mean`,
`txn_count_1h`, `hours_since_last_txn`) must be computed from *past transactions only*. If
you use a whole-column `groupby().mean()`, each row sees its own future and your PR-AUC
comes out near 0.99 — a number that is fake, that P2's attack will trivially break, and
that a judge will ask about.

- Sort by time, then use `.shift()` / `.expanding()` / time-based `.rolling()` per `cc_num`.
- Sparkov already ships a temporal split: `fraudTrain.csv` and `fraudTest.csv`. Use it.
  **Never `train_test_split(shuffle=True)`** on this data.

If PR-AUC comes out above ~0.95, assume leakage before you assume success.

---

## Tasks, in order

### 1. `scripts/fetch_data.py` — get Sparkov

```python
import kagglehub
path = kagglehub.dataset_download("kartik2112/fraud-detection")
```

Copy `fraudTrain.csv` / `fraudTest.csv` into `data/raw/`. Skip the download if they already
exist. Print the row counts and the fraud rate (~0.5%) so anyone can sanity-check.

### 2. `data/load.py`

Load both CSVs, parse `trans_date_trans_time` and `dob` as datetimes, sort by time. Respect
`SETTINGS.sample_rows` from `config.py` so the rest of us can iterate on a subset.

### 3. `data/features.py` — produce EXACTLY the contracted columns

`schema.py` lists 20 features. Nothing more, nothing less — `validate()` rejects extras as
well as omissions.

**FROZEN** (victim attributes):

| Feature | From |
|---|---|
| `age` | `(trans_date_trans_time - dob).days / 365.25` |
| `gender_enc` | `(gender == "M").astype(int)` |
| `city_pop` | as-is |
| `home_lat`, `home_long` | `lat`, `long` |
| `state_enc` | ordinal encode `state` |
| `job_enc` | ordinal encode `job` |

**COUPLED** (all four move together when the attacker picks a merchant):

| Feature | From |
|---|---|
| `category_enc` | ordinal encode `category` |
| `merch_lat`, `merch_long` | as-is |
| `distance_km` | haversine(`lat`, `long`, `merch_lat`, `merch_long`) |

**MUTABLE** (attacker-controlled) — *all of these are the leakage risk*:

| Feature | From |
|---|---|
| `amt` | as-is |
| `log_amt` | `np.log1p(amt)` |
| `amt_ratio_to_card_mean` | `amt / expanding-mean of amt per cc_num, shifted by 1` |
| `hour` | `dt.hour` |
| `day_of_week` | `dt.dayofweek` |
| `is_night` | `hour.between(0, 5).astype(int)` |
| `hours_since_last_txn` | per-`cc_num` diff of `unix_time` / 3600 |
| `txn_count_1h` | causal time-window count per `cc_num` |
| `txn_count_24h` | causal time-window count per `cc_num` |

Save your ordinal encoders — P2 needs them to map `category_enc` back to a real merchant
category when it perturbs the coupled group.

Fill the unavoidable first-transaction NaNs (`hours_since_last_txn`,
`amt_ratio_to_card_mean`) with explicit sentinels. `validate()` rejects nulls.

### 4. FREEZE THE SCHEMA — this unblocks P2

```python
from adversarial_payments.schema import FeatureSchema
from adversarial_payments.config import ARTIFACTS

schema = FeatureSchema.fit(train_df)      # bounds from the training split only
schema.save(ARTIFACTS / "schema.json")
schema.validate(train_df, require_target=True)
```

Commit `artifacts/schema.json` and **tell P2 it's there**. After this point, changing the
feature list is a team decision, not a solo one.

### 5. `detect/train.py` — XGBoost

`scale_pos_weight` for the ~0.5% fraud rate, early stopping on a validation slice.
Signature should be reusable across rounds — P2 calls it repeatedly with augmented data:

```python
def train_detector(X, y, *, seed=SEED) -> xgboost.XGBClassifier
```

### 6. `detect/evaluate.py` — PR-AUC and the threshold

PR-AUC is the headline (ROC-AUC flatters imbalanced data — report both, lead with PR-AUC).
Pick the threshold that maximises F1, or hits a fixed precision target; whichever you
choose, write it into the artifact, because **P2's attack is defined relative to it**.

### 7. `detect/explain.py` — SHAP

`shap.TreeExplainer`, mean absolute SHAP per feature, top 5. On a sample of a few thousand
rows, not the full set.

### 8. Write your artifact

```python
from adversarial_payments import artifacts as A

A.write("detect_rounds", [A.DetectRound(...)], placeholder=False)
```

One `DetectRound` per adversarial round. Round 0 has `n_adversarial_added=0`. P2 fills in
rounds 1+ when it retrains; coordinate so you don't overwrite each other — simplest is that
P2 owns the write once the loop exists, and you own it until then.

### 9. `serving/latency.py` — the <50 ms claim

Export to ONNX, batch of 1, measure p50/p95/p99 over ~1000 calls. **Report what you measure,
not what the research report promised.** If it's 12 ms, say 12 ms.

---

## Done when

- [ ] `python scripts/fetch_data.py` works from nothing
- [ ] `features.py` output passes `schema.validate(df, require_target=True)`
- [ ] `artifacts/schema.json` committed and P2 notified
- [ ] PR-AUC is *plausible* (0.75–0.90). Above 0.95 means go hunt the leak.
- [ ] `artifacts/detect/rounds.json` has `placeholder: false`
- [ ] Dashboard banner has cleared for your section
- [ ] `pytest -q` green

## Test yourself

Add `tests/test_features.py` proving causality — build a tiny frame of 5 transactions for
one card and assert that row *i*'s `amt_ratio_to_card_mean` uses only rows `< i`. That test
is worth more than any other you could write.
