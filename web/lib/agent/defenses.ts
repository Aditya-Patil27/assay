/**
 * The three defense layers, ported from src/adversarial_payments/agentic/defenses.py.
 *
 * This file deliberately contains no constants. Every regex, weight, threshold and scope
 * comes out of artifacts/agent_runtime.json, which scripts/export_agent_runtime.py emits
 * from the Python objects themselves -- so a change to a pattern in Python reaches here
 * without anybody retyping it. What is ported is control flow, and
 * scripts/check_agent_conformance.py proves this control flow agrees with Python's on
 * every span of every injection in the corpus.
 */
import type { AgentRuntime, DefenseEvent, ToolArgs } from "./types";

/** Rebuild a Python-compiled pattern on the JS side, flags and all. */
const re = (p: { source: string; flags: string }) => new RegExp(p.source, p.flags);

/**
 * What a competent reader -- model or classifier -- sees through obfuscation.
 *
 * Mirrors client.normalise: NFKC fold first, then strip zero-width, then append the
 * plaintext of any long base64 run. Order matters; folding after stripping gives a
 * different string for some homoglyph payloads.
 */
export function normalise(text: string, rt: AgentRuntime): string {
  const folded = text.normalize("NFKC").replace(new RegExp(re(rt.classifier.zero_width), "gu"), "");

  const decoded: string[] = [];
  const b64 = new RegExp(rt.classifier.b64.source, "g");
  for (const m of folded.matchAll(b64)) {
    const candidate = m[0];
    try {
      const padded = candidate + "=".repeat((4 - (candidate.length % 4)) % 4);
      const plain = Buffer.from(padded, "base64").toString("utf8");
      // Buffer is lenient where Python's validate=True is not; a round-trip mismatch
      // means this was never valid base64 and Python would have skipped it.
      if (Buffer.from(plain, "utf8").toString("base64").replace(/=+$/, "") !== candidate.replace(/=+$/, "")) {
        continue;
      }
      if (printableRatio(plain) >= 0.9) decoded.push(plain);
    } catch {
      continue;
    }
  }
  return decoded.length ? folded + "\n" + decoded.join("\n") : folded;
}

/** Python's str.isprintable(): false for control, format, surrogate, unassigned and
 *  line/paragraph/space separators -- except U+0020, which is printable. */
const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;
function printableRatio(s: string): number {
  if (s.length === 0) return 1;
  let n = 0;
  for (const ch of s) {
    if (ch === " " || !NON_PRINTABLE.test(ch)) n += 1;
  }
  // Python iterates code points and compares against len(str), which counts UTF-16 units
  // in JS. Compare on code points both sides.
  return n / [...s].length;
}

/** Python's str.splitlines() boundary set, which is wider than \n. */
const PY_LINE_BREAKS = new RegExp(
  // Built from a string, not a literal: U+2028 and U+2029 are line terminators in JS
  // source and would end the regex literal itself.
  "\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]",
);

/** Scoreable spans: lines, then sentences within a long line. Mirrors defenses._spans. */
export function spans(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(PY_LINE_BREAKS)) {
    if (line.length <= 160) {
      out.push(line);
      continue;
    }
    for (const part of line.split(/(?<=[.!?])\s+/)) {
      if (part) out.push(part);
    }
  }
  return out;
}

export interface Verdict {
  score: number;
  reasons: string[];
}

/**
 * Weighted feature sum over the normalised text.
 *
 * Explicitly not a trained model: it is explainable by construction, which is the point
 * for a control that can decline a customer's payment. It scores the normalised text
 * because a classifier reading raw bytes is bypassed by any zero-width or base64 trick.
 */
export function score(text: string, rt: AgentRuntime): Verdict {
  const seen = normalise(text, rt);
  let total = 0;
  const reasons: string[] = [];

  for (const f of rt.classifier.features) {
    if (re(f.pattern).test(seen)) {
      total += f.weight;
      reasons.push(f.name);
    }
  }

  const imperative = re(rt.classifier.imperative).test(seen);
  const payloadish = re(rt.classifier.iban).test(seen) || re(rt.classifier.secretish).test(seen);
  if (imperative && payloadish) {
    total += rt.classifier.imperative_weight;
    reasons.push("imperative-over-payment-data");
  }
  if (seen !== text) {
    total += rt.classifier.obfuscation_weight;
    reasons.push("obfuscated-encoding");
  }

  return { score: Math.round(Math.min(total, 1.0) * 1000) / 1000, reasons };
}

/** Redact the spans that score over threshold; keep the rest of the document. */
export function sanitise(
  text: string,
  rt: AgentRuntime,
): { clean: string; events: DefenseEvent[] } {
  const events: DefenseEvent[] = [];
  const out: string[] = [];
  for (const span of spans(text)) {
    const v = score(span, rt);
    if (v.score >= rt.classifier.threshold) {
      out.push("[REDACTED BY INJECTION FILTER]");
      events.push({
        layer: "classifier",
        action: "redact",
        target: span.trim().slice(0, 80),
        detail: `score=${v.score} ${v.reasons.join(",")}`,
      });
    } else {
      out.push(span);
    }
  }
  return { clean: out.join("\n"), events };
}

/* --- layer 2: tool scoping ------------------------------------------------------- */

import type { Ledger } from "./tools";
import { secretsOf } from "./tools";

/**
 * Least privilege at the call site.
 *
 * Deliberately does not consult the customer's intent: a policy that already knows the
 * right answer is an oracle, not a policy, and it would flatter the results.
 */
export function scopeCheck(
  tool: string,
  args: ToolArgs,
  taskType: string,
  ledger: Ledger,
  rt: AgentRuntime,
): DefenseEvent | null {
  const allowed = rt.scope[taskType] ?? [];
  if (!allowed.includes(tool)) {
    return { layer: "tool_scope", action: "deny", target: tool, detail: `${tool} not in scope for task ${taskType}` };
  }

  const accountId = String(args.account_id ?? args.from_account ?? "").trim();
  if (accountId) {
    const account = ledger.accounts[accountId];
    if (!account || account.owner !== rt.agent.customer) {
      return { layer: "tool_scope", action: "deny", target: tool, detail: `account ${accountId} not owned by session customer` };
    }
  }

  if (tool === "initiate_transfer") {
    const payee = ledger.payees[String(args.to_payee ?? "").trim()];
    if (!payee || !payee.verified) {
      return { layer: "tool_scope", action: "deny", target: tool, detail: `payee ${args.to_payee} is not verified` };
    }
    const leak = dlp(String(args.memo ?? ""), ledger);
    if (leak) return { layer: "tool_scope", action: "deny", target: tool, detail: `memo carries ${leak}` };
  }

  if (tool === "update_payee") {
    const leak = dlp(String(args.name ?? ""), ledger);
    if (leak) return { layer: "tool_scope", action: "deny", target: tool, detail: `payee name carries ${leak}` };
  }
  return null;
}

/** Free-text egress check: a secret must not ride out in a customer-visible field. */
function dlp(value: string, ledger: Ledger): string | null {
  if (!value) return null;
  for (const secret of secretsOf(ledger)) {
    if (secret && value.includes(secret)) return `secret ${secret.slice(0, 6)}...`;
  }
  return null;
}

/* --- layer 3: HITL threshold policy ---------------------------------------------- */

export function requiresApproval(tool: string, args: ToolArgs, rt: AgentRuntime): string | null {
  if (tool === "update_payee" && args.iban) return "settlement IBAN change";
  if (tool === "initiate_transfer") {
    const amount = Number(args.amount ?? 0);
    if (!Number.isFinite(amount)) return "unparseable amount";
    if (amount >= rt.hitl.amount_threshold) {
      return `amount ${amount.toFixed(2)} >= threshold ${rt.hitl.amount_threshold.toFixed(2)}`;
    }
  }
  return null;
}

const same = (a: unknown, b: unknown) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return String(a).trim() === String(b).trim();
};

/** The simulated reviewer: approves only what the customer actually asked for. */
export function humanApproves(
  tool: string,
  args: ToolArgs,
  intent: { calls?: { name: string; arguments?: ToolArgs }[] },
): boolean {
  for (const call of intent.calls ?? []) {
    if (call.name !== tool) continue;
    const expected = call.arguments ?? {};
    if (!(["to_payee", "payee_id", "iban"] as const).every((k) => same(expected[k], args[k]))) {
      continue;
    }
    if (tool === "initiate_transfer") {
      const e = Number(expected.amount ?? 0);
      const a = Number(args.amount ?? 0);
      if (!Number.isFinite(e) || !Number.isFinite(a) || Math.abs(e - a) > 0.01) continue;
    }
    return true;
  }
  return false;
}
