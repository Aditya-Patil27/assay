# An Adversarial Framework for Payment Security

## Red-teaming fraud detection and agentic payment systems

**Mastercard Innovation Challenge 2026 — Solution Walkthrough**

---

> **Editorial status.** Every figure in this document traces to a result file in
> `artifacts/` produced by code in this repository. Figures not yet computed are marked
> `[[PENDING]]` rather than estimated. Nothing here is an aspiration written in the present
> tense.

---

## 1. Executive summary

Fraud detection models are evaluated against fraud that has already happened. They are
trained on labelled historical transactions, scored against held-out historical
transactions, and deployed against an adversary who reads the same research we do.

Nobody scores them against an attacker who adapts.

We built that attacker, and then we built the loop that trains against it. Our system
attacks a payment fraud detector under realistic constraints, measures how often the attack
succeeds, retrains the detector on those successful attacks, and attacks again. The result
is a curve: attack success falling round over round while detection quality holds.

We then applied the same method to a structurally different target — an AI payment assistant
with the ability to move money — to demonstrate that this is a reusable evaluation method
rather than a single experiment.

**What is genuinely novel here is not that we attack a classifier.** Adversarial machine
learning is a mature field. It is that our attacker is constrained to the things a real
fraudster can actually control, which turns out to be a much harder and much more
informative problem than the unconstrained version.

---

## 2. The threat landscape we are responding to

Generative AI has not invented new categories of payment fraud. It has collapsed the cost of
executing the existing ones at scale, and that is a different and more serious problem.

We mapped the attack surface across five vectors before deciding what to build.

### 2.1 Synthetic identity synthesis

Fraudsters fuse real personally identifiable information with fabricated attributes to
produce a persona that passes Know Your Customer checks while corresponding to no real
person. Reported cases have surged roughly 60%, and synthetic identities now account for
close to 29% of identity fraud. Because no genuine victim exists, nobody reports the fraud,
and detection depends entirely on the institution noticing.

### 2.2 Deepfake-enabled impersonation

Voice cloning from seconds of source audio defeats voice-biometric authentication and
enables real-time social engineering against call-centre staff. The attack targets the human
verification layer that institutions added specifically to catch automation.

### 2.3 Localised social engineering at scale

Real-time payment rails create fraud shapes that batch systems never had. India's UPI
collect-request feature, where a payee requests money from a payer, is routinely inverted:
the attacker sends a debit request disguised as an incoming refund, cashback or prize.
"Digital arrest" scams — a fabricated law-enforcement pretext sustained over hours — are the
same technique with a longer con. Generative models make both fluent, personalised and
cheap in the victim's own language.

### 2.4 Agentic prompt injection

AI assistants are being given payment tools: check a balance, initiate a transfer, update a
payee. Those assistants consume text from places an attacker controls — a transaction memo,
a merchant display name, chargeback dispute evidence. An instruction hidden in that text can
cause the agent to act against its principal. This is an attack surface that did not exist
in payments two years ago.

### 2.5 Adversarial evasion of detection models

The vector we chose to build against. An attacker with query access to a scoring system can
search for the minimal modification to a transaction that flips it from *decline* to
*approve*. Unlike the four above, this attack targets the defence itself.

**We built against 2.4 and 2.5.** The other three are mapped, not implemented, and section 8
says so explicitly.

---

## 3. What we built

### 3.1 The architecture

A closed adversarial loop, unrolled over rounds:

```
  Data → Features → [SCHEMA CONTRACT]
                          │
                          ▼
        ┌──────→ Train detector (r) ──→ PR-AUC, threshold
        │                │
        │                ▼
        │      Generate constrained attacks ──→ Attack Success Rate (r)
        │                │
        │                ▼
        └────── Augment training set ────┘   [unroll: round r → r+1]
```

A note on precision: this is a **feedback cycle**, not a directed acyclic graph. It becomes
acyclic only when unrolled over rounds, where round *r*'s retrained detector is a distinct
node feeding round *r+1*'s attacker. We describe it that way throughout, and the interactive
diagram in the web prototype draws those unroll edges distinctly for the same reason.

### 3.2 Generating attacks that could actually happen

This is the core of the work.

The naive way to attack a fraud detector is to perturb feature values until the score drops.
That produces an impressive success rate and a meaningless one, because most of those
perturbed records describe transactions that could never occur — a cardholder who changed
age, a terminal that moved continents, an amount inconsistent with its own logarithm.

We constrain every perturbation through three projections.

**Immutability.** A fraudster using stolen credentials inherits the victim's identity and
cannot alter it. The victim's age, gender, home coordinates, city population and occupation
are restored to their original values after every candidate modification — not clipped,
restored. They are outside the attacker's reach entirely.

**Feasibility.** Values stay within the range the payment network would plausibly observe,
derived from inner quantiles of the training distribution so that a single outlier cannot
hand the attacker an enormous legal range. Integer-valued features stay integral. Derived
features stay consistent with their sources: a perturbation that leaves `log_amt` disagreeing
with `amt` is detectable by inspection and would not survive scrutiny.

**Coupling.** This constraint is the one most adversarial work omits, and on real payment
data it is decisive. An attacker who switches to a different merchant changes the merchant
category, the terminal's latitude and longitude, and the cardholder-to-terminal distance
*simultaneously*. These four features are not independently perturbable — they are the
downstream consequences of one attacker decision. We model merchant choice as a discrete
swap between merchants that actually appear in the data, recomputing distance from the
victim's unchanged home coordinates.

Without coupling, an attack success rate is computed over transactions that cannot
physically exist. We considered that disqualifying.

**Sparsity.** Among successful attacks we prefer the one touching fewest features, which is
also the one hardest for a monitoring system to notice.

### 3.3 The search

The detector is a gradient-boosted tree ensemble, so gradient-based attacks (FGSM, PGD) do
not apply — there is no gradient to follow. We use greedy coordinate descent with random
restarts: repeatedly identify the single permitted change that most reduces the fraud score,
apply it under the projections, and stop when the transaction crosses the decision threshold.

Coordinate descent yields L0 sparsity natively rather than as a post-hoc filter, which is why
we chose it over a decision-boundary attack.

Two design decisions worth stating because they materially affect the number:

- **We only attack transactions the detector correctly flags as fraud.** Evading on a record
  already scored legitimate is not an evasion, and including such records would inflate the
  success rate.
- **Restarts are ranked by attacker *decisions*, not by changed columns.** A merchant switch
  is one decision that moves four columns; an amount change is one decision that moves three.
  Ranking by column count structurally biases the search toward the amount lever and hides
  the attacker's real options.

### 3.4 An error worth reporting

An earlier version of our engine reported a 100% attack success rate. It achieved this by
shrinking transactions to roughly 12% of their original value.

That is not evasion. An attacker who surrenders 88% of the take to avoid detection has not
defeated the system; they have been priced out of it. The number was arithmetically correct
and substantively worthless.

We added an economic floor to the feasibility projection requiring the attacker to retain a
realistic fraction of transaction value. Attacker value retained moved from 11.4% to 74.5%.
The attack profile changed shape as well — where the flawed version reached for the amount
lever in 57 of 60 successful attacks, the corrected version distributes across amount,
timing, and merchant choice.

We report this because it illustrates the central methodological point of the entire project:
**an adversarial metric is only as meaningful as the constraints it is computed under.** An
unconstrained attack success rate is not a hard number that happens to be high. It is not a
number at all.

---

## 4. The detection model and its results

### 4.1 Data

The Sparkov credit-card transaction corpus, obtained from Kaggle.

| | |
|---|---|
| Transactions | **1,852,394** |
| Fraudulent | 9,651 (**0.521%**) |
| Distinct cards | 999 |
| Period | 2019-01-01 to 2020-12-31 |

We chose this corpus specifically because its columns make the constraint model expressible.
The widely used ULB `creditcard.csv` benchmark is PCA-anonymised to unnamed components,
which contains no merchant category, no geography and no device — the immutability projection
is not merely difficult there, it is undefined. Building our central claim on a dataset that
cannot express it would have made the claim a fiction.

### 4.2 Avoiding the failure mode that invalidates this class of result

Fraud features are dominated by per-card aggregates: this transaction's amount relative to
the card's historical average, transaction counts in the preceding hour and day, time since
the card's last transaction. Each is trivially computed in a way that lets a row observe its
own future, producing a model that scores superbly and generalises not at all.

Every aggregate in our pipeline is computed causally — sorted by time, using only prior
transactions for that card. The train/test split is temporal, never randomised.

**We treat a suspiciously high score as a bug report, not a success.** On this data, anything
above roughly 0.95 PR-AUC indicates leakage.

### 4.3 Results

Round 0 detector, gradient-boosted trees, trained on `n_train = 96,000` (a subsample of the
full corpus):

| Metric | Value |
|---|---|
| **PR-AUC** | **0.829** |
| ROC-AUC | 0.978 |
| Precision | 0.718 |
| Recall | 0.797 |
| Decision threshold | 0.233 |

PR-AUC is the headline rather than ROC-AUC deliberately. At a 0.521% positive rate, ROC-AUC
flatters heavily — 0.978 sounds close to perfect and mostly reflects the ease of ranking the
overwhelming negative majority. Precision-recall is the honest view of a needle-in-haystack
problem, and 0.829 is a credible number rather than a suspicious one.

Top features by mean absolute SHAP: transaction amount, merchant category, log amount,
amount relative to the card's running mean, and hour of day.

### 4.4 Adversarial results

`[[PENDING — Attack Success Rate across rounds 0–2]]`

The corrected attack engine and the unrolled loop are implemented and tested. The full
adversarial run across three rounds against the round-0 detector has not been executed at
time of writing, so no attack success rate appears in this document. When it is produced it
will be accompanied by attacker value retained, mean L0, and median model queries per
success — the constraint economics alongside the headline number, for the reasons in
section 3.4.

### 4.5 The second attack surface

`[[PENDING — exploit rate before and after defences]]`

The agentic red team is implemented: a mock payment assistant with `check_balance`,
`initiate_transfer` and `update_payee` tools, an injection corpus spanning transaction memos,
merchant display names, chargeback dispute text and tool-scope overreach, and a defence layer
combining an injection classifier, tool scoping and a human-in-the-loop threshold.

Exploit success is judged from the agent's **audit log** — whether a dangerous tool actually
fired with attacker-chosen arguments — never from the agent's prose. An assistant that says
it will transfer funds and does not has failed to be exploited.

Results are not reported here because the harness has so far been exercised against a scripted
stand-in rather than a live model. Rates measured against our own script describe our
assumptions, not model behaviour, and we decline to present them as findings.

---

## 5. Reproducibility

An evaluation nobody can re-run is an assertion.

- **Results are committed.** Every stage writes a versioned JSON artifact. The web prototype
  and the notebook read those artifacts; they never train. A reviewer sees results without
  reproducing them, and can reproduce them by choice rather than by necessity.
- **Provenance is machine-checked.** Every artifact carries a flag recording whether it is a
  real result or a placeholder fixture. The web prototype renders a prominent banner naming
  any file still carrying placeholder data. It is not possible for a seeded number to reach a
  reader silently. At the time of writing that banner is active and correctly names five
  files.
- **Orchestration is optional.** The pipeline runs under Prefect or as a plain Python loop,
  producing identical numbers. We verified that Prefect 3 starts an ephemeral local HTTP
  server rather than running purely in-process, so the plain loop is the default — a
  reviewer in a restricted environment is not blocked by our tooling choice.
- **The agentic track replays offline.** Model responses are cached, so the red team runs
  with no API key and no network access.
- **The feature contract is enforced in code.** The column list is an importable object with
  a validator that raises. A change to the detector's features fails the attack engine
  immediately rather than silently producing a meaningless success rate.

---

## 6. Real-world feasibility

**Where this fits.** The framework is a pre-deployment evaluation harness, not an inline
production component. It answers a question institutions currently cannot answer: *how much
would it cost an adaptive attacker to evade the model we are about to ship, and what does
hardening against them cost us in detection quality?*

**Inference cost is not the obstacle.** Scoring is a single gradient-boosted tree evaluation,
comfortably within real-time authorisation budgets. `[[PENDING — latency figures. A
measurement exists but was taken against the training-time backend at a tenth of the
specified sample count, so we do not quote it.]]`

**Attack generation is offline and does not need to be fast.** It runs in evaluation, not in
the authorisation path.

**The economics are the interesting result for a payment network.** The constrained attack
reports what evasion *costs* an attacker — value surrendered, features manipulated, model
queries required. Query count is a deployable control: an attacker requiring hundreds of
probes against a live endpoint is exposed to rate limiting. This reframes model robustness
from a binary property into an attacker cost curve, which is the form a risk team can act on.

**Adoption is incremental.** The three projections are configuration, not architecture. An
institution encodes which fields its own attackers control and runs the loop against its own
model. Nothing here requires replacing a detection stack.

---

## 7. Limitations

Stated plainly, because a reviewer will find them anyway and an evaluation that hides its
boundaries should not be trusted.

- **The data is synthetic.** Sparkov is generated, not real transaction data. Fraud patterns
  are simpler and cleaner than production traffic.
- **The detector is trained on a 96,000-row subsample**, not the full 1.85 million. PR-AUC
  0.829 should be read with that qualifier attached.
- **The constraint model is a judgement call.** Which fields an attacker controls is our
  assessment, informed by how card-not-present fraud works, not a measurement. Different
  assumptions produce different success rates. We have made the assumptions explicit and
  configurable rather than burying them.
- **The payment agent is a mock**, with simulated tools and a simulated ledger. It is a
  faithful model of the attack surface, not an integration with a real payment system.
- **Three of the five mapped threat vectors are not implemented** — synthetic identity,
  deepfake voice, and localised social engineering. They are section 2, not section 3.
- **Two results were incomplete at the time of writing**, marked `[[PENDING]]` above rather
  than estimated.

---

## 8. Roadmap

Deliberately not built, and named here so that nothing in this document is mistaken for a
claim about what exists.

| Extension | Why it was excluded |
|---|---|
| Audio anti-spoofing for deepfake voice | Requires a multi-gigabyte corpus and separate model training |
| Temporal graph networks for money-laundering topologies | A full second pipeline; the tabular surface demonstrates the method |
| Streaming deployment (Kafka → Flink → Redis) | Infrastructure, not evidence; the latency question is answerable without it |
| Federated learning with differential privacy | The cross-institution story, unbuildable with one public dataset |
| Synthetic identity and deepfake attack generation | Threat vectors 2.1–2.3, mapped but not implemented |

Each is a real extension of this architecture. None of them is in this repository, and we
would rather be believed about the two surfaces we built than admired for five we described.

---

## 9. Repository

| | |
|---|---|
| Code | `https://github.com/Aditya-Patil27/mastercard-adversarial-payments` |
| Web prototype | `[[PENDING — deployment URL]]` |
| Attack constraints | `src/adversarial_payments/attack/constraints.py` |
| Attack search | `src/adversarial_payments/attack/engine.py` |
| Feature contract | `src/adversarial_payments/schema.py` |
| Unrolled loop | `src/adversarial_payments/loop/flows.py` |
| Agentic red team | `src/adversarial_payments/agentic/` |
| Results | `artifacts/` |

Setup and run instructions are in `docs/team/BUILD.md`.
