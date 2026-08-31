/**
 * Mirror of src/adversarial_payments/artifacts.py.
 *
 * These two files are one contract in two languages. tests/test_artifacts.py parses this
 * file and fails if a field is added on the Python side without landing here, which is
 * the same trick schema.py plays on the P1 -> P2 handoff.
 */

export const SCHEMA_VERSION = 1;

export interface Envelope<T> {
  kind: string;
  placeholder: boolean;
  schema_version: number;
  created_at: string;
  git_sha: string;
  payload: T;
}

export interface ShapFeature {
  feature: string;
  mean_abs_shap: number;
}

export interface DetectRound {
  round: number;
  pr_auc: number;
  roc_auc: number;
  threshold: number;
  precision: number;
  recall: number;
  n_train: number;
  n_adversarial_added: number;
  top_shap: ShapFeature[];
}

export interface AttackRound {
  round: number;
  asr: number;
  n_attempts: number;
  n_success: number;
  mean_l0: number;
  mean_l2: number;
  median_queries: number;
  per_feature_freq: Record<string, number>;
}

/**
 * Why a constrained ASR and an unconstrained one are not the same kind of number.
 *
 * Both attackers report a high success rate. The unconstrained one's wins are mostly not
 * transactions: they sit at merchants absent from the network, or they forged an attribute
 * the real attacker inherits from the victim. Mirrors `artifacts.FeasibilityAudit`.
 */
export interface FeasibilityAudit {
  constrained_asr: number;
  unconstrained_asr: number;
  impossible_merchant_share: number;
  forged_frozen_share: number;
  constrained_mean_l0: number;
  unconstrained_mean_l0: number;
}

export interface FeatureDelta {
  feature: string;
  before: number;
  after: number;
}

export interface AttackExample {
  id: string;
  round: number;
  orig_prob: number;
  adv_prob: number;
  touched: FeatureDelta[];
}

export interface AgenticCategory {
  category: string;
  owasp_id: string;
  attempts: number;
  success_before: number;
  success_after: number;
  example_injection: string;
  /** the model these rates were measured on; an exploit rate is a property of one. */
  model?: string;
}

export interface ScorecardRow {
  surface: string;
  attack_success_before: number;
  attack_success_after: number;
  defense_cost: string;
  primary_metric: string;
}

export type NodeStatus = "pending" | "running" | "done";
export type Track = "tabular" | "agentic" | "shared";

export interface GraphNode {
  id: string;
  label: string;
  stage: string;
  round: number | null;
  status: NodeStatus;
  track: Track;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** "unroll" edges are the feedback cycle made acyclic by round -- drawn dashed. */
  kind: "flow" | "unroll";
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Serving latency for the exported detector.
 *
 * Not a mirrored dataclass -- `artifacts.py` writes this one as a plain dict, so there is
 * no Python counterpart for tests/test_artifacts.py to check this interface against.
 */
export interface LatencyStats {
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  mean_ms: number;
  max_ms: number;
  n_samples: number;
  mode: string;
  backend: string;
}

/**
 * The contract the attacker is held to, as the pipeline actually computed it.
 *
 * `frozen`, `coupled_groups` and `mutable` partition `columns`; `bounds` are the observed
 * min/max in the training corpus, which is what makes "feasible" a measured property
 * rather than an assertion. Written without an envelope by the feature builder.
 */
export interface FeatureSchema {
  columns: string[];
  frozen: string[];
  coupled_groups: string[][];
  mutable: string[];
  bounds: Record<string, [number, number]>;
}

/** Where the transactions came from. Also written without an envelope. */
export interface DataProvenance {
  source: string;
  n_rows: number;
  fraud_rate: number;
  n_fraud: number;
  n_cards: number;
  date_min: string;
  date_max: string;
  kaggle_dataset: string | null;
  seed: number | null;
  generator: string | null;
  path: string;
  created_at: string;
  /** non-null when the loader fell back or degraded; surfaced on the page verbatim. */
  warning: string | null;
}

/**
 * Real flagged transactions for the in-browser demo.
 *
 * Written by scripts/export_live_samples.py from the chronological test split. Every
 * sample is genuinely fraudulent and genuinely flagged by the round-0 detector, which is
 * exactly the population attack/engine.py::select_targets picks -- so /live starts where
 * the pipeline starts rather than on an invented row.
 */
export interface LiveSample {
  id: string;
  p_fraud: number;
  values: Record<string, number>;
}

export interface LiveStreamRow {
  id: string;
  is_fraud: number;
  amt: number;
  values: Record<string, number>;
}

export interface LiveSamples {
  threshold: number;
  features: string[];
  samples: LiveSample[];
  /** Real rows, fraud and legitimate mixed, for the hero to score live. */
  stream?: LiveStreamRow[];
}

/**
 * The backend, inventoried by scripts/export_backend_audit.py.
 *
 * Walked out of the source with `ast` rather than written down, so it cannot go stale:
 * every module, its measured size, its own docstring's first sentence, and its public API.
 */
export interface AuditModule {
  path: string;
  module: string;
  loc: number;
  summary: string;
  api: string[];
}

export interface AuditGroup {
  key: string;
  title: string;
  blurb: string;
  modules: AuditModule[];
}

export interface BackendAudit {
  groups: AuditGroup[];
  tests: { path: string; cases: number; summary: string }[];
  scripts: { path: string; summary: string }[];
  totals: {
    modules: number;
    loc: number;
    test_files: number;
    test_cases: number;
    scripts: number;
  };
}
