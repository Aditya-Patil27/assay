# Record one scene's narration from the microphone into audio_pitch/<scene>.wav.
#
#   powershell -File rec.ps1 -Scene s3
#
# Prints the line and its target length, then records until you type q and Enter.
# Re-run the same scene to retake it. Any recorder that writes audio_pitch/<id>.wav works too.
param(
    [Parameter(Mandatory = $true)][string]$Scene,
    [string]$Device = "Microphone Array (AMD Audio Device)"
)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $here "pitch_narration.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$s = $cfg.scenes | Where-Object { $_.id -eq $Scene }
if (-not $s) { Write-Error "no scene '$Scene' in pitch_narration.json"; exit 1 }
$out = Join-Path $here "audio_pitch"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$wav = Join-Path $out ($Scene + ".wav")

Write-Host ""
Write-Host ("[{0}]  target {1}s{2}" -f $Scene, $s.seconds, $(if ($s.clip) { "  (clip scene: fit the slot build_pitch prints)" } else { "" }))
Write-Host ""
Write-Host $s.text
Write-Host ""
Write-Host "Recording. Type q then Enter to stop."
ffmpeg -y -loglevel error -f dshow -i "audio=$Device" -ac 1 -ar 48000 $wav
$secs = ffprobe -v error -show_entries format=duration -of csv=p=0 $wav
Write-Host ("saved {0}  ({1:N1}s)" -f $wav, [double]$secs)
