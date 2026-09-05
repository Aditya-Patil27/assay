# SAPI fallback: render every scene that has no WAV yet, so the pitch builds with or
# without a human take. -Force re-renders everything (it will overwrite human takes).
param([switch]$Force)
Add-Type -AssemblyName System.Speech
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "audio_pitch"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$cfg = Get-Content (Join-Path $here "pitch_narration.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($cfg.voice) } catch { Write-Output "voice '$($cfg.voice)' unavailable, using default" }
$synth.Rate = $cfg.rate

foreach ($scene in $cfg.scenes) {
    $wav = Join-Path $out ($scene.id + ".wav")
    if ((Test-Path $wav) -and -not $Force) { Write-Output ("{0,-4} kept (human take present)" -f $scene.id); continue }
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($scene.text)
    $synth.SetOutputToNull()
    $secs = [math]::Round(((Get-Item $wav).Length - 44) / (22050.0 * 2), 2)
    Write-Output ("{0,-4} synthetic {1,5:N1}s / target {2}s" -f $scene.id, $secs, $scene.seconds)
}
$synth.Dispose()
