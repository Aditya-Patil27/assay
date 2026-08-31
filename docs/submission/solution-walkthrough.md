# An Adversarial Framework for Payment Security

## Red-teaming fraud detection and agentic payment systems

**Mastercard Innovation Challenge 2026 — Solution Walkthrough**

---

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

### 2.6 The wider catalogue

The five above are the vectors we analysed in depth. Restricting a threat map to them would
misrepresent the surface, so the following are catalogued with what GenAI actually changes
about each. None is implemented, and none is claimed to be.

| Vector | How the rail is abused | What GenAI changes |
|---|---|---|
| **Card testing / BIN attacks** | Automated low-value authorisations probe stolen card ranges for live numbers before resale | Agents adapt probe amount, merchant and pacing in response to declines, turning a fixed script into a feedback loop |
| **Account takeover via OTP interception** | SIM-swap or social-engineered OTP capture converts credential theft into transaction authority | Voice synthesis makes the carrier-support call that authorises the swap cheap and repeatable |
| **Authorised push payment (APP) fraud** | The victim is persuaded to send the payment themselves, so every control that checks authenticity passes | Conversational agents sustain a plausible pretext across hours and channels at negligible marginal cost |
| **Bust-out fraud** | An account is nurtured into good standing over months, then drawn down in a burst | Generative behavioural modelling can shape the nurture phase to resemble a specific segment's real spending |
| **Triangulation fraud** | A fake storefront takes real orders, fulfils them with stolen cards, and harvests the card data | Storefront copy, product listings and reviews are now generated end to end |
| **First-party / friendly fraud** | The legitimate cardholder disputes a genuine transaction | LLM-drafted dispute narratives are internally consistent and match issuer templates, defeating text heuristics |
| **Money mule layering** | Proceeds are split across many accounts to break the transaction graph | Agents coordinate split sizes and timing against known velocity rules rather than fixed patterns |
| **Model extraction and training-set poisoning** | The detector itself is the target: queried to clone its boundary, or fed crafted transactions that shift it | Directly adjacent to what we built. Our dosage sweep is the defensive mirror of a poisoning attack — it measures what a fixed number of crafted rows does to a model, which is the same question a poisoner asks |

**We built against 2.4 and 2.5.** The other three in-depth vectors, and all eight above, are
mapped and not implemented. Section 8 says so again rather than relying on a reader
remembering it.

This is a deliberate trade and worth stating rather than letting a reader infer it: **breadth
in identifying the surface, depth in the two we could measure end to end.** Two vectors carried
to a defensible number are worth more than eight carried to a screenshot, and the ones we did
not build are listed here precisely so that the choice is visible.

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

### 3.4 Three errors worth reporting

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

That is the pattern in all three errors. Each was caught by asking what the number was
measured *under* rather than whether it looked plausible. None of them would have been caught
by a number that looked wrong, because in every case the number looked entirely reasonable.

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

The full three-round run has now been executed against the round-0 detector on 400,000 real
Sparkov rows (train 196,001 / validation 84,000 / test 119,999), attacking 400 transactions
per round. Every figure below is read from `artifacts/attack/rounds.json`, which carries
`placeholder: false`.

| Round | Attack success rate | Mean L0 | Median queries per success |
|---|---|---|---|
| 0 | 100.0% | 3.81 | 277 |
| 1 | 100.0% | 4.26 | 298 |
| 2 | 100.0% | 4.64 | 492 |

**The attack success rate does not fall.** It is 100% at every round. Three rounds of
adversarial retraining did not prevent a single evasion, and we report that rather than
tuning until a more flattering curve appeared.

What the defence actually bought is measurable and it is not nothing: the attacker touches
0.83 more features and spends 215 more model queries per success by round 2. That is a
defence-in-depth economics result — the attack becomes more expensive, not impossible — and
it is the same conclusion the project's own stated limitations predicted before the run
existed.

Two things follow that we would rather state than have asked.

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
| Mean features touched (L0) | 3.82 | 1.76 |
| Successes at a merchant absent from the network | 0.0% | **99.5%** |
| Successes that forged a frozen victim attribute | 0.0% | 3.0% |

The two attackers report the same headline. They are not describing the same thing.
**99.5% of the unconstrained attacker's "evasions" are transactions that could not physically
occur** — a merchant category paired with terminal coordinates that no merchant in the network
occupies. It also reaches that result more cheaply, touching 1.76 features against our 3.82,
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
| Code | `https://github.com/Aditya-Patil27/mastercard-adversarial-payments` |
| Web prototype | https://adversarial-payments.vercel.app |
| Attack constraints | `src/adversarial_payments/attack/constraints.py` |
| Attack search | `src/adversarial_payments/attack/engine.py` |
| Feature contract | `src/adversarial_payments/schema.py` |
| Unrolled loop | `src/adversarial_payments/loop/flows.py` |
| Agentic red team | `src/adversarial_payments/agentic/` |
| Results | `artifacts/` |

Setup and run instructions are in `docs/team/BUILD.md`.
