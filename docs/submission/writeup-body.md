# Kaggle Writeup — paste this into the Writeups form

Everything below is ready to paste. The three required artifacts are listed first because
that is what the submission is checked for.

---

## Adversarial Payments Framework

**A closed-loop red team for payment fraud — and an audit that says which attack numbers are real.**

### Submission artifacts

| # | Artifact | Link |
|---|---|---|
| 1 | Code repository | https://github.com/Aditya-Patil27/mastercard-adversarial-payments |
| 2 | Solution walkthrough (.docx) | attached — `solution-walkthrough.docx` |
| 3 | Working web prototype | https://adversarial-payments.vercel.app |

---

### What we built

A closed-loop red/blue system applied to **two attack surfaces**, reporting the same shape of
result for both, terminating in one scorecard.

- **Tabular** — a constraint-aware evasion search against an XGBoost fraud detector trained
  on 1,852,394 real Sparkov card transactions, then adversarial retraining, then attack again.
- **Agentic** — indirect prompt injection into the untrusted text a payment assistant ingests
  (memos, invoice metadata, merchant names, dispute evidence), defended by an injection
  classifier, tool scoping and a human-in-the-loop threshold.

### The idea that makes it different

Most adversarial-ML work asks *"can I flip this prediction?"* Payments demands a harder
question: **"can I flip it using only what an attacker actually controls?"**

A fraudster with stolen credentials inherits the victim's age, home city and job; the network
stamps the timestamp. What they control is the amount, the timing, and which merchant to hit —
and choosing a merchant moves four features at once, because category, terminal latitude,
terminal longitude and distance are four projections of one decision. Perturb them
independently and you have produced a transaction that cannot physically occur.

**We measured what that costs.** Running the same attack with the constraints removed:

| | Constraint-aware | Unconstrained |
|---|---|---|
| Attack success rate | 100.0% | 100.0% |
| Mean features touched | 4.12 | 1.88 |
| At a merchant that does not exist | 0.0% | **99.9%** |
| Forged a frozen victim attribute | 0.0% | 6.0% |

Both attackers report the same headline. **99.9% of the unconstrained attacker's "evasions"
are transactions that could not physically occur.** An attack success rate measured without
constraints is not a hard number that happens to be high — it is not a number at all. This is
the fidelity claim, demonstrated against our own baseline rather than asserted.

### Detection results

| Metric | Value | Measured on |
|---|---|---|
| PR-AUC | 0.9472 | full 1,852,394 rows |
| Recall on real fraud | 0.916 | full 1,852,394 rows |
| Legitimate declines per 100,000 | 114 | 400,000-row subsample |
| **Recall on held-out generated attacks** | **68.9%** (from 0%) | 400,000-row subsample |
| Single-transaction serving latency (ONNX, p50) | 0.035 ms | 1,000 timed calls |

The right-hand column is there because these are not all one run, and a table without it would
imply they were.

**The caveat that belongs next to 0.9472.** It comes from the unrolled loop, which splits
**stratified at random** rather than temporally. Features are computed causally on the
time-ordered frame, so this is not label leakage — but a card's transactions can land on both
sides, which makes the test set easier than deployment would be. We treat anything above
roughly 0.95 PR-AUC on this data as a leakage signal, and **0.9472 sits just under that line,
on the split most likely to inflate it.** The temporally-split alternative scores 0.829.
Walkthrough §4.2 carries the full discussion; we would rather you meet this here than find it
there.

The defence detects **69% of generated attacks it has never seen**, at a cost of 1.4 points of
real-fraud recall — and it declines *fewer* legitimate payments than before. That result rests
on a *different* split from the one above: we retrain on half the generated attacks and score
the other half, because reporting recall on the rows a model trained on measures memorisation
rather than detection.

### The result we did not expect, reported anyway

**Attack success does not fall across rounds.** It is 100% at every round — and it stays at
100% when we raise the adversarial training dosage 5000×, and when we tighten the decision
threshold to the point of declining one legitimate transaction in ten.

| Defence tried | Effect on attack success | Cost |
|---|---|---|
| Adversarial retraining, 5000× dosage | 1.000 → 1.000 | −22.3% PR-AUC, −33% recall |
| Threshold tightening to FPR 0.10 | 1.000 → 0.998 | 10,035 legitimate declines per 100k |

Both defences available at the model layer are measured, priced, and shown not to work against
an attacker that re-searches after every change. **That is not a tuning failure — it says
defending inside the model is the wrong layer.**

Which is where the second surface earns its place. The payment agent is defended by *layered
controls* rather than by the model, and there the reduction is statistically significant:

| Model | Exploit rate before | After | Fisher exact |
|---|---|---|---|
| openai/gpt-oss-120b | 4.9% (7/144) | **0.0%** | **p = 0.015** |
| nvidia/nemotron-3-super-120b | 3.5% (5/144) | 0.7% (1/144) | p = 0.214 |
| pooled | 4.2% (12/288) | 0.3% | **p = 0.003** |

With a **0% false-refusal rate** on 14 benign controls, which rules out the trivial defence
that blocks everything. Not significant on nemotron alone; we publish the per-model rows rather
than only the pooled figure so that disagreement is visible.

### Try the prototype in 30 seconds

Open **https://adversarial-payments.vercel.app/agent** and run the default pair with defences
off, then on.

- **Off** — the agent executes `update_payee` and a real supplier's IBAN is rewritten to the
  attacker's account. The ledger diff shows it.
- **On** — the injection classifier redacts the payload, the legitimate transfer proceeds, the
  ledger is untouched.

The tabular detector runs in your browser; the agent route calls a live model server-side.

### Why the numbers are checkable

- Every result artifact carries `placeholder: false`, a `git_sha` and a `created_at`. A number
  that has not been computed cannot silently reach a reader; the dashboard renders a banner
  naming any fixture.
- The tabular run **reproduces byte-for-byte** on a second execution.
- The agentic corpus **replays entirely from cache with no network**.
- The browser detector agrees with the ONNX export to **1.71e-07**, and the TypeScript defence
  port agrees with the Python one on all 144 documents and 360 spans — both enforced by checks
  that fail the build.
- 106 tests.

### Limitations we state rather than wait to be asked

- Sparkov is simulator-generated; read accuracy as relative across rounds, not as production
  expectations. We chose a weaker dataset that supports a real claim over a stronger one that
  supports a fake one — `creditcard.csv` is PCA-anonymised, so the constraint story is
  *undefined* on it.
- The payment agent is a mock, with simulated tools and a simulated ledger.
- Both 120B models were already largely resistant at roughly a 4% baseline; our injection
  corpus is a floor on the attack surface, not a census of it.
- The attacker has white-box query access to a fixed model. ASR is an upper bound on a strong
  attacker, not a forecast of live losses.
- Three of the five in-depth threat vectors are mapped, not implemented — deliberately.
  Breadth in identifying the surface, depth in the two we could measure end to end.

### Errors we caught in our own work

Documented in §3.4 of the walkthrough, because a judge who sees we found them first can trust
the rest: an attack scoring 100% by surrendering 88% of the transaction value; a missing
measurement rendered as a confident zero on a chart; an operating threshold fitted on the same
rows the attack was scored against; and our own explanation for the flat attack success —
"the dosage was too small" — refuted by our own sweep.
