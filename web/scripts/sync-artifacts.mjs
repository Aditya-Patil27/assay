/**
 * Copy the pipeline's artifacts into the Next build.
 *
 * Spec 4.3: the dashboard reads committed JSON and never trains. Copying rather than
 * importing across the repo boundary keeps the frontend buildable on its own -- if a
 * teammate clones and runs `npm run dev` with no Python installed, this still works.
 */
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "..", "artifacts");
const dest = join(here, "..", "public", "data");

if (!existsSync(source)) {
  console.error(
    `\n  No artifacts/ found at ${source}\n` +
      `  Run:  python scripts/seed_artifacts.py   (from the repo root)\n`,
  );
  process.exit(1);
}

await mkdir(dest, { recursive: true });
await cp(source, dest, { recursive: true, filter: (p) => !p.includes("cache") });

let count = 0;
async function walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) await walk(full);
    else if (entry.endsWith(".json")) count += 1;
  }
}
await walk(dest);

console.log(`synced ${count} artifact file(s) -> web/public/data`);
