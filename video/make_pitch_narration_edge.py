"""Render the pitch narration with Microsoft Edge's neural voices instead of Windows SAPI.

    python make_pitch_narration_edge.py            # scenes with no WAV yet
    python make_pitch_narration_edge.py --force    # every scene (overwrites human takes too)

Same contract as make_pitch_narration.ps1: one WAV per scene id in audio_pitch/, so
build_pitch.mjs cannot tell the two apart. The difference is the voice. SAPI's desktop
voices read a 300-second script as a warning label; the neural voices carry a sentence.
Needs the network once per line and `uvx` (uv) on PATH; no key, no account.

The voice is `edge_voice` in pitch_narration.json. Preview one line before committing to a
voice:  uvx edge-tts --voice en-US-AndrewNeural --text "..." --write-media probe.mp3
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "audio_pitch"


def render(text: str, voice: str, rate: str, wav: Path) -> float:
    mp3 = wav.with_suffix(".mp3")
    subprocess.run(
        ["uvx", "edge-tts", "--voice", voice, "--rate", rate, "--text", text,
         "--write-media", str(mp3)],
        check=True,
    )
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ar", "48000", "-ac", "1",
         str(wav)],
        check=True,
    )
    mp3.unlink()
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
         str(wav)],
        check=True, capture_output=True, text=True,
    )
    return float(probe.stdout.strip())


def main() -> int:
    force = "--force" in sys.argv
    cfg = json.loads((HERE / "pitch_narration.json").read_text(encoding="utf-8-sig"))
    voice = cfg.get("edge_voice", "en-US-AndrewNeural")
    rate = cfg.get("edge_rate", "+0%")
    OUT.mkdir(exist_ok=True)
    total = 0.0
    for scene in cfg["scenes"]:
        wav = OUT / f"{scene['id']}.wav"
        if wav.exists() and not force:
            print(f"{scene['id']:<4} kept (take present)")
            continue
        secs = render(scene["text"], voice, rate, wav)
        total += secs
        print(f"{scene['id']:<4} {voice} {secs:6.1f}s / target {scene['seconds']}s")
    print(f"rendered total {total:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
