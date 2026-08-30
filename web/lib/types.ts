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
