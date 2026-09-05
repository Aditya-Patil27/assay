# Razorpay AI Buildathon — pitch video, audit console, landing-page loops

**Date:** 2026-09-05 (written 11:10 IST)
**Deadline:** 2026-09-05, 23:59 IST. Internal target: everything uploaded by 21:00 IST.
**Track:** Open Track. Rationale in `RAZORPAY_SUBMISSION.md`.
**Builds on:** `RAZORPAY_SUBMISSION.md` §3 items 3–4, `README.razorpay.md`, the existing
`video/` pipeline, and the Samvad audit console
(<https://github.com/Aditya-Patil27/samvad>, `dashboard/index.html`).

---

## 1. What the Buildathon scores, and what that decides

The form asks for: track, project name, problem statement, public repo URL, an **unlisted
5-minute pitch video URL**, and a text answer to **"what broke and how you recovered."**
Four judging parameters: *Problem Taste, Build Quality, AI Judgment, Failure Recovery.*
Guidance: "record it like explaining the build to an engineer, not a recruiter."

Consequences that shape everything below:

- The video is narrated by a **human** (the user), because "ability to explain your build"
  is scored. Synthetic narration stays as the fallback so the video ships regardless.
- **Failure Recovery is a scored criterion.** The repository's four published errors become
  a landing-page section and a video scene, not a footnote.
- **"Show, don't tell, the AI-native part."** The landing page gets silent product loops in
  the style of <https://www.gr-connect.org/> (a heading beside an autoplaying, muted,
  looping `<video>` of the product in use), and the pitch's live-demo scene reuses them.

## 2. The 100% problem, and the framing decision

`artifacts/scorecard.json` says tabular attack success is 1.000 before and after three
rounds of adversarial retraining. That number is committed, published in the README, and
stays. What changes is **what a skimming judge reads first**:

- **Lead** with the two results that landed: the payment agent's exploit rate 4.86% → 0.0%
  (p = 0.015, 0% false refusals) and the feasibility audit (99.9% of an unconstrained
  attacker's evasions sit at a merchant that does not exist).
- **Present the tabular row as a finding about the model-layer defence, priced**:
  adversarial retraining does not stop an adaptive attacker; it raises median queries per
  success from 275 to 391 and costs 1.6% of PR-AUC. The defence therefore has to live
  elsewhere — in the constraint contract and the agent-layer stack. The scorecard still
  renders 1.000 → 1.000 because the artifact says so; the sentence around it says what the
  number means.
- **Never hide it.** Scene 8 and the "What broke" section depend on it being visible.

Nothing in this spec quotes an artifact that lacks `placeholder: false`. The five unflagged
artifacts appear only as amber rows on the audit console, which is the point of the console.

## 3. Deliverables

Three, in build order. A is independent; B needs A's page for one loop; C needs B's loops.

### A. `/audit` — the Samvad console pointed at `artifacts/`

**Purpose.** Make the README's provenance rule visible: every claim carries an
`evidence_type`, and `model_prior` means nothing ran.

**Components.**

1. `scripts/export_audit_frames.py` (repo root, Python 3.12, stdlib only).
   - Walks `artifacts/**/*.json`, skipping `artifacts/agentic/cache/`.
   - Emits `web/public/audit/frames.json`: `{"nodes": [...], "messages": [...]}`.
   - One message per artifact, in the Samvad frame shape (`type`, `lamport`, `sender`
     `"assay"`, `receiver` `"reviewer"`, `performative` `"task_result"`, `task_status`,
     `root_task`, `claims[]`, `artifacts[]`).
   - **Claim text is computed from artifact values, never typed.** Per-artifact extractors:
     scorecard → one claim per row (`"{surface}: attack success {before} → {after}; {cost}"`);
     `attack/rounds` → ASR and median queries per round; `attack/feasibility` → constrained
     vs unconstrained ASR and `impossible_merchant_share`; each `agentic/redteam*.json` →
     summed `success_before`/`success_after` over `attempts`, with the model name;
     `detect/rounds` → PR-AUC per round; `latency` → p50/p95; `guarantees` → count and
     test cases; `graph` → node/edge counts; `live_samples`, `agent_runtime`,
     `detector_trees`, `attack/examples` → a size/shape claim. Unflagged artifacts
     (`adversarial_detection`, `dosage_sweep`, `threshold_sweep`, `data_provenance`,
     `feature_schema`) → their headline field, so the amber row still says something.
   - `evidence` = `"{path} · git_sha {sha} · created {created_at}"`.
   - `evidence_type` = `"test_output"` if `placeholder is False`, else `"model_prior"`.
     `task_status` = `"complete"` / `"uncertain"` accordingly.
   - Ordering: flagged artifacts first by `created_at`, unflagged last, so the replay ends
     on the amber rows.
   - Deterministic output (sorted paths, fixed lamport = index + 1). Exits non-zero if any
     artifact fails to parse; never writes a partial file.
2. `web/public/audit/index.html` — Samvad's `dashboard/index.html` copied verbatim except:
   - `PEERS = ["assay", "reviewer"]`, with roles "red/blue loop" and "you".
   - `live()` is replaced by `replay()`: `fetch("./frames.json")`, feed `nodes` through
     `onNode`, then `messages` through `onMessage` at 400 ms intervals; on fetch failure
     fall back to Samvad's `demo()` with the hint text changed to say the file did not
     load. The header badge reads `artifacts` instead of `live`.
   - A one-line provenance comment at the top naming the upstream file and commit.
3. `web/scripts/sync-artifacts.mjs` additionally runs `python scripts/export_audit_frames.py`
   when the repo root is present and Python is on PATH; failure to run Python is a warning,
   not an error, because `frames.json` is committed. No behaviour change on Vercel.
4. Header link: "Audit" added to `SiteHeader` in `web/components/SiteChrome.tsx`.

**Data flow.** `artifacts/` → `export_audit_frames.py` → `frames.json` → console fetch →
Samvad's own `evidence()` → green/amber pills and the "grounded" KPI.

**Error handling.** Missing artifact directory: script exits 1 with the path. Malformed
JSON: exit 1 naming the file. Console: fetch failure → synthetic demo with an explicit
"frames.json did not load" hint; never a blank page.

**Testing.** `tests/test_export_audit_frames.py`: runs the exporter on a temp directory with
one flagged and one unflagged fixture; asserts evidence types, statuses, ordering, and that
no claim string is empty. Manual: `npm run dev`, open `/audit`, confirm the grounded KPI
equals flagged ÷ total and that the last rows are amber.

### B. Landing page: Razorpay framing, feature loops, "What broke"

**Files.** `web/app/page.tsx`, `web/components/SiteChrome.tsx`, new
`web/components/FeatureLoop.tsx`, new `web/public/demos/{live,agent,audit}.mp4`, new
`video/record_loops.mjs`.

1. **Framing.** The two "Mastercard Innovation Challenge 2026" strings become
   "Razorpay AI Buildathon 2026 · Open Track". Hero `<h1>` becomes the reframed thesis:
   *"The test that tells you which of your security numbers are real."* The three `STEPS`
   entries are rewritten to the §2 framing (problem → what we built → the two results that
   landed, then the priced finding).
2. **Feature loops.** `FeatureLoop` renders a heading, two sentences, a link, and
   `<video src autoPlay muted loop playsInline preload="metadata">` with a poster-free
   black background, matching the reference. Three sections replace the text-only
   capability cards for `/live`, `/agent`, `/audit`; the `/results`, `/attack`, `/system`
   cards stay as a compact row beneath.
   - `video/record_loops.mjs` (Playwright, 1920×1080, `deviceScaleFactor: 1`, page zoom
     1.35 so text is legible at thumbnail size) records three clips from the **deployed**
     site, or `BASE_URL` if set:
     - `live`: open `/live`, scroll the detector into view, drag the range input through
       three positions with 1.5 s holds, click "Run the attack", wait for the result.
     - `agent`: open `/agent`, scroll to "Fire one at a live model", click **Fire with
       defenses OFF**, wait for the outcome panel text, then **Fire with defenses ON**, wait
       again. Retries once on a non-2xx. Timeout 60 s per fire.
     - `audit`: open `/audit`, hold until the replay's "run complete" hint appears, then
       click the last amber row so the detail pane shows "nothing ran — not grounded".
   - ffmpeg transcodes each `.webm` to H.264 `-crf 26 -preset slow`, `faststart`, no audio,
     capped at 25 s; target ≤ 4 MB each (the reference's clips are 2.7–4.1 MB).
3. **"What broke, and how we recovered."** A new section between the stats band and the
   feature loops. Four items, each: one-line error, one-line recovery, and a link to the
   commit that fixed it (`git log --grep` finds the four; the "fourth error" is commit
   `c3b809d`). Content is the README's "What we got wrong, in public" list, unchanged in
   substance. Static JSX, no new artifact.

**Testing.** `npm run typecheck && npm run lint && npm run build` pass. Manual: loops
autoplay on load in Chrome and iOS Safari (playsInline is what makes the latter work).

### C. The 5-minute pitch video

**Principle (unchanged from `video/README.md`).** Narration first; every scene is held for
exactly the length of its own audio. The only file a human edits is the narration JSON.

**Files.** `video/pitch_narration.json`, `video/pitch.html`, `video/record_pitch.mjs`,
`video/rec.ps1`, `video/make_pitch_narration.ps1` (SAPI fallback),
`video/build_pitch.mjs`, output `video/pitch.mp4`.

**Scenes.** Targets are guides for the narrator; actual slots come from the recorded WAVs.

| # | id | Beat | Source | Target |
|---|---|---|---|---|
| 1 | s1 | Assay: an assay determines the true metal in a coin; this one does it to a security number | motion | 15 s |
| 2 | s2 | Problem: a fraud-detection number nobody attacked is decoration; Razorpay's own bar is honest metrics | motion | 25 s |
| 3 | s3 | Result one: payment agent, 4.86% → 0.0%, p = 0.015, 0% false refusals, two 120B models, and the nemotron row that is *not* significant | motion | 30 s |
| 4 | s4 | Result two: the feasibility audit — 99.9% of the naive attacker's identical 100% is impossible transactions | motion | 25 s |
| 5 | s5 | The honest row: tabular ASR 1.000 → 1.000; what it means, priced (275 → 391 queries, −1.6% PR-AUC); so the defence lives elsewhere | motion | 30 s |
| 6 | s6 | Live: `/agent` fires pm-01 with defenses off, then on | `demos/agent.mp4` | slot = clip |
| 7 | s7 | Architecture: one loop, two surfaces, constraint contract at the attack's entry, classifier + tool scoping + HITL on the agent | motion | 45 s |
| 8 | s8 | Audit console: every claim carries evidence; the amber rows are ours too | `demos/audit.mp4` | slot = clip |
| 9 | s9 | What broke and how we recovered: the four errors | motion | 35 s |
| 10 | s10 | Still unverified, and next: per-round PR-AUC, latency; Razorpay surfaces the injection channels map to | motion | 20 s |
| 11 | s11 | Why it should exist; repo, site, `/audit` | motion | 15 s |

Sum of targets ≈ 300 s. Scenes 6 and 8 are capped at 25 s by B.2, so the narrator gets
those two slot lengths before recording.

**pitch.html.** Same stylesheet and scene mechanics as `workflow.html`. Differences:
- Reads `window.SLOTS` (ms per scene id, injected by Playwright before load) instead of a
  hard-coded timeline; `?scenes=s1,s2,s3` selects a subset, so the page is recorded in three
  runs (s1–s5, s7, s9–s11) with no re-encode splitting.
- Every figure shown is one of: scorecard rows, redteam sums and p-values, feasibility
  share, rounds median queries, detect PR-AUC round 0 vs 3. Each is annotated in a comment
  with the artifact path. No unflagged figure appears.

**Recording narration.** `rec.ps1 -Scene s3` prints the line, its target seconds, and
records from the default microphone via `ffmpeg -f dshow` into `audio_pitch/s3.wav`
(48 kHz mono) until Enter. Any recorder that produces a WAV named by scene id also works.
`build_pitch.mjs` normalises loudness (`loudnorm`, one pass) and measures each file with
`ffprobe`.

**build_pitch.mjs.**
1. Slots: motion scenes = WAV duration + 0.4 s; clip scenes = clip duration; narration for
   clip scenes is padded or trimmed to the clip.
2. Records `pitch.html` three times with `SLOTS` injected; verifies each `.webm` is within
   0.3 s of its declared total, otherwise fails.
3. Pads or trims every WAV to its slot (`apad=whole_dur`, `-t`), concatenates audio.
4. Concatenates the five video segments (three motion runs, two clips) via ffmpeg concat
   demuxer with re-encode, muxes audio, `-movflags +faststart`. Fails if final duration is
   not within 0.5 s of the audio total, or exceeds 5:00.
5. Writes `video/pitch_timeline.json` for the README.

**Fallback.** `make_pitch_narration.ps1` renders every line with SAPI into the same
`audio_pitch/` layout. If the user has not recorded by 18:00 IST, the build runs on SAPI so
an upload exists; human takes replace files one by one and the build is re-run.

**Error handling.** Missing WAV for a scene → build stops naming the scene. Live capture
returns an error panel → the loop is re-recorded, never shipped with an error visible.

**Testing.** `ffprobe` on the output: 1920×1080, H.264, AAC, ≤ 300 s. Watch it once end to
end before upload. Upload unlisted to YouTube; test the link in a private window.

## 4. Repository edits outside the three deliverables

- `README.md`: pitch link and `/audit` link in the header block. The full splice from
  `README.razorpay.md` is a separate task and is not part of this spec.
- `video/README.md`: a "Pitch video" section describing rebuild steps.
- `LINKS.md`: pitch URL.

## 5. Out of scope tonight

Razorpay test-mode API integration; the architecture one-pager; OG preview image;
re-running any sweep; any change to committed artifacts.

## 6. Time budget (13 h available)

| Block | Hours | Done by |
|---|---|---|
| A. audit exporter + console + header link | 2.0 | 13:30 |
| B.1 framing + B.3 what-broke section | 1.0 | 14:30 |
| B.2 loops: recorder + three clips + landing sections; deploy | 2.0 | 16:30 |
| C. pitch.html + narration JSON + build script, SAPI dry run | 2.5 | 19:00 |
| User records 11 lines; rebuild with human audio | 1.0 | 20:00 |
| Upload, README links, form | 1.0 | 21:00 |
| Buffer | 3.0 | 23:59 |
