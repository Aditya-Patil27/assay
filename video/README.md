# Assay — demo video pipeline

Generates a narrated 97-second animated explainer of the system, start to finish, with no
editing and no paid services.

```bash
cd video
npm install && npx playwright install chromium      # once
powershell -File make_wf_narration.ps1              # narration WAVs, one per scene
node record_workflow.mjs                            # records workflow.html
# then pad each clip to its scene slot, concat, and mux (see "Rebuilding" below)
```

Output: `assay-workflow.mp4` — 1920x1080 H.264 + AAC, ~97s, ~5.5 MB.

## What it is

Nine scenes of motion graphics, not a screen recording. The pipeline lighting up node by
node, the three constraint tiers, a live score readout falling from 0.954 to 0.000 as the
hour changes, the flat attack-success bars, the dosage sweep, the 99.9% feasibility split,
the scorecard, and a closing card.

An earlier version screen-recorded the deployed dashboard with a voiceover over it. That
showed what the page looks like rather than what the system does, and spent most of 3m17s
scrolling. This replaced it.

## Why it is built this way

**Narration is rendered first; each scene is then held for exactly the length of its own
audio.** Guessing shot lengths and trimming to fit afterwards is the part of making a demo
that eats an evening. Here the timing falls out of the audio, so `workflow_narration.json`
is the only file anyone edits — the spoken words and the scene they belong to live together
and cannot drift apart.

Re-timing is not optional after an edit. Changing a line changes its clip length, and a
scene whose slot is now too short trims the line mid-sentence. Both times that happened it
was caught by re-deriving every slot from its measured clip rather than by listening.

**The page publishes its own runtime.** `record_workflow.mjs` reads `window.TOTAL_MS`
instead of guessing how long to hold. Anything driven by wall-clock jitter would desync from
the narration and would not reproduce the same frames on a rerun.

**Windows SAPI rather than a cloud TTS.** No key, no upload, no network, no per-character
cost. The voice is audibly synthetic, which is a fair trade for a demo of an engineering
result — and re-recording after a number changes is one command instead of another take.

**Scene order is deliberate.** The feasibility audit is second, not last: 99.9% of the
unconstrained attacker's evasions sitting at a merchant that does not exist is the only
genuinely novel result here and it lands in thirty seconds. Opening on an architecture
diagram is the forgettable choice.

## Rebuilding after the numbers change

Every figure on screen is read from a committed artifact. If a result moves, the video is
wrong until it is rebuilt — so rebuild rather than patching the narration by hand:

1. Update the figures in `workflow.html` and the wording in `workflow_narration.json`.
2. `powershell -File make_wf_narration.ps1` — regenerates the clips and prints any that
   overrun their slot.
3. Re-time any scene that overran, then `node record_workflow.mjs`.
4. Pad each clip to its slot with `ffmpeg -af apad=whole_dur=<seconds> -t <seconds>`,
   concat, and mux onto the recording.

`make_narration.ps1`, `record.mjs`, `mux.sh` and `script.json` belong to the retired
dashboard-walkthrough version and are kept only because the approach may be worth reviving
for a longer-form demo. The shipped video does not use them.
