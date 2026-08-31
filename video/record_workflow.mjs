/**
 * Record the animated workflow explainer.
 *
 * The page drives itself on a fixed declarative timeline and publishes its own total
 * runtime, so this script does not guess how long to hold: it reads window.TOTAL_MS and
 * stops when the animation says it is done. Anything driven by wall-clock jitter would
 * desync from the narration and would not reproduce the same frames on a rerun.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "raw_wf");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();

const url = "file:///" + path.join(here, "workflow.html").replace(/\\/g, "/");
console.log("opening", url);
await page.goto(url, { waitUntil: "load" });

const total = await page.evaluate(() => window.TOTAL_MS);
console.log(`animation declares ${(total / 1000).toFixed(1)}s`);

await page.waitForTimeout(total + 900);
await context.close();
await browser.close();

const produced = fs.readdirSync(OUT).filter((f) => f.endsWith(".webm"));
if (produced.length !== 1) throw new Error(`expected 1 video, got ${produced.length}`);
fs.renameSync(path.join(OUT, produced[0]), path.join(OUT, "workflow.webm"));
fs.writeFileSync(path.join(here, "workflow_ms.txt"), String(total));
console.log(`wrote ${path.join(OUT, "workflow.webm")}`);
