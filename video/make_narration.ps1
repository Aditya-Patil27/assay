# Render one WAV per scene with the Windows speech synthesiser, and report each
# clip's duration so the recorder can hold every shot exactly as long as its narration.
#
# Windows SAPI rather than a cloud TTS on purpose: no key, no upload, no network, and the
# narration text is read from script.json so the voiceover cannot drift from what the
# scene list says.

Add-Type -AssemblyName System.Speech

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "audio"
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

$script = Get-Content (Join-Path $here "script.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
# Hazel reads technical copy more evenly than David; -1 slows it just under default,
# which matters because these lines carry a lot of digits.
try { $synth.SelectVoice("Microsoft Hazel Desktop") } catch { }
$synth.Rate = -1

$manifest = @()
foreach ($scene in $script.scenes) {
    $wav = Join-Path $out ($scene.id + ".wav")
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($scene.narration)
    $synth.SetOutputToNull()

    $reader = New-Object System.Media.SoundPlayer $wav
    $reader.Load()
    $bytes = (Get-Item $wav).Length
    # SAPI writes 16-bit mono PCM at 22.05 kHz; 44 bytes of header.
    $seconds = [math]::Round(($bytes - 44) / (22050.0 * 2), 2)

    Write-Output ("{0,-14} {1,6:N2}s  {2}" -f $scene.id, $seconds, $wav)
    $manifest += [pscustomobject]@{ id = $scene.id; wav = $wav; seconds = $seconds }
}
$synth.Dispose()

$manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $out "durations.json") -Encoding UTF8
$total = ($manifest | Measure-Object -Property seconds -Sum).Sum
Write-Output ("total narration: {0:N1}s" -f $total)
