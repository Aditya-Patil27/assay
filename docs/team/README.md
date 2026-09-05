# Start here

> ## ⏰ Deadline: **Aug 31 2026, 11:59 PM IST**
>
> Not Sep 1 — an earlier version of our plan said that, and it was wrong by a day.
>
> **We submit three things** through the Kaggle *Writeups* section:
> 1. This GitHub repo
> 2. A `.docx` walkthrough document
> 3. A working web prototype (a live URL)
>
> **No video is needed.** **A draft writeup is not judged** — saved as a draft counts as not
> submitted at all.

---

## What we're building, in one paragraph

Banks use machine-learning models to catch fraudulent card transactions. Those models get
tested against fraud that *already happened*. Nobody tests them against an attacker who
adapts. So we built the attacker.

Our system runs a loop: attack the fraud detector until it's fooled → measure how often that
worked → retrain the detector on those attacks → attack again. Round after round, the attack
should stop working. **That "it worked, then it stopped working" curve is our submission.**
We then do the same thing to a second, completely different target — an AI payment assistant
that can be tricked by hidden instructions — to show the method generalises.

The headline number is **ASR (Attack Success Rate)**: out of 100 attempts to fool the
detector, how many succeeded.

---

## New to working with AI coding agents? Read this part twice.

You don't need to write this code yourself. You need to **direct** an agent and then **check
its work**. The second skill is the one people skip, and it's the one that matters here.

### The loop you'll be in

1. Open Claude Code in the project folder
2. Paste the **Part 2** block from your brief
3. It writes code and runs tests
4. **You verify it did what it claims**
5. Commit and push

### Four ways an AI agent will mislead you without lying

Not malice — these failures genuinely look like success from the outside.

| What you'll see | What might really be happening | What to ask |
|---|---|---|
| "All tests pass ✅" | It wrote tests that can't fail | *"Show me the test failing first, then passing."* |
| "PR-AUC is 0.99 — excellent!" | The model is seeing the future. That's a bug called leakage. | On our data, **anything above 0.95 is wrong**. Ours is 0.829. |
| "Attack success rate: 100%!" | It won by cheating, not by being clever | *"What did the attacker give up to get this? Is that realistic?"* |
| "I've implemented X" | The code exists but never actually ran | *"Paste the real terminal output."* |

Row three is not hypothetical. **It happened on this project today.** The attack was scoring a
perfect 100% by shrinking transactions to 12% of their value. A fraudster who hands back 88%
of the money hasn't evaded anything — they've surrendered. It was caught because someone
asked what the attacker was giving up. The fix took three code changes and five new tests.

### Three sentences worth memorising

> "Run it and paste me the real output."
> "What would make this number wrong?"
> "Write the test first, watch it fail, then fix it."

### The rule that keeps us honest

**If a number isn't produced by code in this repo, it doesn't go in the submission.**

There's a safety net. Every result file is flagged `placeholder: true` until it's real, and
the website displays a large amber banner naming exactly which numbers are still fake. So
leaving something unfinished is completely safe — the banner tells the truth on your behalf.
What is *not* safe is replacing a fake number with a plausible-sounding invented one.

---

## Who does what

Each person owns their own folders, so you can't overwrite each other.

| | Owner | Your brief | Your folders |
|---|---|---|---|
| **P1** | Detector & data | [P1-detector.md](P1-detector.md) | `src/adversarial_payments/{data,detect,serving}/`, `scripts/` |
| **P2** | Attack engine | [P2-attack.md](P2-attack.md) | `src/adversarial_payments/{attack,loop}/` |
| **P3** | AI agent red team | [P3-agentic.md](P3-agentic.md) | `src/adversarial_payments/agentic/` |
| **P4** | Website | [P4-dashboard.md](P4-dashboard.md) | `web/` |
| **P5** | Writeup & submission | [P5-comms.md](P5-comms.md) | `docs/` |

**Read only your own brief.** They're self-contained deliberately.

Each brief has two parts:
- **Part 1 — for you.** Plain language: what you're building, why it matters, what done means.
- **Part 2 — for your AI agent.** A technical spec you paste in verbatim.

| | |
|---|---|
| Setting up, or something broke? | → [BUILD.md](BUILD.md) |
| What's actually finished right now? | → [STATUS.md](STATUS.md) — the live board, check it each morning |

---

## Where we stand (Aug 30)

| Piece | State |
|---|---|
| Real fraud data | ✅ 1.85M transactions, 0.52% fraudulent |
| Fraud detector | ✅ PR-AUC 0.829 — good, and honest |
| Speed measurement | ⚠️ 6.6 ms, but measured the wrong way — re-run before quoting |
| **Attack success rate** | 🔴 **The headline number. The critical path.** |
| AI agent red team | 🟡 Harness works, but on scripted fake responses — needs a real API key |
| Website | ✅ Builds and tells the whole story |
| Writeup | 🟡 In progress |

[STATUS.md](STATUS.md) is the authoritative version of this table.

---

## Setup

Full detail in [BUILD.md](BUILD.md). Short version:

```bash
git clone https://github.com/Aditya-Patil27/assay.git
cd assay

uv venv --python 3.12          # exactly 3.12 — 3.13 and 3.14 will fail
uv pip install -e ".[dev]"
pytest -q                      # should be all green

cd web && npm install && npm run dev    # the website at localhost:3000
```

Need access? Ask Aditya to run:

```bash
gh repo add-collaborator Aditya-Patil27/assay <your-username> --permission push
```

---

## Saving your work

Do this **at least hourly**. Right now a large amount of this project's real code exists only
on one laptop and is not backed up anywhere.

```bash
git pull --rebase        # get everyone else's changes first
pytest -q                # check nothing broke
git add <your folders>
git commit -m "what you did"
git push                 # now it's safe
```

**Never commit:** `data/` (too big), `.env` (your API key).
**Always commit:** your `artifacts/*.json` results — those are what make the website work.

---

## The two shared files nobody edits alone

Ask the team first. Everything else inside your own folders is yours to change freely.

**`src/adversarial_payments/schema.py`** — the agreed list of data columns. P1 creates them,
P2 attacks them. It sorts every column into three groups:

- **Frozen** — what an attacker cannot change. The victim's age, their home city. Someone
  using stolen card details inherits these.
- **Coupled** — what moves *together*. Choosing a different shop changes the shop's category,
  its location, and the distance from the victim's home all at once. Changing one alone would
  describe a transaction that couldn't physically exist.
- **Mutable** — what the attacker really controls: the amount, the timing, the pacing.

**`artifacts.py` + `web/lib/types.ts`** — the agreed format for result files. The Python code
and the website must describe results identically; a test fails if they drift apart.

---

## Dates

| When | What | Who |
|---|---|---|
| Aug 30 (today) | A real attack success rate exists | P2 |
| Aug 30 evening | Real API key wired into the agent red team | P3 |
| **Aug 31 morning** | Code frozen. Website deployed and publicly reachable. | all |
| **Aug 31, 11:59 PM IST** | **Submitted — published, not draft** | P5 |

Aim to submit by afternoon. The final hours are when things break.
