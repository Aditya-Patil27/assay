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
  // On a host that only received web/, the repo root is not there to copy from -- but
  // public/data was uploaded already synced, so there is nothing to do and nothing wrong.
  // Failing here would mean the site could only ever build from a full checkout.
  const already = existsSync(dest) && (await readdir(dest)).length > 0;
  if (already) {
    console.log(`no artifacts/ at ${source}; public/data already populated, skipping`);
    process.exit(0);
  }
  console.error(
    `
  No artifacts/ found at ${source} and public/data is empty
` +
      `  Run:  python scripts/seed_artifacts.py   (from the repo root)
`,
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
