"""Render the pitch narration with Sarvam AI's Bulbul voices (Indian English).

    set SARVAM_API_KEY=...            # never written to a file in this repo
    python make_pitch_narration_sarvam.py            # scenes with no WAV yet
    python make_pitch_narration_sarvam.py --force    # every scene (overwrites human takes too)

Same contract as make_pitch_narration.ps1 and make_pitch_narration_edge.py: one WAV per
scene id in audio_pitch/, 48 kHz mono, so build_pitch.mjs cannot tell the sources apart.
Voice and model come from `sarvam_speaker` / `sarvam_model` in pitch_narration.json.
API: POST https://api.sarvam.ai/text-to-speech, header api-subscription-key, response
{"audios": [base64 wav]}. Bulbul v3 accepts up to 2500 characters; the longest line is ~600.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "audio_pitch"
ENDPOINT = "https://api.sarvam.ai/text-to-speech"


def synth(text: str, key: str, speaker: str, model: str, pace: float) -> bytes:
    body = {
        "text": text,
        "language_code": "en-IN",
        "speaker": speaker,
        "model": model,
        "pace": pace,
        "speech_sample_rate": 48000,
        "output_audio_codec": "wav",
        "enable_preprocessing": True,
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={"api-subscription-key": key, "content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return base64.b64decode(payload["audios"][0])


def duration(wav: Path) -> float:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)],
        check=True, capture_output=True, text=True,
    )
    return float(probe.stdout.strip())


def main() -> int:
    key = os.environ.get("SARVAM_API_KEY", "").strip()
    if not key:
        print("SARVAM_API_KEY is not set", file=sys.stderr)
        return 1
    force = "--force" in sys.argv
    cfg = json.loads((HERE / "pitch_narration.json").read_text(encoding="utf-8-sig"))
    speaker = cfg.get("sarvam_speaker", "aditya")
    model = cfg.get("sarvam_model", "bulbul:v3")
    pace = float(cfg.get("sarvam_pace", 1.0))
    OUT.mkdir(exist_ok=True)
    total = 0.0
    for scene in cfg["scenes"]:
        wav = OUT / f"{scene['id']}.wav"
        if wav.exists() and not force:
            print(f"{scene['id']:<4} kept (take present)")
            continue
        raw = OUT / f"{scene['id']}.sarvam.wav"
        raw.write_bytes(synth(scene["text"], key, speaker, model, pace))
        # Normalise container/rate so every source looks identical downstream.
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-ar", "48000",
                        "-ac", "1", str(wav)], check=True)
        raw.unlink()
        secs = duration(wav)
        total += secs
        print(f"{scene['id']:<4} {model} {speaker} {secs:6.1f}s / target {scene['seconds']}s")
    print(f"rendered total {total:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
