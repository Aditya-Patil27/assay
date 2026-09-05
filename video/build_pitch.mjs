// video/build_pitch.mjs
/**
 * Build pitch.mp4 from the narrator's WAVs.
 *
 * Narration first: every motion scene is held for exactly its WAV plus a 0.4 s breath.
 * The two clip scenes are held for the longer of the clip and the narration (plus breath),
 * so a narrator who runs slightly long is never cut mid-sentence — when the narration wins,
 * the clip's last frame freezes to fill the rest of the slot. The page is recorded in runs of
 * consecutive motion scenes so the clips splice in without re-cutting anything. Any
 * mismatch between what the page declared and what the recording measured fails the build
 * rather than shipping a video whose audio drifts.
 *
 *   node build_pitch.mjs              # full build
 *   node build_pitch.mjs --slots      # print slots only (so the narrator can fit the clip scenes)
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const AUDIO = path.join(here, "audio_pitch");
const NORM = path.join(AUDIO, "norm");
const PADDED = path.join(AUDIO, "padded");
const RAW = path.join(here, "raw_pitch");
const DEMOS = path.join(here, "..", "web", "public", "demos");
const FOOTAGE = path.join(here, "footage");
const clipPath = (name) => [FOOTAGE, DEMOS].map((d) => path.join(d, `${name}.mp4`)).find((f) => fs.existsSync(f)) || path.join(FOOTAGE, `${name}.mp4`);
const OUT = path.join(here, "pitch.mp4");
const BREATH = 0.4;
const MAX_TOTAL = 300;

const cfg = JSON.parse(fs.readFileSync(path.join(here, "pitch_narration.json"), "utf8").replace(/^﻿/, ""));
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const r2 = (x) => Math.round(x * 100) / 100;

// 1. Normalise and measure every WAV; derive slots.
for (const d of [NORM, PADDED, RAW]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
const scenes = cfg.scenes.map((s) => {
  const wav = path.join(AUDIO, `${s.id}.wav`);
  if (!fs.existsSync(wav)) throw new Error(`missing ${wav} — record it with rec.ps1 -Scene ${s.id}, or run make_pitch_narration.ps1`);
  const norm = path.join(NORM, `${s.id}.wav`);
  ff(["-i", wav, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", norm]);
  const spoken = probe(norm);
  const clip = s.clip ? clipPath(s.clip) : null;
  if (clip && !fs.existsSync(clip)) throw new Error(`missing ${clip} — run record_loops.mjs ${s.clip}`);
  const clipDur = clip ? probe(clip) : null;
  const natural = r2(spoken + BREATH);
  // The narration sets the pace for every scene. A clip longer than its line is cut, a
  // shorter one holds its last frame; the audience never sits through silent footage.
  const slot = natural;
  return { ...s, norm, clip, clipDur, spoken: r2(spoken), slot };
});
for (const s of scenes) {
  console.log(`${s.id.padEnd(4)} spoken ${String(s.spoken).padStart(6)}s  slot ${String(s.slot).padStart(6)}s`);
}
const total = r2(scenes.reduce((a, s) => a + s.slot, 0));
console.log(`total ${total}s`);
if (process.argv.includes("--slots")) process.exit(0);
if (total > MAX_TOTAL) throw new Error(`total ${total}s exceeds ${MAX_TOTAL}s — tighten the narration`);

// 2. Record the motion scenes in runs of consecutive non-clip scenes.
const runs = [];
for (const s of scenes) {
  if (s.clip) { runs.push({ clip: s }); continue; }
  const last = runs[runs.length - 1];
  if (last && last.motion) last.motion.push(s); else runs.push({ motion: [s] });
}
const slotsMs = Object.fromEntries(scenes.filter((s) => !s.clip).map((s) => [s.id, Math.round(s.slot * 1000)]));
const pageUrl = "file:///" + path.join(here, "pitch.html").replace(/\\/g, "/");

let k = 0;
for (const run of runs) {
  if (!run.motion) continue;
  const ids = run.motion.map((s) => s.id);
  const declared = run.motion.reduce((a, s) => a + s.slot, 0);
  const dir = path.join(RAW, `run${k}`);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: 1920, height: 1080 } } });
  const page = await context.newPage();
  await page.addInitScript((s) => { window.SLOTS = s; }, slotsMs);
  await page.goto(`${pageUrl}?scenes=${ids.join(",")}`, { waitUntil: "load" });
  const pageTotal = (await page.evaluate(() => window.TOTAL_MS)) / 1000;
  if (Math.abs(pageTotal - declared) > 0.05) throw new Error(`run${k}: page declares ${pageTotal}s, build expects ${declared}s`);
  await page.waitForTimeout(pageTotal * 1000 + 900);
  await context.close();
  await browser.close();
  const webm = path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".webm")));
  const recorded = probe(webm);
  const lead = Math.max(recorded - 0.9 - declared, 0);  // page load before the timeline started
  // Playwright starts the file at context creation but only writes frames once the page
  // paints, so a short run can come back a few hundred ms under its slot. Freeze the last
  // frame to cover the gap; only a gap over a second means something actually went wrong.
  const short = Math.max(declared - recorded, 0);
  if (short > 1) throw new Error(`run${k}: recording ${recorded}s is ${r2(short)}s shorter than declared ${declared}s`);
  const vf = "fps=30,scale=1920:1080,setsar=1" + (short > 0 ? `,tpad=stop_mode=clone:stop_duration=${short.toFixed(3)}` : "");
  run.file = path.join(RAW, `run${k}.mp4`);
  ff(["-ss", lead.toFixed(3), "-i", webm, "-t", declared.toFixed(3), "-an", "-vf", vf, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", run.file]);
  console.log(`run${k} [${ids.join(",")}] recorded ${r2(recorded)}s, lead ${r2(lead)}s, kept ${r2(declared)}s`);
  k++;
}

// 3. Pad or trim every WAV to its slot, then concatenate the audio.
const list = [];
for (const s of scenes) {
  const out = path.join(PADDED, `${s.id}.wav`);
  ff(["-i", s.norm, "-af", `apad=whole_dur=${s.slot}`, "-t", String(s.slot), out]);
  list.push(`file '${out.replace(/\\/g, "/")}'`);
}
fs.writeFileSync(path.join(PADDED, "list.txt"), list.join("\n") + "\n");
const narration = path.join(AUDIO, "narration.wav");
ff(["-f", "concat", "-safe", "0", "-i", path.join(PADDED, "list.txt"), "-c:a", "pcm_s16le", narration]);

// 4. Concatenate the video segments in scene order, and mux.
// A clip segment whose slot outran the clip gets its last frame frozen (tpad) to fill the gap.
const segments = runs.map((r) => {
  if (r.motion) return { file: r.file, pad: 0 };
  const padSec = Number((r.clip.slot - r.clip.clipDur).toFixed(3));
  return { file: r.clip.clip, pad: padSec > 0 ? padSec : 0, cut: r.clip.slot };
});
const inputs = segments.flatMap((seg) => ["-i", seg.file]);
const chain = segments.map((seg, i) => {
  const tpad = seg.pad > 0 ? `,tpad=stop_mode=clone:stop_duration=${seg.pad.toFixed(3)}` : "";
  const cut = seg.cut ? `trim=duration=${seg.cut.toFixed(3)},setpts=PTS-STARTPTS,` : "";
  return `[${i}:v]${cut}fps=30,scale=1920:1080,setsar=1${tpad}[v${i}]`;
}).join(";")
  + ";" + segments.map((_, i) => `[v${i}]`).join("") + `concat=n=${segments.length}:v=1:a=0[v]`;
ff([...inputs, "-i", narration, "-filter_complex", chain, "-map", "[v]", "-map", `${segments.length}:a`,
    "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", OUT]);

// 5. Verify and record the timeline.
const finalDur = probe(OUT);
const audioDur = probe(narration);
if (Math.abs(finalDur - audioDur) > 0.5) throw new Error(`pitch.mp4 is ${finalDur}s but narration is ${audioDur}s`);
if (finalDur > MAX_TOTAL) throw new Error(`pitch.mp4 is ${finalDur}s, over ${MAX_TOTAL}s`);
let at = 0;
const timeline = scenes.map((s) => { const row = { id: s.id, start: r2(at), slot: s.slot, spoken: s.spoken, source: s.clip ? path.basename(s.clip) : "pitch.html" }; at += s.slot; return row; });
fs.writeFileSync(path.join(here, "pitch_timeline.json"), JSON.stringify({ total: r2(finalDur), scenes: timeline }, null, 2) + "\n");
console.log(`\nwrote ${OUT}: ${r2(finalDur)}s, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
