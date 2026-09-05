/**
 * Build-time artifact loading.
 *
 * Read with fs in server components rather than fetched in the browser: the data is
 * inlined into the exported HTML, so there is no loading state, no waterfall, and no way
 * for the demo to show a spinner in front of a judge.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AgentRuntime } from "./agent/types";
import type {
  AdversarialDetection,
  AgenticCategory,
  AttackExample,
  AttackRound,
  DataProvenance,
  DetectRound,
  Envelope,
  FeasibilityAudit,
  FeatureSchema,
  Graph,
  Guarantees,
  LatencyStats,
  LiveSamples,
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

/**
 * The feasibility audit, or null when this run did not produce one.
 *
 * Optional by design rather than by accident: the audit only exists when the round-0
 * unconstrained baseline was run, and a run with `--no-baseline` legitimately has nothing
 * to report. Returning null keeps the page buildable instead of inventing a zeroed audit,
 * which would be the exact dishonesty this artifact exists to prevent.
 */
export async function loadFeasibility(): Promise<Envelope<FeasibilityAudit> | null> {
  try {
    return await load<FeasibilityAudit>("attack", "feasibility.json");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Second-stage detection, or null unless a real run wrote it.
 *
 * Stricter than the other optional loaders on purpose. The file spent its first week as a
 * bare JSON with no envelope, and the audit console showed it amber for exactly that
 * reason. A file that fails the envelope check or carries placeholder:true renders
 * nothing here rather than a figure nobody could retract.
 */
export async function loadAdversarialDetection(): Promise<Envelope<AdversarialDetection> | null> {
  try {
    const env = await load<AdversarialDetection>("attack", "adversarial_detection.json");
    return env.placeholder === false ? env : null;
  } catch {
    return null;
  }
}

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

/* ---------------------------------------------------------------------------------------
 * The system artifacts.
 *
 * These describe the machine that produced the numbers above rather than the numbers
 * themselves, and every one of them is optional: a clone that has never run the pipeline
 * still builds, and the page simply omits what it does not have. That is the same rule
 * loadFeasibility follows -- omit, never invent.
 * ------------------------------------------------------------------------------------- */

/** null when the file is absent; any other failure still throws. */
async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Read a bare artifact -- one the writer emits without an Envelope.
 *
 * feature_schema.json and data_provenance.json predate the envelope contract and carry no
 * schema_version, so `load` would reject them on a version mismatch that does not exist.
 * They are read unwrapped rather than given a fake envelope, because a fabricated
 * `placeholder: false` is exactly the claim this codebase refuses to make on data's behalf.
 */
async function loadBare<T>(...segments: string[]): Promise<T> {
  return JSON.parse(await readFile(join(DATA, ...segments), "utf8")) as T;
}

export const loadLatency = () =>
  optional(() => load<LatencyStats>("latency.json"));

export const loadFeatureSchema = () =>
  optional(() => loadBare<FeatureSchema>("feature_schema.json"));

export const loadDataProvenance = () =>
  optional(() => loadBare<DataProvenance>("data_provenance.json"));

/**
 * The per-provider red-team runs behind the pooled agentic result.
 *
 * An exploit rate is a property of one model, so the pooled figure alone invites the
 * reading that the defense was validated once. Loading the providers separately lets the
 * page show that it was measured twice, on two vendors, and say plainly where the result
 * is significant and where it is not.
 */
export async function loadProviderRedteams(): Promise<Envelope<AgenticCategory[]>[]> {
  const files = ["redteam-groq.json", "redteam-nvidia.json"];
  const loaded = await Promise.all(
    files.map((f) => optional(() => load<AgenticCategory[]>("agentic", f))),
  );
  return loaded.filter((e): e is Envelope<AgenticCategory[]> => e !== null);
}

export const loadLiveSamples = () => optional(() => load<LiveSamples>("live_samples.json"));

/**
 * The single provider the /lineage outcome column is measured against.
 *
 * Graph 1 there needs one fixed set of success_before/success_after counts per technique,
 * not the pooled or per-vendor comparison loadProviderRedteams renders elsewhere -- so it
 * reads redteam-groq.json directly rather than picking an index out of that array.
 */
export const loadRedteamGroq = () =>
  optional(() => load<AgenticCategory[]>("agentic", "redteam-groq.json"));

/** The agent runtime constants, exported from Python by scripts/export_agent_runtime.py. */
export const loadAgentRuntime = () => optional(() => load<AgentRuntime>("agent_runtime.json"));

export const loadGuarantees = () => optional(() => load<Guarantees>("guarantees.json"));
