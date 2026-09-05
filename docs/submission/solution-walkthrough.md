# Assay

## Red-teaming fraud detection and agentic payment systems

**Solution Walkthrough — Razorpay AI Buildathon 2026, Open Track** (prepared for the Mastercard Innovation Challenge 2026; numbers unchanged)

---

> **On the name.** An assay is the test that determines the true metal content of a
> coin — historically, the check that money is what it claims to be. That is what this
> framework does to a security number. It is also literally what §4.4's feasibility
> audit does: two attackers report the same 100% success rate, and 99.9% of one's
> evasions turn out to be base metal.

> **Editorial status.** Every figure in this document traces to a result file in
> `artifacts/` produced by code in this repository. Figures not yet computed are marked
> with an orange PENDING marker rather than estimated. **As of this revision there are
> none left:** every figure below is computed. Nothing here is an aspiration written in the
> present tense.

---

## 1. Executive summary

Fraud detection models are evaluated against fraud that has already happened. They are
trained on labelled historical transactions, scored against held-out historical
transactions, and deployed against an adversary who reads the same research we do.

Nobody scores them against an attacker who adapts.

We built that attacker, and then we built the loop that trains against it. Our system
attacks a payment fraud detector under realistic constraints, measures how often the attack
succeeds, retrains the detector on those successful attacks, and attacks again.

**The result is not the curve we expected, and reporting it accurately is the point of the
submission.** Attack success does not fall. It is 100% at every round — and it stays at 100%
when we raise the adversarial training dosage five-thousand-fold, and when we tighten the
decision threshold to the point of declining one legitimate transaction in ten. Both defences
available at the model layer are measured, priced, and shown not to work against an attacker
that re-searches after every change.

That is a more useful finding than a falling curve, because it is actionable: it says where
model-layer defence runs out, and what you would have paid to discover that in production
instead. We then applied the same method to a structurally different target — an AI payment
assistant with the ability to move money — where the defence is *layered* rather than
model-internal, and there the reduction is statistically significant. The contrast between
the two surfaces is the result we would most want carried away.

**What is genuinely novel here is not that we attack a classifier.** Adversarial machine
learning is a mature field. It is that our attacker is constrained to the things a real
fraudster can actually control, which turns out to be a much harder and much more
informative problem than the unconstrained version.

---

## 2. The threat landscape we are responding to

Generative AI has not invented new categories of payment fraud. It has collapsed the cost of
executing the existing ones at scale, and that is a different and more serious problem.

We mapped the attack surface across five vectors in depth before deciding what to build,
and catalogued a further eight that GenAI changes materially but that we did not
implement. Section 2.6 lists those, because a threat map that contains only the things
we happened to build is not a threat map.

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

### 2.6 The wider catalogue, by surface

The five above are the vectors we analysed in depth. Restricting a threat map to them would
misrepresent the surface, so the following are catalogued with what GenAI actually changes
about each. They are grouped by the surface they attack, because "payments" is not one
channel: a vector that works against a card rail often has no analogue on a real-time
account-to-account rail, and a control that stops one is frequently irrelevant to the other.

None of these is implemented, and none is claimed to be.

#### Card rails — card-not-present

| Vector | How the rail is abused | What GenAI changes |
|---|---|---|
| **Card testing / BIN attacks** | Automated low-value authorisations probe stolen card ranges for live numbers before resale | Agents adapt probe amount, merchant and pacing in response to declines, turning a fixed script into a feedback loop |
| **Triangulation fraud** | A fake storefront takes real orders, fulfils them with stolen cards, and harvests the card data | Storefront copy, product listings and reviews are now generated end to end, so the shopfront is no longer the weak link |
| **First-party / friendly fraud** | The legitimate cardholder disputes a genuine transaction | LLM-drafted dispute narratives are internally consistent and match issuer templates, defeating text heuristics |
| **Refund and returns abuse** | Refunds are claimed for goods never returned, or returns are made with substituted items | Generated photographic "evidence" and consistent narratives across multiple claims raise the cost of manual review past what it is worth |
| **Adversarial evasion of detection models** | *Section 2.5 — the vector we built against* | |

#### Card rails — card-present

| Vector | How the rail is abused | What GenAI changes |
|---|---|---|
| **Shimming and EMV relay** | A thin shim inside the reader captures chip-transaction data; relay attacks extend a contactless card's range to a terminal elsewhere | Less about generation than logistics — but agents coordinate mule timing across terminals, which is the part that used to need a person |
| **ATM cash-out and jackpotting** | Withdrawal limits are lifted on compromised accounts and drained simultaneously across many ATMs | Coordination of a timed multi-city cash-out is a scheduling problem that agents do cheaply |
| **Wallet provisioning fraud** | A stolen card is added to a mobile wallet, converting a card-not-present theft into a card-present token | Voice synthesis defeats the call-centre step of "yellow path" provisioning, which is precisely the human check that exists to stop this |

#### Real-time account-to-account rails

Relevant to this challenge's setting: India's UPI settles irrevocably in seconds, so a
successful attack is unrecoverable in a way a card chargeback is not.

| Vector | How the rail is abused | What GenAI changes |
|---|---|---|
| **Authorised push payment (APP) fraud** | The victim is persuaded to send the payment themselves, so every control that checks authenticity passes | Conversational agents sustain a plausible pretext across hours and channels at negligible marginal cost |
| **Collect-request abuse** | A "collect" request is presented as an incoming payment; approving it debits the victim | Localised, contextually plausible request text at scale — the attack has always been a language problem, not a technical one |
| **QR tampering** | A sticker over a merchant's static QR redirects funds to the attacker | Generated merchant branding makes the overlay indistinguishable at a glance |
| **E-mandate / autopay abuse** | A recurring debit authority is established under a pretext and drawn down slowly | Agents can run the enrolment conversation and pace the debits under velocity thresholds |
| **Money mule layering** | Proceeds are split across many accounts to break the transaction graph | Agents coordinate split sizes and timing against known velocity rules rather than fixed patterns |

#### Identity and onboarding

| Vector | How the rail is abused | What GenAI changes |
|---|---|---|
| **Synthetic identity synthesis** | *Section 2.1* | |
| **Deepfake video-KYC and liveness bypass** | A generated face or replayed video passes remote onboarding checks | This is the vector GenAI most directly created; liveness detection and generation are now in a direct arms race |
| **Account takeover via OTP interception** | SIM-swap or social-engineered OTP capture converts credential theft into transaction authority | Voice synthesis makes the carrier-support call that authorises the swap cheap and repeatable |
| **Bust-out fraud** | An account is nurtured into good standing over months, then drawn down in a burst | Generative behavioural modelling can shape the nurture phase to resemble a specific segment's real spending |
| **BNPL origination fraud** | Thin-file or synthetic identities take instalment credit with no intent to repay | Underwriting on sparse data is exactly where synthetic identities are hardest to separate from genuine thin files |

#### Merchant side

| Vector | How the rail is abused | What GenAI changes |
|---|---|---|
| **Transaction laundering** | An illegitimate business processes its volume through a legitimate merchant ID | Generated site content and plausible transaction mixes make the front business survive monitoring longer |
| **Merchant account takeover** | Payout details on a real merchant account are altered so settlement is redirected | The same payee-mutation objective our agentic red team fires at an assistant, aimed at a support desk instead |
| **Loyalty and rewards theft** | Points balances are drained or converted; often weaker controls than the payment rail beside them | Credential-stuffing agents adapt per-programme, and rewards are frequently not monitored as money |

#### The defence itself as a target

| Vector | How the rail is abused | What GenAI changes |
|---|---|---|
| **Agentic prompt injection** | *Section 2.4 — the vector we built against* | |
| **Model extraction and training-set poisoning** | The detector is queried to clone its boundary, or fed crafted transactions that shift it | Directly adjacent to what we built. Our dosage sweep is the defensive mirror of a poisoning attack — it measures what a bounded number of crafted rows does to a trained model, which is the same question a poisoner asks |

**Twenty-five vectors across six surfaces; we built against two.** Sections 2.4 and 2.5 are
implemented end to end. Everything else here is mapped and not implemented, and section 8
says so again rather than relying on a reader remembering it.

This is a deliberate trade and worth stating rather than letting a reader infer it: **breadth
in identifying the surface, depth in the two we could measure end to end.** Two vectors carried
to a defensible number are worth more than 23 carried to a screenshot, and the ones we did
not build are listed here precisely so that the choice is visible rather than looking like an
oversight.

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

![Figure 1 — All 20 detector inputs, assigned a tier and a band measured from the corpus: 7 frozen, 4 coupled as a single merchant move, 9 free. This table is the attack's search space.](figures/constraints.png)

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

### 3.5 The red team, the blue team, and how each is initialised

This is a red-team/blue-team challenge and the project is pitched as a closed loop, so this
section names both teams explicitly, says how the blue team's model is constructed, and
describes the orchestration layer that lets the two sides choose moves rather than follow a
script.

**The blue team is the detector plus its operating point.** An XGBoost gradient-boosted
ensemble, and the
exact configuration behind every round published in `artifacts/detect/rounds.json`:

| | |
|---|---|
| Estimators | 300 |
| Max depth | 6 |
| Learning rate | 0.1 |
| Subsample / colsample | 0.9 / 0.9 |
| L2 (`reg_lambda`) | 1.0 |
| `scale_pos_weight` | computed per fit as negatives / positives |
| Tree method | `hist` |
| Eval metric | `aucpr` |

`scale_pos_weight` is computed rather than fixed because the positive rate changes as
adversarial rows are folded in each round; pinning it would quietly re-weight the objective
between rounds.

The operating point is not part of the model and is chosen separately: the lowest threshold
whose false-positive rate stays inside `FPR_BUDGET = 0.001`, fitted on a validation slice
carved from training data before the loop starts. Section 4.2 covers why that slice is
carved once and what the split costs us.

**One caveat about the configuration above, because the repository contains two.**
`detect/train.py` builds a detector at 400 estimators, depth 7, learning rate 0.08, and that
is what `scripts/run_detect_round0.py` trains on a temporal split. The loop uses the values
in the table. Until today `loop/flows.py` opened with a `try: from ..detect.train import
train_model` that fell through to its own configuration on failure — and since that module
exports `train_round` rather than `train_model`, the import raised on every call and the
fallback ran every time. No number is wrong because of it, but the source implied the
published rounds came from the other trainer. The dead branch is removed; both
configurations remain, and which one produced which artifact is now readable.

**The red team is the constraint-aware search of section 3.3**; the blue team's response is
adversarial retraining, and on the agentic surface the layered controls of section 4.6. Both are measured in section 4.4, where the honest finding is that
the blue response does not work at any dosage we can afford.

#### The orchestration layer

`src/adversarial_payments/orchestration/` — 697 lines across three modules — exists because
"we retrained three times" is not co-evolution. Without it the question *"in what sense are
there two adversaries here rather than one script?"* has no good answer.

- **`repertoire.py`** — the moves each side can play. Six for red (`amount_probe`,
  `merchant_pivot`, `timing_shift`, `velocity_pacing`, `combined_sweep`, `low_and_slow`) and
  four for blue (`adversarial_retrain`, `targeted_retrain`, `threshold_tighten`,
  `retrain_and_tighten`). A red play is a *restricted schema plus an attack config*, which
  is why the attack engine needs no changes and no knowledge that strategies exist.
- **`arena.py`** — runs the exchange and records each side's stated reasoning per round, so
  the transcript shows an actual counter (red pivoting to timing *because* blue hardened
  amount) rather than the writeup asserting adaptivity.
- **`orchestrators.py`** — the two agents that select plays.

**Three honesty guards are the point of it, more than the mechanics.**

1. **Saturation.** If the attacker wins essentially every attempt, neither side has a signal
   to adapt to, and a sequence of moves against a saturated target looks exactly like
   adaptation without being it. The arena detects that regime and refuses to support an
   adaptivity claim. **This matters here: attack success is 1.000, so the arena is in
   precisely the regime it declines to draw conclusions from.**
2. **Provenance.** A move chosen by the deterministic fallback is labelled `fallback` even
   though it carries a written rationale. Presenting a rule's rationale as a model's
   reasoning would be the same species of dishonesty as writing a placeholder into a result
   file.
3. A model returning a play that does not exist **falls back rather than being trusted.**

**What we claim for it, and what we do not.** The package is strictly additive: it imports
`attack/` and `loop/` and modifies neither, so the headline results stand whether or not it
runs. It is not wired into the published rounds, and no number in section 4 comes from it.
We report it because it is built and tested, and because the saturation guard is the reason
we are *not* claiming co-evolution from a flat attack-success curve — a guard that refuses
to support your own pitch is worth more than one that never fires.

### 3.4 Four errors worth reporting

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

**The second error was the same mistake, one layer down.**

Our dashboard plots attack success against detector quality across rounds. It read the
detector's results for each round, and where a round had not been trained yet it substituted
zero. The chart therefore drew detection quality collapsing to the floor — directly beneath a
caption stating that detection quality holds. The figure disproved its own caption, and a
statistic panel two inches away simultaneously reported the correct, unchanged value.

The cause was a single defaulting expression: `?? 0`. It converts *"I have no measurement"*
into *"I measured zero"*, and everything downstream then treats the fabrication as data.

The two errors are worth setting beside each other because they differ in exactly one
respect that matters. The first — an attack scoring 100% by surrendering the money — was
caught by a colleague asking what the attacker had given up. It was wrong in a report, where
somebody can push back. The second was wrong *in code*, rendered confidently, on the artifact
a reviewer actually looks at, with nobody in the loop to object. **A missing measurement
presented as a confident zero is not a smaller error than a fabricated result. It is a
fabricated result, produced automatically.**

Both are instances of the same thesis this framework exists to argue. A number means nothing
apart from the conditions under which it was obtained — and a system that cannot represent
*"not measured"* as distinct from *"measured zero"* will eventually assert the second when it
means the first. The fix was not a better default but the removal of the default: the value
is now nullable, absent rounds are drawn as absent, and the round table names them "not run"
rather than letting them silently vanish. A point that quietly disappears still leaves the
reader to guess.

**The third error was the one that decided the headline number.**

The unrolled loop chose its operating threshold by maximising F1 — on the test split. Two
things were wrong with that at once. It contradicted the threshold policy our own detector
module documents in its opening comment, which selects the lowest threshold holding the
false-positive rate inside a fixed budget. And it fitted the operating point on the very rows
the attack was then scored against.

The consequence was not subtle. It lifted the decision threshold to roughly 0.94 against a
budget-derived cut near 0.23. The attacker only ever had to push a score below a bar four
times higher than the detector's real operating point, which made evasion close to free by
construction. Worse, the bar moved *upward* every round as adversarial retraining shifted the
score distribution, so each round of "defence" quietly handed the attacker an easier target
than the one before it.

The threshold is now selected at a fixed false-positive budget on a validation slice carved
out of the training data before the loop begins — carved once, because adversarial rows are
appended to the training set each round and a validation slice growing alongside them would
move the operating point for reasons having nothing to do with the detector. Two properties
follow, and the attack success rate in section 4.4 is only meaningful because of them: the
operating point never sees the test rows, and every round is compared at the same
false-positive cost. A fall in attack success would therefore be the detector improving,
rather than the defender quietly widening the net to catch more.

It is worth being precise about what this fix did and did not change. The corrected threshold
made evasion genuinely harder — and the attack success rate stayed at 100% anyway. The bug
was not what was propping up the result. Had we found it after publishing rather than before,
the number would have survived; but we would have been quoting it for the wrong reason, and
we could not have told the difference.

**The fourth error is the one careful reading would not have found.**

`loop/flows.py` built its detector like this:

```python
try:
    from ..detect.train import train_model
    return train_model(train_df)
except Exception:
    pass                     # fall through to the configuration below
```

`train_model` does not exist. That module exports `train_round`. So the import raised on
every call, the fallback ran every time, and it ran that way for the life of the project.

Nothing was broken and no published number is wrong. What was wrong is that **the source
could not tell you which model produced the results.** A reader following that code would
conclude the rounds in `artifacts/detect/rounds.json` came from `detect/train.py` at 400
estimators, depth 7, learning rate 0.08. They came from 300, depth 6, 0.1. Both are real
configurations in real files that a maintained project would legitimately contain; only the
absence of one function definition separates the live one from the dead one.

It was caught because a second person, drafting section 3.5, went to cite the detector's
hyperparameters and read them out of `detect/train.py` — the file the code appeared to
prefer. Confirming which one actually ran took a single command, `grep -c "^def train_model"`,
returning zero. Nobody reading either file carefully would have found it, because neither
file is wrong. The disagreement lives in the space between them.

The `try/except` is what let it persist: an exception handler that catches everything and
continues cannot distinguish "this dependency is temporarily unavailable" from "this function
was never written." It reports success either way. The branch is now deleted and the live
configuration sits inline.

**The pattern across the first three is one thing; the fourth is another, and both are worth
carrying away.** The first three were each caught by asking what a number was measured
*under* rather than whether it looked plausible — none would have been caught by a number
that looked wrong, because in every case the number looked entirely reasonable. The fourth
would not have been caught by that question either. It needed someone to ask which code
actually ran, and to check rather than read. In a codebase where failures are swallowed, that
is a question you have to ask deliberately, because nothing will ever raise it for you.

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
transactions for that card. That safeguard holds for every number in this document: features
are built on the time-ordered frame before any split exists.

**The split itself is where we have to be careful, and we are not fully clean.** Two splits
appear in this project and they are not equivalent:

- `scripts/run_detect_round0.py` splits **temporally** — later transactions are held out —
  which is the correct evaluation for fraud and the one we would defend.
- The unrolled loop splits **stratified at random**. A card's other transactions can then sit
  on both sides of the split, so the model can learn card-specific behaviour it would not
  have at deployment. Features are still past-only, so this is not label leakage; it is an
  easier test set.

The rounds published in section 4.3 come from the loop, so they carry the second, weaker
split. We say so rather than letting the temporal claim cover both.

**We treat a suspiciously high score as a bug report, not a success.** On this data, anything
above roughly 0.95 PR-AUC indicates leakage — and the published round-0 figure below is
0.9472, just under that line. We are reporting a number that sits against our own tripwire,
on the split most likely to inflate it. Read it accordingly.

### 4.3 Results

Detector rounds from the unrolled loop, on the full 1,852,394-row corpus
(`n_train = 907,675`, stratified split — see the caveat in 4.2):

| Round | PR-AUC | ROC-AUC | Precision | Recall | Threshold | Adversarial rows |
|---|---|---|---|---|---|---|
| 0 | **0.9472** | 0.9989 | 0.814 | 0.916 | 0.8199 | — |
| 1 | 0.9390 | 0.9985 | 0.826 | 0.896 | 0.8978 | +800 |
| 2 | 0.9318 | 0.9982 | 0.823 | 0.890 | 0.9327 | +800 |

PR-AUC is the headline rather than ROC-AUC deliberately. At a 0.521% positive rate, ROC-AUC
flatters heavily — 0.9989 sounds close to perfect and mostly reflects the ease of ranking the
overwhelming negative majority. Precision-recall is the honest view of a needle-in-haystack
problem.

**An earlier revision of this section reported 0.829 at `n_train = 96,000`, from the
temporally-split round-0 script.** That figure is not in any artifact now. The loop replaced
it so that all three rounds could be published from one experiment, and the honest cost of
that choice is the weaker split described above: part of the gap between 0.829 and 0.9472 is
more training data, and part is a test set that shares cards with the training set. We are
not able to say how much of each, and we would rather state that than pick the flattering
reading.

Top features by mean absolute SHAP: transaction amount, merchant category, log amount,
amount relative to the card's running mean, and hour of day.

### 4.4 Adversarial results

The full three-round run has now been executed against the round-0 detector on 400,000 real
Sparkov rows (train 196,001 / validation 84,000 / test 119,999), attacking 400 transactions
per round. Every figure below is read from `artifacts/attack/rounds.json`, which carries
`placeholder: false`.

| Round | Attack success rate | Mean L0 | Median queries per success |
|---|---|---|---|
| 0 | 100.0% | 4.12 | 275 |
| 1 | 100.0% | 4.00 | 291 |
| 2 | 100.0% | 4.03 | 391 |

**The attack success rate does not fall.** It is 100% at every round. Three rounds of
adversarial retraining did not prevent a single evasion, and we report that rather than
tuning until a more flattering curve appeared.

What the defence actually bought is measurable and it is not nothing: the attacker touches
116 more model queries per success by round 2, while mean features touched stays flat (4.12 → 4.03). That is a
defence-in-depth economics result — the attack becomes more expensive, not impossible — and
it is the same conclusion the project's own stated limitations predicted before the run
existed.

Two things follow that we would rather state than have asked.

![Figure 2 — Attack success is flat at 100% across all three rounds. What lengthens is the search: median queries 275 to 391. Mean features touched is unchanged over the same rounds (4.12 to 4.03), so retraining made evasions harder to find rather than structurally more expensive.](figures/coevolution.png)

**We tested the dosage explanation, and it is wrong.**

The obvious objection to the table above is that a few hundred adversarial rows against a
training set of that size is a fraction of a percent, too small a dosage to expect anything.
We swept it rather than asserting it. Each arm reruns the loop with adversarial rows carrying
`sample_weight = w`, over a range wide enough that at the top they outweigh the entire
legitimate training set, and the sweep runs on the **full 1,852,394-row dataset** — train
907,675 / validation 389,002 / test 555,717, 800 attacked transactions per round.

| Adversarial weight | Final ASR | Final PR-AUC | Final recall |
|---|---|---|---|
| — (round 0, no defence) | 1.000 | 0.9457 | 0.911 |
| 1 | 1.000 | 0.9304 | 0.883 |
| 10 | 1.000 | 0.9020 | 0.844 |
| 50 | 1.000 | 0.8753 | 0.809 |
| 200 | 1.000 | 0.8357 | 0.764 |
| 1000 | 1.000 | 0.8078 | 0.706 |
| 5000 | 1.000 | 0.7343 | 0.609 |

*Source: `artifacts/attack/dosage_sweep.json`. Round 0 is shared across arms by construction —
the weight only applies from round 1 — which is why every arm starts from the same detector.*

**Attack success is 1.000 in every arm and every round. Not one of the eighteen measurements
moved.** Raising the dosage by a factor of 5000 bought exactly nothing, and cost **22.3% of
PR-AUC and a third of recall** — 0.911 down to 0.609. The detector is being destroyed at a
rate the attacker never notices.

The mechanism is visible in the threshold column of the artifact. At weight 5000 the
operating threshold is driven to 0.99966: weighting the adversarial rows that heavily makes
the model so confident on everything else that the fixed false-positive budget has almost
nowhere to sit. We degraded the detector into uselessness and the attacker still won every
attempt.

So the explanation we offered in an earlier revision of this document — that the defence
looked ineffective only because the dosage was small — is refuted by our own experiment. The
supportable claim is narrower and less comfortable: **against a constraint-aware attacker
that re-searches after every retrain, adversarial retraining does not work at any dosage we
can afford.** Retraining on a bounded set of specific evasions cannot cover the feasible
region the attacker searches next round; it can only overfit to the points it was given.

*An earlier revision of this section reported this sweep on a 400,000-row subsample, where
one arm dipped to 0.982. That dip does not survive the full dataset, and we report the full
run rather than the subsample that happened to contain a more interesting number.*

That is a real result about adversarial retraining under an adaptive threat model, and it is
worth more to a reader than the falling curve we set out to produce.

![Figure 3 — Adversarial dosage swept 1x to 5000x on the full corpus. Attack success is 1.000 in all eighteen measurements; the left panel shows no trend because there is none. Detector PR-AUC falls from 0.9457 to 0.7343 across the same arms.](figures/dosage.png)

**Then we priced the other lever, and it does not work either.**

Retraining is not the only defence available. The attacker wins by pushing a score below the
operating threshold, so lowering that threshold shrinks the target for reasons that have
nothing to do with what the model learned. It is instant, needs no retraining, and is not
free: every step down declines more legitimate customers. We swept the false-positive budget
against a single fixed detector, so any change is attributable to the operating point alone.

| FPR budget | Threshold | ASR | Recall | Legitimate declines per 100,000 |
|---|---|---|---|---|
| 0.001 | 0.478 | 1.000 | 0.893 | 114 |
| 0.002 | 0.229 | 1.000 | 0.916 | 226 |
| 0.005 | 0.067 | 1.000 | 0.943 | 528 |
| 0.01 | 0.022 | 1.000 | 0.964 | 1,002 |
| 0.02 | 0.006 | 1.000 | 0.973 | 1,981 |
| 0.05 | 0.001 | 1.000 | 0.986 | 5,008 |
| 0.10 | 0.0004 | 0.998 | 0.994 | 10,035 |

*Source: `artifacts/attack/threshold_sweep.json`.*

**Moving attack success from 1.000 to 0.998 costs declining roughly one in ten legitimate
transactions.** No payment network runs at a 10% decline rate. The defence is not expensive;
it is unbuyable.

The reason is visible in where the attack lands. At a threshold of 0.478 the median successful
evasion scores 1.9e-03; at a threshold of 0.0004 it scores 6.6e-05. The attacker does not
clear a fixed bar — it lands just underneath whichever bar we set, and lowering the bar only
makes it search harder. Its search stops as soon as it wins, so the scores hug the threshold
from below while retaining headroom to go further.

![Figure 4 — Attack success against the false-positive budget. It holds at 1.000 until the widest budget tested, where it reaches 0.998 — at 10,035 legitimate declines per 100,000 transactions.](figures/threshold.png)

**Taken together these two sweeps say something narrower and more useful than either alone.**
Both defences available at the model layer were measured, not assumed, and both were priced:
retraining fails at any dosage, and threshold tightening fails at any operating point a
business could run. That is not a failure of tuning. Against an attacker who re-searches after
every change, defending inside the model is the wrong layer.

Which is exactly where the agentic result earns its place in this document. That surface is
defended by *layered controls* rather than by the model — an injection classifier, tool
scoping, and a human-in-the-loop threshold — and there the reduction is statistically
significant at p = 0.015 with a 0% false-refusal rate. The contrast between the two surfaces
is the most actionable thing we found: **the tabular track shows where model-layer defence
runs out, and the agentic track shows what replaces it.**

Second, per-round PR-AUC is deliberately absent from the table. The loop does not write
`artifacts/detect/rounds.json` — that artifact belongs to the detector track and holds a
round-0 figure computed under a different split — so the loop's own per-round PR-AUC exists
only in a run log and sits outside the provenance machinery described in section 2. We will
not quote a number that our own audit cannot vouch for.

**Does the defence detect the generated attacks?** That is the question pillar III actually
asks, and the loop above does not answer it. The loop asks something harder — after
retraining, can a *fresh* constraint-aware search find *new* evasions — and the answer is
always yes. Those are different questions, and conflating them undersells the defence.

So we measured the pillar's question directly. Attack the round-0 detector, split the
successful evasions in half, retrain on one half only, and score the half the model has never
seen. The split is the load-bearing part: folding every adversarial row into training and then
reporting recall on those same rows measures memorisation, which is the same species of error
as fitting a threshold on the test split.

| | Before retraining | After retraining |
|---|---|---|
| **Recall on held-out adversarial attacks** | 0.0% | **68.9%** |
| Recall on the adversarial rows it trained on | — | 100.0% *(memorisation ceiling)* |
| Recall on real fraud | 89.3% | 87.9% |
| PR-AUC | 0.9291 | 0.9214 |
| Legitimate declines per 100,000 | 114 | 94 |

*Source: `artifacts/attack/adversarial_detection.json`. 566 successful evasions, split
283 / 283.*

**The defence detects 69% of generated attacks it has never seen, at a cost of 1.4 points of
real-fraud recall — and it declines fewer legitimate payments than before, not more.** The
100% figure on the rows it trained on is reported beside it deliberately: it is the ceiling
memorisation would produce, and the gap between 100% and 68.9% is how much of the result is
generalisation rather than recall of specific rows.

![Figure 5 — Recall on 283 adversarial examples the retrained model never saw: 0.0% to 68.9%. Recall on rows it did see is 100%, which is the memorisation ceiling and why the held-out figure is the only honest one. Real-fraud recall holds and legitimate declines fall. Measured on a 400,000-row run.](figures/adversarial_detection.png)

**Both of these are true at once, and the pair is the finding.** Adversarial retraining
generalises *within* the attack distribution — it learns something transferable about how
these evasions are shaped. It does not survive an attacker who re-searches against the new
model, which is why attack success returns to 1.000 in the loop. A defence can be genuinely
effective against replayed and near-neighbour attacks while being worthless against an
adaptive adversary, and a submission that reported only one of those numbers would be
misleading in whichever direction it chose.

**A worked example, round 0.** Transaction `txn_25311` scored 0.954 under the detector. The
attacker changed exactly one feature — the hour, from 22:00 to 04:00 — and the score fell to
0.000. No amount was altered, no merchant substituted, nothing frozen was forged. A single
rescheduling, entirely within an attacker's control and entirely legal, was sufficient.

**The audit that makes the number above worth reading.** Section 3.4 claims that an
unconstrained attack success rate is not a number at all. That claim is now measured rather
than asserted, on our own baseline, and published as its own artifact
(`artifacts/attack/feasibility.json`).

We ran a second attacker against the identical round-0 detector with the constraints removed
— free to move any feature, including the victim's own attributes and the merchant's
coordinates, subject only to observed value bounds.

| | Constraint-aware | Unconstrained |
|---|---|---|
| Attack success rate | 100.0% | 100.0% |
| Mean features touched (L0) | 4.12 | 1.88 |
| Successes at a merchant absent from the network | 0.0% | **99.9%** |
| Successes that forged a frozen victim attribute | 0.0% | 6.0% |

The two attackers report the same headline. They are not describing the same thing.
**99.9% of the unconstrained attacker's "evasions" are transactions that could not physically
occur** — a merchant category paired with terminal coordinates that no merchant in the network
occupies. It also reaches that result more cheaply, touching 1.88 features against our 4.12,
because forging is cheaper than searching.

Our zeroes in that table are zero by construction rather than by measurement: frozen columns
are excluded from the search entirely, and merchant choice is drawn from the observed network,
so an infeasible transaction cannot be produced in the first place.

This is the single result we would most want a sceptical reader to take away. Had we reported
the unconstrained figure, it would have been arithmetically correct, better-looking on cost,
and describing something that does not exist.

### 4.5 The second attack surface

The corpus was run live against **two independent frontier-class models**, on two providers,
with every response cached so the whole run replays offline with no network. The corpus is 48
injections across six OWASP-mapped categories, paired with the scenarios on their own channel:
**144 trials per arm, per model.**

| Model | Provider | Exploit rate before | after | Fisher exact (2-sided) |
|---|---|---|---|---|
| `openai/gpt-oss-120b` | Groq | 4.9% (7/144) | **0.0%** (0/144) | **p = 0.015** |
| `nvidia/nemotron-3-super-120b-a12b` | NVIDIA NIM | 3.5% (5/144) | 0.7% (1/144) | p = 0.214 |
| *pooled* | — | 4.2% (12/288) | 0.3% (1/288) | **p = 0.003** |

*Sources: `artifacts/agentic/redteam-groq.json` and `redteam-nvidia.json`, both
`placeholder: false`. 95% CI on the pooled before-rate is 2.4%–7.1%.*

![Figure 6 — Exploit rate before and after the defence layer, on two vendors. The reduction clears alpha = 0.05 on gpt-oss-120b and on the pooled corpus, and does not clear it on nemotron-120b taken alone.](figures/agentic.png)

**The defence layer produces a statistically significant reduction** on `gpt-oss-120b`
(p = 0.015) and pooled across both models (p = 0.003). It refused **none** of the 14 benign
control documents — a 0% false-refusal rate — which rules out the trivial defence that simply
blocks everything and thereby scores a perfect exploit rate.

Three things about that result we would rather state than have drawn out of us.

**It is not significant on `nemotron-120b` taken alone** (p = 0.214), and one exploit survived
the defence there. We report the per-model rows rather than only the pooled figure precisely
because the pooled number alone would hide that disagreement.

**The surviving exploit is worth more than a clean sweep would have been.** A defence that
blocks 100% of everything on every model is the result most likely to mean the corpus was too
easy. One survivor on one model is evidence the measurement still has headroom.

**An earlier revision of this document reported this same comparison as *not* significant**,
and that was correct at the time: the corpus was then 24 injections, 72 trials per arm, and
3/72 → 0/72 gives p = 0.245. Nothing about the defence changed. We doubled the corpus because
72 trials could not resolve an effect of this size, and the significance follows from the
added statistical power rather than from any change to what is being measured. The new
injections were authored from published patterns **before** any were run, and none was revised
after seeing whether the defence caught it — tuning payloads against our own classifier would
have made the exploit rate a measure of that tuning.

The finding underneath the significance is the one we would actually lead with: **two
independently-trained 120B instruction-tuned models were already largely resistant to a
hand-authored indirect-injection corpus**, at roughly a 4% baseline. `payee_mutation` is the
only category that lands with any regularity on either model. Data exfiltration, obfuscated
override and transfer tampering scored zero before any defence was applied.

**What we would do with more time**, named because it is the obvious next step rather than a
hedge: both providers host purpose-built injection guard models
(`meta-llama/llama-prompt-guard-2`, `nvidia/llama-3.1-nemoguard-8b`). Substituting a published
guard for our hand-rolled classifier, and hardening the corpus until a non-trivial baseline
exists, is what would turn this into a measurable result.


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

### 4.6 Detecting, flagging and mitigating

The brief asks for a system that *detects, flags and mitigates* the generated attacks. Those
are three different actions and we implement them at both surfaces, so this section names
which mechanism performs which rather than leaving a reader to infer it from the results
above.

| | Tabular detector | Payment agent |
|---|---|---|
| **Detect** | Score every transaction; PR-AUC 0.9472, and **68.9%** recall on generated attacks it has never seen | Judge the agent's *audit log*, never its prose: an exploit is a dangerous tool call that actually fired with attacker-chosen arguments |
| **Flag** | Decline above a threshold chosen at a fixed false-positive budget — 114 legitimate declines per 100,000 | Raise a defence event naming the layer and the reason, e.g. `classifier · redact · score=0.54 addresses-the-assistant, authority-framing` |
| **Mitigate** | The threshold *is* the mitigation: the transaction does not authorise. Section 4.4 prices tightening it | Three layers, each blocking a different way in — see below |

**The agent's mitigation is layered, and the layers are not interchangeable.**

1. **Injection classifier** — scores untrusted text and *redacts* the offending span before the
   model ever sees it. The document reaches the agent with the payload replaced by
   `[REDACTED BY INJECTION FILTER]`, so the instruction cannot be followed rather than being
   refused after the fact.
2. **Tool scoping** — each task carries its own permitted tool set
   (`memo_review`, `dispute_review`, `invoice_payment`, `payee_onboarding`). A payee-mutation call arriving during a
   memo review is denied because that task cannot make it, independent of anything the model
   decided.
3. **Human in the loop** — any transfer above 500 is held for
   approval rather than executed. This is the layer that catches what the first two miss, and
   it is why the defence does not have to be perfect to be useful.

**Both halves of the trade are measured.** The layers remove every exploit observed on
`gpt-oss-120b` (Fisher p = 0.015) and refuse **none** of the 14 benign control documents — a 0%
false-refusal rate. A defence that blocked everything would score a perfect exploit rate and be
worthless, which is exactly why the benign controls exist.

The `/agent` page on the prototype runs this stack live. Firing the default injection with
defences off rewrites a supplier's IBAN to the attacker's account and the ledger diff shows it;
firing it again with defences on produces `classifier · redact` followed by `hitl · approve`,
the legitimate transfer completes, and the ledger is untouched.

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
comfortably within real-time authorisation budgets. Measured on the **serving** path — the round-0 detector exported to ONNX and run under
ONNX Runtime on CPU, one transaction at a time, 1,000 timed calls after 100 discarded
warmups:

| p50 | p95 | p99 | mean |
|---|---|---|---|
| 0.035 ms | 0.081 ms | 0.145 ms | 0.043 ms |

*Source: `artifacts/latency.json`, `placeholder: false`. Tail percentiles are reported
because p99 is what breaches an authorisation SLA, not the mean.*

Two things make this figure defensible rather than merely small. The exported graph was
checked against the training-time model over 256 inputs and agrees to **8.6e-08**, so the
number describes the model we actually evaluated and not a lookalike. And the earlier
measurement this replaces — 4.1 ms — was taken through XGBoost's Python API, which builds a
one-row DataFrame per call; that overhead, not the tree evaluation, was almost all of it.
Quoting the training-time path as a serving cost would have overstated inference by two
orders of magnitude in our own disfavour.

**A note on which path this figure describes, because the live demo uses a different one.**
The 0.035 ms above is the server-side serving path: the exported graph under ONNX Runtime,
which is what a payment network would actually deploy. The interactive demo scores in the
visitor's browser instead, and it does not use ONNX — shipping `onnxruntime-web` cost 3.2 MB
of WASM on the wire and 8.8 seconds to a first score on a 4 Mbps connection, to do what is
ultimately 400 walks down a binary tree comparing a float to a threshold. The browser now
walks the trees directly from a 174 KB export.

These are two execution paths for **one model**, not two models. `npm run check:trees` scores
a fixture through ONNX and through the JavaScript walker and fails on any disagreement:
68 rows, worst delta **1.71e-07**. The same discipline covers the agent — `npm run check:agent`
confirms the TypeScript defence port agrees with the Python one on all 144 documents and 360
spans, because a browser demo that quietly disagreed with the measured results would be
evidence for nothing.

So read 0.035 ms as the deployable serving cost, not as the latency of the web demo. We are
not quoting a browser measurement as a production one.

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
- **The published detector rounds use a stratified random split, not a temporal one.** A
  card's transactions can appear on both sides, which makes the test set easier than
  deployment would be. PR-AUC 0.9472 sits just under our own 0.95 leakage tripwire and should
  be read with that attached. The temporally-split alternative scores 0.829; we publish the
  loop's rounds because all three exist there, and we flag the trade rather than hiding it.
- **The constraint model is a judgement call.** Which fields an attacker controls is our
  assessment, informed by how card-not-present fraud works, not a measurement. Different
  assumptions produce different success rates. We have made the assumptions explicit and
  configurable rather than burying them.
- **The payment agent is a mock**, with simulated tools and a simulated ledger. It is a
  faithful model of the attack surface, not an integration with a real payment system.
- **Three of the five mapped threat vectors are not implemented** — synthetic identity,
  deepfake voice, and localised social engineering. They are section 2, not section 3.
- **Every result in this document is now backed by an artifact carrying
  `placeholder: false`**, and no PENDING markers remain. The last one to close was
  latency, which had been measured against the training-time backend at a tenth of the
  specified sample count *and* written outside the provenance envelope of section 2 — so it
  was both the wrong number and an unauditable one. Both defects are fixed rather than
  argued away.
- **The agentic defence result is reported as not statistically significant** (section 4.5).
  It would have been easy to present "4.2% to 0.0%" as a success and most readers would have
  accepted it.

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
| Code | `https://github.com/Aditya-Patil27/assay` |
| Web prototype | https://assay-payments.vercel.app |
| Attack constraints | `src/adversarial_payments/attack/constraints.py` |
| Attack search | `src/adversarial_payments/attack/engine.py` |
| Feature contract | `src/adversarial_payments/schema.py` |
| Unrolled loop | `src/adversarial_payments/loop/flows.py` |
| Agentic red team | `src/adversarial_payments/agentic/` |
| Results | `artifacts/` |

**A note on the two names.** The project is **Assay**. The repository and deployment
keep the `adversarial-payments` slug they were created under: that URL is cited in this
document and in the submission, and `src/adversarial_payments/` is imported by 35
modules and two cross-language conformance checks. Renaming them hours before a deadline
would risk the deliverable to fix nothing a reader can see.

Setup and run instructions are in `docs/team/BUILD.md`.
