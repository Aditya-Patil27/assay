# P4 — Website

> **⏰ Aug 31, 11:59 PM IST.** Your website is now one of the three graded deliverables, not
> a demo aid. That changed today.

---

# Part 1 — For you

## What you're building, in plain terms

The website that shows a judge what we did, in about ninety seconds of scrolling.

It's deliberately simple under the hood: **it does no work.** Every other track writes its
results into small JSON files, and your site just reads those and draws them. No server, no
database, no Python running anywhere. The whole thing compiles down to plain HTML and
JavaScript that could be opened from a USB stick.

That was a design choice with a purpose. It means the demo cannot break during judging.
Nothing is training, nothing is calling an API, nothing can time out.

## Your job got more important today

We confirmed the submission requirements. It's three artifacts: the GitHub repo, a `.docx`
walkthrough, and **a working web prototype**.

That third one is yours. It's not a nice-to-have supporting the writeup any more — **it is
one of the three things being graded.** If the URL doesn't load for a judge, we lose a third
of what we submitted.

## Where you are

The site is built and it works. It shows the headline numbers, the framework scorecard, the
attack-versus-detector chart, an interactive diagram of the whole loop, worked examples of
individual attacks, and the AI-agent results. It builds cleanly to a static export.

Two things to know:

**Nobody has confirmed the exported site opens standalone.** It builds. That's not the same
as verifying the output folder actually works when opened directly, which is exactly the
scenario a judge might hit.

**The amber banner is currently doing real work.** Five of six result files are still
placeholders, so the site is correctly announcing which numbers are fake. Do not remove or
soften that banner. It disappears by itself as the other tracks finish. It is the mechanism
that lets everyone else ship honestly.

## What's left

1. **Deploy it and get a public URL.** Highest priority — do it now, before it's polished.
   A live link the team can watch fill in with real numbers is worth more than a perfect
   local build.
2. **Check it in a real browser.** Including on a phone. Judges browse on phones.
3. **Verify the static export opens standalone**, not just that the build command succeeded.
4. **Re-sync as other tracks land real numbers**, and watch the banner clear.
5. **Run the reproducibility checks** — you own verifying the claims we make to judges.

## What "done" looks like

- A public URL that loads from a logged-out browser on a phone
- No amber banner (because everyone's numbers are real)
- The fraud-detector attack chart shows a real falling line
- Fresh clone → follow BUILD.md → it works

## How to check your agent isn't fooling you

| If it says | Ask |
|---|---|
| "The build succeeded" | *"Open the exported output and confirm the page actually renders — a build passing isn't a page working."* |
| "It's deployed" | *"Give me the URL. I'll open it in a private window."* |
| "It's responsive" | *"Show me at 375px wide. Does anything overflow horizontally?"* |
| "I updated the data" | *"Did you re-run the sync? The site reads a copy, not the original."* |

**Test the deployed URL in a private/incognito window.** A link that works only because
you're logged in is the classic way to lose points on finished work.

## One design note

Do **not** use Mastercard's logo, colours or branding. This is an entry to their challenge,
not a Mastercard product, and dressing it up as one reads badly to the people judging it.

---

# Part 2 — Paste this to your AI agent

```
You are working on the P4 dashboard track of an adversarial ML project.

CONTEXT
Read first:
  docs/team/BUILD.md
  web/lib/load.ts, web/lib/types.ts     (the data contract)
  web/app/page.tsx, web/components/**   (EXISTING, working)

The dashboard is BUILT and building cleanly. Do not rebuild it. Remaining work is
deployment, verification and polish.

SCOPE -- you may edit ONLY:
  web/**
Do NOT touch anything under src/, scripts/, or docs/.

ARCHITECTURE -- do not fight it
Static export (output: "export"). No backend, no API, no Python at runtime.
  npm run sync   copies artifacts/**.json -> web/public/data/
  Server components read that with fs AT BUILD TIME (lib/load.ts)
  Data is inlined into the HTML: no fetch, no loading state, no spinner during judging
Anything using hooks or React Flow needs "use client". Data loading stays in server
components.

web/lib/types.ts mirrors src/adversarial_payments/artifacts.py. They are one contract in
two languages and tests/test_artifacts.py fails if they drift. If a field changes on the
Python side, mirror it here in the same commit.

CRITICAL CONTEXT CHANGE
The working web prototype is now ONE OF THREE GRADED SUBMISSION ARTIFACTS (alongside the
GitHub repo and a .docx walkthrough). It is no longer demo support. Deployment and public
accessibility are deliverables, not polish.

TASKS, IN PRIORITY ORDER
1. Deploy and produce a PUBLIC URL. Do this before polishing.
     npm run build && npx vercel deploy out --prod
   For GitHub Pages instead: BASE_PATH=/<repo-name> npm run build
   Report the URL. Confirm it loads in a logged-out/incognito session.
2. Verify the static export opens STANDALONE -- not merely that `npm run build` exited 0.
   Serve web/out/ and confirm the page renders with all data present. Report what you
   actually observed, not that the build succeeded.
3. Check rendering in a real browser at 375px, 768px and 1440px. Nothing may scroll
   horizontally. Wide tables and charts scroll inside their own container.
4. Do NOT remove, soften or hide the placeholder banner. Five of six artifacts are
   currently fixtures and the banner naming them is a correctness feature -- it is what
   lets other tracks ship unfinished work honestly. It clears on its own when writers emit
   placeholder=false.
5. Re-run `npm run sync` as other tracks land real artifacts; confirm the banner shrinks.
6. Reproducibility checks -- you own verifying these claims:
     - fresh clone, follow BUILD.md exactly, works
     - pytest -q green
     - loop with --orchestrated and without produce IDENTICAL ASR
     - agentic track replays from cache with no network and no key
     - npm run build from a clean node_modules
   Report honestly if any fails. Do not fix the docs to avoid a failing check.

DESIGN
Palette is in web/app/globals.css: red = attack, teal = defend, amber = warning. Keep that
mapping consistent -- the whole story is one turning into the other.
Do NOT use Mastercard logos, colours or branding. This is a submission to their challenge,
not a Mastercard product.

METHOD
For any claim about how the site looks or behaves, verify it by actually loading the page.
"It builds" is not "it works". Report real observations.
```
