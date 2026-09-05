/**
 * Deploy to production and pin the public alias.
 *
 * The project's auto-assigned domain is assay-snowy.vercel.app; the one we publish is
 * assay-payments.vercel.app, which is a manual alias. `vercel deploy --prod` moves the
 * auto domains but not manual aliases, so every deploy re-points the alias here. One
 * command, no step to forget at 21:00.
 *
 *   npm run deploy
 */
import { execFileSync, spawnSync } from "node:child_process";

const ALIAS = "assay-payments.vercel.app";

const out = spawnSync("npx", ["vercel", "deploy", "--prod", "--yes"], {
  encoding: "utf8",
  shell: process.platform === "win32",
  stdio: ["inherit", "pipe", "inherit"],
});
process.stdout.write(out.stdout ?? "");
if (out.status !== 0) process.exit(out.status ?? 1);

const url = (out.stdout.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g) ?? []).pop();
if (!url) {
  console.error("could not find the deployment URL in vercel's output");
  process.exit(1);
}
execFileSync("npx", ["vercel", "alias", "set", url, ALIAS], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log(`\n${ALIAS} -> ${url}`);
