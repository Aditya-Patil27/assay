# Render one WAV per animation scene. Padding/trimming to the scene length happens in
# ffmpeg afterwards, so a line that runs slightly long is clipped rather than pushing every
# later scene out of sync.

Add-Type -AssemblyName System.Speech

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "audio_wf"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out | Out-Null

$cfg = Get-Content (Join-Path $here "workflow_narration.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $synth.SelectVoice($cfg.voice) } catch { Write-Output "voice '$($cfg.voice)' unavailable, using default" }
$synth.Rate = $cfg.rate

foreach ($scene in $cfg.scenes) {
    $wav = Join-Path $out ($scene.id + ".wav")
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($scene.text)
    $synth.SetOutputToNull()
    $secs = [math]::Round(((Get-Item $wav).Length - 44) / (22050.0 * 2), 2)
    $flag = if ($secs -gt $scene.seconds) { "  OVER -> will be trimmed" } else { "" }
    Write-Output ("{0,-4} spoken {1,5:N2}s / slot {2,5:N2}s{3}" -f $scene.id, $secs, $scene.seconds, $flag)
}
$synth.Dispose()
Write-Output "done"
