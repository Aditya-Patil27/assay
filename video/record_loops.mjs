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
const BASE = process.env.BASE_URL || "https://adversarial-payments.vercel.app";
const RAW = path.join(here, "raw_loops");
const OUT = path.join(here, "..", "web", "public", "demos");
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
  const out = path.join(OUT, `${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-ss", "1", "-i", path.join(dir, webm), "-t", String(MAX_S),
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
