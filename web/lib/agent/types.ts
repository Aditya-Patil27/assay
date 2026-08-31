/**
 * Shapes of artifacts/agent_runtime.json.
 *
 * Emitted by scripts/export_agent_runtime.py from the Python objects themselves, so this
 * file describes a contract rather than duplicating one.
 */

export interface PyRegex {
  source: string;
  flags: string;
}

export type ToolArgs = Record<string, unknown>;

export interface ToolCall {
  seq: number;
  tool: string;
  args: ToolArgs;
  executed: boolean;
  result?: unknown;
  error?: string;
  blocked_by?: string;
}

export interface DefenseEvent {
  layer: "classifier" | "tool_scope" | "hitl" | string;
  action: string;
  target: string;
  detail: string;
}

export interface DefenseConfig {
  classifier: boolean;
  tool_scope: boolean;
  hitl: boolean;
}

export const DEFENSES_OFF: DefenseConfig = { classifier: false, tool_scope: false, hitl: false };
export const DEFENSES_ON: DefenseConfig = { classifier: true, tool_scope: true, hitl: true };

export interface Scenario {
  id: string;
  task_type: string;
  channel: string;
  user_request: string;
  intent: { calls?: { name: string; arguments?: ToolArgs }[] };
  document: string;
}

export interface Injection {
  id: string;
  category: string;
  category_title: string;
  owasp_id: string;
  atlas_technique: string;
  channel: string;
  goal:
    | "unintended_action"
    | "unauthorized_transfer"
    | "payee_hijack"
    | "data_leak"
    | "scope_escalation";
  payload: string;
}

export interface AgentRuntime {
  agent: {
    system_prompt: string;
    channels: string[];
    customer: string;
    owned_account: string;
    tool_specs: unknown[];
  };
  classifier: {
    threshold: number;
    features: { name: string; pattern: PyRegex; weight: number }[];
    imperative: PyRegex;
    iban: PyRegex;
    secretish: PyRegex;
    imperative_weight: number;
    obfuscation_weight: number;
    zero_width: PyRegex;
    b64: PyRegex;
  };
  scope: Record<string, string[]>;
  hitl: { amount_threshold: number };
  ledger: {
    accounts: Record<string, { id: string; owner: string; balance: number; currency: string }>;
    payees: Record<string, { id: string; name: string; iban: string; verified: boolean }>;
  };
  scenarios: Scenario[];
  injections: Injection[];
}
