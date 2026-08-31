# Demo video pipeline

Generates a narrated 3-minute walkthrough of the deployed dashboard, start to finish, with
no editing and no paid services.

```bash
cd video
npm install && npx playwright install chromium     # once
powershell -File make_narration.ps1                # narration WAVs + durations
node record.mjs                                    # records the LIVE site
bash mux.sh                                        # -> adversarial-payments-walkthrough.mp4
```

Output: 1920x1080 H.264 + AAC, roughly 3m15s and 17 MB.

## Why it is built this way

**Narration is rendered first, then each shot is held for exactly that long.** Guessing shot
lengths and trimming to fit afterwards is the part of making a demo that eats an evening.
Here the timing falls out of the audio, so `script.json` is the only thing anyone edits: the
spoken words and the section each is spoken over live in one file and cannot drift apart.

**It records the deployed URL, not a local build.** What ships in the video is what a judge
opening the link actually sees. A local-only recording could show a page that no longer
matches what is published.

**Windows SAPI rather than a cloud TTS.** No key, no upload, no network, no per-character
cost. The voice is unmistakably synthetic, which is a fair trade for a demo of an
engineering result -- and re-recording after a numbers change is one command rather than
another take.

**Scene order is deliberate.** The feasibility audit comes second, not last. It is the only
genuinely novel result and it lands in thirty seconds; opening with an architecture diagram
is the forgettable choice most submissions make.

## Keeping it honest

Every number spoken is read from a committed artifact carrying `placeholder: false`. If a
figure in `script.json` stops matching `artifacts/`, the video is wrong -- so re-run the
pipeline after any result changes rather than patching the narration by hand.

The `#feasibility`, `#tabular`, `#coevolution`, `#scorecard` and `#graph` anchors come from
`web/app/page.tsx`. Renaming a section id there silently breaks the shot: `record.mjs` warns
and scrolls on rather than failing, so check its output for `!` lines.
