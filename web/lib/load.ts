/**
 * Build-time artifact loading.
 *
 * Read with fs in server components rather than fetched in the browser: the data is
 * inlined into the exported HTML, so there is no loading state, no waterfall, and no way
 * for the demo to show a spinner in front of a judge.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  AgenticCategory,
  AttackExample,
  AttackRound,
  DetectRound,
  Envelope,
  Graph,
  ScorecardRow,
} from "./types";
import { SCHEMA_VERSION } from "./types";

const DATA = join(process.cwd(), "public", "data");

async function load<T>(...segments: string[]): Promise<Envelope<T>> {
  const path = join(DATA, ...segments);
  const raw = await readFile(path, "utf8");
  const envelope = JSON.parse(raw) as Envelope<T>;

  if (envelope.schema_version !== SCHEMA_VERSION) {
    throw new Error(
      `${segments.join("/")}: artifact schema v${envelope.schema_version} but the ` +
        `frontend expects v${SCHEMA_VERSION}. Regenerate artifacts or update lib/types.ts.`,
    );
  }
  return envelope;
}

export const loadScorecard = () => load<ScorecardRow[]>("scorecard.json");
export const loadGraph = () => load<Graph>("graph.json");
export const loadDetectRounds = () => load<DetectRound[]>("detect", "rounds.json");
export const loadAttackRounds = () => load<AttackRound[]>("attack", "rounds.json");
export const loadAttackExamples = () => load<AttackExample[]>("attack", "examples.json");
export const loadAgentic = () => load<AgenticCategory[]>("agentic", "redteam.json");

/** True if any artifact on the page is still seeded placeholder data. */
export function anyPlaceholder(...envelopes: { placeholder: boolean }[]): boolean {
  return envelopes.some((e) => e.placeholder);
}
