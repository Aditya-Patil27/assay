#!/usr/bin/env bash
# Concatenate the per-scene narration and mux it onto the recording.
#
# The lead-in is measured, not assumed: the recording contains page load plus a settle
# before scene 1's narration starts, and that varies with network. Deriving it from the
# actual video duration keeps audio and video aligned without anyone eyeballing it.
set -euo pipefail
cd "$(dirname "$0")"

NARR=$(python -c "import json;print(sum(d['seconds'] for d in json.load(open('audio/durations.json',encoding='utf-8-sig'))))")
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 raw/walkthrough.webm)
MS=$(python -c "print(max(int((float('$DUR')-0.6-float('$NARR'))*1000),0))")
echo "narration ${NARR}s | video ${DUR}s | lead-in ${MS}ms"

python -c "
import json,pathlib
scenes=json.load(open('script.json',encoding='utf-8'))['scenes']
pathlib.Path('audio/list.txt').write_text('\n'.join(f\"file '{s['id']}.wav'\" for s in scenes)+'\n',encoding='utf-8')
"
ffmpeg -y -loglevel error -f concat -safe 0 -i audio/list.txt -c:a pcm_s16le audio/narration.wav
ffmpeg -y -loglevel error -i raw/walkthrough.webm -i audio/narration.wav \
  -filter_complex "[1:a]adelay=${MS}|${MS},apad[a]" \
  -map 0:v -map "[a]" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -shortest -movflags +faststart \
  adversarial-payments-walkthrough.mp4

ffprobe -v error -show_entries format=duration,size -of default=nw=1 adversarial-payments-walkthrough.mp4
