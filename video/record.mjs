/**
 * Record a narrated walkthrough of the deployed dashboard.
 *
 * Each shot is held for exactly as long as its narration WAV, so the audio and video line
 * up without editing. That is the whole reason the narration is rendered first: guessing
 * shot lengths and then trimming to fit is the part of making a demo that eats an evening.
 *
 * Records the LIVE deployed URL rather than a local build, so what ships in the video is
 * what a judge opening the link actually sees.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = JSON.parse(fs.readFileSync(path.join(here, "script.json"), "utf8"));
// PowerShell's Set-Content -Encoding UTF8 writes a BOM, which JSON.parse rejects.
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
const durations = readJson(path.join(here, "audio", "durations.json"));
const secondsFor = (id) =>
  (durations.find((d) => d.id === id) || { seconds: 6 }).seconds;

const OUT = path.join(here, "raw");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();

console.log("opening", script.url);
await page.goto(script.url, { waitUntil: "networkidle", timeout: 120_000 });

// Recharts and React Flow animate on mount; let them settle before the first shot so the
// opening frames are not a half-drawn chart.
await sleep(2500);

const timeline = [];
let elapsed = 0;

for (const scene of script.scenes) {
  const hold = secondsFor(scene.id);
  const target = scene.selector
    .split(",")
    .map((s) => s.trim())
    .find((sel) => true);

  const found = await page.evaluate((selectors) => {
    for (const sel of selectors.split(",").map((s) => s.trim())) {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return sel;
      }
    }
    window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
    return null;
  }, scene.selector);

  if (!found) {
    console.warn(`  ! ${scene.id}: no element matched "${scene.selector}" — scrolled on`);
  }

  timeline.push({ id: scene.id, start: elapsed, hold });
  console.log(
    `  ${scene.id.padEnd(14)} ${String(hold).padStart(6)}s  ${found ?? "(fallback scroll)"}`,
  );

  await sleep(hold * 1000);
  elapsed += hold;
}

await sleep(600); // let the last frame land
await context.close();
await browser.close();

const produced = fs.readdirSync(OUT).filter((f) => f.endsWith(".webm"));
if (produced.length !== 1) throw new Error(`expected 1 video, got ${produced.length}`);
const final = path.join(OUT, "walkthrough.webm");
fs.renameSync(path.join(OUT, produced[0]), final);
fs.writeFileSync(
  path.join(here, "timeline.json"),
  JSON.stringify({ total: elapsed, scenes: timeline }, null, 2) + "\n",
);

console.log(`\nwrote ${final}`);
console.log(`total ${elapsed.toFixed(1)}s across ${timeline.length} scenes`);
