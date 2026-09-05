// video/record_loops.mjs
/**
 * Record the three landing-page loops from the deployed site.
 *
 * Recorded live rather than mocked so what plays on the overview is what a judge gets
 * when they click through. Each clip is trimmed of its first second (page paint) and
 * capped at 25 s, then transcoded to a small H.264 file with no audio track.
 *
 *   node record_loops.mjs            # all three
 *   node record_loops.mjs agent      # one
 *   BASE_URL=http://localhost:3000 node record_loops.mjs audit
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "https://assay-payments.vercel.app";
const RAW = path.join(here, "raw_loops");
const OUT = path.join(here, "..", "web", "public", "demos");
// Pitch-only footage: real pages as b-roll under the narration. Not embedded on the site.
const FOOTAGE = path.join(here, "footage");
const PITCH_ONLY = new Set(["landing", "agent_table", "results", "whatbroke"]);
const MAX_BY_NAME = { landing: 27, agent_table: 41, results: 33, whatbroke: 32 };
const MAX_S = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setRange(page, idx, frac) {
  await page.evaluate(([i, f]) => {
    const el = document.querySelectorAll("input[type=range]")[i];
    if (!el) return;
    const lo = Number(el.min), hi = Number(el.max);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(lo + (hi - lo) * f));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [idx, frac]);
}

const LOOPS = {
  async live(page) {
    await page.goto(`${BASE}/live`, { waitUntil: "networkidle" });
    const first = page.locator("input[type=range]").first();
    await first.waitFor({ timeout: 30_000 });
    await first.scrollIntoViewIfNeeded();
    await sleep(1500);
    for (const f of [0.15, 0.85, 0.5]) {
      await setRange(page, 0, f);
      await sleep(1500);
    }
    await setRange(page, 1, 0.9);
    await sleep(1500);
    const run = page.getByRole("button", { name: "Run the attack" });
    if (await run.isVisible({ timeout: 2000 }).catch(() => false)) {
      await run.click();
      await page.getByRole("button", { name: "searching…" }).waitFor({ state: "hidden", timeout: 30_000 });
    }
    await sleep(4000);
  },

  async agent(page) {
    await page.goto(`${BASE}/agent`, { waitUntil: "networkidle" });
    const off = page.getByRole("button", { name: "Fire with defenses OFF" });
    await off.waitFor({ timeout: 30_000 });
    await off.scrollIntoViewIfNeeded();
    await sleep(1500);
    for (const [btn, label] of [[off, "Defenses off"], [page.getByRole("button", { name: "Fire with defenses ON" }), "Defenses on"]]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        await btn.click();
        await page.getByRole("button", { name: "running…" }).waitFor({ state: "hidden", timeout: 60_000 });
        const failed = await page.getByText(`${label} — failed`).count();
        if (!failed) break;
        console.warn(`  ${label}: failed, retrying once`);
        await sleep(3000);
      }
      await sleep(3500);
    }
    await sleep(2000);
  },

  async landing(page) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await sleep(9000);
    await page.evaluate(() => window.scrollBy({ top: 520, behavior: "smooth" }));
    await sleep(5000);
    await page.evaluate(() => window.scrollBy({ top: 700, behavior: "smooth" }));
    await sleep(6000);
  },

  async agent_table(page) {
    await page.goto(`${BASE}/agent`, { waitUntil: "networkidle" });
    const fig = page.getByText("Exploit rate by OWASP category").first();
    await fig.waitFor({ timeout: 30_000 });
    await fig.scrollIntoViewIfNeeded();
    await sleep(9000);
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: "smooth" }));
    await sleep(8000);
    const two = page.getByText("Measured twice, on two vendors").first();
    if (await two.isVisible({ timeout: 2000 }).catch(() => false)) {
      await two.scrollIntoViewIfNeeded();
      await sleep(9000);
    }
  },

  async results(page) {
    await page.goto(`${BASE}/results`, { waitUntil: "networkidle" });
    await sleep(3000);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy({ top: 560, behavior: "smooth" }));
      await sleep(4500);
    }
  },

  async whatbroke(page) {
    await page.goto(`${BASE}/#what-broke`, { waitUntil: "networkidle" });
    await page.locator("#what-broke").scrollIntoViewIfNeeded();
    await sleep(12000);
    await page.evaluate(() => window.scrollBy({ top: 420, behavior: "smooth" }));
    await sleep(12000);
  },

  async audit(page) {
    await page.goto(`${BASE}/audit`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.getElementById("hint")?.textContent.includes("run complete"), null, { timeout: 30_000 });
    await sleep(800);
    await page.locator("#rows tr").last().click();
    await sleep(3500);
  },
};

async function record(name) {
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const dir = path.join(RAW, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.zoom = "1.35"; });
  });
  console.log(`${name}: recording from ${BASE}`);
  await LOOPS[name](page);
  await context.close();
  await browser.close();

  const webm = fs.readdirSync(dir).find((f) => f.endsWith(".webm"));
  const outDir = PITCH_ONLY.has(name) ? FOOTAGE : OUT;
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", "1", "-i", path.join(dir, webm), "-t", String(MAX_BY_NAME[name] || MAX_S),
    "-an", "-vf", "fps=30,scale=1920:1080,setsar=1", "-c:v", "libx264", "-crf", "26", "-preset", "slow",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
  ]);
  const bytes = fs.statSync(out).size;
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim();
  console.log(`  wrote ${out}: ${Number(dur).toFixed(1)}s, ${(bytes / 1e6).toFixed(2)} MB`);
  if (bytes > 4_000_000) console.warn("  over 4 MB — raise -crf to 28 and re-run");
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LOOPS);
for (const name of wanted) {
  if (!LOOPS[name]) throw new Error(`unknown loop ${name}; one of ${Object.keys(LOOPS).join(", ")}`);
  await record(name);
}
