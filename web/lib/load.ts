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

export interface Artifacts {
  scorecard: Envelope<ScorecardRow[]>;
  graph: Envelope<Graph>;
  detect: Envelope<DetectRound[]>;
  attack: Envelope<AttackRound[]>;
  examples: Envelope<AttackExample[]>;
  agentic: Envelope<AgenticCategory[]>;
}

/**
 * Every artifact the page renders, keyed by the file that produced it.
 *
 * The key is the on-disk path rather than a friendly name on purpose: when the banner
 * names a placeholder, whoever owns that writer must be able to go straight to the file.
 */
export const ARTIFACT_FILES: Record<keyof Artifacts, string> = {
  scorecard: "artifacts/scorecard.json",
  graph: "artifacts/graph.json",
  detect: "artifacts/detect/rounds.json",
  attack: "artifacts/attack/rounds.json",
  examples: "artifacts/attack/examples.json",
  agentic: "artifacts/agentic/redteam.json",
};

export async function loadArtifacts(): Promise<Artifacts> {
  const [scorecard, graph, detect, attack, examples, agentic] = await Promise.all([
    loadScorecard(),
    loadGraph(),
    loadDetectRounds(),
    loadAttackRounds(),
    loadAttackExamples(),
    loadAgentic(),
  ]);
  return { scorecard, graph, detect, attack, examples, agentic };
}

/** True if any artifact on the page is still seeded placeholder data. */
export function anyPlaceholder(...envelopes: { placeholder: boolean }[]): boolean {
  return envelopes.some((e) => e.placeholder);
}

export interface PlaceholderSource {
  file: string;
  kind: string;
}

/**
 * Which artifacts are still fixtures.
 *
 * A page-wide boolean would tell a judge that *something* is fake without saying what --
 * which is barely better than saying nothing. Naming the files is the point.
 */
export function placeholderSources(artifacts: Artifacts): PlaceholderSource[] {
  return (Object.keys(ARTIFACT_FILES) as (keyof Artifacts)[])
    .filter((key) => artifacts[key].placeholder)
    .map((key) => ({ file: ARTIFACT_FILES[key], kind: artifacts[key].kind }));
}

/**
 * Provenance for the run that produced these numbers.
 *
 * Artifacts are written by four independent stages, so they carry different timestamps
 * and can carry different commits. We surface the newest timestamp and every distinct
 * sha -- a mixed-sha footer is itself a finding worth showing.
 */
export function provenance(artifacts: Artifacts): { shas: string[]; newest: string } {
  const envelopes = Object.values(artifacts);
  const shas = [...new Set(envelopes.map((e) => e.git_sha))].sort();
  const newest = envelopes
    .map((e) => e.created_at)
    .sort()
    .at(-1)!;
  return { shas, newest };
}
